import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewQuality } from "./review-quality.ts";
import type { ReviewRecord } from "./review-store.ts";

function record(repo: string, event: "APPROVE" | "COMMENT", findings: number, since: string | null = null) {
  return { repo, since, status: "done", outcome: { event, findings, needsHuman: false, reason: "" } } as ReviewRecord;
}

test("counts first reviews only, in total and for each repo, with the busiest repo first", () => {
  const quality = reviewQuality([
    record("o/a", "COMMENT", 3),
    record("o/b", "APPROVE", 0),
    record("o/b", "COMMENT", 2),
    record("o/b", "COMMENT", 4, "abc123"),
  ]);
  assert.deepEqual(quality.total, { firstReviews: 3, findings: 5, approved: 1, clean: 1 });
  assert.deepEqual(quality.repos, [
    { repo: "o/b", firstReviews: 2, findings: 2, approved: 1, clean: 1 },
    { repo: "o/a", firstReviews: 1, findings: 3, approved: 0, clean: 0 },
  ]);
});
