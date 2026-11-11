import { randomUUID } from "node:crypto";
import net from "node:net";
import type { Forward, RemoteHost } from "../shared/forwards";
import { tunnelCloseRpc, tunnelOpenRpc, tunnelReadRpc, tunnelWriteRpc } from "../shared/tunnel";
import type { RemoteHosts } from "./remote-hosts";

interface ActiveForward {
  forward: Forward;
  server: net.Server;
  sockets: Set<net.Socket>;
}

export class Forwarder {
  private readonly active = new Map<string, ActiveForward>();
  private readonly starting = new Map<string, Promise<Forward>>();

  constructor(private readonly hosts: RemoteHosts) {}

  list(): Forward[] {
    return [...this.active.values()].map(({ forward, sockets }) => ({
      ...forward,
      connections: sockets.size,
    }));
  }

  start(host: RemoteHost, remotePort: number, { auto = false } = {}): Promise<Forward> {
    const existing = this.find(host.serverId, remotePort);
    if (existing) return Promise.resolve(existing);
    const key = `${host.serverId}:${remotePort}`;
    let starting = this.starting.get(key);
    if (!starting) {
      starting = this.open(host, remotePort, auto).finally(() => this.starting.delete(key));
      this.starting.set(key, starting);
    }
    return starting;
  }

  stop(id: string): Forward | null {
    const entry = this.active.get(id);
    if (!entry) return null;
    entry.server.close();
    for (const socket of entry.sockets) socket.destroy();
    this.active.delete(id);
    return entry.forward;
  }

  stopAll() {
    for (const id of this.active.keys()) this.stop(id);
  }

  private find(serverId: string, remotePort: number) {
    return this.list().find(
      (forward) => forward.serverId === serverId && forward.remotePort === remotePort,
    );
  }

  private async open(host: RemoteHost, remotePort: number, auto: boolean): Promise<Forward> {
    const forward: Forward = {
      id: randomUUID(),
      serverId: host.serverId,
      hostLabel: host.label,
      remotePort,
      localPort: remotePort,
      connections: 0,
      auto,
      error: null,
    };
    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => socket.destroy());
      this.pipe(forward, socket).catch((error: unknown) => {
        forward.error = error instanceof Error ? error.message : String(error);
        socket.destroy();
      });
    });
    forward.localPort = await listen(server, (await isInUse(remotePort)) ? 0 : remotePort);
    this.active.set(forward.id, { forward, server, sockets });
    return forward;
  }

  private async pipe(forward: Forward, socket: net.Socket) {
    const remote = this.hosts.forHost(forward.serverId);
    socket.pause();
    const { id } = await remote(tunnelOpenRpc, { port: forward.remotePort });
    forward.error = null;
    const closeTunnel = () => remote(tunnelCloseRpc, { id }).catch(() => undefined);
    if (socket.destroyed) return void closeTunnel();

    socket.on("data", (chunk) => {
      socket.pause();
      remote(tunnelWriteRpc, { id, data: chunk.toString("base64") }).then(
        () => socket.resume(),
        () => socket.destroy(),
      );
    });
    socket.on("close", closeTunnel);
    socket.resume();

    while (!socket.destroyed) {
      const { chunks, ended } = await remote(tunnelReadRpc, { id });
      for (const chunk of chunks) socket.write(Buffer.from(chunk, "base64"));
      if (ended) {
        socket.end();
        return;
      }
    }
  }
}

function listen(server: net.Server, port: number) {
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve((server.address() as net.AddressInfo).port);
    });
  });
}

// A bind to 127.0.0.1 succeeds on macOS even when another app listens on all addresses,
// so ask the port directly.
async function isInUse(port: number) {
  const answers = await Promise.all(["127.0.0.1", "::1"].map((host) => accepts(host, port)));
  return answers.includes(true);
}

function accepts(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ host, port, timeout: 500 });
    const finish = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}
