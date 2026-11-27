import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const sandboxStatusSchema = z.object({
  mode: z.enum(["native", "nested", "unavailable"]),
  error: z.string().nullable(),
});

export type SandboxStatus = z.infer<typeof sandboxStatusSchema>;

export const sandboxStatusRpc = defineRpc({
  name: "sandbox.status",
  input: z.object({}),
  output: sandboxStatusSchema,
});
