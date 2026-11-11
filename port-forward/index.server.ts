import type { PluginServerContext, PluginSettingsState } from "@getpaseo/plugin/server";
import {
  forwardStartRpc,
  forwardStopRpc,
  forwardsListRpc,
  remoteHostsRpc,
  remotePortsRpc,
} from "./shared/forwards";
import { autoForwardSettings } from "./shared/settings";
import {
  listeningPortsRpc,
  tunnelCloseRpc,
  tunnelOpenRpc,
  tunnelReadRpc,
  tunnelWriteRpc,
} from "./shared/tunnel";
import { AutoForwarder } from "./server/auto-forwarder";
import { Forwarder } from "./server/forwarder";
import { listListeningPorts } from "./server/listening-ports";
import { RemoteHosts } from "./server/remote-hosts";
import { TunnelEndpoint } from "./server/tunnel-endpoint";

export default function contribute(server: PluginServerContext) {
  const tunnels = new TunnelEndpoint();
  server.handle(tunnelOpenRpc, ({ port }) => tunnels.open(port));
  server.handle(tunnelWriteRpc, ({ id, data }) => tunnels.write(id, data));
  server.handle(tunnelReadRpc, ({ id }) => tunnels.read(id));
  server.handle(tunnelCloseRpc, ({ id }) => tunnels.close(id));
  server.handle(listeningPortsRpc, listListeningPorts);

  const hosts = new RemoteHosts();
  const forwarder = new Forwarder(hosts);
  const autoForwarder = new AutoForwarder(hosts, forwarder);
  server.handle(remoteHostsRpc, async () => ({ hosts: await hosts.list() }));
  server.handle(remotePortsRpc, ({ serverId }) => hosts.call(serverId, listeningPortsRpc, {}));
  server.handle(forwardsListRpc, () => ({ forwards: forwarder.list() }));
  server.handle(forwardStartRpc, async ({ serverId, remotePort }) => {
    const host = (await hosts.list()).find((candidate) => candidate.serverId === serverId);
    if (!host) throw new Error(`Host ${serverId} is not connected to this daemon`);
    return forwarder.start(host, remotePort);
  });
  server.handle(forwardStopRpc, ({ id }) => {
    const stopped = forwarder.stop(id);
    if (stopped) autoForwarder.dismiss(stopped);
    return {};
  });

  const settings = server.registerSettings(autoForwardSettings);
  const applySettings = (state: PluginSettingsState<typeof autoForwardSettings.schema>) => {
    if (state.status === "ready") autoForwarder.configure(state.values);
  };
  void settings.read().then(applySettings, () => undefined);
  const unsubscribe = settings.subscribe(applySettings);

  return () => {
    unsubscribe();
    autoForwarder.dispose();
    tunnels.closeAll();
    forwarder.stopAll();
    void hosts.close();
  };
}
