import type { PrStatus } from "../shared/dashboard";
import type { PullRequest } from "./pull-request";

export function prStatus(pr: PullRequest): PrStatus {
  return { review: review(pr), checks: checks(pr.checks), merge: merge(pr) };
}

function review(pr: PullRequest): PrStatus["review"] {
  if (pr.isDraft) return "draft";
  if (pr.reviewDecision === "APPROVED") return "approved";
  if (pr.reviewDecision === "CHANGES_REQUESTED") return "changes";
  return "required";
}

function checks(state: string | null): PrStatus["checks"] {
  if (state === "SUCCESS") return "passing";
  if (state === "FAILURE" || state === "ERROR") return "failing";
  if (state === "PENDING" || state === "EXPECTED") return "pending";
  return "none";
}

function merge(pr: PullRequest): PrStatus["merge"] {
  if (pr.mergeable === "CONFLICTING" || pr.mergeState === "DIRTY") return "conflicts";
  if (pr.mergeState === "CLEAN" || pr.mergeState === "HAS_HOOKS" || pr.mergeState === "UNSTABLE") return "ready";
  if (pr.mergeState === "BEHIND") return "behind";
  if (pr.mergeState === "BLOCKED") return "blocked";
  return "unknown";
}
