# How `@tsuuanmi/internet` Works

- **Status:** current implementation
- **Last synchronized:** 2026-09-09

`@tsuuanmi/internet` is a standalone DeepSeek Harness plugin that drives authenticated ChatGPT Web and Gemini Web sessions through isolated browser contexts. It exposes direct chat/research/team tools and a durable coding workflow whose deterministic control plane is separate from model reasoning.

## Runtime layers

### Browser layer

`BrowserManager` owns account-scoped Chrome lifecycle, portable auth state refresh, scheduler leases, conversation binding, visible/hidden displays, and remote login.

Semantic accounts:

```text
chatgpt-thinker
gemini-thinker
chatgpt-writer
```

Provider is implementation metadata; authenticated runtime state is account-scoped.

### Provider adapters

- ChatGPT: auth verification, reasoning-level selection, prompt submission, completion, Website GitHub confirmation detection.
- Gemini: auth verification, model/thinking selection, prompt submission and completion.
- Provider-native Deep Research adapters: activate/verify research mode before submission.

Provider execution errors are raised as runtime errors rather than returned as valid model content.

### Team layer

One shared `runTeam(...)` core serves both `internet_team` and workflow research/review.

The core owns ordered rounds, prompt strategy, provider calls, synthesis, structured progress/failures, completed-turn transcript capture, and cancellation propagation.

Prompt strategies:

```text
generic-debate
workflow-research
workflow-review
```

The generic strategy is used by `internet_team`; workflow selects research/review strategies from deterministic session identity.

All strategies treat peer model output as delimited untrusted evidence. Synthesis explicitly targets the strongest supported combined answer rather than a neutral or 50/50 merge.

### Workflow layer

Main components:

```text
WorkflowEngine
WorkflowDriver
WorkflowJobStore
WorkflowHandoffStore
WorkflowTeamPromptBuilder
BrowserWorkflowTeamRunner
WorkflowTeamTraceStore
DurableWorkflowTeamObserver
WorkflowOperator
BrowserWorkflowWriterRunner
approval policy / confirmation parser
WorkflowEventSink / DshWorkflowEventSink
WorkflowRetentionManager
```

The engine owns deterministic correctness; the driver owns automatic progression; the team observer owns bounded execution evidence; the operator exposes user-facing views/actions over authoritative durable state.

## Plugin registration

When both thinker providers and the writer account are enabled, the plugin registers:

```text
internet_chat
internet_research
internet_team
internet_browser
internet_workflow
internet_workflow_maintenance
```

It also registers `/internet` and the `/workflow` command family.

## Direct chat and research

`internet_chat` validates an explicit thinker account, acquires that account's scheduler lease, verifies portable account state/auth, resumes an account-scoped durable conversation, selects the required provider mode, submits the prompt, waits for a stable changed response, refreshes durable conversation identity, and returns markdown + provider metadata.

`internet_research` uses provider-native research modes. Selected provider runs are independent; a completed provider result may be preserved when another fails.

## Direct team flow

`internet_team` uses its own `<agent>:team:<name>` session namespace and calls the shared team core.

Default two-round shape:

```text
round 1: ChatGPT -> Gemini critique/refinement
round 2: ChatGPT critique/refinement -> Gemini critique/refinement
synthesis: configured synthesizer -> best combined final
```

The tool may return a bounded current-call transcript when requested.

## Workflow admission and operator commands

`/workflow <objective>` resolves the current Git worktree, authoritative remote repository identity, and exact `HEAD`; it then starts a durable job and enqueues `WorkflowDriver`.

The same command family exposes routine operator actions:

```text
/workflow list
/workflow status [jobId]
/workflow watch [jobId]
/workflow stop [jobId]
/workflow continue [jobId]
```

Operator job selection is scoped to the owning Local session and fails on ambiguity rather than guessing.

`watch` returns the authoritative current snapshot; live progress continues through the existing `PROGRESS` event stream instead of a second polling state machine.

## Workflow sessions

Stable Website session IDs:

```text
<owner>:workflow:<job>:research:A
<owner>:workflow:<job>:research:B
<owner>:workflow:<job>:review:A
<owner>:workflow:<job>:review:B
<owner>:workflow:<job>:writer
```

Reviewer sessions persist across cycles; exact cycle/head facts remain durable state and prompt inputs.

## Concurrent research and review fan-out

`WorkflowEngine.runResearch()` and `runReview()` launch both incomplete A/B lane promises before awaiting either sibling.

