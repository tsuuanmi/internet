# @tsuuanmi/internet

Browser-backed ChatGPT Web and Gemini Web tools for the DeepSeek Harness (DSH), plus a durable multi-account coding workflow that can reason, implement, review, gate on PR health, request exact-head merge approval, and execute the authorized merge.

## What it provides

- **`internet_chat`** — direct authenticated thinker conversation through an explicitly selected account.
- **`internet_research`** — provider-native Deep Research through one or more selected thinker accounts.
- **`internet_team`** — a shared provider-agnostic agent-team runtime that critiques, refines, and synthesizes the strongest supported combined answer.
- **`internet_browser`** — login/status/stop for semantic accounts, including the dedicated writer.
- **`internet_workflow`** — lower-level durable workflow control/status surface.
- **`internet_workflow_maintenance`** — explicit operator-only retention preview/cleanup.
- **`/internet <question>`** — direct ChatGPT Web answer from the DSH conversation UI.
- **`/workflow <objective>`** — automatically drive a Git-aware implementation workflow from a freshly queried upstream `main` HEAD.
- **`/workflow list|status|watch|stop|continue|delete`** — discover, inspect, follow, cancel, resume, or explicitly remove durable workflow jobs.

The plugin drives the providers' real websites through isolated Chrome contexts. It is standalone and does not replace DSH `web_search` / `web_fetch`.

## Account model

The runtime uses semantic authenticated identities rather than treating provider as the security boundary:

```text
chatgpt-thinker
chatgpt-writer
gemini-thinker
chatgpt-thinker-2
```

The three ChatGPT-backed identities use separate portable auth state, login profiles, browser pools, schedulers, and conversation bindings. `chatgpt-writer` remains the dedicated workflow mutation authority and is not reused as a reasoning member.

The current default team routing is:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
Writer   -> chatgpt-writer
```

For genuine member independence, `chatgpt-thinker-2` should be signed into a different ChatGPT account from `chatgpt-thinker`. Gemini remains available for direct chat/research and explicit non-default team composition when enabled.

This is a clean-break model: authenticated APIs require explicit `accountId`; there is no provider-to-account default fallback or legacy provider-keyed state migration.

## Agent-team model

`internet_team` and workflow research/review use one shared team execution core. Team reasoning is deliberately provider-agnostic and seeks the strongest supported result, not an equal-weight merge:

```text
Member 1 reasoning
  <-> Member 2 critique/refinement
  <-> further cross-member refinement
  -> explicit synthesis
  -> strongest supported combined answer
```

Members see only ordinal roles (`Member 1`, `Member 2`, ...), never the underlying provider or account identity. Peer output is delimited as untrusted evidence to evaluate, not control-plane instruction. The synthesizer may keep one member's stronger proposal, combine compatible parts, reject weak parts from all members, or state an unresolved verification need. Provider/browser execution errors are orchestration failures and are never treated as valid member contributions.

The current operational default uses two independent ChatGPT thinker accounts because Gemini is temporarily excluded from the default route. This is a routing policy rather than a team-engine assumption; explicit team composition can still include Gemini.

Workflow uses purpose-specific prompt strategies for implementation research and exact-head PR review while retaining the same shared team engine as `internet_team`.

## Coding workflow

Start explicitly from a DSH session whose working directory is inside the target Git repository:

```text
/workflow Fix the login redirect after a cancelled sign-in.
```

The command resolves the repository/upstream, queries the selected remote for the exact current `refs/heads/main` SHA, stores that SHA as the workflow `baseRevision`, creates a durable job, prints its job ID, and immediately enqueues the workflow driver. Local worktree `HEAD` is not workflow base authority.

Normal path:

```text
/workflow <task>
-> Research Team A/B launched concurrently
     each team: Member 1 + Member 2 -> strongest combined synthesis
-> exact SHA-256-bound handoffs A then B to chatgpt-writer
-> START_IMPLEMENTATION
-> writer verifies repo/upstream main base, implements, validates
-> deterministic workflow branch + exactly one reconciled PR targeting main
-> Review Team A/B launched concurrently against the exact PR head
     each team: Member 1 + Member 2 -> exact-head review synthesis
