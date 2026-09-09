# How `@tsuuanmi/internet` Works

- **Status:** current implementation
- **Last synchronized:** 2026-09-09

`@tsuuanmi/internet` is a standalone DeepSeek Harness plugin that drives authenticated ChatGPT Web and Gemini Web sessions through isolated browser contexts. It exposes direct chat/research/team tools and a durable coding workflow whose deterministic control plane is separate from model reasoning.

## Runtime layers

### Browser layer

`BrowserManager` owns account-scoped Chrome lifecycle, portable auth state refresh, scheduler leases, conversation binding, visible/hidden displays, and remote login.

Important account identities:

```text
chatgpt-thinker
gemini-thinker
chatgpt-writer
```

Every authenticated runtime path requires explicit account identity. Provider is derived implementation metadata only.

### Provider adapters

- ChatGPT adapter: auth verification, reasoning-level selection, prompt submission, completion, Website GitHub confirmation detection.
- Gemini adapter: auth verification, model/thinking selection, prompt submission and completion.
- provider-native Deep Research adapters: activate/verify research mode before submitting.

### Team layer

The lower-level team runtime executes ordered ChatGPT/Gemini debate turns and optional final synthesis. `chatgpt-thinker` is the default explicit synthesizer.

Public `internet_team` owns its own `<agent>:team:<name>` namespace. The workflow runtime passes exact workflow-owned session IDs directly to the lower-level team primitive.

### Workflow layer

Main components:

```text
WorkflowEngine
WorkflowDriver
WorkflowJobStore
WorkflowHandoffStore
WorkflowTeamPromptBuilder
BrowserWorkflowTeamRunner
BrowserWorkflowWriterRunner
approval policy / confirmation parser
WorkflowEventSink / DshWorkflowEventSink
WorkflowRetentionManager
```

The engine owns deterministic correctness; the driver owns automatic progression through safe runnable states.

## Plugin registration

When enabled, the plugin registers browser-backed tools according to available providers/accounts:

```text
internet_chat
internet_research
internet_team
internet_browser
internet_workflow
internet_workflow_maintenance
```

It also registers `/internet` for direct ChatGPT conversation use and `/workflow` when both thinker providers needed by the coding workflow are available.

## Direct chat flow

```text
internet_chat { account, prompt, visible? }
-> validate explicit thinker account
-> acquire account scheduler lease
-> verify portable account is ready
-> launch/reuse account browser
-> load account-scoped durable conversation binding
-> verify provider auth surface
-> select required reasoning/model mode
-> insert prompt and verify editor content
-> submit via semantic send control
-> wait for a changed, stopped, stable response
-> refresh durable conversation URL
-> refresh portable auth state when safe
-> return markdown + provider conversation metadata
```

`chatgpt-thinker` and `chatgpt-writer` use the same Website implementation but never share authentication files, schedulers or conversation bindings.

## Direct research flow

`internet_research` derives a research-specific owner namespace and invokes selected thinker accounts. Each provider must successfully enter its native Deep Research mode; the tool does not silently downgrade to ordinary chat.

Provider runs may complete independently. One completed provider result is preserved if another fails.

## Direct team flow

`internet_team` runs configured thinker accounts in deterministic speaking order. Each round gives the current task and prior team contributions to the next speaker. If synthesis is enabled, the explicit synthesizer receives the full current-call transcript and returns the final answer.

The public tool may return a bounded transcript when requested; transcript truncation is explicit.

## `/workflow` admission

`/workflow <objective>` is a command-plane operation.

It:

1. reads the current DSH session worktree;
2. resolves the checked-out branch remote, then `origin`, then one unambiguous configured remote;
3. converts supported SSH/HTTPS GitHub remotes to a credential-free repository identity;
4. verifies the exact current `HEAD`;
5. calls `WorkflowEngine.start(...)` with owner session, objective, repository and exact base revision;
6. enqueues the new job in `WorkflowDriver`;
7. returns the durable job ID.

If repository authority cannot be resolved safely, no job is created.

## Workflow sessions

Stable session IDs are derived from owner session + job:

```text
<owner>:workflow:<job>:research:A
<owner>:workflow:<job>:research:B
<owner>:workflow:<job>:review:A
<owner>:workflow:<job>:review:B
<owner>:workflow:<job>:writer
```

Reviewer sessions persist across cycles. The exact cycle and head SHA are durable state and prompt inputs.

## Research fan-out

`WorkflowDriver` advances a newly created job into research. `WorkflowEngine.runResearch()` starts incomplete A/B lanes logically together.

`WorkflowTeamPromptBuilder` creates lane-specific tasks from authoritative objective/repository/base facts. `BrowserWorkflowTeamRunner` invokes the lower-level team runtime directly. A completed lane is persisted and is not rerun merely because its sibling failed.

## Exact handoffs

Completed team finals become durable handoffs:

```text
handoff_id
job_id
source
recipient
sequence
payload
payload_hash
delivery state/timestamps
```

`payload_hash` is SHA-256 over the exact UTF-8 payload. Parsing recomputes deterministic identity/hash and rejects tampering.

Research handoffs are prepared/delivered in deterministic A-then-B order. Website delivery is modeled as at-least-once; durable acknowledgement makes repeated delivery attempts idempotent.

No control instruction is injected into the payload.

## Writer implementation

