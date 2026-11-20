import assert from "node:assert/strict";
import { test } from "node:test";
import { type ProviderUsage, usageHold } from "./usage-guard.ts";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const RULES = { usageLimitPct: 80, usagePacing: true };

function claude(windows: ProviderUsage["windows"]): ProviderUsage[] {
  return [{ providerId: "claude", displayName: "Claude", windows }];
}

test("holds when a window is above the limit", () => {
  const usage = claude([{ id: "five_hour", label: "Session", usedPct: 85, resetsAt: "2026-11-19T14:00:00Z" }]);
  assert.equal(usageHold(usage, ["claude"], RULES, NOW), "Claude session usage is 85% until 2026-11-19 14:00 UTC");
});

test("ignores providers that the reviewer does not use", () => {
  const usage = claude([{ id: "five_hour", label: "Session", usedPct: 95 }]);
  assert.equal(usageHold(usage, ["codex"], RULES, NOW), null);
});

test("holds when the weekly usage runs ahead of the week", () => {
  // The week started 2 days ago, so about 29% of it has passed.
  const usage = claude([{ id: "weekly", label: "Weekly", usedPct: 50, resetsAt: "2026-11-24T12:00:00Z" }]);
  assert.match(usageHold(usage, ["claude"], RULES, NOW) ?? "", /Claude weekly usage is 50%, but only 29% of the week/);
});

test("does not hold when the weekly usage keeps pace", () => {
  const usage = claude([{ id: "weekly", label: "Weekly", usedPct: 35, resetsAt: "2026-11-24T12:00:00Z" }]);
  assert.equal(usageHold(usage, ["claude"], RULES, NOW), null);
});

test("a limit of 100 and no pacing never hold", () => {
  const usage = claude([{ id: "weekly", label: "Weekly", usedPct: 99, resetsAt: "2026-11-24T12:00:00Z" }]);
  assert.equal(usageHold(usage, ["claude"], { usageLimitPct: 100, usagePacing: false }, NOW), null);
});

test("leaves the account out of the provider name", () => {
  const usage = [{ providerId: "claude", displayName: "Claude (me@example.com)", windows: [{ id: "five_hour", label: "Session", usedPct: 90 }] }];
  assert.equal(usageHold(usage, ["claude"], { usageLimitPct: 80, usagePacing: false }, Date.now()), "Claude session usage is 90%");
});
