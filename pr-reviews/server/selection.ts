import type { Reviewer } from "../shared/settings";
import type { PullRequest } from "./pull-request";

const QUIET_MS = 3 * 60_000;
const REREVIEW_COOLDOWN_MS = 15 * 60_000;
const BOT_SUFFIX = /\[bot\]$/;
const DAY_MS = 24 * 60 * 60_000;

export type SelectionRules = Pick<Reviewer, "selection" | "bots" | "skipAuthors" | "maxAgeDays">;

export interface HandledReview {
  head: string;
  at: string;
}

type Decision =
  | { review: true; reason: string; since: string | null }
  | { review: false; reason: string };

export function decide(
  pr: PullRequest,
  me: string,
  rules: SelectionRules,
  handled: HandledReview | undefined,
  now: number,
): Decision {
  if (pr.author === me) return skip("my own PR");
  const requested = pr.requestedReviewers.includes(me);
  const author = pr.author.replace(BOT_SUFFIX, "").toLowerCase();
  if (rules.skipAuthors.some((skipped) => skipped.replace(BOT_SUFFIX, "").toLowerCase() === author)) {
    return skip("skipped author");
  }
  if (pr.authorIsBot || BOT_SUFFIX.test(pr.author)) {
    if (rules.bots === "skip") return skip("bot PR");
    if (rules.bots === "requested" && !requested) return skip("bot PR without review request");
  }
  if (pr.isDraft) return skip("draft");
  if (rules.maxAgeDays > 0 && now - Date.parse(pr.createdAt) > rules.maxAgeDays * DAY_MS) return skip("too old");
  if (pr.reviewDecision === "APPROVED") return skip("already approved");
  if (now - Date.parse(pr.updatedAt) < QUIET_MS) return skip("recently updated");

  const myReviews = pr.reviews.filter((review) => review.author === me);
  const lastTouch = latest([
    ...myReviews.map((review) => review.at),
    ...pr.comments.filter((comment) => comment.author === me).map((comment) => comment.at),
    handled?.at,
  ]);

  if (lastTouch === null) {
    if (rules.selection === "all-open" || requested) return { review: true, reason: "new PR", since: null };
    return skip("no review request for me");
  }
  if (handled && now - Date.parse(handled.at) < REREVIEW_COOLDOWN_MS) return skip("recently reviewed");

  const lastHead = handled?.head ?? latestReview(myReviews)?.commit ?? null;
  const reasons = [
    lastHead !== null && lastHead !== pr.head && "new commits",
    hasRepliesSince(pr, me, lastTouch) && "new replies",
    requested && pr.requestedAt !== null && Date.parse(pr.requestedAt) > lastTouch && "review requested again",
  ].filter((reason): reason is string => Boolean(reason));

  if (reasons.length === 0) return skip("no change since my last review");
  return { review: true, reason: reasons.join(", "), since: lastHead };
}

function hasRepliesSince(pr: PullRequest, me: string, since: number) {
  const threadReply = pr.threads.some(
    (thread) =>
      thread.starter === me &&
      thread.last !== null &&
      thread.last.author !== me &&
      !thread.last.isBot &&
      Date.parse(thread.last.at) > since,
  );
  const authorComment = pr.comments.some(
    (comment) => comment.author === pr.author && Date.parse(comment.at) > since,
  );
  return threadReply || authorComment;
}

function latestReview<T extends { at: string }>(reviews: T[]): T | undefined {
  return reviews.reduce<T | undefined>(
    (latest, review) => (!latest || Date.parse(review.at) > Date.parse(latest.at) ? review : latest),
    undefined,
  );
}

function latest(times: (string | undefined)[]): number | null {
  const parsed = times.flatMap((time) => (time ? [Date.parse(time)] : []));
  return parsed.length > 0 ? Math.max(...parsed) : null;
}

function skip(reason: string): Decision {
  return { review: false, reason };
}
