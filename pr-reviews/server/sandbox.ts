import type { Reviewer } from "../shared/settings";

// Shell commands get no network. gh posts the review, and codex needs its API and starts its own sandbox,
// so both run outside the sandbox with the normal permission check. The web is read through WebFetch and WebSearch.
const CLAUDE_SANDBOX = {
  allowedTools: ["WebFetch", "WebSearch"],
  sandbox: {
    enabled: true,
    failIfUnavailable: true,
    autoAllowBashIfSandboxed: true,
    allowUnsandboxedCommands: false,
    excludedCommands: ["gh *", "codex review *", "cat .pr-review/codex-prompt.md"],
    network: { allowedDomains: [], strictAllowlist: true },
  },
};

export function isSandboxed(reviewer: Reviewer) {
  return reviewer.sandbox && reviewer.provider === "claude";
}

export function sandboxOptions(reviewer: Reviewer) {
  return isSandboxed(reviewer) ? { options: CLAUDE_SANDBOX } : {};
}
