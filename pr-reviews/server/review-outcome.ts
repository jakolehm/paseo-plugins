import { z } from "zod";

const reviewOutcomeSchema = z.object({
  event: z.enum(["APPROVE", "COMMENT", "NONE"]),
  findings: z.number().int().min(0),
  needsHuman: z.boolean(),
  reason: z.string(),
});

export type ReviewOutcome = z.infer<typeof reviewOutcomeSchema>;

export const reviewOutcomeJsonSchema = z.toJSONSchema(reviewOutcomeSchema) as Record<string, unknown>;

export function parseOutcome(message: string | null): ReviewOutcome | null {
  if (!message) return null;
  const json = message.slice(message.lastIndexOf("{"), message.lastIndexOf("}") + 1);
  try {
    return reviewOutcomeSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
}
