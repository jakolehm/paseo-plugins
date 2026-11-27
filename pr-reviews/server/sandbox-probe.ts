import { execCommand } from "@getpaseo/plugin/server";
import type { SandboxStatus } from "../shared/sandbox";

const PROBE_ARGS = ["--ro-bind", "/", "/", "--dev", "/dev", "--unshare-pid", "--proc", "/proc", "true"];
const PROBE_TIMEOUT_MS = 10_000;

// Claude uses bubblewrap on Linux. A container hides parts of /proc, so bubblewrap cannot mount a new one there,
// and Claude needs its weaker nested sandbox.
export async function probeSandbox(platform = process.platform): Promise<SandboxStatus> {
  if (platform !== "linux") return { mode: "native", error: null };
  try {
    await execCommand("bwrap", PROBE_ARGS, { timeout: PROBE_TIMEOUT_MS });
    return { mode: "native", error: null };
  } catch (error) {
    return classifyProbeFailure(error);
  }
}

export function classifyProbeFailure(error: unknown): SandboxStatus {
  const { stderr, message } = error as { stderr?: string; message?: string };
  const text = (stderr || message || String(error)).trim();
  if (text.includes("Can't mount proc")) return { mode: "nested", error: null };
  return { mode: "unavailable", error: text.split("\n")[0] };
}
