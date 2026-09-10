# Workflow Engine — Current Runtime Design

- **Status:** implemented
- **Last synchronized:** 2026-09-10

This document describes the deterministic runtime behind `/workflow <task>`. User-visible operation lives in [`WORKFLOW.md`](./WORKFLOW.md).

## Core components

```text
/workflow command
  -> WorkflowEngine
  -> WorkflowJobStore
  -> WorkflowHandoffStore
  -> WorkflowDriver
  -> WorkflowTeamPromptBuilder
  -> BrowserWorkflowTeamRunner
  -> WorkflowTeamTraceStore / DurableWorkflowTeamObserver
  -> WorkflowOperator
  -> BrowserWorkflowWriterRunner
  -> approval/confirmation policy
  -> WorkflowEventSink / DshWorkflowEventSink
  -> WorkflowRetentionManager
```

`WorkflowEngine` owns authoritative transitions, state guards, durable per-job account routing, handoff gates, reviewer/head validation, health/merge authority, and retry/idempotency semantics.

`WorkflowDriver` automatically advances safe code-owned states, deduplicates active execution by `jobId`, resumes safe jobs after restart, and stops at human/action-required boundaries.

`WorkflowJobStore` persists private atomic per-job JSON and strictly validates nested state. Corrupted routing/session/PR/authorization state fails closed.

`WorkflowHandoffStore` persists exact model payloads, deterministic identity, SHA-256 and delivery metadata.

`BrowserWorkflowTeamRunner` adapts the shared provider-agnostic team runtime to deterministic workflow tasks. It does not maintain a second debate loop.

`WorkflowTeamTraceStore` and `DurableWorkflowTeamObserver` persist bounded per-turn execution evidence and publish compact best-effort progress events.

`WorkflowOperator` projects authoritative job + trace state through `/workflow list|status|watch|stop|continue|delete`.

`BrowserWorkflowWriterRunner` routes implementation/remediation/health/merge controls through `chatgpt-writer` only.

## Account and member routing

Semantic account identity remains authoritative for authentication and scheduling. Team intellectual roles are separate and ordinal.

Current catalog:

```text
chatgpt-thinker
chatgpt-writer
gemini-thinker
chatgpt-thinker-2
```

Current default route for **new** workflow jobs:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
Writer   -> chatgpt-writer
Synthesizer -> chatgpt-thinker
```

`gemini-thinker` remains a valid thinker account but is temporarily outside the default workflow route.

`WorkflowJob.accountRouting` persists the exact two thinker accounts, writer account, and synthesizer account. The parser validates capabilities rather than hard-coding one provider pair. Therefore old durable jobs keep their recorded route while new jobs use the current default. Retry never silently changes team membership.

## Shared team runtime

Research/review lanes call the shared `runTeam(...)` core directly with the job's ordered thinker routing. Prompt strategies render only `Member 1..N`, never provider/account identity.

Purpose-specific strategies:

```text
generic-debate
workflow-research
workflow-review
```

Workflow uses the latter two. Peer model output is untrusted evidence, and review's exact PR/head/output contract remains authoritative.

Structured team stages:

```text
prepare_prompt
provider_turn
synthesis
complete
```

Internal progress/failure events retain backing account/provider for routing and diagnostics. Provider/browser failures are not valid member contributions.

## Stable workflow sessions

```text
<owner>:workflow:<job>:research:A
<owner>:workflow:<job>:research:B
<owner>:workflow:<job>:review:A
<owner>:workflow:<job>:review:B
<owner>:workflow:<job>:writer
```

Review cycle, exact PR head, and account routing are durable facts rather than session-ID components.

## Top-level states

The engine uses explicit states including:

```text
CREATED
RESEARCH_RUNNING
RESEARCH_HANDOFFS_DELIVERING
WRITER_RUNNING
PR_OPEN
REVIEW_RUNNING
REVIEW_HANDOFFS_DELIVERING
WRITER_REMEDIATING
READY_FOR_MERGE_AUTHORIZATION
AWAITING_MERGE_AUTHORIZATION
MERGING
DONE

BLOCKED
UNKNOWN_CONFIRMATION
FAILED_RETRYABLE
REVIEW_LIMIT_REACHED
CANCELLED
```

Parallel Team A/B status lives inside lane state rather than multiplying top-level states.

## Research and review concurrency

Research Team A/B are launched before either sibling is awaited. Review Team A/B follow the same rule.

```text
Research Team A  ─────────────────►
Research Team B  ─────────────────►

