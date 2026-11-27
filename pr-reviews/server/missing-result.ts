// An agent can end its turn to wait for a background task, such as a Codex run, and continue by itself when the task
// finishes. So a turn without a result fails the review only after a grace period.
export class MissingResult {
  private readonly graceMs: number;
  private since: number | null = null;

  constructor(graceMs: number) {
    this.graceMs = graceMs;
  }

  expired(now = Date.now()) {
    this.since ??= now;
    return now - this.since >= this.graceMs;
  }
}
