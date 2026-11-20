import type { PullRequest } from "./pull-request";

const STALE_DAYS = 30;

interface AttentionSnapshot {
  login: string;
  syncedAt: string;
  reviewRequested: PullRequest[];
  authored: PullRequest[];
}

// PRs that wait on me on GitHub, also outside the repos that a reviewer covers.
export class Attention {
  private snapshot: AttentionSnapshot | null = null;
  private error: string | null = null;

  current() {
    return { snapshot: this.snapshot, error: this.error };
  }

  searches() {
    const since = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60_000).toISOString().slice(0, 10);
    return [`user-review-requested:@me updated:>=${since}`, `author:@me updated:>=${since}`];
  }

  update(login: string, [reviewRequested, authored]: PullRequest[][]) {
    this.snapshot = { login, syncedAt: new Date().toISOString(), reviewRequested, authored };
    this.error = null;
  }

  fail(error: string) {
    this.error = error;
  }
}

// Ordered from most to least urgent: feedback to answer, then conflicts, then a PR that is ready to merge.
export function authorActions(pr: PullRequest, me: string): { reasons: string[]; rank: number } | null {
  if (pr.isDraft) return null;
  const unanswered = pr.threads.filter(
    (thread) => !thread.resolved && thread.last !== null && thread.last.author !== me && !thread.last.isBot,
  ).length;
  const actions = [
    { rank: 0, reason: pr.reviewDecision === "CHANGES_REQUESTED" && "Changes requested" },
    { rank: 0, reason: unanswered > 0 && `${unanswered} unanswered review ${unanswered === 1 ? "thread" : "threads"}` },
    { rank: 1, reason: pr.mergeable === "CONFLICTING" && "Merge conflicts" },
    { rank: 2, reason: pr.reviewDecision === "APPROVED" && pr.mergeable === "MERGEABLE" && "Approved, ready to merge" },
  ].filter((action): action is { rank: number; reason: string } => Boolean(action.reason));
  if (actions.length === 0) return null;
  return { reasons: actions.map((action) => action.reason), rank: actions[0].rank };
}
