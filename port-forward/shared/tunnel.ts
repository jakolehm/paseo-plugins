import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const portSchema = z.number().int().min(1).max(65535);

export const listeningPortsSchema = z.object({
  ports: z.array(z.object({ port: portSchema, process: z.string().nullable() })),
});

const tunnelId = z.object({ id: z.string() });

export const tunnelOpenRpc = defineRpc({
  name: "tunnel.open",
  input: z.object({ port: portSchema }),
  output: tunnelId,
});

export const tunnelWriteRpc = defineRpc({
  name: "tunnel.write",
  input: tunnelId.extend({ data: z.string() }),
  output: z.object({}),
});

export const tunnelReadRpc = defineRpc({
  name: "tunnel.read",
  input: tunnelId,
  output: z.object({ chunks: z.array(z.string()), ended: z.boolean() }),
});

export const tunnelCloseRpc = defineRpc({
  name: "tunnel.close",
  input: tunnelId,
  output: z.object({}),
});

export const listeningPortsRpc = defineRpc({
  name: "ports.listening",
  input: z.object({}),
  output: listeningPortsSchema,
});
