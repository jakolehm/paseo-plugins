import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const prStatusSchema = z.object({
  review: z.enum(["approved", "changes", "required", "draft"]),
  checks: z.enum(["passing", "failing", "pending", "none"]),
  merge: z.enum(["ready", "blocked", "behind", "conflicts", "unknown"]),
});

export type PrStatus = z.infer<typeof prStatusSchema>;

const prRowSchema = z.object({
  key: z.string(),
  repo: z.string(),
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  author: z.string().nullable(),
  reviewer: z.string().nullable(),
  reviewerId: z.string().nullable(),
  agentId: z.string().nullable(),
  archived: z.boolean(),
  reason: z.string(),
  at: z.string(),
  dismissible: z.boolean(),
  status: prStatusSchema.nullable(),
});

export type PrRow = z.infer<typeof prRowSchema>;

const reviewerStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  enabled: z.boolean(),
  repos: z.array(z.object({ repo: z.string(), currentName: z.string(), checkout: z.string().nullable() })),
  lastPollAt: z.string().nullable(),
  lastResult: z.string().nullable(),
  skipped: z.string().nullable(),
  error: z.string().nullable(),
});

export type ReviewerStatus = z.infer<typeof reviewerStatusSchema>;

const dashboardSchema = z.object({
  login: z.string().nullable(),
  syncedAt: z.string().nullable(),
  error: z.string().nullable(),
  usageHold: z.string().nullable(),
  reviewAccounts: z.array(z.string()),
  nextCheck: z.object({ from: z.string(), at: z.string() }).nullable(),
  actionNeeded: z.object({
    agents: z.array(prRowSchema),
    reviews: z.array(prRowSchema),
    ownPullRequests: z.array(prRowSchema),
  }),
  inProgress: z.array(prRowSchema),
  waitingOnOthers: z.array(prRowSchema),
  recentlyDone: z.array(prRowSchema),
  recentStats: z.object({
    reviews: z.number().int(),
    pullRequests: z.number().int(),
    approved: z.number().int(),
    findings: z.number().int(),
    tokens: z.number().int(),
    hourly: z.array(z.number().int()),
    hourlyTokens: z.array(z.number().int()),
  }),
  reviewers: z.array(reviewerStatusSchema),
});

export type Dashboard = z.infer<typeof dashboardSchema>;

export const dashboardRpc = defineRpc({
  name: "dashboard.get",
  input: z.object({}),
  output: dashboardSchema,
});

export const checkNowRpc = defineRpc({
  name: "github.check",
  input: z.object({}),
  output: z.object({}),
});

export const reviewNowRpc = defineRpc({
  name: "reviews.start",
  input: z.object({ repo: z.string(), number: z.number().int(), reviewerId: z.string() }),
  output: z.object({}),
});

export const restoreAgentRpc = defineRpc({
  name: "agent.restore",
  input: z.object({ agentId: z.string() }),
  output: z.object({}),
});

export const dismissRpc = defineRpc({
  name: "attention.dismiss",
  input: z.object({ key: z.string() }),
  output: z.object({}),
});
