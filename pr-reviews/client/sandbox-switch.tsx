import { useRpc } from "@getpaseo/plugin/client";
import { SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { type SandboxStatus, sandboxStatusRpc } from "../shared/sandbox";

const BASE_HINT = "Shell commands run without network and need no permission. The agent reads the web with WebFetch.";

interface Props {
  value: boolean;
  onValueChange(value: boolean): void;
}

export function SandboxSwitch({ value, onValueChange }: Props) {
  const getStatus = useRpc(sandboxStatusRpc);
  const { data } = useQuery({ queryKey: ["pr-reviews", "sandbox-status"], queryFn: () => getStatus({}) });
  return <SettingsSwitch label="Sandbox" hint={hint(data)} value={value} onValueChange={onValueChange} />;
}

function hint(status: SandboxStatus | undefined) {
  if (status?.mode === "nested") return `${BASE_HINT} This host is a container, so the sandbox uses the weaker nested mode.`;
  if (status?.mode === "unavailable") {
    return `${BASE_HINT} The sandbox cannot start on this host: ${status.error}. Install bubblewrap and socat, or turn off the sandbox.`;
  }
  return BASE_HINT;
}
