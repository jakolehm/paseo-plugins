import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

const selectionPolicies = ["review-requested", "all-open"] as const;
const botPolicies = ["skip", "requested", "include"] as const;
const approvalPolicies = ["when-no-findings", "strict", "never"] as const;

export type SelectionPolicy = (typeof selectionPolicies)[number];
export type BotPolicy = (typeof botPolicies)[number];
export type ApprovalPolicy = (typeof approvalPolicies)[number];

const reviewerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().default(""),
  enabled: z.boolean().default(true),
  repos: z.array(z.string().regex(REPO_PATTERN, "Use owner/name")).default([]),
  focus: z.string().default(""),
  provider: z.string().min(1).default("claude"),
  model: z.string().default(""),
  modeId: z.string().default(""),
  selection: z.enum(selectionPolicies).default("review-requested"),
  bots: z.enum(botPolicies).default("requested"),
  skipAuthors: z.array(z.string().min(1)).default(["dependabot", "release-please", "renovate"]),
  maxAgeDays: z.number().int().min(0).max(365).default(0),
  approval: z.enum(approvalPolicies).default("when-no-findings"),
  secondOpinion: z.boolean().default(true),
  sandbox: z.boolean().default(true),
});

export type Reviewer = z.infer<typeof reviewerSchema>;

export const reviewSettings = defineSettings({
  id: "reviewers",
  scope: "host",
  version: 1,
  schema: z
    .object({
      pollMinutes: z.number().int().min(1).max(60).default(5),
      maxParallelReviews: z.number().int().min(1).max(8).default(2),
      usageLimitPct: z.number().int().min(10).max(100).default(80),
      usagePacing: z.boolean().default(true),
      archiveAfterMinutes: z.number().int().min(0).max(1440).default(60),
      reviewers: z.array(reviewerSchema).default([]),
    })
    .refine(hasUniqueRepos, { message: "A repo can belong to one reviewer only" }),
});

export type ReviewSettings = z.infer<typeof reviewSettings.schema>;

export const settingsBackupRpc = defineRpc({
  name: "settings.backup",
  input: z.object({}),
  output: z.object({ backup: reviewSettings.schema.nullable() }),
});

function hasUniqueRepos({ reviewers }: { reviewers: Reviewer[] }) {
  const repos = reviewers.flatMap((reviewer) => reviewer.repos.map((repo) => repo.toLowerCase()));
  return new Set(repos).size === repos.length;
}

export function newReviewer(id: string): Reviewer {
  return reviewerSchema.parse({ id, name: "New reviewer" });
}
