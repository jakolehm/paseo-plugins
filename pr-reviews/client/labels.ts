import type { ApprovalPolicy, BotPolicy, Reviewer, SelectionPolicy } from "../shared/settings";

export const SELECTION_LABELS: Record<SelectionPolicy, string> = {
  "review-requested": "PRs that request my review",
  "all-open": "All open PRs",
};

export const BOT_LABELS: Record<BotPolicy, string> = {
  skip: "Skip",
  requested: "Only when they request my review",
  include: "Same as other PRs",
};

export const APPROVAL_LABELS: Record<ApprovalPolicy, string> = {
  "when-no-findings": "Approve when there are no findings",
  strict: "Approve only safe changes, else tell me",
  never: "Never approve, tell me",
};

export function selectOptions<Value extends string>(labels: Record<Value, string>) {
  return (Object.keys(labels) as Value[]).map((value) => ({ value, label: labels[value] }));
}

export function summarize(reviewer: Reviewer) {
  const repos = reviewer.repos.length === 0 ? "No repos" : reviewer.repos.map((repo) => repo.split("/")[1]).join(", ");
  const agent = reviewer.model ? `${reviewer.provider}/${reviewer.model}` : reviewer.provider;
  return [repos, SELECTION_LABELS[reviewer.selection], APPROVAL_LABELS[reviewer.approval], agent].join(" · ");
}