```text
Research A  ─────────────────►
Research B  ─────────────────►

Review A    ─────────────────►
Review B    ─────────────────►
```

Each lane is a full ChatGPT+Gemini team invocation. One lane failing or completing does not restart its sibling.

The account scheduler may serialize turns that use the same authenticated account. This is intentionally separate from workflow-lane concurrency; workflow adds no A-then-B mutex.

## Structured team traces

`BrowserWorkflowTeamRunner` wraps shared team execution with `DurableWorkflowTeamObserver`.

The observer persists bounded trace evidence under:

```text
<workflow data>/workflows/team-traces/<jobId>.json
```

Trace events identify:

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
bounded completed-turn text
```

Stages include `prepare_prompt`, `provider_turn`, `synthesis`, and `complete`; the trace also records team-level attempt markers.

The trace is deliberately separate from compact job JSON. It is private, bounded, and used by workflow status to show the exact latest turn/failure without dumping full payloads into Local progress context.

## Exact handoffs

Completed research/review finals become durable exact handoffs containing source/recipient/sequence, verbatim payload, SHA-256 payload hash, and delivery state/timestamps.

Research handoffs are delivered to the writer in deterministic A-then-B order. Website delivery is modeled as at-least-once with idempotent durable acknowledgement.

Trusted controls are separate from data payloads.

## Writer implementation

After both research handoffs are acknowledged, the stable `chatgpt-writer` conversation receives `START_IMPLEMENTATION`.

The writer verifies repository/base, inspects code, implements and validates the requested change, uses the deterministic workflow branch, reconciles an existing exact matching open PR before creating a new one, and never merges during implementation.

Successful output becomes a durable PR receipt bound to repository, PR number/URL, base, head branch, and exact head SHA.

## Exact-head review and remediation

Review A/B inspect the actual PR at the exact persisted head SHA. The workflow review prompt strategy keeps the strict output contract authoritative.

Each final result must contain:

```text
verdict: PASS | CHANGES_REQUIRED
reviewedHeadSha: <exact requested SHA>
```

Malformed/wrong-head results fail the lane. If changes are required, exact reviewer handoffs go to the same writer, which receives `APPLY_REVIEWS`, preserves the same PR, advances the head, and triggers a new review cycle.

Default maximum review cycles: `3`.

## Workflow events

Events are classified:

```text
INTERNAL
PROGRESS
ACTION_REQUIRED
```

Team progress is persisted to trace first and then published as compact phase/lane/attempt/round/account/stage metadata. Full model payloads are not injected into Local progress context.

Notification failure cannot roll back durable workflow correctness.

## Status, stop, and explicit recovery

`WorkflowOperator.status()` combines compact durable job state with the latest trace event for each lane, plus writer, PR/head, review cycle, CI/health, pending action, and update time.

`WorkflowOperator.stop()` delegates to `WorkflowDriver.cancel()`, which aborts active work, waits for settlement, then persists terminal `CANCELLED`. Cancelled jobs are not rediscovered as runnable after restart.

`WorkflowOperator.continue()` delegates to the engine's explicit retry/recovery transition and re-enqueues only a valid resumable job. It does not reset a job to the beginning.

## Automatic driver and restart recovery

`WorkflowDriver` maintains at most one active run per job ID and repeatedly invokes engine primitives until a stop boundary is reached.

Safe restart discovery resumes runnable durable states but does not wake terminal/action-required jobs. Unexpected driver errors become explicit retry-required state with a persisted resume target.

## PR health, merge authorization, and execution

After Review A/B both pass the same exact head, the writer performs read-only `CHECK_PR_HEALTH` and persists an exact-head receipt classified as:

```text
PASS | FAIL | PENDING | NONE | UNKNOWN
```

Only `PASS`, or verified `NONE` when no required checks/statuses exist, may advance toward authorization. A new head invalidates prior review/health evidence.

Merge authorization is explicit and bound to repository + PR + exact head. Immediately before merge, the writer re-reads live PR/head/health. Stale authority fails closed.

## Retention maintenance

`internet_workflow_maintenance` is operator-only and never runs automatically.

```text
DONE      -> eligible after 30 days
CANCELLED -> eligible after 14 days
```

Cleanup requires exact `jobId + updatedAt`, validates private workflow artifacts, removes only the selected job/handoffs/team trace, and retains a private durable audit receipt.

## Correctness boundary

Website conversation continuity is useful tactical context, but Website cross-conversation/project memory is not workflow correctness state.

Correctness-bearing facts are explicitly persisted in job, handoff, team trace, PR, review, health, authorization, and merge receipts.
