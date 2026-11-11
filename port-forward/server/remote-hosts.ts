import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PluginRpcContract } from "@getpaseo/plugin";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { createHostChannelTransport, createHostClient } from "@getpaseo/client/node";
import type { ZodType, input as ZodInput, output as ZodOutput } from "zod";
import type { RemoteHost } from "../shared/forwards";
import { PLUGIN_ID } from "../shared/plugin-id";

// The plugin SDK cannot call a plugin on another host. This module opens the same
// host route that `paseo.hosts.client()` opens and keeps the raw client for plugin RPC.
export class RemoteHosts {
  private origin: Promise<DaemonClient> | null = null;
  private readonly routes = new Map<string, Promise<DaemonClient>>();

  async list(): Promise<RemoteHost[]> {
    const directory = await (await this.connectOrigin()).listHosts();
    return directory.hosts.flatMap((host) =>
      host.serverId
        ? [
            {
              serverId: host.serverId,
              label: host.label ?? host.targetDescription,
              online: host.status === "online",
            },
          ]
        : [],
    );
  }

  async call<Input extends ZodType, Output extends ZodType>(
    serverId: string,
    contract: PluginRpcContract<Input, Output>,
    input: ZodInput<Input>,
  ): Promise<ZodOutput<Output>> {
    const route = this.route(serverId);
    const client = await route;
    try {
      const output = await client.invokePluginRpc(PLUGIN_ID, contract.name, contract.input.parse(input));
      return contract.output.parse(output);
    } catch (error) {
      if (client.getConnectionState().status !== "connected") this.forget(serverId, route);
      throw error;
    }
  }

  forHost(serverId: string) {
    return <Input extends ZodType, Output extends ZodType>(
      contract: PluginRpcContract<Input, Output>,
      input: ZodInput<Input>,
    ) => this.call(serverId, contract, input);
  }

  async close() {
    const pending = [...this.routes.values()];
    if (this.origin) pending.push(this.origin);
    for (const result of await Promise.allSettled(pending)) {
      if (result.status === "fulfilled") await result.value.close();
    }
    this.routes.clear();
    this.origin = null;
  }

  private route(serverId: string) {
    let route = this.routes.get(serverId);
    if (!route) {
      route = this.openRoute(serverId);
      route.catch(() => this.routes.delete(serverId));
      this.routes.set(serverId, route);
    }
    return route;
  }

  private async openRoute(serverId: string) {
    const origin = await this.connectOrigin();
    const scopeId = randomUUID();
    const client = new DaemonClient({
      url: "ws://routed-host/ws",
      clientId: scopeId,
      clientType: "cli",
      transportFactory: createHostChannelTransport(origin, serverId, scopeId, null),
      reconnect: { enabled: false },
    });
    await client.connect();
    client.setReconnectEnabled(true);
    return client;
  }

  private connectOrigin() {
    if (!this.origin) {
      const home = process.env.PASEO_HOME ?? join(homedir(), ".paseo");
      const client = createHostClient(readListenAddress(home), {
        clientId: `${PLUGIN_ID}-${randomUUID()}`,
        clientType: "cli",
        localCredential: () => readFileSync(join(home, "local-credential"), "utf8").trim(),
      });
      this.origin = client.connect().then(() => client);
      this.origin.catch(() => (this.origin = null));
    }
    return this.origin;
  }

  private forget(serverId: string, route: Promise<DaemonClient>) {
    if (this.routes.get(serverId) !== route) return;
    this.routes.delete(serverId);
    void route.then((client) => client.close());
  }
}

function readListenAddress(home: string): string {
  const lock = JSON.parse(readFileSync(join(home, "paseo.pid"), "utf8")) as { listen?: unknown };
  if (typeof lock.listen !== "string") throw new Error(`No daemon address in ${home}/paseo.pid`);
  return lock.listen;
}
