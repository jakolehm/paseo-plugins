import { execCommand } from "@getpaseo/plugin/server";

export interface ListeningPort {
  port: number;
  process: string | null;
}

export async function listListeningPorts(): Promise<{ ports: ListeningPort[] }> {
  const found = process.platform === "linux" ? await fromSs() : await fromLsof();
  const unique = new Map(found.map((entry) => [entry.port, entry]));
  return { ports: [...unique.values()].sort((a, b) => a.port - b.port) };
}

async function fromSs(): Promise<ListeningPort[]> {
  const { stdout } = await execCommand("ss", ["-Hltnp"]);
  return stdout.split("\n").flatMap((line) => {
    const columns = line.trim().split(/\s+/);
    const port = Number(columns[3]?.split(":").pop());
    if (!Number.isInteger(port) || port <= 0) return [];
    return [{ port, process: /users:\(\("([^"]+)"/.exec(line)?.[1] ?? null }];
  });
}

async function fromLsof(): Promise<ListeningPort[]> {
  const { stdout } = await execCommand("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fcn"]);
  let command: string | null = null;
  return stdout.split("\n").flatMap((line) => {
    if (line.startsWith("c")) command = line.slice(1);
    if (!line.startsWith("n")) return [];
    const port = Number(line.split(":").pop());
    return Number.isInteger(port) && port > 0 ? [{ port, process: command }] : [];
  });
}
