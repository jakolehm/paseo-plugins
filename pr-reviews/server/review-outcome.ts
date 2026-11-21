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
  const end = message.lastIndexOf("}") + 1;
  // The reason can contain braces, so try each opening brace from the end.
  for (let start = end - 1; start > 0; ) {
    start = message.lastIndexOf("{", start - 1);
    if (start < 0) break;
    const outcome = tryParse(message.slice(start, end));
    if (outcome) return outcome;
  }
  return null;
}

function tryParse(json: string) {
  try {
    return reviewOutcomeSchema.parse(JSON.parse(json));
  } catch {
    return null;
  }
}