After both research handoffs are acknowledged, the engine sends separate `START_IMPLEMENTATION` to the stable `chatgpt-writer` conversation.

The writer is instructed to:

- verify repository and exact base revision;
- inspect current code;
- use the delivered research finals;
- implement and validate the requested change;
- use the deterministic workflow branch;
- reconcile an existing exact matching open PR before creating a new one;
- return strict `PR_OPEN` or `BLOCKED`;
- never merge during implementation.

Successful output is parsed into a durable PR receipt:

```text
repository
PR number / URL
base branch
head branch
head SHA
```

Retry does not resend acknowledged handoffs or blindly create duplicate PRs.

## Website GitHub confirmation handling

The ChatGPT adapter inspects only narrow confirmation surfaces. A visible generic `Allow` string is not enough.

The controller extracts supported action/repository/branch/PR identity and evaluates it against actual runtime account/session plus authoritative workflow state.

Implementation/remediation may auto-Allow only when all scope checks match. Unknown/malformed/ambiguous/cross-scope prompts become `UNKNOWN_CONFIRMATION` and stop the driver.

Premature merge is not part of implementation authority.

## Exact-head review

Once a PR exists, Review A/B inspect the actual PR and exact persisted head SHA.

Each reviewer must return one strict JSON result whose control fields include:

```text
verdict: PASS | CHANGES_REQUIRED
reviewedHeadSha: <exact requested SHA>
```

The engine rejects malformed or wrong-head results. The complete reviewer JSON remains the exact data-plane payload.

## Same-PR remediation

Reviewer handoffs are delivered to the same writer conversation. If either verdict requires changes, the engine sends separate `APPLY_REVIEWS` only after both review handoffs are acknowledged.

The writer must preserve the exact PR identity, remediate it and return a different head SHA. The engine resets review-run state for the new head and reuses the same reviewer sessions.

Default maximum review cycles: `3`.

## Workflow events

Durable events are classified:

```text
INTERNAL
PROGRESS
ACTION_REQUIRED
```

Only new `PROGRESS` / `ACTION_REQUIRED` events are eligible for `DshWorkflowEventSink` publication. The sink resolves the exact persisted Local owner session and calls DSH `agent.inject()` with compact job/state/PR/head/pending-action metadata.

Full team/reviewer payloads are never projected into Local progress context. Event delivery is best-effort after state commit; notification failure cannot roll back workflow work.

## Automatic driver and restart recovery

`WorkflowDriver` maintains one active run per job ID and repeatedly invokes engine primitives until a stop boundary is reached.

Safe restart discovery resumes runnable durable states but does not wake jobs waiting on user authority or known exception handling.

Unexpected driver errors become explicit retry-required state with a persisted resume target. There is no generic reset to `CREATED`.

Cancellation aborts/settles active work before `CANCELLED` is persisted.

## Exact-head PR health

After Review A/B both pass the same head, the writer receives read-only `CHECK_PR_HEALTH`.

The resulting durable health receipt is bound to repository + PR + exact head and classified:

```text
PASS
FAIL
PENDING
NONE
UNKNOWN
```

`PASS` is acceptable. `NONE` is acceptable only when absence of required checks/status policy is established. `PENDING` is retryable. `FAIL` cannot advance. `UNKNOWN` fails closed.

A new PR head invalidates the prior receipt.

## Merge authorization and execution

With PASS/PASS review and acceptable current-head health, the workflow can request merge authorization.

The action-required request contains the exact PR and expected head. `approve(jobId, expectedHeadSha)` must exactly match the pending head and persists authorization bound to repository, PR, head branch/SHA, review cycle, owner session and time.

Approval transitions to `MERGING`.

Immediately before merge, the writer re-reads the live PR and PR health. Changed head or unacceptable health invalidates stale authority. Only then does `MERGE_AUTHORIZED` execute.

Website merge confirmation may auto-Allow only when the job is in exact authorized `MERGING` state and all durable scope still matches.

Success persists a merge receipt and transitions to `DONE`.

## Workflow status/control surface

`internet_workflow` exposes deterministic operations including start/status/continue/cancel, merge request/approval/rejection and the engine controls needed by the driver.

The normal user path is still `/workflow <task>` rather than manually driving every operation.

Status is intentionally payload-free: it reports control state, lane status/errors, handoff hashes/delivery state, writer/PR/head, review cycle, health, pending action, last event and last error.

## Retention maintenance

`internet_workflow_maintenance` is operator-only and never called automatically by the driver.

Retention eligibility:

```text
DONE      -> 30 days after authoritative updatedAt
CANCELLED -> 14 days after authoritative updatedAt
```

`preview` returns eligible terminal candidates only. `cleanup` requires exact `jobId + updatedAt` from preview. Before deleting anything it validates the selected job's handoff directory structure/files/permissions.

Cleanup removes only that job record and its exact handoffs, then retains a private durable audit receipt. Repeating the same exact completed cleanup is audit-idempotent.

There is no background cleanup, startup sweep or scheduled deletion.

## Durable correctness does not depend on Website memory

Website conversation continuity is useful tactical context, especially for the writer and reviewer sessions, but account-level cross-conversation/project memory is not part of the workflow correctness/data plane.

All correctness-bearing facts are persisted explicitly in job, handoff, PR, review, health and authorization state.
