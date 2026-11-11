import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { listeningPortsSchema, portSchema as port } from "./tunnel";

export const forwardSchema = z.object({
  id: z.string(),
  serverId: z.string(),
  hostLabel: z.string(),
  remotePort: port,
  localPort: port,
  connections: z.number().int(),
  auto: z.boolean(),
  error: z.string().nullable(),
});

export type Forward = z.infer<typeof forwardSchema>;

export const remoteHostSchema = z.object({
  serverId: z.string(),
  label: z.string(),
  online: z.boolean(),
});

export type RemoteHost = z.infer<typeof remoteHostSchema>;

export const remoteHostsRpc = defineRpc({
  name: "hosts.list",
  input: z.object({}),
  output: z.object({ hosts: z.array(remoteHostSchema) }),
});

export const remotePortsRpc = defineRpc({
  name: "hosts.ports",
  input: z.object({ serverId: z.string() }),
  output: listeningPortsSchema,
});

export const forwardsListRpc = defineRpc({
  name: "forwards.list",
  input: z.object({}),
  output: z.object({ forwards: z.array(forwardSchema) }),
});

export const forwardStartRpc = defineRpc({
  name: "forwards.start",
  input: z.object({ serverId: z.string(), remotePort: port }),
  output: forwardSchema,
});

export const forwardStopRpc = defineRpc({
  name: "forwards.stop",
  input: z.object({ id: z.string() }),
  output: z.object({}),
});
