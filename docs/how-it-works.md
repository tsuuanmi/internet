# How `@tsuuanmi/internet` Works

- **Status:** current implementation
- **Last synchronized:** 2026-09-10

`@tsuuanmi/internet` is a standalone DeepSeek Harness plugin that drives authenticated ChatGPT Web and Gemini Web sessions through isolated browser contexts. It exposes direct chat/research/team tools and a durable coding workflow whose deterministic control plane is separate from model reasoning.

## Runtime layers

### Browser layer

`BrowserManager` owns account-scoped Chrome lifecycle, portable auth state refresh, scheduler leases, conversation binding, visible/hidden displays, and remote login.

Semantic accounts:

```text
chatgpt-thinker
chatgpt-writer
gemini-thinker
chatgpt-thinker-2
```

Provider is implementation metadata; authenticated runtime state is account-scoped. The current default reasoning team maps Member 1 to `chatgpt-thinker` and Member 2 to `chatgpt-thinker-2`. `chatgpt-writer` remains separate mutation authority.

### Provider adapters

- ChatGPT: auth verification, reasoning-level selection, prompt submission, completion, Website GitHub confirmation detection.
- Gemini: auth verification, model/thinking selection, prompt submission and completion.
- Provider-native Deep Research adapters: activate/verify research mode before submission.

Provider execution errors are raised as runtime errors rather than returned as valid member content.

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

Every strategy receives ordered backing accounts but renders reasoning roles only as `Member 1`, `Member 2`, ... . Peer content and transcript delimiters contain member numbers rather than provider/account names. All strategies treat peer output as delimited untrusted evidence. Synthesis explicitly targets the strongest supported combined answer rather than a neutral or equal-weight merge.

Underlying account/provider identity is retained internally for routing, auth, scheduler ownership, traces, and failure diagnostics. It is not exposed to members as part of their reasoning role.

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

When the two default thinker accounts and writer account are available, the workflow command/tool surfaces are registered. `internet_team` is registered whenever at least two thinker accounts are enabled and the configured synthesizer is available.

With default configuration, the plugin registers:

```text
internet_chat
internet_research
internet_team
internet_browser
internet_workflow
internet_workflow_maintenance
```

It also registers `/internet` and the `/workflow` command family.

Gemini is no longer required for workflow registration. Disabling Gemini leaves the two-ChatGPT default team/workflow available.

## Direct chat and research

`internet_chat` validates an explicit thinker account, acquires that account's scheduler lease, verifies portable account state/auth, resumes an account-scoped durable conversation, selects the required provider mode, submits the prompt, waits for a stable changed response, refreshes durable conversation identity, and returns markdown + provider metadata.

`internet_research` uses provider-native research modes. Selected provider/account runs are independent; a completed result may be preserved when another fails.

## Direct team flow

`internet_team` uses its own `<agent>:team:<name>` session namespace and calls the shared team core.

Current default two-round shape:

```text
round 1: Member 1 -> Member 2 critique/refinement
round 2: Member 1 critique/refinement -> Member 2 critique/refinement
synthesis: configured synthesizer -> strongest combined final
```

