import type { PaseoProviderUsageResult } from "@getpaseo/client";
import type { Daemon } from "./daemon";
import { bestAccount, type ProviderUsage, type UsageRules, usageHold } from "./usage-rules";
import { zeroSubUsage } from "./zerosub";

const REFRESH_MS = 5 * 60_000;

export class UsageGuard {
  private readonly daemon: Daemon;
  private usage: ProviderUsage[] = [];
  private fetchedAt = 0;

  constructor(daemon: Daemon) {
    this.daemon = daemon;
  }

  // ZeroSub knows each account of a provider. For a provider that ZeroSub does not manage, Paseo's report applies.
  async refresh() {
    if (Date.now() - this.fetchedAt < REFRESH_MS) return;
    try {
      const [report, zeroSubState] = await Promise.all([
        (await this.daemon.api()).providers.listUsage() as Promise<PaseoProviderUsageResult>,
        this.daemon.invokePluginRpc("zerosub", "zerosub.state", {}).catch(() => null),
      ]);
      const accounts = zeroSubUsage(zeroSubState);
      const managed = new Set(accounts.map((account) => account.providerId));
      const reported = report.providers.filter((provider) => provider.status === "available" && !managed.has(provider.providerId));
      this.usage = [...accounts, ...reported];
      this.fetchedAt = Date.now();
    } catch {
      // Keep the last known usage. Without usage data, reviews do not wait.
    }
  }

  hold(providers: string[], rules: UsageRules) {
    return usageHold(this.usage, providers, rules, Date.now());
  }

  account(providerId: string, rules: UsageRules) {
    return bestAccount(this.usage, providerId, rules, Date.now());
  }

  // For example "Claude: me@example.com".
  accountLabel(accountId: string) {
    const account = this.usage.find((entry) => entry.accountId === accountId);
    return account ? `${account.displayName}: ${account.accountLabel ?? accountId}` : accountId;
  }
}
