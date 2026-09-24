# Browser reliability smoke test

Build the workspace, then explicitly select the real authenticated accounts to test:

```sh
npm run build
node scripts/smoke-browser.mjs chatgpt-thinker chatgpt-writer gemini-thinker
```

Run only when workflow/browser work on these accounts is idle: this standalone process does not share the running DSH server's in-memory account scheduler. It uses each account's own portable storage, opens visible browsers, sends two harmless prompts in a unique smoke conversation, and checks both remembered context and stable conversation ID. It does not create a PR, resume a workflow, or authorize a merge. Browsers are disposed on completion; smoke conversations and refreshed account state are retained.

A short successful real turn does not prove the delayed-navigation race is fixed. The runtime regression tests simulate navigation after 30 seconds, response-before-navigation, missing URLs, early research binding, cancellation, and deadline failures. Gemini tests exercise execution-error surfaces and legitimate refusals; team tests verify a provider error stops the lane instead of becoming a debate contribution.

One completion-policy note the smoke prompts respect by design: a follow-up whose visible answer is textually identical to the previous turn's answer is legitimately treated as still-previous and never completes. The follow-up therefore asks for a differently prefixed echo of the remembered marker.

## Full workflow acceptance (not a non-mutating smoke)

`internet_workflow` with `operation: "test"` runs the real workflow against the current Git repository. It checks account readiness, runs research and implementation, opens a PR, reviews it, and automatically authorizes/merges only the exact healthy reviewed head. Do not invoke it merely to check browser login or prompts. Deploy the runtime fixes first and explicitly choose this end-to-end run knowing it changes the repository.

## Separate DSH blank-session issue

The installed DSH `@deepseek-ai/dsh-client-ui-chat/lib/client.js` chat-target `isActive` predicate excludes command nodes. Consequently, a blank session containing only `/workflow` command run/done nodes can retain the welcome screen even though the command result exists.

The source fix should count existing command nodes as activity, while keeping truly empty sessions and stale order keys inactive. Regression cases: running command, successful command with text, failed command, ordinary message, empty session, stale order key. Verify the existing authenticated GUI after rebuilding the affected client artifacts.

The supplied DSH location is an npm installation, not a source checkout with its build/test toolchain. No DSH bundles were patched or redeployed here. The running internet plugin is also an installed copy, not a workspace symlink: rebuilding this workspace and running the script tests the new code directly, but does not update the already-running DSH tools. Deploy/reload through the normal plugin lifecycle before resuming workflow acceptance; do not treat this smoke test as an end-to-end workflow pass.
