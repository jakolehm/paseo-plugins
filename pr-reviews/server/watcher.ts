import type { ReviewerStatus } from "../shared/dashboard";
import { type Reviewer, type ReviewSettings, reviewSettings } from "../shared/settings";
import { githubProjects } from "../shared/github-projects";
import { reviewerColors } from "../shared/reviewer-colors";
import type { Attention } from "./attention";
import type { Daemon } from "./daemon";
import { type GitHub, type RateLimit, RateLimitError, type Snapshot } from "./github";
import { prKey, type PullRequest } from "./pull-request";
import type { ReviewRunner } from "./review-runner";
import type { ReviewStore } from "./review-store";
import { decide } from "./selection";
import type { UsageGuard } from "./usage-guard";

const SETTLE_MS = 5_000;
const LOW_REMAINING = 500;
const MAX_BACKOFF_MS = 60 * 60_000;

interface PollState {
  lastPollAt: string | null;
  lastResult: string | null;
  skipped: string | null;
  error: string | null;
}

export interface HeldPullRequest {
  pr: PullRequest;
  reason: string;
}

export const MANUAL_REASON = "requested manually";

// Polls GitHub without an agent, and starts an agent only for a PR that needs a review.
export class Watcher {
  private settings: ReviewSettings = reviewSettings.schema.parse({});
  private readonly open = new Map<string, PullRequest[]>();
  private readonly polls = new Map<string, PollState>();
  private readonly held = new Map<string, HeldPullRequest[]>();
  private checkouts = new Map<string, string>();
  private readonly currentNames = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private nextCheck: { from: string; at: string } | null = null;
  private polling: Promise<number> | null = null;
  private backoffMs = 0;
  private disposed = false;

  constructor(
    private readonly github: GitHub,
    private readonly daemon: Daemon,
    private readonly store: ReviewStore,
    private readonly runner: ReviewRunner,
    private readonly attention: Attention,
    private readonly usage: UsageGuard,
  ) {}

  // Saves come in bursts. One check after the last save is enough, and a rate limit back-off stays.
  configure(settings: ReviewSettings) {
    this.settings = settings;
    this.runner.configure(settings);
    void this.refreshCheckouts();
    if (this.backoffMs === 0) this.schedule(SETTLE_MS);
  }

  runNow() {
    this.schedule(0);
  }

  async reviewNow(repo: string, number: number, reviewerId: string) {
    const reviewer = this.settings.reviewers.find((candidate) => candidate.id === reviewerId);
    if (!reviewer) throw new Error("The reviewer does not exist");
    if (!this.checkouts.has(repo.toLowerCase())) await this.refreshCheckouts();
    const checkout = this.checkouts.get(repo.toLowerCase());
    if (!checkout) throw new Error(`${repo} is not a Paseo project on this host`);
    const pr = await this.github.openPullRequest(await this.currentName(repo), number);
    if (!pr) throw new Error(`${repo}#${number} is not an open PR`);
    const key = prKey(pr.repo, pr.number);
    if (this.runner.isActive(key)) throw new Error(`A review of ${key} is already in progress`);
    const handled = this.store.handled(key);
    const since = handled && handled.head !== pr.head ? handled.head : null;
    this.runner.enqueue(pr, MANUAL_REASON, since, reviewer, checkout, this.usage.account(reviewer.provider, this.settings));
    for (const [id, held] of this.held) this.held.set(id, held.filter((entry) => prKey(entry.pr.repo, entry.pr.number) !== key));
  }

  scheduledCheck() {
    return this.nextCheck;
  }

  // The ZeroSub accounts that new reviews start on.
  reviewAccounts() {
    const providers = new Set(this.settings.reviewers.filter((reviewer) => reviewer.enabled).map((reviewer) => reviewer.provider));
    return [...providers].flatMap((provider) => {
      const account = this.usage.account(provider, this.settings);
      return account ? [this.usage.accountLabel(account)] : [];
    });
  }

  usageHold() {
    for (const reviewer of this.settings.reviewers.filter((candidate) => candidate.enabled)) {
      const hold = this.usage.hold(agentProviders(reviewer), this.settings);
      if (hold) return hold;
    }
    return null;
  }

