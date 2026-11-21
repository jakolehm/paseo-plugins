PR reviews runs review agents on the pull requests of your GitHub repos, and shows on one page all the PRs that wait on you.

## Reviewers

Add reviewers in **Settings → PR reviews**. Each reviewer has a name, a list of repos, and a focus, for example "Bob" for security in two repos and "Alice" for API design in two other repos. The focus goes into the agent's system prompt, after the shared review rules. Each repo must be a Paseo project on this host, because the agent works in a worktree of that checkout.

## No tokens for polling

The plugin checks GitHub with `gh` every few minutes, without an agent. It starts an agent only when a PR needs a review: a new PR (all open PRs, or only PRs that request your review), new commits after your last review, or a reply in one of your threads. It waits until a PR has had no updates for 3 minutes. Each PR gets its own agent, and **Parallel review agents** sets the limit.

## Reviews page

Open **Reviews** in the sidebar. The badges show the agents that need you, the PRs that wait for your review, your own PRs that need action, and the reviews that run now.

- **Action needed**: a reviewer found no problems but did not approve, a review agent failed or waits for a permission, somebody requested your review in a repo that no reviewer covers, or your own PR has requested changes, unanswered threads, conflicts, or an approval and is ready to merge.
- **In progress**: review agents that are queued, run now, or wait for a retry, PRs with new commits since their review, and PRs that usage limits hold back.
- **Waiting on others**: PRs that a reviewer commented on, with or without findings, and that nobody approved.
- **Reviewed in the last 24 hours**: all finished reviews.
- **Reviewers**: the status of each reviewer. The status card shows the time to the next check, and a button checks GitHub now.

Dismiss a failed review to try it again on the same commit. A finished review that needs nothing from you is archived after a delay. Open its row to restore the workspace.

## Limits

All reviewers post with your `gh` login. The plugin runs only while this daemon runs. It uses the local `gh` and, for the second opinion, `codex`.
