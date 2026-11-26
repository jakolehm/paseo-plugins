import type { PluginServerContext, PluginSettingsState } from "@getpaseo/plugin/server";
import { checkNowRpc, dashboardRpc, dismissRpc, restoreAgentRpc, reviewNowRpc } from "./shared/dashboard";
import { reviewSettings, settingsBackupRpc } from "./shared/settings";
import { Attention } from "./server/attention";
import { Daemon } from "./server/daemon";
import { buildDashboard } from "./server/dashboard";
import { GitHub } from "./server/github";
import { ReviewRunner } from "./server/review-runner";
import { ReviewStore } from "./server/review-store";
import { SettingsBackup } from "./server/settings-backup";
import { UsageGuard } from "./server/usage-guard";
import { Watcher } from "./server/watcher";

export default function contribute(server: PluginServerContext) {
  const github = new GitHub();
  const daemon = new Daemon();
  const store = new ReviewStore();
  const runner = new ReviewRunner(daemon, store, github);
  const attention = new Attention();
  const watcher = new Watcher(github, daemon, store, runner, attention, new UsageGuard(daemon));
  void runner.resume();

  server.handle(dashboardRpc, () => buildDashboard(store, watcher, attention));
  server.handle(checkNowRpc, () => {
    watcher.runNow();
    return {};
  });
  server.handle(reviewNowRpc, async ({ repo, number, reviewerId }) => {
    await watcher.reviewNow(repo, number, reviewerId);
    return {};
  });
  server.handle(restoreAgentRpc, async ({ agentId }) => {
    await runner.restore(agentId);
    return {};
  });

  server.handle(dismissRpc, ({ key }) => {
    store.dismiss(key);
    return {};
  });

  const backup = new SettingsBackup();
  server.handle(settingsBackupRpc, () => ({ backup: backup.load() }));

  const settings = server.registerSettings(reviewSettings);
  const applySettings = (state: PluginSettingsState<typeof reviewSettings.schema>) => {
    if (state.status !== "ready") return;
    watcher.configure(state.values);
    backup.save(state.values);
  };
  void settings.read().then(applySettings, () => undefined);
  const unsubscribe = settings.subscribe(applySettings);

  return () => {
    unsubscribe();
    watcher.dispose();
    runner.dispose();
    void daemon.close();
  };
}
