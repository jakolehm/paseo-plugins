import { createHash, randomUUID } from "node:crypto";
import type { PaseoApi } from "@getpaseo/client";
import type { Reviewer } from "../shared/settings";
import type { Daemon } from "./daemon";
import type { GitHub } from "./github";
import { prKey, type PullRequest } from "./pull-request";
import { parseOutcome, reviewOutcomeJsonSchema } from "./review-outcome";
import { followUpPrompt, reviewPrompt, systemPrompt } from "./review-prompt";
import type { ReviewRecord, ReviewStore } from "./review-store";

const WAIT_STEP_MS = 10 * 60_000;
const AGENT_DEADLINE_MS = 4 * 60 * 60_000;
const RESUME_RETRY_MS = 30_000;
const ACTIVE = new Set(["queued", "running", "permission"]);
const MAX_ROUNDS = 3;
const SEND_WAIT_MS = 5_000;
const RESTORE_WAIT_MS = 30_000;
const RESTORE_POLL_MS = 1_000;
const PERMISSION_POLL_MS = 30_000;

interface Job {
  recordId: string;
  reviewer: Reviewer;
  checkout: string;
}

export class ReviewRunner {
  private readonly pending: Job[] = [];
  private running = 0;
  // Two PR checkouts in one repo at the same time race on .git/config.
  private readonly checkoutQueues = new Map<string, Promise<unknown>>();
  private maxParallel = 2;
  private disposed = false;

  constructor(
    private readonly daemon: Daemon,
    private readonly store: ReviewStore,
    private readonly github: GitHub,
  ) {}

  setMaxParallel(maxParallel: number) {
    this.maxParallel = maxParallel;
    this.pump();
  }

  isActive(key: string) {
    return this.store.records().some((record) => record.key === key && ACTIVE.has(record.status));
  }

  enqueue(pr: PullRequest, reason: string, since: string | null, reviewer: Reviewer, checkout: string) {
    const record: ReviewRecord = {
      id: randomUUID(),
      key: prKey(pr.repo, pr.number),
      repo: pr.repo,
      number: pr.number,
      title: pr.title,
      url: pr.url,
      author: pr.author,
      head: pr.head,
      since,
      reason,
      reviewerId: reviewer.id,
      reviewerName: reviewer.name,
      agentId: null,
      status: "queued",
      queuedAt: new Date().toISOString(),
      finishedAt: null,
      outcome: null,
      error: null,
      agentConfig: agentConfig(reviewer),
    };
    this.store.add(record);
    this.pending.push({ recordId: record.id, reviewer, checkout });
    this.pump();
  }

  // Takes the active records once, before this instance queues its own reviews.
  async resume(ids = this.store.records().filter((record) => ACTIVE.has(record.status)).map((record) => record.id)) {
    if (this.disposed) return;
    try {
      await this.daemon.api();
    } catch {
      if (!this.disposed) setTimeout(() => void this.resume(ids), RESUME_RETRY_MS);
      return;
    }
    for (const record of this.store.records()) {
      if (!ids.includes(record.id) || !ACTIVE.has(record.status)) continue;
      if (record.agentId) {
        this.running++;
        void this.follow(record.id, record.agentId);
      } else {
        this.fail(record.id, "The daemon restarted before the review started");
      }
    }
  }

  // A PR can close between the check and the end of its review. Stop the work for it.
  async stopClosed(repo: string, openKeys: Set<string>) {
    const lower = repo.toLowerCase();
    const records = this.store
      .records()
      .filter((record) => record.repo.toLowerCase() === lower && ACTIVE.has(record.status) && !openKeys.has(record.key));
    for (const record of records) {
      const queued = this.pending.findIndex((job) => job.recordId === record.id);
      if (queued >= 0) this.pending.splice(queued, 1);
      if (record.agentId) await this.daemon.cancelAgent(record.agentId).catch(() => undefined);
      this.fail(record.id, "The PR closed during the review");
    }
  }

