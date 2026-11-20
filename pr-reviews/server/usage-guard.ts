import type { PaseoProviderUsageResult } from "@getpaseo/client";
import type { Daemon } from "./daemon";

const REFRESH_MS = 5 * 60_000;
const PACE_MARGIN_PCT = 10;
const WEEK_MS = 7 * 24 * 60 * 60_000;

export interface UsageWindow {
  id: string;
  label: string;
  usedPct?: number | null;
  resetsAt?: string | null;
}

export interface ProviderUsage {
  providerId: string;
  displayName: string;
  windows: UsageWindow[];
}

export interface UsageRules {
  usageLimitPct: number;
  usagePacing: boolean;
}

// Returns why new reviews must wait, or null. Reviews are background work, so they leave room for my own sessions.
export function usageHold(usage: ProviderUsage[], providers: string[], rules: UsageRules, now: number): string | null {
  for (const provider of usage.filter((candidate) => providers.includes(candidate.providerId))) {
    for (const window of provider.windows) {
      const used = window.usedPct;
      if (used == null) continue;
      const name = `${providerName(provider)} ${window.label.toLowerCase()} usage is ${Math.round(used)}%`;
      if (rules.usageLimitPct < 100 && used >= rules.usageLimitPct) return `${name}${resets(window)}`;
      const elapsed = weekElapsedPct(window, now);
      if (rules.usagePacing && elapsed !== null && used > elapsed + PACE_MARGIN_PCT) {
        return `${name}, but only ${Math.round(elapsed)}% of the week has passed`;
      }
    }
  }
  return null;
}

// Paseo adds the account to the name, for example "Claude (me@example.com)".
function providerName(provider: ProviderUsage) {
  return provider.displayName.replace(/\s*\(.*\)$/, "");
}

function weekElapsedPct(window: UsageWindow, now: number) {
  if (!window.id.startsWith("weekly") || !window.resetsAt) return null;
  const start = Date.parse(window.resetsAt) - WEEK_MS;
  return Math.min(100, Math.max(0, ((now - start) / WEEK_MS) * 100));
}

function resets(window: UsageWindow) {
  return window.resetsAt ? ` until ${new Date(window.resetsAt).toISOString().slice(0, 16).replace("T", " ")} UTC` : "";
}

export class UsageGuard {
  private readonly daemon: Daemon;
  private usage: ProviderUsage[] = [];
  private fetchedAt = 0;

  constructor(daemon: Daemon) {
    this.daemon = daemon;
  }

  async refresh() {
    if (Date.now() - this.fetchedAt < REFRESH_MS) return;
    try {
      const result: PaseoProviderUsageResult = await (await this.daemon.api()).providers.listUsage();
      this.usage = result.providers.filter((provider) => provider.status === "available");
      this.fetchedAt = Date.now();
    } catch {
      // Keep the last known usage. Without usage data, reviews do not wait.
    }
  }

  hold(providers: string[], rules: UsageRules) {
    return usageHold(this.usage, providers, rules, Date.now());
  }
}
