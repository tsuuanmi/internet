# @tsuuanmi/internet

Browser-backed ChatGPT Web and Gemini Web tools for the DeepSeek Harness (DSH), plus a durable multi-account coding workflow that can reason, implement, review, gate on PR health, request exact-head merge approval, and execute the authorized merge.

## What it provides

- **`internet_chat`** — direct authenticated thinker conversation through an explicitly selected account.
- **`internet_research`** — provider-native Deep Research through one or more selected thinker accounts.
- **`internet_team`** — provider-agnostic agent-team reasoning with critique/refinement and strongest-supported synthesis.
- **`internet_browser`** — login/status/stop for semantic accounts, including the dedicated writer.
- **`internet_workflow`** — lower-level durable workflow control/status surface.
- **`internet_workflow_maintenance`** — explicit operator-only retention preview/cleanup.
- **`/internet <question>`** — direct ChatGPT Web answer from the DSH conversation UI.
- **`/workflow <objective>`** — automatically drive a Git-aware implementation workflow from a freshly queried upstream `main` HEAD.
- **`/workflow list|status|watch|stop|continue|delete`** — discover, inspect, follow, cancel, recover, or explicitly remove durable workflow jobs.

The plugin drives the providers' real websites through isolated Chrome contexts. It is standalone and does not replace DSH `web_search` / `web_fetch`.

## Account model

The runtime uses semantic authenticated identities rather than treating provider as the security boundary:

```text
chatgpt-thinker
chatgpt-writer
gemini-thinker
chatgpt-thinker-2
```

The ChatGPT-backed identities use separate portable auth state, login profiles, browser/runtime ownership, schedulers, and conversation bindings. `chatgpt-writer` remains the dedicated workflow mutation authority and is never reused as a reasoning member.

Current default workflow team routing:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
Writer   -> chatgpt-writer
```

For genuine member independence, sign `chatgpt-thinker` and `chatgpt-thinker-2` into different ChatGPT accounts. Gemini remains available for direct chat/research and explicit team composition when enabled.

This is a clean-break model: authenticated APIs require explicit `accountId`; there is no provider-to-account fallback or legacy provider-keyed state migration.

## Agent-team model

`internet_team` and workflow research/review share the same deterministic `TeamPlan`/step semantics. Team reasoning is provider-agnostic and seeks the strongest supported result rather than an equal-weight merge.

```text
Member reasoning
  <-> peer critique/refinement
  -> evidence-based disagreement resolution
  -> explicit synthesis
  -> strongest supported combined answer
```

Members see only ordinal roles (`Member 1`, `Member 2`, ...). Provider/account identity is routing and diagnostic metadata. Peer output is delimited as untrusted evidence, never control-plane instruction. Provider/browser failures are orchestration failures and are never accepted as member contributions.

`internet_team` executes the plan in-memory. Workflow persists the same member/synthesis steps as durable graph nodes so recovery can target one exact step without replaying completed siblings.

## Coding workflow

Start from a DSH session whose working directory is inside the target Git repository:

```text
/workflow Fix the login redirect after a cancelled sign-in.
```

The command resolves repository/upstream authority, queries the selected remote for exact current `refs/heads/main`, persists it as `baseRevision`, creates one durable graph job, prints its job ID, and enqueues `WorkflowDriver`. Local worktree `HEAD` is not workflow base authority.

Normal path:

```text
/workflow <task>
-> Research Team A/B durable member graphs
     exact member results -> strongest synthesis
