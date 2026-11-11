import { randomUUID } from "node:crypto";
import net from "node:net";

const READ_WAIT_MS = 15_000;
const IDLE_LIMIT_MS = 60_000;
const PAUSE_ABOVE_BYTES = 1024 * 1024;

class Tunnel {
  private chunks: Buffer[] = [];
  private bufferedBytes = 0;
  private ended = false;
  private waiter: (() => void) | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly socket: net.Socket,
    private readonly onIdle: () => void,
  ) {
    socket.on("data", (chunk) => this.receive(chunk));
    socket.on("end", () => this.finish());
    socket.on("close", () => this.finish());
    socket.on("error", () => this.finish());
    this.touch();
  }

  write(data: Buffer) {
    this.touch();
    if (!this.socket.destroyed) this.socket.write(data);
  }

  async read(): Promise<{ chunks: string[]; ended: boolean }> {
    this.touch();
    if (this.chunks.length === 0 && !this.ended) await this.waitForData();
    const chunks = this.chunks.map((chunk) => chunk.toString("base64"));
    this.chunks = [];
    this.bufferedBytes = 0;
    this.socket.resume();
    return { chunks, ended: this.ended && chunks.length === 0 };
  }

  close() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.socket.destroy();
    this.finish();
  }

  private receive(chunk: Buffer) {
    this.chunks.push(chunk);
    this.bufferedBytes += chunk.length;
    if (this.bufferedBytes > PAUSE_ABOVE_BYTES) this.socket.pause();
    this.wake();
  }

  private finish() {
    this.ended = true;
    this.wake();
  }

  private waitForData() {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => this.wake(), READ_WAIT_MS);
      this.waiter = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  private wake() {
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.();
  }

  private touch() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(this.onIdle, IDLE_LIMIT_MS);
  }
}

export class TunnelEndpoint {
  private readonly tunnels = new Map<string, Tunnel>();

  async open(port: number): Promise<{ id: string }> {
    const socket = await connect(port);
    const id = randomUUID();
    this.tunnels.set(id, new Tunnel(socket, () => this.close(id)));
    return { id };
  }

  write(id: string, data: string) {
    this.find(id).write(Buffer.from(data, "base64"));
    return {};
  }

  read(id: string) {
    return this.find(id).read();
  }

  close(id: string) {
    this.tunnels.get(id)?.close();
    this.tunnels.delete(id);
    return {};
  }

  closeAll() {
    for (const id of this.tunnels.keys()) this.close(id);
  }

  private find(id: string) {
    const tunnel = this.tunnels.get(id);
    if (!tunnel) throw new Error(`Tunnel ${id} is closed`);
    return tunnel;
  }
}

function connect(port: number) {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.off("error", reject);
      resolve(socket);
    });
    socket.once("error", reject);
  });
}
