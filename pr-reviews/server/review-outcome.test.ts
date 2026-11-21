import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOutcome } from "./review-outcome.ts";

test("reads the JSON block after a summary that has braces", () => {
  const message = [
    "The PR moves `parse()` into `{lib}`. I posted no review.",
    "```json",
    '{"event": "NONE", "findings": 0, "needsHuman": true, "reason": "approve blocked"}',
    "```",
  ].join("\n");
  assert.deepEqual(parseOutcome(message), { event: "NONE", findings: 0, needsHuman: true, reason: "approve blocked" });
});

test("returns null without a result", () => {
  assert.equal(parseOutcome("I could not finish."), null);
});

test("reads a result whose reason has braces", () => {
  const message = '```json\n{"event": "APPROVE", "findings": 0, "needsHuman": false, "reason": "the links open /u/{name}"}\n```';
  assert.deepEqual(parseOutcome(message), { event: "APPROVE", findings: 0, needsHuman: false, reason: "the links open /u/{name}" });
});
