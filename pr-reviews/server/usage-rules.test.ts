import assert from "node:assert/strict";
import { test } from "node:test";
import { bestAccount, type ProviderUsage, usageHold } from "./usage-rules.ts";

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

function account(accountId: string, weeklyPct: number): ProviderUsage {
  return {
    providerId: "claude",
    displayName: "Claude",
    accountId,
    accountLabel: accountId,
    windows: [{ id: "weekly", label: "Weekly", usedPct: weeklyPct, resetsAt: "2026-11-20T12:00:00Z" }],
  };
}

test("does not hold while one account of the provider has room", () => {
  const usage = [account("max", 86), account("team", 2)];
  assert.equal(usageHold(usage, ["claude"], RULES, NOW), null);
  assert.equal(bestAccount(usage, "claude", RULES, NOW), "team");
});

test("holds when every account must wait, and names each account", () => {
  const usage = [account("max", 86), account("team", 90)];
  assert.match(usageHold(usage, ["claude"], RULES, NOW) ?? "", /Claude account max weekly usage is 86%.*; Claude account team weekly usage is 90%/);
  assert.equal(bestAccount(usage, "claude", RULES, NOW), null);
});

test("selects the account with the most room", () => {
  const usage = [account("a", 40), account("b", 10), account("c", 30)];
  assert.equal(bestAccount(usage, "claude", { usageLimitPct: 80, usagePacing: false }, NOW), "b");
});

test("selects no account from Paseo's own report", () => {
  assert.equal(bestAccount(claude([{ id: "weekly", label: "Weekly", usedPct: 1 }]), "claude", RULES, NOW), null);
});

test("holds when every account is at its limit, and selects none", () => {
  const usage = [
    { ...account("max", 10), limitedUntil: "2026-11-19T14:00:00Z" },
    { ...account("team", 5), limitedUntil: "2026-11-19T13:00:00Z" },
  ];
  assert.match(usageHold(usage, ["claude"], RULES, NOW) ?? "", /Claude account max is at its limit until 2026-11-19 14:00 UTC; Claude account team is at its limit/);
  assert.equal(bestAccount(usage, "claude", RULES, NOW), null);
});

test("uses an account again after its limit ends", () => {
  const usage = [{ ...account("team", 5), limitedUntil: "2026-11-19T11:00:00Z" }];
  assert.equal(bestAccount(usage, "claude", RULES, NOW), "team");
});
