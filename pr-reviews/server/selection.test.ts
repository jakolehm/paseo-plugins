import assert from "node:assert/strict";
import { test } from "node:test";
import type { PullRequest } from "./pull-request.ts";
import { decide, type SelectionRules } from "./selection.ts";

const SKIPPED = ["dependabot", "release-please", "renovate"];
const ALL_OPEN: SelectionRules = { selection: "all-open", bots: "requested", skipAuthors: SKIPPED, maxAgeDays: 0 };
const REQUESTED: SelectionRules = { ...ALL_OPEN, selection: "review-requested" };
const NOW = Date.parse("2026-11-19T12:00:00Z");
const ME = "me";

function pr(changes: Partial<PullRequest> = {}): PullRequest {
  return {
    repo: "acme/app",
    number: 1,
    title: "Change",
    url: "https://github.com/acme/app/pull/1",
    author: "alice",
    authorIsBot: false,
    isDraft: false,
    createdAt: "2026-11-01T12:00:00Z",
    updatedAt: "2026-11-19T11:00:00Z",
    reviewDecision: null,
    mergeable: "MERGEABLE",
    mergeState: "BLOCKED",
    checks: "SUCCESS",
    head: "bbb",
    requestedReviewers: [],
    requestedAt: null,
    reviews: [],
    comments: [],
    threads: [],
    ...changes,
  };
}

const myReview = { author: ME, isBot: false, at: "2026-11-19T10:00:00Z", commit: "aaa" };

test("skips my own, skipped author, draft, and approved PRs", () => {
  for (const changes of [{ author: ME }, { author: "dependabot[bot]" }, { isDraft: true }, { reviewDecision: "APPROVED" }]) {
    assert.equal(decide(pr(changes), ME, ALL_OPEN, undefined, NOW).review, false);
  }
});

test("waits until the PR is quiet", () => {
  const decision = decide(pr({ updatedAt: "2026-11-19T11:59:00Z" }), ME, ALL_OPEN, undefined, NOW);
  assert.equal(decision.review, false);
});

test("reviews a new PR only when the policy allows it", () => {
  assert.equal(decide(pr(), ME, REQUESTED, undefined, NOW).review, false);
  assert.equal(decide(pr({ requestedReviewers: [ME] }), ME, REQUESTED, undefined, NOW).review, true);
  assert.equal(decide(pr(), ME, ALL_OPEN, undefined, NOW).review, true);
});

test("re-reviews from my last reviewed commit after new commits", () => {
  const decision = decide(pr({ reviews: [myReview] }), ME, REQUESTED, undefined, NOW);
  assert.deepEqual(decision, { review: true, reason: "new commits", since: "aaa" });
});

test("does not re-review when nothing changed", () => {
  const decision = decide(pr({ head: "aaa", reviews: [myReview] }), ME, ALL_OPEN, undefined, NOW);
  assert.equal(decision.review, false);
});

test("re-reviews when someone replies in my thread", () => {
  const thread = { resolved: false, starter: ME, last: { author: "alice", isBot: false, at: "2026-11-19T10:30:00Z" } };
  const decision = decide(pr({ head: "aaa", reviews: [myReview], threads: [thread] }), ME, ALL_OPEN, undefined, NOW);
  assert.deepEqual(decision, { review: true, reason: "new replies", since: "aaa" });
});

test("ignores bot replies in my thread", () => {
  const thread = { resolved: false, starter: ME, last: { author: "copilot", isBot: true, at: "2026-11-19T10:30:00Z" } };
  const decision = decide(pr({ head: "aaa", reviews: [myReview], threads: [thread] }), ME, ALL_OPEN, undefined, NOW);
  assert.equal(decision.review, false);
});

test("a handled review without a GitHub review stops repeat runs on the same commit", () => {
  const handled = { head: "bbb", at: "2026-11-19T11:30:00Z" };
  const decision = decide(pr({ requestedReviewers: [ME] }), ME, REQUESTED, handled, NOW);
  assert.equal(decision.review, false);
});

test("waits for the cooldown after a handled review", () => {
  const handled = { head: "aaa", at: "2026-11-19T11:50:00Z" };
  const decision = decide(pr({ updatedAt: "2026-11-19T11:51:00Z" }), ME, ALL_OPEN, handled, NOW);
  assert.equal(decision.review, false);
});

test("re-reviews when the author requests my review again after the last review", () => {
  const handled = { head: "bbb", at: "2026-11-19T11:00:00Z" };
  const again = { requestedReviewers: [ME], requestedAt: "2026-11-19T11:30:00Z", updatedAt: "2026-11-19T11:30:00Z" };
  const decision = decide(pr(again), ME, REQUESTED, handled, NOW);
  assert.deepEqual(decision, { review: true, reason: "review requested again", since: "bbb" });
});

test("reviews bot PRs as the bot policy says", () => {
  const bot = { author: "ci-bot", authorIsBot: true };
  const requestedBot = { ...bot, requestedReviewers: [ME] };
  assert.equal(decide(pr(bot), ME, { ...ALL_OPEN, bots: "skip" }, undefined, NOW).review, false);
  assert.equal(decide(pr(requestedBot), ME, { ...ALL_OPEN, bots: "skip" }, undefined, NOW).review, false);
  assert.equal(decide(pr(bot), ME, ALL_OPEN, undefined, NOW).review, false);
  assert.equal(decide(pr(requestedBot), ME, ALL_OPEN, undefined, NOW).review, true);
  assert.equal(decide(pr(bot), ME, { ...ALL_OPEN, bots: "include" }, undefined, NOW).review, true);
});

test("skips listed authors also when they request my review", () => {
  const dependabot = { author: "dependabot", authorIsBot: true, requestedReviewers: [ME] };
  assert.equal(decide(pr(dependabot), ME, { ...ALL_OPEN, bots: "include" }, undefined, NOW).review, false);
});

test("skips PRs older than the age limit", () => {
  assert.equal(decide(pr(), ME, { ...ALL_OPEN, maxAgeDays: 14 }, undefined, NOW).review, false);
  assert.equal(decide(pr(), ME, { ...ALL_OPEN, maxAgeDays: 30 }, undefined, NOW).review, true);
});