Default backing accounts:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
```

Explicit team calls may choose other enabled thinker accounts, including Gemini. This changes routing only; member-facing prompts remain provider-agnostic.

The tool may return a bounded current-call transcript when requested. Transcript presentation uses only member numbers. On execution failure, user-facing error text identifies the failed member and separate diagnostic metadata identifies the backing account/provider/kind.

## Workflow admission and operator commands

`/workflow <objective>` resolves the current Git worktree and authoritative remote repository identity, queries that remote for the exact current `refs/heads/main` SHA, persists it as `baseRevision`, then starts a durable job and enqueues `WorkflowDriver`. Local worktree `HEAD` is not workflow base authority.

The same command family exposes routine operator actions:

```text
/workflow list
/workflow status [jobId]
/workflow watch [jobId]
/workflow stop [jobId]
/workflow continue [jobId]
/workflow delete <jobId>
```

Operator job selection is scoped to the owning Local session and fails on ambiguity rather than guessing. Deletion always requires an explicit job ID.

`status` starts with a compact pipeline summary and then expands Research/Review Team A/B. `watch` returns the authoritative current snapshot; live progress continues through the existing `PROGRESS` event stream instead of a second polling state machine.

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

## Durable graph execution and concurrent branches

Workflow research/review use the same deterministic `TeamPlan`/`TeamStep` primitives as `internet_team`, but each member/synthesis step is persisted as an executable graph node. Dependencies, not a procedural lane replay loop, determine readiness.

Research A/B and Review A/B are independent graph branches. When dependencies permit, READY nodes from both branches may execute concurrently. The account scheduler remains the only same-account capacity/session-ordering gate.

Completed exact-input nodes are stored separately in `WorkflowNodeResultStore` and remain reusable while their input/dependency hashes match. A later member or synthesis failure therefore recovers only that logical node.

Execution attempts carry unique `executionId` values, ownership leases, provider state, and progress timestamps. Expired ownership is reconciled as an orphaned execution; stale late progress/results cannot commit after fencing.

`WorkflowOperator.status()` projects the graph directly: phase/lifecycle, active or recovering nodes, attempts, provider activity, blockers, failure/recovery action, PR/head/health state, and recent meaningful events. The ordered event journal explains history without becoming a second correctness state machine.

## Exact handoffs

Completed research/review finals become durable exact handoffs containing source/recipient/sequence, verbatim payload, SHA-256 payload hash, and delivery state/timestamps.

Research handoffs are delivered to the writer in deterministic A-then-B order. Website delivery is modeled as at-least-once with idempotent durable acknowledgement.

Trusted controls are separate from data payloads.

## Writer implementation

After both research handoffs are acknowledged, the stable `chatgpt-writer` conversation receives `START_IMPLEMENTATION`.

The writer verifies repository, required base branch `main`, and exact upstream `main` base revision; creates/reuses the deterministic workflow branch from that revision; inspects code; implements and validates the requested change; and reconciles an existing exact matching open PR targeting `main` before creating a new one. It never merges during implementation.

`chatgpt-writer` is deliberately not a team member. Successful output becomes a durable PR receipt bound to repository, PR number/URL, base, head branch, and exact head SHA. A PR result targeting any base other than `main` is blocked.

## Exact-head review and remediation

Review Team A/B inspect the actual PR at the exact persisted head SHA. The workflow review prompt strategy keeps the strict output contract authoritative.

Each final result must contain:

```text
verdict: PASS | CHANGES_REQUIRED
reviewedHeadSha: <exact requested SHA>
```

Malformed/wrong-head results fail the lane. If changes are required, exact reviewer handoffs go to the same writer, which receives `APPLY_REVIEWS`, preserves the same PR, advances the head, and triggers a new review cycle.

Default maximum review cycles: `3`.

## Workflow events, recovery, and operator control

Events are classified as `INTERNAL`, `PROGRESS`, or `ACTION_REQUIRED` and appended to an ordered per-job journal after/with authoritative graph transitions. Notification failure cannot roll back workflow correctness.

`WorkflowDriver` maintains at most one active run per job and owns scheduling, ownership reconciliation, and cancellation. Workflow-domain transitions remain in `WorkflowEngine`. Scheduler invariant failure is persisted through the engine as `BLOCKED` + `CODE_FIX_REQUIRED`.

Provider completion separates a hard deadline from a semantic no-progress stall lease. Response/generation transitions renew provider progress; static thinking controls and unrelated DOM churn do not. Provider stall, hard timeout, browser failure, auth failure, and deterministic automation defects are classified before recovery policy is selected.

`WorkflowOperator.stop()` aborts active work, waits for settlement, and persists terminal `CANCELLED`. `continue()` operates only on the existing graph and never resets completed exact-input work or persisted routing.

`WorkflowOperator.delete()` requires an exact job ID. Active work is cancelled/settled first; local deletion then removes the job record, handoffs, node results, and event journal. GitHub PR/branch state and provider Website conversations are external and remain untouched.

## PR health, merge authorization, and execution

After Review Team A/B both pass the same exact head, the writer performs read-only `CHECK_PR_HEALTH` and persists an exact-head receipt classified as:

```text
PASS | FAIL | PENDING | NONE | UNKNOWN
```

Only `PASS`, or verified `NONE` when no required checks/statuses exist, may advance toward authorization. A new head invalidates prior review/health evidence.

Merge authorization is explicit and bound to repository + PR + exact head. Immediately before merge, the writer re-reads live PR/head/health. Stale authority fails closed.

`MERGE_AUTHORIZED` is squash-only. Successful workflow merge therefore adds exactly one commit to `main`; if squash merge is unavailable the writer blocks instead of falling back to merge-commit or rebase-merge behavior.

## Retention maintenance

`internet_workflow_maintenance` is operator-only and never runs automatically.

```text
DONE      -> eligible after 30 days
CANCELLED -> eligible after 14 days
```

Aged cleanup requires exact `jobId + updatedAt`, validates private workflow artifacts, removes only the selected job/handoffs/node-results/event journal, and retains a private durable audit receipt.

Immediate `/workflow delete <jobId>` bypasses the age threshold only for an explicitly selected workflow and does not create an aged-cleanup audit receipt.

## Correctness boundary

Website conversation continuity is useful tactical context, but Website cross-conversation/project memory is not workflow correctness state.

Correctness-bearing facts are explicitly persisted in the graph/job snapshot, exact node results, handoffs, PR/head/health/authorization/merge receipts, and execution ownership records. The event journal is diagnostic history.
