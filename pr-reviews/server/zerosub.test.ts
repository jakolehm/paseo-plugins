import assert from "node:assert/strict";
import { test } from "node:test";
import { zeroSubUsage } from "./zerosub.ts";

function account(id: string, changes: Record<string, unknown> = {}) {
  return {
    id,
    family: "claude",
    label: id,
    status: "ready",
    disabled: false,
    limitedUntil: null,
    usage: { windows: [{ id: "seven_day", label: "Weekly", usedPercent: 12, resetsAt: "2026-11-26T05:00:00Z" }] },
    ...changes,
  };
}

test("maps ready accounts and names the week as Paseo does", () => {
  const [usage] = zeroSubUsage({ accounts: [account("team")] });
  assert.deepEqual(usage, {
    providerId: "claude",
    displayName: "Claude",
    accountId: "team",
    accountLabel: "team",
    limitedUntil: null,
    windows: [{ id: "weekly", label: "Weekly", usedPct: 12, resetsAt: "2026-11-26T05:00:00Z" }],
  });
});

test("leaves out accounts that are signed out, disabled, or of other families", () => {
  const usage = zeroSubUsage(
    {
      accounts: [
        account("off", { disabled: true }),
        account("signed-out", { status: "signed-out" }),
        account("limited", { limitedUntil: "2026-11-24T13:00:00Z" }),
        account("grok", { family: "grok" }),
      ],
    },
  );
  assert.deepEqual(usage.map((entry) => entry.accountId), ["limited"]);
});

test("gives nothing for an answer it does not know", () => {
  assert.deepEqual(zeroSubUsage(null), []);
  assert.deepEqual(zeroSubUsage({ accounts: "no" }), []);
});
