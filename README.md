# @tsuuanmi/internet

Browser-backed ChatGPT Web and Gemini Web tools for the DeepSeek Harness (DSH), plus a durable multi-account coding workflow that can reason, implement, review, gate on PR health, request exact-head merge approval, and execute the authorized merge.

## What it provides

- **`internet_chat`** — direct authenticated ChatGPT/Gemini thinker conversation.
- **`internet_research`** — provider-native Deep Research through one or both thinker accounts.
- **`internet_team`** — deterministic ChatGPT/Gemini debate with explicit final synthesizer.
- **`internet_browser`** — login/status/stop for semantic accounts, including the dedicated writer.
- **`internet_workflow`** — durable workflow control/status surface.
- **`internet_workflow_maintenance`** — explicit operator-only retention preview/cleanup.
- **`/internet <question>`** — direct ChatGPT Web answer from the DSH conversation UI.
- **`/workflow <objective>`** — automatically drive a Git-aware implementation workflow to the next human/action-required boundary.

The plugin drives the providers' real websites through isolated Chrome contexts. It is standalone and does not replace DSH `web_search` / `web_fetch`.

## Account model

The runtime uses semantic authenticated identities rather than treating provider as the security boundary:

```text
chatgpt-thinker
chatgpt-writer
gemini-thinker
```

`chatgpt-thinker` and `chatgpt-writer` both use ChatGPT Web but have separate portable auth state, login profiles, browser pools, schedulers and conversation bindings.

This is a clean-break model: authenticated APIs require explicit `accountId`; there is no provider-to-account default fallback or legacy provider-keyed state migration.

## Coding workflow

Start explicitly from a DSH session whose working directory is inside the target Git repository:

```text
/workflow Fix the login redirect after a cancelled sign-in.
```

The command resolves the repository/upstream and exact current base revision, creates a durable job, and immediately enqueues the workflow driver.

Normal path:

```text
/workflow <task>
-> Research A/B directly through ChatGPT + Gemini teams
-> ChatGPT synthesizes each team
-> exact SHA-256-bound handoffs A then B to chatgpt-writer
-> START_IMPLEMENTATION
-> writer verifies repo/base, implements, validates
-> deterministic workflow branch + exactly one reconciled PR
-> Review A/B inspect the actual PR and exact head SHA
-> exact reviewer payloads to writer
-> APPLY_REVIEWS and same-PR remediation if required
-> both reviewers PASS the exact head
-> read-only CHECK_PR_HEALTH
-> exact-head merge authorization request
-> explicit user approval
-> immediate live head + health revalidation
-> MERGE_AUTHORIZED
-> writer merges
-> DONE
```

The workflow driver automatically advances code-owned states and stops at explicit human/error boundaries such as merge authorization, `BLOCKED`, `UNKNOWN_CONFIRMATION`, retry-required state, review limit, cancellation, or completion.

Local remains the user-facing authority broker. It does not need to absorb or rewrite normal research/reviewer payloads.

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

During implementation it must verify the authoritative repository/base, inspect current code, implement and validate the change, then create or reuse exactly one matching open PR. Retry reconciles the deterministic workflow branch instead of blindly creating another PR.

The durable PR receipt binds:

```text
repository
PR number / URL
base branch
head branch
exact head SHA
```

The same writer Website conversation is reused for remediation and authorized merge controls.

## PR review and remediation

Two independent reviewer lanes inspect the real PR. Each must return strict JSON with:

```text
verdict: PASS | CHANGES_REQUIRED
reviewedHeadSha: <exact current head SHA>
```

Malformed or stale-head results fail the lane. Reviewer finals are delivered unchanged to the writer.

If changes are required, the writer receives a separate `APPLY_REVIEWS` control and must update the same PR with a new head. The default review limit is three cycles.

## PR/CI health gate

After both reviewers pass the same exact head, the workflow performs a read-only live PR health inspection.

Health states:

```text
PASS
FAIL
PENDING
NONE
UNKNOWN
```

- `PASS` is merge-eligible.
- `NONE` is merge-eligible only when no required checks/statuses are established.
- `PENDING` is retryable.
- `FAIL` does not advance.
- `UNKNOWN` fails closed.

A new/remediated head invalidates the previous health receipt.

## Merge authorization

Starting `/workflow` does **not** authorize merge.

After review and health gates pass, the workflow emits a concrete action-required request containing the PR and expected head SHA. User approval is persisted against that exact repository + PR + head.

Immediately before merge, the writer re-reads the live PR and health state. A changed head or unacceptable health invalidates stale authorization.

