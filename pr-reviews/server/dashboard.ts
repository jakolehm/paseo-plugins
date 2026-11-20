import type { Dashboard, PrRow } from "../shared/dashboard";
import { type Attention, authorActions } from "./attention";
import { prStatus } from "./pr-status";
import { prKey, type PullRequest } from "./pull-request";
import type { ReviewRecord, ReviewStore } from "./review-store";
import type { Watcher } from "./watcher";

const RECENT_MS = 24 * 60 * 60_000;
const STALE_REQUEST_MS = 30 * RECENT_MS;
const EVENT_LABELS = { APPROVE: "Approved", COMMENT: "Commented", NONE: "No review posted" };

export function buildDashboard(store: ReviewStore, watcher: Watcher, attention: Attention): Dashboard {
  const { snapshot, error } = attention.current();
  const latest = latestPerPullRequest(store.records().filter((record) => !isSuperseded(record, store))).filter((record) =>
    watcher.isOpen(record.repo, record.key),
  );

  const now = Date.now();
  const visible = latest.filter((record) => !store.isDismissed(record.id));
  const agents = [
    ...visible.filter((record) => record.status === "permission").map((record) => recordRow(record, "The review agent waits for your permission")),
    ...visible
      .filter((record) => record.status === "failed" && record.agentId)
      .map((record) => recordRow(record, `Review failed: ${firstPart(record.error)}. Dismiss to retry.`, true)),
  ];
  const reviews = [
    ...visible
      .filter((record) => record.status === "done" && record.outcome?.needsHuman && !reviewedSince(record, snapshot?.login, watcher))
      .map((record) => recordRow(record, record.outcome!.reason, true)),
    ...(snapshot?.reviewRequested ?? [])
      .filter((pr) => !watcher.isCovered(pr.repo) && now - Date.parse(pr.requestedAt ?? pr.updatedAt) < STALE_REQUEST_MS)
      .map((pr) => githubRow(pr, "review", "Review requested from you", pr.requestedAt ?? pr.updatedAt, watcher)),
  ].sort(byTime);
  const ownPullRequests = (snapshot?.authored ?? [])
    .flatMap((pr) => {
      const actions = authorActions(pr, snapshot!.login);
      return actions ? [{ rank: actions.rank, row: githubRow(pr, "author", actions.reasons.join(" · "), pr.updatedAt, watcher) }] : [];
    })
    .sort((a, b) => a.rank - b.rank || byTime(a.row, b.row))
    .map(({ row }) => row);

  const inProgress = latest.flatMap((record) => {
    if (record.status === "queued" || record.status === "running") {
      return [recordRow(record, `${record.status === "queued" ? "Queued" : "Reviewing"}: ${record.reason}`)];
    }
    if (record.status === "failed" && !record.agentId) {
      return [recordRow(record, `Waits for retry: ${firstPart(record.error)}`)];
    }
    return [];
  });

  const waitingOnOthers = latest
    .filter((record) => record.status === "done" && record.outcome && !record.outcome.needsHuman && record.outcome.findings > 0)
    .map((record) => recordRow(record, `${findings(record)}, waiting for the author`));

  const needsAction = new Set([...agents, ...reviews].map((row) => prKey(row.repo, row.number)));
  const recentlyDone = store
    .records()
    .filter((record) => record.status === "done" && record.finishedAt && now - Date.parse(record.finishedAt) < RECENT_MS)
    .filter((record) => !needsAction.has(prKey(record.repo, record.number)))
    .map((record) => recordRow(record, `${EVENT_LABELS[record.outcome!.event]} · ${findings(record)} · ${record.outcome!.reason}`));

  const known = new Map(
    [...(snapshot?.reviewRequested ?? []), ...(snapshot?.authored ?? [])].map((pr) => [prKey(pr.repo, pr.number), pr]),
  );
  const withStatus = (rows: PrRow[]) =>
    rows.map((row) => {
      const key = prKey(row.repo, row.number);
      const pr = watcher.openPullRequest(row.repo, key) ?? known.get(key);
      return { ...row, status: pr ? prStatus(pr) : null };
    });

  return {
    login: snapshot?.login ?? null,
    syncedAt: snapshot?.syncedAt ?? null,
    error,
    usageHold: watcher.usageHold(),
    nextCheck: watcher.scheduledCheck(),
    actionNeeded: {
      agents: withStatus(agents),
      reviews: withStatus(reviews),
      ownPullRequests: withStatus(ownPullRequests),
    },
    inProgress: withStatus(inProgress),
    waitingOnOthers: withStatus(waitingOnOthers),
    recentlyDone: withStatus(recentlyDone),
    reviewers: watcher.status(),
  };
}

function latestPerPullRequest(records: readonly ReviewRecord[]) {
  const seen = new Set<string>();
  return records.filter((record) => !seen.has(record.key) && seen.add(record.key));
}

// After the agent asked me to act, my own review on GitHub (for example in the agent's workspace) settles it.
function reviewedSince(record: ReviewRecord, login: string | undefined, watcher: Watcher) {
  const pr = watcher.openPullRequest(record.repo, record.key);
  const since = Date.parse(record.finishedAt ?? record.queuedAt);
  return Boolean(login && pr?.reviews.some((review) => review.author === login && Date.parse(review.at) > since));
}

// A start that failed after the same commit was already reviewed changes nothing, and the next check does not retry it.
function isSuperseded(record: ReviewRecord, store: ReviewStore) {
  return record.status === "failed" && !record.agentId && store.handled(record.key)?.head === record.head;
}

function recordRow(record: ReviewRecord, reason: string, dismissible = false): PrRow {
  return {
    key: record.id,
    repo: record.repo,
    number: record.number,
    title: record.title,
    url: record.url,
    author: record.author,
    reviewer: record.reviewerName,
    reviewerId: record.reviewerId,
    agentId: record.agentId,
    archived: record.archived ?? false,
    reason,
    at: record.finishedAt ?? record.queuedAt,
    dismissible,
    status: null,
  };
}

function githubRow(pr: PullRequest, kind: string, reason: string, at: string, watcher: Watcher): PrRow {
  return {
    key: `${kind}:${prKey(pr.repo, pr.number)}`,
    repo: pr.repo,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    author: pr.author,
    reviewer: watcher.reviewerFor(pr.repo)?.name ?? null,
    reviewerId: watcher.reviewerFor(pr.repo)?.id ?? null,
    agentId: null,
    archived: false,
    reason,
    at,
    dismissible: false,
    status: null,
  };
}

// Paseo puts the full gh command with its query in some errors. The first part is enough.
function firstPart(error: string | null) {
  return (error ?? "unknown error").split(/:\s*gh |\n/)[0];
}

function findings(record: ReviewRecord) {
  const count = record.outcome?.findings ?? 0;
  return count === 1 ? "1 finding" : `${count} findings`;
}

function byTime(a: PrRow, b: PrRow) {
  return Date.parse(a.at) - Date.parse(b.at);
}
