import type { ProviderUsage } from "./usage-rules";

// The account that ZeroSub opens a new agent on, when the agent's metadata names one.
export const ZEROSUB_ACCOUNT_KEY = "zerosub.account";

const FAMILY_NAMES: Record<string, string> = { claude: "Claude", codex: "Codex" };

interface ZeroSubAccount {
  id: string;
  family: string;
  label: string;
  status: string;
  disabled: boolean;
  limitedUntil: string | null;
  usage: { windows?: { id: string; label: string; usedPercent?: number | null; resetsAt?: string | null }[] } | null;
}

// The signed-in accounts of ZeroSub, with their usage. An account at its limit stays, so that the rules hold it. ZeroSub's own state RPC is not a public
// interface, so anything unexpected counts as "no ZeroSub", and the usage of Paseo's own report applies.
export function zeroSubUsage(state: unknown): ProviderUsage[] {
  const accounts = (state as { accounts?: unknown })?.accounts;
  if (!Array.isArray(accounts)) return [];
  return (accounts as ZeroSubAccount[])
    .filter((account) => FAMILY_NAMES[account.family] && account.status === "ready" && !account.disabled)
    .map((account) => ({
      providerId: account.family,
      displayName: FAMILY_NAMES[account.family],
      accountId: account.id,
      accountLabel: account.label,
      limitedUntil: account.limitedUntil,
      windows: (account.usage?.windows ?? []).map((window) => ({
        // ZeroSub names the week "seven_day". The pacing rule reads weekly windows by their id.
        id: window.id === "seven_day" ? "weekly" : window.id,
        label: window.label,
        usedPct: window.usedPercent ?? null,
        resetsAt: window.resetsAt ?? null,
      })),
    }));
}
