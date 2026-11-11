import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { PORT_RANGES_HINT, parsePortRanges } from "./port-ranges";

export const autoForwardSettings = defineSettings({
  id: "auto-forward",
  scope: "host",
  version: 1,
  schema: z.object({
    enabled: z.boolean().default(false),
    ports: z
      .string()
      .default("3000-3999, 5173, 8000-8999")
      .refine((text) => parsePortRanges(text) !== null, { message: PORT_RANGES_HINT }),
  }),
});