  openPullRequest(repo: string, key: string): PullRequest | undefined {
    return this.open.get(repo.toLowerCase())?.find((pr) => prKey(pr.repo, pr.number) === key);
  }

  heldPullRequests() {
    const enabled = new Set(this.settings.reviewers.filter((reviewer) => reviewer.enabled).map((reviewer) => reviewer.id));
    return [...this.held].filter(([reviewerId]) => enabled.has(reviewerId)).flatMap(([, held]) => held);
  }

  isOpen(repo: string, key: string) {
    const polled = this.open.get(repo.toLowerCase());
    return !polled || polled.some((pr) => prKey(pr.repo, pr.number) === key);
  }

  isWatched(repo: string) {
    return this.reviewerFor(repo) !== undefined;
  }

  isCovered(repo: string) {
    return this.reviewerFor(repo)?.enabled ?? false;
  }

  reviewerFor(repo: string): Reviewer | undefined {
    const lower = repo.toLowerCase();
    return this.settings.reviewers.find((reviewer) => reviewer.repos.some((candidate) => this.sameRepo(candidate, lower)));
  }

  status(): ReviewerStatus[] {
    const colors = reviewerColors(this.settings.reviewers);
    return this.settings.reviewers.map((reviewer) => {
      const poll = this.polls.get(reviewer.id);
      return {
        id: reviewer.id,
        name: reviewer.name,
        color: colors.get(reviewer.id)!,
        enabled: reviewer.enabled,
        repos: reviewer.repos.map((repo) => ({
          repo,
          currentName: this.currentNames.get(repo.toLowerCase()) ?? repo.toLowerCase(),
          checkout: this.checkouts.get(repo.toLowerCase()) ?? null,
        })),
        lastPollAt: poll?.lastPollAt ?? null,
        lastResult: poll?.lastResult ?? null,
        skipped: poll?.skipped ?? null,
        error: poll?.error ?? null,
      };
    });
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delayMs: number) {
    if (this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    this.nextCheck = { from: new Date().toISOString(), at: new Date(Date.now() + delayMs).toISOString() };
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private async tick() {
    this.polling ??= this.pollAll().finally(() => (this.polling = null));
    this.schedule(await this.polling);
  }

  // One GitHub request covers all reviewers and the PRs that wait on me.
  private async pollAll() {
    await Promise.all([this.refreshCheckouts(), this.usage.refresh()]);
    const reviewers = this.settings.reviewers.filter((reviewer) => reviewer.enabled);
    try {
      const me = await this.github.viewer();
      const repos = await Promise.all(reviewers.flatMap((reviewer) => reviewer.repos).map((repo) => this.currentName(repo)));
      const snapshot = await this.github.snapshot(repos, this.attention.searches());
      for (const reviewer of reviewers) await this.pollReviewer(reviewer, snapshot, me);
      this.attention.update(me, snapshot.searches);
      return this.delayAfter(snapshot.rateLimit);
    } catch (error) {
      const rateLimited = error instanceof RateLimitError;
      const message = `${errorMessage(error)}${rateLimited ? ". The next check waits longer" : ""}`;
      for (const reviewer of reviewers) this.polls.set(reviewer.id, { ...this.pollState(reviewer.id), error: message });
      this.attention.fail(message);
      return rateLimited ? this.backOff() : this.delayAfter(null);
    }
  }

  private delayAfter(rateLimit: RateLimit | null) {
    this.backoffMs = 0;
    const interval = this.settings.pollMinutes * 60_000;
    if (!rateLimit || rateLimit.remaining >= LOW_REMAINING) return interval;
    return Math.max(interval, Date.parse(rateLimit.resetAt) - Date.now());
  }

  private backOff() {
    this.backoffMs = Math.min(Math.max(this.backoffMs * 2, this.settings.pollMinutes * 2 * 60_000), MAX_BACKOFF_MS);
    return this.backoffMs;
  }

  private pollState(reviewerId: string): PollState {
    return this.polls.get(reviewerId) ?? { lastPollAt: null, lastResult: null, skipped: null, error: null };
  }

  private sameRepo(configured: string, lower: string) {
    const name = configured.toLowerCase();
    return name === lower || this.currentNames.get(name) === lower;
  }

  private async currentName(repo: string) {
    const name = await this.github.currentName(repo).catch(() => repo);
    this.currentNames.set(repo.toLowerCase(), name.toLowerCase());
    return name;
  }

  private async refreshCheckouts() {
    try {
      const projects = await githubProjects(await this.daemon.api());
      const checkouts = new Map<string, string>();
      for (const { repo, path } of projects) {
        checkouts.set(repo.toLowerCase(), path);
        checkouts.set((await this.currentName(repo)).toLowerCase(), path);
      }
      this.checkouts = checkouts;
    } catch {
      // Keep the last known checkouts. A repo without a checkout shows an error on its reviewer.
    }
  }

  private async pollReviewer(reviewer: Reviewer, snapshot: Snapshot, me: string) {
    const errors: string[] = [];
    const tally = new PollTally();
    for (const repo of reviewer.repos) {
      try {
        await this.pollRepo(reviewer, repo, snapshot, me, tally);
      } catch (error) {
        errors.push(`${repo}: ${errorMessage(error)}`);
      }
    }
    this.polls.set(reviewer.id, {
      lastPollAt: new Date().toISOString(),
      lastResult: tally.result(),
      skipped: tally.skippedReasons(),
      error: errors.join(". ") || null,
    });
    this.held.set(reviewer.id, tally.held);
  }

  // A review agent that failed is not started again on the same commit until the user dismisses the failure.
  // A failure before the agent started cost no tokens, so the next check tries again.
  private failedOnSameHead(key: string, head: string) {
    const last = this.store.latest(key);
    return last?.status === "failed" && last.agentId !== null && last.head === head && !this.store.isDismissed(last.id);
  }

  private async pollRepo(reviewer: Reviewer, repo: string, snapshot: Snapshot, me: string, tally: PollTally) {
    const checkout = this.checkouts.get(repo.toLowerCase());
    if (!checkout) throw new Error("no Paseo project. Add a local checkout as a project");

    const currentName = await this.currentName(repo);
    const pullRequests = snapshot.repos.get(currentName.toLowerCase()) ?? new Error("not checked");
    if (pullRequests instanceof Error) throw pullRequests;
    const openKeys = new Set(pullRequests.map((pr) => prKey(pr.repo, pr.number)));
    this.open.set(currentName.toLowerCase(), pullRequests);
    await this.runner.stopClosed(currentName, openKeys);
    await this.runner.archiveStale(currentName, openKeys, this.settings.archiveAfterMinutes * 60_000);

    const now = Date.now();
    const hold = this.usage.hold(agentProviders(reviewer), this.settings);
    for (const pr of pullRequests) {
      const key = prKey(pr.repo, pr.number);
      if (this.runner.isActive(key)) {
        tally.skip("review in progress");
        continue;
      }
      if (this.failedOnSameHead(key, pr.head)) {
        tally.skip("failed review on this commit");
        continue;
      }
      const decision = decide(pr, me, reviewer, this.store.handled(key), now);
      if (decision.review && hold) {
        tally.hold(pr, hold);
      } else if (decision.review) {
        this.runner.enqueue(pr, decision.reason, decision.since, reviewer, checkout, this.usage.account(reviewer.provider, this.settings));
        tally.start();
      } else {
        tally.skip(decision.reason);
      }
    }
  }
}

class PollTally {
  private checked = 0;
  private started = 0;
  private readonly skipped = new Map<string, number>();
  readonly held: HeldPullRequest[] = [];

  start() {
    this.checked++;
    this.started++;
  }

  skip(reason: string) {
    this.checked++;
    this.skipped.set(reason, (this.skipped.get(reason) ?? 0) + 1);
  }

  hold(pr: PullRequest, reason: string) {
    this.skip("held back by usage limits");
    this.held.push({ pr, reason });
  }

  result() {
    const started = this.started === 0 ? "none to review" : `started ${this.started} ${this.started === 1 ? "review" : "reviews"}`;
    return `${this.checked} open PRs, ${started}`;
  }

  skippedReasons() {
    const reasons = [...this.skipped].sort((a, b) => b[1] - a[1]).map(([reason, count]) => `${count} ${reason}`);
    return reasons.length > 0 ? `Skipped: ${reasons.join(", ")}.` : null;
  }
}

function agentProviders(reviewer: Reviewer) {
  return reviewer.secondOpinion ? [reviewer.provider, "codex"] : [reviewer.provider];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