-> exact reviewer payloads to writer
-> APPLY_REVIEWS and same-PR remediation if required
-> both reviewers PASS the exact head
-> read-only CHECK_PR_HEALTH
-> exact-head merge authorization request
-> explicit user approval
-> immediate live head + health revalidation
-> MERGE_AUTHORIZED
-> writer squash-merges exactly that PR
-> DONE
```

Research A/B and Review A/B are independent workflow lanes and are started before either sibling is awaited. The default account scheduler capacity is `2`, so different workflow session IDs may progress concurrently on the same authenticated account while each individual session remains strictly ordered. The workflow does not add an A-then-B mutex above those scheduler limits.

The workflow driver automatically advances code-owned states and stops at explicit human/error boundaries such as merge authorization, `BLOCKED`, `UNKNOWN_CONFIRMATION`, retry-required state, review limit, cancellation, or completion.

Local remains the user-facing authority broker. It does not need to absorb or rewrite normal research/reviewer payloads.

## Workflow operator commands

Routine operation does not require inspecting `~/.dsh/internet/workflows/jobs/*.json` manually.

```text
/workflow list
/workflow status [jobId]
/workflow watch [jobId]
/workflow stop [jobId]
/workflow continue [jobId]
/workflow delete <jobId>
```

- **`list`** shows jobs owned by the current Local session, newest first.
- **`status`** starts with a pipeline summary, then shows Research/Review Team A/B separately with attempt, current/latest round, `Member 1..N`, execution stage, structured failure detail, writer state, PR/head, CI, review cycle, and pending action.
- **`watch`** returns the same authoritative snapshot while compact live events identify phase, Team A/B, attempt, round, member, stage, and structured failures as they occur. It does not create a second workflow state machine.
- **`stop`** aborts active driver work, waits for the active operation to settle, persists terminal `CANCELLED`, and prevents restart resume.
- **`continue`** only resumes a job that already has an explicit durable retry/recovery target; it is not a reset-to-start operation.
- **`delete`** requires an exact `jobId`. Active work is cancelled and settled first, then that workflow's durable job record, handoffs, and team trace are removed. It never guesses an omitted ID and does not silently delete the GitHub PR/branch.

Normal status/watch output uses team/member identities. Underlying account/provider identity is included only in explicit failure diagnostics so provider-level incidents can still be attributed correctly.

When `jobId` is omitted, the operator surface resolves only an unambiguous current-session target. Multiple plausible jobs require an explicit ID rather than guessing. Deletion always requires an explicit ID.

## Structured team traces

Workflow team execution persists bounded private per-job trace evidence outside the compact job record. Internal trace evidence records fields such as:

```text
phase
lane
attempt
round
accountId
provider
stage
status
failure kind/message/retryability
```

The operator projection maps backing accounts to `Member 1..N` for normal display. Completed member text is bounded; compact Local progress events do not inject full research/review payloads. Explicit terminal retention cleanup or exact-ID workflow deletion removes the corresponding team trace together with the selected workflow artifacts.

## Exact handoffs

Research and review finals are delivered verbatim to the writer. Metadata is outside the payload:

```text
handoff_id
job_id
source
recipient
sequence
payload
payload_hash
delivery state
```

SHA-256 is computed over the exact UTF-8 payload. Website delivery is treated as at-least-once with idempotent durable acknowledgement; transactional exactly-once UI delivery is not assumed.

Trusted controls such as `START_IMPLEMENTATION`, `APPLY_REVIEWS`, `CHECK_PR_HEALTH`, and `MERGE_AUTHORIZED` are separate from model data.

## Writer and PR behavior

`chatgpt-writer` is the only workflow account used for repository mutation.

During implementation it must verify the authoritative repository, required base branch `main`, and exact upstream `main` base revision; inspect current code; implement and validate the change; then create or reuse exactly one matching open PR targeting `main`. Retry reconciles the deterministic workflow branch instead of blindly creating another PR.

The durable PR receipt binds repository, PR number/URL, base branch, head branch, and exact head SHA. The same writer Website conversation is reused for remediation and authorized merge controls.

## PR review, health, and merge

Two independent reviewer teams inspect the real PR. Each final result must bind its verdict to the exact requested head SHA. Malformed or stale-head results fail the team lane; reviewer finals are delivered unchanged to the writer.

If changes are required, the writer receives a separate `APPLY_REVIEWS` control and must update the same PR with a new head. The default review limit is three cycles.

After both reviewer teams pass the same exact head, the workflow performs read-only live PR health inspection:

```text
PASS | FAIL | PENDING | NONE | UNKNOWN
```

`PASS`, or verified `NONE` when no required checks/statuses exist, may advance. `PENDING` is retryable, `FAIL` does not advance, and `UNKNOWN` fails closed. A new head invalidates the prior health receipt.

Starting `/workflow` does **not** authorize merge. User approval is bound to the exact repository + PR + head, and the writer re-reads live head/health immediately before merge. Authorized workflow merges are **squash-only**, so each workflow PR contributes exactly one commit to `main`; if squash merge is unavailable, the writer must return `BLOCKED` rather than falling back to merge-commit or rebase-merge modes.

## Scoped Website confirmations

Routine implementation/remediation confirmations may be auto-allowed only when the Website surface is narrowly recognized and all scope checks match runtime account/session, repository, workflow state, action type, and branch/PR identity.

Unknown, malformed, ambiguous, or cross-scope prompts become `UNKNOWN_CONFIRMATION`. Visible `Allow` text alone is not sufficient.

## Workflow events and recovery

Durable events are classified as `INTERNAL`, `PROGRESS`, or `ACTION_REQUIRED`. Only compact control-plane metadata is injected into Local through DSH `agent.inject()`; full research/review payloads remain in dedicated durable stores.

Durable jobs survive normal Local turn completion and plugin restart. Startup discovery resumes only safe runnable states and preserves completed lanes/handoffs. Unexpected driver errors become explicit retry-required state with a persisted resume target; there is no generic reset to the beginning.

## Retention / cleanup

Retention is explicit operator maintenance; there is no background deletion.

```text
DONE      -> 30 days after authoritative updatedAt
CANCELLED -> 14 days after authoritative updatedAt
```

Use `internet_workflow_maintenance preview` to list eligible terminal candidates. Cleanup requires the exact `jobId` and unchanged `updatedAt`, validates the selected workflow artifacts, removes only that job + handoffs + team trace, and retains a private durable audit receipt.

For immediate manual removal of one known workflow, use `/workflow delete <jobId>`. It requires the exact ID, cancels active work first if necessary, and then removes only that workflow's local durable artifacts.

## Direct tools

### `internet_chat`

```text
internet_chat {
  account: "chatgpt-thinker" | "chatgpt-thinker-2" | "gemini-thinker",
  prompt: string,
  visible?: boolean
}
```

ChatGPT ordinary turns explicitly select/verify the configured reasoning level. Default: `high`.

### `internet_research`

```text
internet_research {
  query: string,
  accounts?: ["chatgpt-thinker", "chatgpt-thinker-2", "gemini-thinker"],
  name?: string,
  visible?: boolean
}
```

Provider-native Deep Research is enabled and verified before submission. It does not silently downgrade to ordinary chat.

### `internet_team`

```text
internet_team {
  task: string,
  team?: string,
  rounds?: number,
  synthesize?: boolean,
  includeTranscript?: boolean,
  accounts?: ["chatgpt-thinker", "chatgpt-thinker-2"],
  visible?: boolean
}
```

The `accounts` field selects the authenticated accounts backing ordered `Member 1..N`; it can be overridden explicitly, including with `gemini-thinker` when enabled. The default synthesizer is the account backing Member 1 (`chatgpt-thinker`).

### `internet_browser`

```text
internet_browser {
  action: "login" | "status" | "stop" | "login_all" | "status_all" | "stop_all",
  account: "chatgpt-thinker" | "chatgpt-writer" | "gemini-thinker" | "chatgpt-thinker-2",
}
```

Account states include `ready`, `reauth-required`, `invalid`, and `missing`.

## Install

```bash
npm install @tsuuanmi/internet
```

Install it in the DSH profile/plugin environment, then restart the existing DSH host so the server-side plugin loads the new build.

## Example profile configuration

```yaml
plugins:
  - name: internet
    package: "@tsuuanmi/internet"
    config:
      dataDir: "~/.dsh/internet"
      headless: false
      loginTimeoutMs: 1800000
      remoteLoginPort: 39000
      turnTimeoutMs: 300000
      researchTimeoutMs: 1800000
      maxConcurrentTurnsPerAccount: 2
      chatgptThinkingLevel: high
      teamRounds: 2
      teamMaxRounds: 4
      teamSynthesizer: chatgpt-thinker
```

## Interactive login

Use `internet_browser login` for each semantic account. Every login uses a tokenized loopback noVNC page on the server. Open the returned loopback URL directly on that server, or SSH-forward the port and open the same URL remotely. After sign-in, press **Save account**; do not close Chrome manually.

Default stable ports:

```text
39000 chatgpt-thinker
39001 chatgpt-writer
39002 gemini-thinker
39003 chatgpt-thinker-2
```

The fourth account is appended to the semantic account catalog, so the three existing stable login ports are unchanged. The runtime assigns `remoteLoginPort + ACCOUNT_IDS.indexOf(accountId)`.

For the current default team, sign `chatgpt-thinker` and `chatgpt-thinker-2` into two different ChatGPT accounts. Keep `chatgpt-writer` as its own separate account/authority. Gemini login is optional for the default workflow but remains useful for explicit Gemini chat/research/team runs.

The HTTP/WebSocket and VNC listeners bind to loopback. Treat the tokenized URL and temporary VNC password as bearer credentials.

The login page also includes a host-text helper for pasting into the remote browser. Focus the target field in Chrome, paste text into the helper, then press **Type into focused field**.

Native Chrome may batch cookie writes. Wait at least 35 seconds after completing sign-in before **Save account** so newly issued cookies have time to flush. Session restoration preserves already-flushed session cookies; it does not make SIGTERM a guaranteed storage flush.

Developers can exercise the isolated native-Chrome session-cookie handoff with `INTERNET_TEST_LOGIN_PROFILE=1 npm test -- test/login-profile.test.ts` on Linux with Chrome; it uses synthetic loopback cookies, not real accounts.

## Portable accounts

The portable boundary is exactly:

```text
~/.dsh/internet/accounts/
  chatgpt-thinker.json
  chatgpt-writer.json
  gemini-thinker.json
  chatgpt-thinker-2.json
```

These files contain authenticated browser state and must be protected as secrets. On POSIX, keep the account directory private and files mode `0600`.

Do not treat machine-local login profiles or durable conversation files as the portable account boundary.

## Documentation

Start with [`docs/README.md`](./docs/README.md). Key current-state documents include:

- [`docs/how-it-works.md`](./docs/how-it-works.md)
- [`docs/WORKFLOW.md`](./docs/WORKFLOW.md)
- [`docs/WORKFLOW-ENGINE.md`](./docs/WORKFLOW-ENGINE.md)
- [`docs/AGENT-TEAM-DESIGN.md`](./docs/AGENT-TEAM-DESIGN.md)
- [`docs/WORKFLOW-OPERATOR-CONTRACT.md`](./docs/WORKFLOW-OPERATOR-CONTRACT.md)
- [`docs/WORKFLOW-HARDENING.md`](./docs/WORKFLOW-HARDENING.md)
- [`docs/SRS.md`](./docs/SRS.md)
- [`docs/internet-team-architecture.md`](./docs/internet-team-architecture.md)
- [`docs/TODO.md`](./docs/TODO.md)

The explicit P0-P13 roadmap remains complete. The workflow-team hardening and provider-agnostic member routing are implemented without adding a numbered phase; broader generalization remains deferred until a concrete need exists.
