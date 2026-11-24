import type { ReviewRecord } from "./review-store";

const HOUR_MS = 60 * 60_000;
export const STATS_HOURS = 24;

// The hourly counts start with the oldest hour, so the newest bar is at the right.
export function reviewStats(records: readonly ReviewRecord[], now: number) {
  const done = records.filter((record) => record.status === "done" && record.outcome && record.finishedAt);
  const hourly = Array<number>(STATS_HOURS).fill(0);
  const hourlyTokens = Array<number>(STATS_HOURS).fill(0);
  for (const record of done) {
    const hoursAgo = Math.floor((now - Date.parse(record.finishedAt!)) / HOUR_MS);
    if (hoursAgo < 0 || hoursAgo >= STATS_HOURS) continue;
    hourly[STATS_HOURS - 1 - hoursAgo]++;
    hourlyTokens[STATS_HOURS - 1 - hoursAgo] += record.tokens ?? 0;
  }
  return {
    reviews: done.length,
    pullRequests: new Set(done.map((record) => record.key)).size,
    approved: done.filter((record) => record.outcome!.event === "APPROVE").length,
    findings: done.reduce((sum, record) => sum + record.outcome!.findings, 0),
    tokens: hourlyTokens.reduce((sum, tokens) => sum + tokens, 0),
    hourly,
    hourlyTokens,
  };
}