  // Removes the review workspaces of closed PRs, of agents that a new agent replaced,
  // and of finished reviews that need nothing from me. A re-review restores the last one.
  async archiveStale(repo: string, openKeys: Set<string>, archiveAfterMs: number) {
    const lower = repo.toLowerCase();
    const records = this.store.records().filter((record) => record.repo.toLowerCase() === lower && record.agentId);
    const busy = new Set(records.filter((record) => ACTIVE.has(record.status)).map((record) => record.agentId));
    const now = Date.now();
    const stale = new Set(
      records
        .filter((record) => !record.archived && !busy.has(record.agentId))
        .filter((record) => {
          const latest = this.store.latest(record.key);
          if (!openKeys.has(record.key)) return true;
          if (latest?.agentId && latest.agentId !== record.agentId) return true;
          return latest?.id === record.id && archiveAfterMs > 0 && this.isSettled(record, now - archiveAfterMs);
        })
        .map((record) => record.agentId!),
    );
    if (stale.size === 0) return;
    const paseo = await this.daemon.api();
    for (const agentId of stale) {
      try {
        const agent = paseo.agents.ref(agentId);
        const workspaceId = (await agent.refresh())?.agent.workspaceId;
        if (workspaceId) await paseo.workspaces.archive(workspaceId);
        else await agent.archive();
        for (const record of records.filter((candidate) => candidate.agentId === agentId)) {
          this.store.update(record.id, { archived: true });
        }
      } catch {
        // The next check tries again.
      }
    }
  }

  // Brings back the archived workspace of a review agent. The archive delay starts again.
  async restore(agentId: string) {
    const paseo = await this.daemon.api();
    const snapshot = (await paseo.agents.ref(agentId).refresh())?.agent;
    if (snapshot?.archivedAt && snapshot.workspaceId) await this.daemon.restoreWorkspace(snapshot.workspaceId);
    const restoredAt = new Date().toISOString();
    for (const record of this.store.records().filter((candidate) => candidate.agentId === agentId && candidate.archived)) {
      this.store.update(record.id, { archived: false, restoredAt });
    }
  }

  private isSettled(record: ReviewRecord, before: number) {
    if (record.status !== "done" || record.finishedAt === null) return false;
    const quietSince = Math.max(Date.parse(record.finishedAt), record.restoredAt ? Date.parse(record.restoredAt) : 0);
    return quietSince < before && (!record.outcome?.needsHuman || this.store.isDismissed(record.id));
  }

  dispose() {
    this.disposed = true;
    this.pending.length = 0;
  }

  private pump() {
    while (!this.disposed && this.running < this.maxParallel && this.pending.length > 0) {
      const job = this.pending.shift()!;
      this.running++;
      void this.start(job);
    }
  }

  private async start({ recordId, reviewer, checkout }: Job) {
    const record = this.store.records().find((candidate) => candidate.id === recordId);
    if (!record) return this.release();
    let agentId: string;
    try {
      if (!(await this.github.isOpen(record.repo, record.number))) {
        this.fail(record.id, "The PR closed before the review started");
        return this.release();
      }
      const paseo = await this.daemon.api();
      const continued = await this.continueAgent(paseo, record);
      if (continued) {
        agentId = continued.agentId;
        this.store.update(record.id, { status: "running", agentId, round: continued.round });
        return await this.follow(record.id, agentId);
      }
      const create = async () => paseo.agents.create({
        idempotencyKey: record.id,
        cwd: checkout,
        worktree: { mode: "checkout-pr", prNumber: record.number },
        config: {
          provider: await agentModel(paseo, reviewer),
          ...(reviewer.modeId ? { modeId: reviewer.modeId } : {}),
          systemPrompt: systemPrompt(reviewer),
        },
        title: `${reviewer.name}: ${record.repo}#${record.number}`,
        prompt: reviewPrompt(record),
        outputSchema: reviewOutcomeJsonSchema,
        labels: { "pr-reviews": reviewer.id },
      });
      const previous = this.checkoutQueues.get(checkout) ?? Promise.resolve();
      const created = previous.catch(() => undefined).then(create);
      this.checkoutQueues.set(checkout, created);
      agentId = (await created).id;
      this.store.update(record.id, { status: "running", agentId, round: 1 });
    } catch (error) {
      this.fail(record.id, message(error));
      return this.release();
    }
    await this.follow(record.id, agentId);
  }

