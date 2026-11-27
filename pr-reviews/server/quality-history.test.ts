import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { QualityHistory } from "./quality-history.ts";
import type { ReviewRecord } from "./review-store.ts";

const NOW = Date.parse("2026-11-27T12:00:00Z");

function record(finishedAt: string, findings: number) {
  return { repo: "o/a", since: null, status: "done", finishedAt, outcome: { event: "COMMENT", findings, needsHuman: false, reason: "" } } as ReviewRecord;
}

function historyFile() {
  return join(mkdtempSync(join(tmpdir(), "pr-reviews-")), "quality-history.json");
}

test("saves each day and keeps an older day after its records are gone", () => {
  const file = historyFile();
  new QualityHistory(file).record([record("2026-11-26T10:00:00Z", 2), record("2026-11-27T09:00:00Z", 4)], NOW);
  const history = new QualityHistory(file);
  history.record([record("2026-11-28T09:00:00Z", 1)], NOW + 24 * 60 * 60_000);
  const days = history.daily(3, NOW + 24 * 60 * 60_000);
  assert.deepEqual(
    days.map(({ date, firstReviews, findings }) => [date, firstReviews, findings]),
    [
      ["2026-11-26", 1, 2],
      ["2026-11-27", 1, 4],
      ["2026-11-28", 1, 1],
    ],
  );
});

test("a day without reviews has zero counts", () => {
  const [day] = new QualityHistory(historyFile()).daily(1, NOW);
  assert.deepEqual(day, { date: "2026-11-27", firstReviews: 0, findings: 0, approved: 0, clean: 0 });
});
