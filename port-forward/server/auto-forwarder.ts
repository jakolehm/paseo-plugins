import type { Forward, RemoteHost } from "../shared/forwards";
import { inPortRanges, parsePortRanges, type PortRange } from "../shared/port-ranges";
import { listeningPortsRpc } from "../shared/tunnel";
import type { Forwarder } from "./forwarder";
import type { RemoteHosts } from "./remote-hosts";

const POLL_MS = 3000;

export class AutoForwarder {
  private ranges: readonly PortRange[] = [];
  private timer: NodeJS.Timeout | null = null;
  private generation = 0;
  private readonly dismissed = new Map<string, Set<number>>();

  constructor(
    private readonly hosts: RemoteHosts,
    private readonly forwarder: Forwarder,
  ) {}

  configure({ enabled, ports }: { enabled: boolean; ports: string }) {
    this.ranges = parsePortRanges(ports) ?? [];
    this.dispose();
    if (enabled) {
      this.schedule(this.generation);
      return;
    }
    this.dismissed.clear();
    this.stopAutoForwards();
  }

  dismiss(forward: Forward) {
    const ports = this.dismissed.get(forward.serverId) ?? new Set<number>();
    ports.add(forward.remotePort);
    this.dismissed.set(forward.serverId, ports);
  }

  dispose() {
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(generation: number) {
    this.timer = setTimeout(async () => {
      await this.sync(generation);
      if (generation === this.generation) this.schedule(generation);
    }, POLL_MS);
  }

  private async sync(generation: number) {
    for (const host of await this.hosts.list().catch(() => [])) {
      if (generation !== this.generation) return;
      if (!host.online) continue;
      const listening = await this.hosts
        .call(host.serverId, listeningPortsRpc, {})
        .then(({ ports }) =>
          ports.map(({ port }) => port).filter((port) => inPortRanges(this.ranges, port)),
        )
        .catch(() => null);
      if (listening) await this.reconcile(generation, host, listening);
    }
  }

  private async reconcile(generation: number, host: RemoteHost, listening: number[]) {
    const dismissed = this.dismissed.get(host.serverId) ?? new Set<number>();
    for (const port of dismissed) {
      if (!listening.includes(port)) dismissed.delete(port);
    }
    for (const forward of this.forwarder.list()) {
      if (forward.auto && forward.serverId === host.serverId && !listening.includes(forward.remotePort)) {
        this.forwarder.stop(forward.id);
      }
    }
    for (const port of listening) {
      if (generation !== this.generation) return;
      if (dismissed.has(port)) continue;
      await this.forwarder.start(host, port, { auto: true }).catch(() => undefined);
    }
  }

  private stopAutoForwards() {
    for (const forward of this.forwarder.list()) {
      if (forward.auto) this.forwarder.stop(forward.id);
    }
  }
}