Website merge confirmation may be auto-allowed only while the job is in the exact authorized `MERGING` state.

## Scoped Website confirmations

Routine implementation/remediation confirmations may be auto-allowed only when the Website surface is narrowly recognized and all scope checks match:

```text
runtime account
runtime session
repository
workflow state
action type
branch / PR identity
```

Unknown, malformed, ambiguous, or cross-scope prompts become `UNKNOWN_CONFIRMATION`. Visible `Allow` text alone is not sufficient.

## Workflow events

Durable events are classified as:

```text
INTERNAL
PROGRESS
ACTION_REQUIRED
```

Only compact control-plane metadata is injected into Local through DSH `agent.inject()`. Full research/review payloads stay in their dedicated durable stores.

Notification delivery is best-effort after durable state commit and is not part of correctness.

## Restart recovery

Durable jobs survive normal Local turn completion and plugin restart. Startup discovery resumes only safe runnable states and preserves already completed lanes/handoffs.

Unexpected driver errors become explicit retry-required state with a persisted resume target. There is no generic reset to the beginning.

## Retention / cleanup

Retention is explicit operator maintenance; there is no background deletion.

Eligibility:

```text
DONE      -> 30 days after authoritative updatedAt
CANCELLED -> 14 days after authoritative updatedAt
```

Use `internet_workflow_maintenance preview` to list aged terminal candidates. Cleanup requires the exact `jobId` and unchanged `updatedAt` returned by preview, validates the selected job's exact handoff directory, deletes only that job + handoffs, and retains a private durable audit receipt.

## Direct tools

### `internet_chat`

```text
internet_chat {
  account: "chatgpt-thinker" | "gemini-thinker",
  prompt: string,
  visible?: boolean
}
```

ChatGPT ordinary turns explicitly select/verify the configured reasoning level. Default: `high`.

### `internet_research`

```text
internet_research {
  query: string,
  accounts?: ["chatgpt-thinker", "gemini-thinker"],
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
  accounts?: ["chatgpt-thinker", "gemini-thinker"],
  visible?: boolean
}
```

Default final synthesizer: `chatgpt-thinker`, independent of speaking order.

### `internet_browser`

```text
internet_browser {
  action: "login" | "status" | "stop" | "login_all" | "status_all" | "stop_all",
  account: "chatgpt-thinker" | "chatgpt-writer" | "gemini-thinker",
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
      maxConcurrentTurnsPerAccount: 1
      chatgptThinkingLevel: high
      teamRounds: 2
      teamMaxRounds: 4
      teamSynthesizer: chatgpt-thinker
```

## Interactive login

Use the browser tool for each semantic account:

```text
internet_browser { action: "login", account: "chatgpt-thinker" }
internet_browser { action: "login", account: "chatgpt-writer" }
internet_browser { action: "login", account: "gemini-thinker" }
```

Every login uses a tokenized loopback noVNC page on the server. Open the returned loopback URL directly when working on that server, or SSH-forward the port and open the same URL from another machine. After sign-in, press **Save account**; do not close Chrome manually. The login page also includes a host-text field: focus the target field in remote Chrome, paste text from the host into the helper, then press **Type into focused field**. The helper sends key events directly and clears the host text after sending. Default stable ports are:

```text
39000 chatgpt-thinker
39001 chatgpt-writer
39002 gemini-thinker
```

The HTTP/WebSocket and VNC listeners bind to loopback. Treat the tokenized URL and temporary VNC password as bearer credentials.

## Portable accounts

The portable boundary is exactly:

```text
~/.dsh/internet/accounts/
  chatgpt-thinker.json
  chatgpt-writer.json
  gemini-thinker.json
```

These files contain authenticated browser state and must be protected as secrets. On POSIX, keep the account directory private and files mode `0600`.

Do not treat machine-local login profiles or durable conversation files as the portable account boundary.

## Documentation

Start with [`docs/README.md`](./docs/README.md).

Key current-state documents:

- [`docs/how-it-works.md`](./docs/how-it-works.md)
- [`docs/WORKFLOW.md`](./docs/WORKFLOW.md)
- [`docs/WORKFLOW-ENGINE.md`](./docs/WORKFLOW-ENGINE.md)
- [`docs/SRS.md`](./docs/SRS.md)
- [`docs/internet-team-architecture.md`](./docs/internet-team-architecture.md)
- [`docs/ROADMAP.md`](./docs/ROADMAP.md)
- [`docs/TODO.md`](./docs/TODO.md)

The explicit coding-workflow roadmap is complete through P13. No P14 is implied; broader generalization remains deferred until a concrete need exists.