-> required SHA-256-bound handoffs to chatgpt-writer
-> START_IMPLEMENTATION
-> writer verifies repository/base, implements, validates
-> deterministic workflow branch + exactly one reconciled PR targeting main
-> Review Team A/B graphs bound to exact PR head
-> exact review decision
-> APPLY_REVIEWS + same-PR remediation/new review cycle if required
-> both reviewers PASS the same exact head
-> read-only CHECK_PR_HEALTH
-> exact-head merge authorization request
-> explicit user approval
-> immediate live head + health revalidation
-> MERGE_AUTHORIZED
-> writer squash-merges exactly that PR
-> DONE
```

Research A/B and Review A/B are independent graph branches. READY nodes from sibling branches may execute concurrently. The account scheduler remains the only same-account capacity and same-session ordering boundary; workflow adds no A-then-B mutex.

## Durable graph and recovery

The workflow graph/job snapshot is the sole correctness state. Each logical node has explicit dependencies and an exact input receipt. Completed model payloads are stored separately in the node-result store and referenced by exact result/output receipts.

Each concrete provider attempt has a unique `executionId`, attempt number, owner lease, provider state, and progress timestamps. Lost ownership becomes orphan recovery; stale/fenced attempts cannot commit late results.

Recovery is reconcile-before-resubmit:

```text
inspect exact node/provider/external receipts
-> recover an already completed result when safely identifiable
-> otherwise perform bounded same-node retry
```

A later member failure does not replay earlier members. An orphaned synthesis does not replay member turns. Writer retry reconciles deterministic branch/PR identity before another external mutation attempt. Provider-result ambiguity fails closed instead of blindly sending the same logical request again.

There is no degraded research/review quorum and no hidden member/provider substitution.

## Workflow operator commands

Routine operation does not require reading private job JSON manually.

```text
/workflow list
/workflow status [jobId]
/workflow watch [jobId]
/workflow stop [jobId]
/workflow continue [jobId]
/workflow delete <jobId>
```

- **`list`** shows jobs owned by the current Local session, newest first.
- **`status`** projects phase/lifecycle, exact active/recovering/failed nodes, execution attempts/provider activity, dependency blockers, structured failure/recovery, PR/head/CI/review state, pending action, and recent diagnostic events.
- **`watch`** returns the same authoritative snapshot while compact live control-plane events continue through the workflow event stream.
- **`stop`** aborts active work, waits for settlement, persists terminal `CANCELLED`, and prevents restart resume.
- **`continue`** operates on the same durable graph and may reopen one engine-approved failed recovery target; it never resets the workflow or routing.
- **`delete`** requires an exact `jobId`; active work is cancelled/settled first, then only that workflow's job record, handoffs, node results, and event journal are removed.

Normal research/review presentation uses Team A/B and `Member 1..N`. Raw account/provider identity is diagnostic detail.

## Workflow events

The ordered event journal records compact `INTERNAL`, `PROGRESS`, and `ACTION_REQUIRED` control-plane history with per-job sequence and graph revision. It is diagnostic history, not a second correctness state machine. Full research/review payloads are not injected into Local progress context.

## Exact handoffs

Research/review synthesis payloads are delivered verbatim to the writer. Metadata stays outside the payload:

```text
handoffId
jobId
source
recipient
sequence
payload
payloadHash
delivery state
```

SHA-256 is computed over the exact UTF-8 payload. Website delivery is at-least-once with idempotent durable acknowledgement. Trusted controls such as `START_IMPLEMENTATION`, `APPLY_REVIEWS`, `CHECK_PR_HEALTH`, and `MERGE_AUTHORIZED` remain separate from model data.

## Writer and PR behavior

`chatgpt-writer` is the only workflow mutation account. It verifies authoritative repository, `main`, and exact upstream base revision; creates/reuses the deterministic workflow branch; implements/validates; and reconciles exactly one matching open PR targeting `main`.

The durable PR receipt binds repository, PR number/URL, base, head branch, and exact head SHA. The same stable writer Website conversation is used for remediation and authorized merge controls, while each browser turn uses a fresh disposable BrowserContext loaded from persisted account state.

## PR review, health, and merge

Two independent reviewer teams inspect the real PR and exact requested head. Each synthesis must return:

```text
verdict: PASS | CHANGES_REQUIRED
reviewedHeadSha: <exact head SHA>
```

If changes are required, Writer updates the same PR and advances its head. A new review cycle is created against the new head; old-head evidence cannot satisfy it. Default maximum review cycles: `3`.

After both teams pass the same head, read-only live health is persisted as:

```text
PASS | FAIL | PENDING | NONE | UNKNOWN
```

`PASS`, or verified `NONE` when no required checks/statuses exist, may advance. `PENDING` waits/retries on the health dependency; `FAIL` blocks; `UNKNOWN` fails closed. New head invalidates old health evidence.

Starting `/workflow` does **not** authorize merge. User authority is bound to exact repository + PR + head + review cycle, and live head/health are revalidated immediately before merge. Authorized workflow merge is **squash-only**; if squash merge is unavailable, Writer blocks rather than changing merge strategy.

## Scoped Website confirmations

Routine implementation/remediation GitHub confirmations may auto-Allow only when narrowly recognized and exact runtime/durable scope matches account, session, repository, state, action, and branch/PR identity.

Unknown, malformed, ambiguous, or scope-mismatched confirmations are never clicked. Current headless workflow behavior is a durable blocked/action-required stop because the per-turn BrowserContext closes when that provider turn exits; it is not currently a resumable live browser `WAITING_USER` session. Top-level `WAITING_USER` is used for durable user authority such as merge authorization.

## Retention / cleanup

Retention is explicit operator maintenance; there is no background deletion.

```text
COMPLETED -> 30 days after authoritative updatedAt
CANCELLED -> 14 days after authoritative updatedAt
```

Aged cleanup requires exact `jobId + updatedAt`, validates the selected workflow artifacts, removes only job + handoffs + node results + event journal, and retains a private durable audit receipt.

Immediate `/workflow delete <jobId>` bypasses the age threshold only for that explicitly selected workflow.

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

`accounts` selects authenticated accounts backing ordered `Member 1..N` and may explicitly include `gemini-thinker` when enabled. Default synthesizer: account backing Member 1 (`chatgpt-thinker`).

### `internet_browser`

```text
internet_browser {
  action: "login" | "status" | "stop" | "login_all" | "status_all" | "stop_all",
  account: "chatgpt-thinker" | "chatgpt-writer" | "gemini-thinker" | "chatgpt-thinker-2"
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

The runtime assigns `remoteLoginPort + ACCOUNT_IDS.indexOf(accountId)`; the second thinker was appended so existing stable account ports did not move.

After **Save account** is accepted, remote login access is revoked and the account profile is finalized/persisted. Workflow/browser inference does not reuse the login browser; ordinary turns start fresh contexts from persisted auth.

For the default team, sign `chatgpt-thinker` and `chatgpt-thinker-2` into different ChatGPT accounts. Keep `chatgpt-writer` as its own account/authority. Gemini login is optional for the default workflow.

The HTTP/WebSocket and VNC listeners bind to loopback. Treat the tokenized URL and temporary VNC password as bearer credentials.

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

Start with [`docs/README.md`](./docs/README.md), the canonical knowledge router.

Current production knowledge is organized under:

- [requirements](./docs/requirements/README.md)
- [architecture](./docs/architecture/README.md)
- [design](./docs/design/README.md)
- [accepted decisions](./docs/decisions/README.md)
- [reference contracts](./docs/reference/README.md)
- [validation](./docs/validation/README.md)
- [operations](./docs/operations/README.md)

Workflow vNext remains explicitly separated under [proposals](./docs/proposals/workflow-vnext/README.md) until implemented and promoted.