Review Team A    ─────────────────►
Review Team B    ─────────────────►
```

Each lane receives the same persisted ordered thinker route but an independent workflow focus/session. A completed or failed sibling is preserved and not rerun unnecessarily.

The default account scheduler capacity is `maxConcurrentTurnsPerAccount = 2`, so Team A and Team B may execute different session IDs concurrently on the same authenticated account. Each session remains strictly ordered; work above the configured capacity queues. This does not change workflow-level lane independence.

## Durable team trace

Trace evidence is stored separately from compact job JSON:

```text
<workflow data>/workflows/team-traces/<jobId>.json
```

Events include:

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

The operator maps account IDs to `Member N` by the job's persisted thinker tuple. Normal display stays provider-agnostic; raw account/provider appears only for explicit failure diagnostics.

Full research/review payloads are not injected into Local progress context.

## Handoff phase

Each final research/review result is persisted exactly:

```text
handoff_id
job_id
source
recipient
sequence
payload
payload_hash
delivery status/timestamps
```

The SHA is over exact UTF-8 payload bytes. Re-preparing identical logical handoffs is idempotent; changed content for an existing logical handoff is rejected.

Website transport is modeled as at-least-once with durable idempotent acknowledgement.

## Trusted controls

Controls are typed separately from model data:

```text
START_IMPLEMENTATION
APPLY_REVIEWS
RETRY
CHECK_PR_HEALTH
MERGE_AUTHORIZED
```

This preserves the invariant that a handoff payload equals the exact source final output.

## Workflow base authority

New workflows resolve one public upstream repository, select the authoritative remote, query `refs/heads/main` with `git ls-remote`, and persist that exact SHA as `baseRevision`. Local worktree `HEAD` is not accepted as workflow base authority.

The writer must create or reuse the deterministic workflow branch from that exact base revision and target PR base branch `main`. A writer result whose PR base is not `main` is blocked.

## Writer implementation and PR idempotency

`START_IMPLEMENTATION` is sent only after required research handoffs are acknowledged. The writer verifies repository, required `main` base branch, and exact base revision; uses the deterministic branch; and reconciles exact matching PR identity before creating anything new.

Successful writer output persists:

```text
repository
PR number
PR URL
base branch
head branch
head SHA
```

`chatgpt-writer` is never reused as a reasoning member.

## Website approval boundary

Auto-Allow requires exact match on runtime account/session, repository, workflow state, recognized action, and branch/PR identity. Unknown/ambiguous UI becomes `UNKNOWN_CONFIRMATION`.

Premature merge is excluded from implementation authority.

## Exact-head review loop

Review Team A/B inspect the actual PR and requested current head. Each final review result must assert:

```text
PASS | CHANGES_REQUIRED
reviewedHeadSha == exact requested head
```

Malformed or stale-head output fails the lane. If changes are required, exact review handoffs are delivered before `APPLY_REVIEWS`; remediation preserves PR identity and advances head before both teams review again.

Default maximum review cycles: `3`.

## Operator projection

`/workflow status` combines job and trace state:

```text
State: FAILED_RETRYABLE
Current: Research · retry required

Pipeline
  Research  Team A=failed · Team B=completed
  Writer    waiting for research
  Review    Team A=pending · Team B=pending
  PR        not created

Research teams
  Team A — FAILED (attempt 1)
    Step: round 1 · Member 2 · provider turn · FAILED · provider_error
    Members: Member 1=completed round 1 · Member 2=failed round 1
    Error: provider_error · retryable
    Diagnostic: <account> · <provider>
```

`watch` returns the same authoritative snapshot. Live `TEAM_PROGRESS` events use phase/team/attempt/round/member/stage/status and include backing source only on failure.

`delete` is an exact-ID mutation. Active jobs are cancelled and settled first, then the selected workflow's local job record, handoffs, and team trace are removed. It does not infer a missing ID or silently remove external GitHub/provider artifacts.

## Event publication

```text
INTERNAL         -> engine/store only
PROGRESS         -> eligible for Local injection
ACTION_REQUIRED  -> eligible for Local injection
```

Durable trace/state is committed before best-effort notification. Missing/disposed Local agents cannot roll back correctness.

## Automatic driver and recovery

The driver advances runnable states until an explicit stop boundary. Safe restart discovery preserves completed work and does not wake jobs waiting on user authority or known exceptions.

Unexpected driver errors become `FAILED_RETRYABLE` with an explicit `resumeState`. `/workflow continue` resumes only that durable recovery path.

`/workflow stop` aborts active driver work, waits for settlement, then persists terminal `CANCELLED`. Cancelled jobs do not resume on restart.

## PR health and merge authority

Health is exact-head-bound:

```text
PASS | FAIL | PENDING | NONE | UNKNOWN
```

`CHECK_PR_HEALTH` is read-only. Only `PASS`, or verified `NONE` with no required checks/statuses, may advance. New head invalidates prior health.

Merge authorization is explicit and bound to repository + PR + exact head. Immediately before merge the writer re-reads head and health. Only still-valid authority may execute `MERGE_AUTHORIZED`.

Authorized workflow merges are squash-only. One workflow PR therefore contributes exactly one commit to `main`; if squash merge is unavailable, the writer must return `BLOCKED` rather than fall back to merge-commit or rebase-merge modes.

## Maintenance / retention

Terminal cleanup remains explicit operator maintenance:

```text
DONE      30 days
CANCELLED 14 days
```

Aged cleanup requires exact `jobId + updatedAt`, validates private artifacts, removes the selected job + handoffs + team trace, and retains a private audit receipt.

Immediate `/workflow delete <jobId>` is a separate exact-ID operator action. It can cancel an active workflow first and then remove only that workflow's local durable artifacts without waiting for retention eligibility.

## Runtime invariants

1. Job state, not model memory, determines the next phase.
2. Provider identity never substitutes for account identity or team member role.
3. Team prompts are provider-agnostic; routing is durable execution metadata.
4. Existing jobs keep persisted routing; retry never silently changes members.
5. Full team/reviewer payloads are not correctness-bearing Local context.
6. Handoff payloads are immutable exact data; controls are separate.
7. Research A/B and Review A/B are workflow-level concurrent.
8. New workflows pin fresh upstream `main` HEAD; Local `HEAD` is not base authority.
9. Writer PRs target `main`; PR, review, health and merge authorization are bound to exact head state.
10. Retry prefers resume/reconcile over duplicate external action.
11. Website confirmation policy fails closed.
12. Merge requires explicit user authority and uses squash-only history.
13. Restart recovery resumes only safe code-owned work.
14. Exact-ID delete removes only the selected workflow's local durable artifacts.
15. Retention deletion is explicit operator maintenance only.
