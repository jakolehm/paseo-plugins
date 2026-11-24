const PACE_MARGIN_PCT = 10;
const WEEK_MS = 7 * 24 * 60 * 60_000;

export interface UsageWindow {
  id: string;
  label: string;
  usedPct?: number | null;
  resetsAt?: string | null;
}

// One account of a provider. Only ZeroSub names the account: Paseo's own report has one account for each provider.
export interface ProviderUsage {
  providerId: string;
  displayName: string;
  accountId?: string;
  accountLabel?: string;
  limitedUntil?: string | null;
  windows: UsageWindow[];
}

export interface UsageRules {
  usageLimitPct: number;
  usagePacing: boolean;
}

// Returns why new reviews must wait, or null. Reviews are background work, so they leave room for my own sessions.
// A provider with several accounts waits only when each of its accounts must wait.
export function usageHold(usage: ProviderUsage[], providers: string[], rules: UsageRules, now: number): string | null {
  for (const providerId of providers) {
    const reasons = usage.filter((account) => account.providerId === providerId).map((account) => accountHold(account, rules, now));
    if (reasons.length > 0 && reasons.every(Boolean)) return reasons.join("; ");
  }
  return null;
}

// The ZeroSub account with the most room among those that need not wait, or null.
export function bestAccount(usage: ProviderUsage[], providerId: string, rules: UsageRules, now: number): string | null {
  const free = usage.filter((account) => account.providerId === providerId && account.accountId && !accountHold(account, rules, now));
  free.sort((a, b) => highestUse(a) - highestUse(b));
  return free[0]?.accountId ?? null;
}

function accountHold(account: ProviderUsage, rules: UsageRules, now: number) {
  if (account.limitedUntil && Date.parse(account.limitedUntil) > now) {
    return `${accountName(account)} is at its limit${until(account.limitedUntil)}`;
  }
  for (const window of account.windows) {
    const used = window.usedPct;
    if (used == null) continue;
    const name = `${accountName(account)} ${window.label.toLowerCase()} usage is ${Math.round(used)}%`;
    if (rules.usageLimitPct < 100 && used >= rules.usageLimitPct) return `${name}${resets(window)}`;
    const elapsed = weekElapsedPct(window, now);
    if (rules.usagePacing && elapsed !== null && used > elapsed + PACE_MARGIN_PCT) {
      return `${name}, but only ${Math.round(elapsed)}% of the week has passed`;
    }
  }
  return null;
}

function highestUse(account: ProviderUsage) {
  return Math.max(0, ...account.windows.map((window) => window.usedPct ?? 0));
}

function accountName(account: ProviderUsage) {
  return account.accountLabel ? `${providerName(account)} account ${account.accountLabel}` : providerName(account);
}

// Paseo adds the account to the name, for example "Claude (me@example.com)".
function providerName(provider: ProviderUsage): string {
  return provider.displayName.replace(/\s*\(.*\)$/, "");
}

function weekElapsedPct(window: UsageWindow, now: number) {
  if (!window.id.startsWith("weekly") || !window.resetsAt) return null;
  const start = Date.parse(window.resetsAt) - WEEK_MS;
  return Math.min(100, Math.max(0, ((now - start) / WEEK_MS) * 100));
}

function resets(window: UsageWindow) {
  return window.resetsAt ? until(window.resetsAt) : "";
}

function until(time: string) {
  return ` until ${new Date(time).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

