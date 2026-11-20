# pr-reviews

A [Paseo](https://paseo.sh) plugin that runs review agents on GitHub pull requests and shows on one page all the PRs that wait on you.

## How it works

```
every N minutes (no agent, no tokens)
  → gh GraphQL: open PRs of each reviewer's repos (one small request for each repo)
    → selection rules in code: new PR, new commits, replies in my threads
      → Paseo agent in a worktree on the PR head (one agent for each PR)
        → review posted with your gh login, JSON result back to the plugin
```

Each reviewer has its own repos, focus, provider, approval policy, and PR selection policy. A repo can belong to one reviewer only.

- A re-review continues the agent of the last review, in the same workspace. A new agent starts after 3 rounds, or when the reviewer settings changed.
- When a PR is merged or closed, the plugin stops its review agent and archives the workspace.
- A finished review that needs nothing from you is archived after a delay (1 hour by default). A re-review restores the workspace and continues the same agent.
- The plugin loads reviews, comments, and threads again only for PRs that changed. When GitHub reports a rate limit, the plugin waits longer before the next check.
- New automatic reviews wait while the provider usage (session or weekly) is above the limit, or runs ahead of the week. Running and manual reviews continue.

## Requirements

- Paseo 0.14.0 or later, with plugins enabled: `"pluginsEnabled": true` in `~/.paseo/config.json`.
- `gh` on the PATH of the daemon, logged in.
- `codex` on the PATH, if you use the second opinion.
- A Paseo project for each repo that a reviewer covers.

## Install

```bash
paseo plugin install github:jakolehm/paseo-plugins:pr-reviews
```

## Settings

For each reviewer:

| Setting | Values |
| --- | --- |
| Review | `PRs that request my review`, or `All open PRs` |
| Bot PRs | Skip, review only when requested, or review |
| Never review PRs from | Authors to skip, for example `dependabot` |
| Skip PRs older than | No limit, or 7 to 90 days from when the PR was opened. Manual reviews ignore this limit. |
| Approval | `Approve when there are no findings`, `Approve only safe changes, else tell me`, or `Never approve, tell me` |
| Codex second opinion | On or off |
| Provider, model, mode | Paseo provider and model. Use a mode that does not ask for permissions, or the agent stops until you answer. |
| Focus | Text that the plugin adds to the shared review rules |

For all reviewers: check interval, parallel review agents, the archive delay for finished reviews, the usage limit, and the weekly pace rule.

## Claude Code permissions

Review agents post to GitHub and run Codex without a person. Claude Code must allow these commands, or its permission check blocks them and the review result says which command was blocked. The prompt tells the agents to use these exact forms:

| Action | Command |
| --- | --- |
| Review with comments | `gh api repos/<repo>/pulls/<n>/reviews --method POST --input .pr-review/review.json` |
| Approve | `gh api repos/<repo>/pulls/<n>/reviews --method POST -f commit_id=<sha> -f event=APPROVE` |
| Thread reply | `gh api repos/<repo>/pulls/<n>/comments/<id>/replies --method POST -f body=<text>` |
| Codex | `codex review - < .pr-review/codex-prompt.md` |

Agents write their files into `.pr-review/` in the review worktree, not into `/tmp`.

Add allow rules to `~/.claude/settings.json`. Change `acme` to your GitHub org:

```json
{
  "permissions": {
    "allow": [
      "Bash(gh api repos/acme/*/pulls/*/reviews --method POST --input .pr-review/review.json)",
      "Bash(gh api repos/acme/*/pulls/*/reviews --method POST * event=APPROVE*)",
      "Bash(gh api repos/acme/*/pulls/*/comments/*/replies --method POST *)",
      "Bash(codex review *)"
    ]
  }
}
```

If you use auto mode, also tell its classifier that these actions are expected. Add to `autoMode.environment`:

```json
"**Source control**: the `acme` GitHub org (all repos) and their origin remotes",
"**Primary uses**: automatic PR reviews of `acme` repos. Review agents post reviews, approvals, and thread replies with `gh`, and get a second opinion from `codex review`. Sending PR diffs and PR text to OpenAI Codex is sanctioned."
```

Without these lines, the classifier can block posts to repos that it does not trust, and can block Codex as communication to an outside service.

## State

The plugin keeps review results in `~/.paseo/plugin-data/pr-reviews/state.json`.

## Development

```bash
npm install
npm run typecheck
npm test
```
