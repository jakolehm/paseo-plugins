import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createPaseoApi, type PaseoApi } from "@getpaseo/client";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { createHostClient } from "@getpaseo/client/node";
import { PLUGIN_ID } from "../shared/plugin-id";

// Handlers get `paseo` only per call. The watcher starts agents from a timer, so it keeps its own connection.
export class Daemon {
  private connection: Promise<{ client: DaemonClient; api: PaseoApi }> | null = null;

  async api(): Promise<PaseoApi> {
    return (await this.connect()).api;
  }

  async invokePluginRpc(pluginId: string, method: string, input: unknown) {
    return (await this.connect()).client.invokePluginRpc(pluginId, method, input);
  }

  async cancelAgent(agentId: string) {
    await (await this.connect()).client.cancelAgent(agentId);
  }

  async restoreWorkspace(workspaceId: string) {
    await (await this.connect()).client.restoreWorkspace(workspaceId);
  }

  async close() {
    const connection = this.connection;
    this.connection = null;
    if (connection) await (await connection).client.close();
  }

  private connect() {
    if (!this.connection) {
      const home = process.env.PASEO_HOME ?? join(homedir(), ".paseo");
      const client = createHostClient(readListenAddress(home), {
        clientId: `${PLUGIN_ID}-${randomUUID()}`,
        clientType: "cli",
        localCredential: () => readFileSync(join(home, "local-credential"), "utf8").trim(),
      });
      this.connection = client.connect().then(() => ({ client, api: createPaseoApi(client) }));
      this.connection.catch(() => (this.connection = null));
    }
    return this.connection;
  }
}

function readListenAddress(home: string): string {
  const lock = JSON.parse(readFileSync(join(home, "paseo.pid"), "utf8")) as { listen?: unknown };
  if (typeof lock.listen !== "string") throw new Error(`No daemon address in ${home}/paseo.pid`);
  return lock.listen;
}
