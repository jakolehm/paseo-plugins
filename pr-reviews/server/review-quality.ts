import type { QualityCounts } from "../shared/dashboard";
import type { ReviewRecord } from "./review-store";

// A first review sees the whole PR, and a re-review sees only the changes since the last review.
// So only first reviews compare PRs with each other.
export function reviewQuality(done: readonly ReviewRecord[]) {
  const first = done.filter((record) => record.outcome && !record.since);
  const repos = [...new Set(first.map((record) => record.repo))]
    .map((repo) => ({ repo, ...counts(first.filter((record) => record.repo === repo)) }))
    .sort((a, b) => b.firstReviews - a.firstReviews);
  return { total: counts(first), repos };
}

function counts(records: readonly ReviewRecord[]): QualityCounts {
  return {
    firstReviews: records.length,
    findings: records.reduce((sum, record) => sum + record.outcome!.findings, 0),
    approved: records.filter((record) => record.outcome!.event === "APPROVE").length,
    clean: records.filter((record) => record.outcome!.findings === 0).length,
  };
}
