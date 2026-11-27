import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type ReviewRecord, ReviewStore } from "./review-store.ts";

const NOW = Date.parse("2026-11-27T12:00:00Z");
const HOUR = 60 * 60_000;

function record(id: string, hoursAgo: number, changes: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id,
    key: `o/r#${id}`,
    repo: "o/r",
    number: 1,
    title: id,
    url: "",
    author: "a",
    head: "abc",
    since: null,
    reason: "new PR",
    reviewerId: "r",
    reviewerName: "R",
    agentId: null,
    status: "done",
    queuedAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
    finishedAt: null,
    outcome: null,
    error: null,
    ...changes,
  };
}

test("old records drop out, but active reviews and unarchived workspaces stay", () => {
  const store = new ReviewStore(join(mkdtempSync(join(tmpdir(), "pr-reviews-")), "state.json"));
  store.add(record("old-done", 72), NOW - 72 * HOUR);
  store.add(record("old-running", 72, { status: "running", agentId: "a1" }), NOW - 72 * HOUR);
  store.add(record("old-workspace", 72, { agentId: "a2" }), NOW - 72 * HOUR);
  store.add(record("old-archived", 72, { agentId: "a3", archived: true }), NOW - 72 * HOUR);
  store.add(record("recent", 1), NOW - HOUR);
  store.add(record("new", 0), NOW);
  assert.deepEqual(
    store.records().map((kept) => kept.id),
    ["new", "recent", "old-workspace", "old-running"],
  );
});
