import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReviewRecord } from "./review-store.ts";
import { reviewStats } from "./review-stats.ts";

const NOW = Date.parse("2026-11-24T12:00:00Z");
const HOUR_MS = 60 * 60_000;

function record(key: string, event: "APPROVE" | "COMMENT" | "NONE", findings: number, hoursAgo = 0, status: ReviewRecord["status"] = "done", tokens: number | null = null) {
  const finishedAt = new Date(NOW - hoursAgo * HOUR_MS).toISOString();
  return { key, status, finishedAt, tokens, outcome: { event, findings, needsHuman: false, reason: "" } } as ReviewRecord;
}

test("counts reviews, pull requests, approvals, and findings of finished reviews only", () => {
  const { hourly, hourlyTokens, ...totals } = reviewStats(
    [record("acme/app#1", "COMMENT", 3), record("acme/app#1", "APPROVE", 0), record("acme/app#2", "COMMENT", 2), record("acme/app#3", "APPROVE", 5, 0, "failed")],
    NOW,
  );
  assert.deepEqual(totals, { reviews: 3, pullRequests: 2, approved: 1, findings: 5, tokens: 0 });
  assert.equal(hourly.length, 24);
});

test("puts each review in its hour, with the newest hour last", () => {
  const { hourly } = reviewStats([record("a#1", "APPROVE", 0, 0.5), record("a#2", "APPROVE", 0, 0.9), record("a#3", "APPROVE", 0, 23.5)], NOW);
  assert.equal(hourly[23], 2);
  assert.equal(hourly[0], 1);
  assert.equal(hourly.reduce((sum, count) => sum + count, 0), 3);
});

test("adds the tokens of each hour, and counts a review without tokens as zero", () => {
  const stats = reviewStats([record("a#1", "APPROVE", 0, 0.5, "done", 1_000), record("a#2", "APPROVE", 0, 0.7, "done", 500), record("a#3", "APPROVE", 0, 3.2)], NOW);
  assert.equal(stats.tokens, 1_500);
  assert.equal(stats.hourlyTokens[23], 1_500);
  assert.equal(stats.hourlyTokens[20], 0);
});