  // An agent that waits for my permission does no work, so it gives its slot to the next review.
  // A re-review continues the agent of the last review: it keeps its context and its workspace.
  // A new agent starts when the reviewer settings changed, after MAX_ROUNDS, or when the old agent is not idle.
  private async continueAgent(paseo: PaseoApi, record: ReviewRecord) {
    const previous = this.store.records().find((candidate) => candidate.key === record.key && candidate.id !== record.id && candidate.agentId);
    if (
      !previous ||
      previous.status !== "done" ||
      previous.reviewerId !== record.reviewerId ||
      previous.agentConfig !== record.agentConfig ||
      (previous.round ?? 1) >= MAX_ROUNDS
    ) {
      return null;
    }
    try {
      const agent = paseo.agents.ref(previous.agentId!);
      let snapshot = (await agent.refresh())?.agent;
      if (snapshot?.archivedAt) {
        await this.restore(previous.agentId!);
        snapshot = await this.idleAfterRestore(agent);
      }
      if (!snapshot || snapshot.archivedAt || snapshot.status !== "idle") return null;
      await agent.run(followUpPrompt(record), { timeoutMs: SEND_WAIT_MS });
      return { agentId: previous.agentId!, round: (previous.round ?? 1) + 1 };
    } catch {
      return null;
    }
  }

  // A restored agent reports "closed" for a few seconds before its session is open again.
  private async idleAfterRestore(agent: ReturnType<PaseoApi["agents"]["ref"]>) {
    const deadline = Date.now() + RESTORE_WAIT_MS;
    while (Date.now() < deadline) {
      const snapshot = (await agent.refresh())?.agent;
      if (snapshot?.status !== "closed") return snapshot;
      await sleep(RESTORE_POLL_MS);
    }
    return undefined;
  }

  private async follow(recordId: string, agentId: string) {
    const deadline = Date.now() + AGENT_DEADLINE_MS;
    let holdsSlot = true;
    try {
      const agent = (await this.daemon.api()).agents.ref(agentId);
      while (!this.disposed && Date.now() < deadline) {
        const result = await agent.waitForFinish(WAIT_STEP_MS);
        if (this.disposed || !this.stillActive(recordId)) return;
        if (result.status === "timeout") continue;
        if (result.status === "permission") {
          if (holdsSlot) {
            this.store.update(recordId, { status: "permission" });
            this.release();
            holdsSlot = false;
          }
          await sleep(PERMISSION_POLL_MS);
          continue;
        }
        if (result.status === "error") return this.fail(recordId, result.error ?? "The agent failed");
        const outcome = parseOutcome(result.lastMessage);
        if (!outcome) return this.fail(recordId, "The agent did not return a review result");
        return this.store.update(recordId, { status: "done", outcome, finishedAt: new Date().toISOString() });
      }
      if (!this.disposed) this.fail(recordId, "The agent did not finish in 4 hours");
    } catch (error) {
      if (!this.disposed) this.fail(recordId, message(error));
    } finally {
      if (holdsSlot) this.release();
    }
  }

  private stillActive(recordId: string) {
    const status = this.store.records().find((record) => record.id === recordId)?.status;
    return status !== undefined && ACTIVE.has(status);
  }

  private fail(recordId: string, error: string) {
    this.store.update(recordId, { status: "failed", error, finishedAt: new Date().toISOString() });
  }

  private release() {
    this.running--;
    this.pump();
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function agentConfig({ name, provider, model, modeId, focus, approval, secondOpinion }: Reviewer) {
  const settings = JSON.stringify({ name, provider, model, modeId, focus, approval, secondOpinion });
  return createHash("sha256").update(settings).digest("hex").slice(0, 16);
}

async function agentModel(paseo: PaseoApi, reviewer: Reviewer) {
  if (reviewer.model) return `${reviewer.provider}/${reviewer.model}`;
  const { entries } = await paseo.providers.snapshot();
  const models = entries.find((entry) => entry.provider === reviewer.provider)?.models ?? [];
  const model = models.find((candidate) => candidate.isDefault) ?? models[0];
  if (!model) throw new Error(`Provider ${reviewer.provider} has no models`);
  return `${reviewer.provider}/${model.id}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
