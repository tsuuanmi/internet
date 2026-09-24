# Coding Workflow — Current Operational Contract

- **Status:** implemented
- **Last synchronized:** 2026-09-15

This document describes the user-visible coding workflow. Runtime detail lives in [`WORKFLOW-ENGINE.md`](../design/WORKFLOW-ENGINE.md) and [`WORKFLOW-GRAPH-ORCHESTRATION.md`](../design/WORKFLOW-GRAPH-ORCHESTRATION.md).

## Command surface

```text
/workflow <task>
/workflow list
/workflow status [jobId]
/workflow watch [jobId]
/workflow stop [jobId]
/workflow continue [jobId]
/workflow delete <jobId>
```

Start resolves the repository/upstream authority, queries exact current `main` head SHA, persists it as `baseRevision`, creates one durable graph job, prints its ID, and enqueues the driver. Local worktree `HEAD` is not workflow base authority.

## Normal path

```text
/workflow <task>
-> Research Team A/B graphs
     member nodes -> strongest synthesis
-> required exact research handoffs
-> Writer implementation
-> deterministic branch + exactly one PR -> main
-> Review Team A/B graphs bound to exact head
-> review decision
-> same-PR remediation/new head/new review cycle when required
-> PASS/PASS exact head
-> CHECK_PR_HEALTH
-> exact-head merge authorization WAITING_USER gate
-> explicit user approval
-> immediate head + health revalidation
-> writer squash merge
-> durable merge receipt
-> DONE
```

## Agent-team behavior

Research A/B and Review A/B each use the same provider-agnostic `TeamPlan`/step semantics as `internet_team`. Workflow persists member and synthesis steps separately; it does not execute one opaque full-team workflow call.

Normal prompts use only `Member 1..N`, peer output is untrusted evidence, and synthesis targets the strongest supported combined answer.

Current default backing route:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
Writer   -> chatgpt-writer
```

Gemini remains available for explicit direct/research/team use but is not required by the default workflow.

## Concurrency

Research A/B and Review A/B are independent graph branches. READY nodes from both branches may run concurrently. The account scheduler remains the sole same-account capacity/session-ordering authority; workflow adds no A-then-B mutex.

A failed later member/synthesis does not restart completed exact-input work in either branch.

## Stable Website sessions

```text
<local>:workflow:<job>:research:A
<local>:workflow:<job>:research:B
<local>:workflow:<job>:review:A
<local>:workflow:<job>:review:B
<local>:workflow:<job>:writer
```

Review cycle/head are durable exact inputs, not new conversation IDs. Individual browser contexts remain per-turn and disposable.

## Progress and recovery

`/workflow status` and `/workflow watch` project the authoritative graph. They expose phase/lifecycle, exact active/recovering/failed node, execution attempt/evidence, provider activity, blockers, failure/recovery action, PR/head/health state, pending action, and recent diagnostic events.

Example:

```text
Phase: RESEARCH
Status: RECOVERING
Node: research:A:round:2:member:2
Failure: HARD_TIMEOUT
Recovery: RECREATE_SESSION · attempt 2/3
```

Completed sibling nodes remain `COMPLETED`.

Recovery reconciles exact node/provider/external receipts before resubmitting. `/workflow continue` uses the same graph and only reopens an engine-approved failed target; it does not reset the workflow or change routing.

## Stop and delete

`/workflow stop` aborts/settles active work and persists terminal `CANCELLED`; cancellation is not pause.

`/workflow delete <jobId>` requires one explicit ID. Active work is cancelled first. Only that workflow's local job/handoffs/node-results/event journal are deleted; GitHub PR/branch and Website conversations remain external.

## Exact handoffs

Research/review synthesis payloads reach Writer verbatim. SHA-256 identity and delivery receipts are metadata outside the payload. Website delivery is at-least-once with idempotent durable acknowledgement.

## Writer behavior

`chatgpt-writer` is the only workflow mutation account. It verifies repository, `main`, and exact base revision; creates/reuses the deterministic workflow branch; implements/validates; reconciles exactly one matching open PR targeting `main`; remediates the same PR; performs read-only health inspection; and merges only after exact authorization.

Authorized workflow merge is squash-only. If squash merge is unavailable, the Writer blocks rather than changing merge strategy.

## Website confirmation policy

Recognized scope-valid implementation/remediation GitHub confirmations may auto-Allow. Unknown, malformed, ambiguous, or scope-mismatched confirmations are never clicked. Merge is excluded from ordinary implementation authority.

Current unknown-confirmation behavior is a durable blocked/action-required stop because the headless browser context closes when the provider turn exits. The runtime does not currently present that as a resumable live browser `WAITING_USER` session.

## Exact-head review and remediation

Each Review Team synthesis is bound to the exact persisted PR head and must return:

```text
verdict: PASS | CHANGES_REQUIRED
reviewedHeadSha: <exact head SHA>
```

If either team requests changes, exact review payloads are delivered to Writer followed by `APPLY_REVIEWS`. Writer preserves the PR and advances its head; a new review cycle is then built against the new head. Older-head review evidence cannot satisfy it.

Default maximum review cycles: `3`.

## PR/CI health and merge authority

After PASS/PASS, read-only `CHECK_PR_HEALTH` persists:

```text
PASS | FAIL | PENDING | NONE | UNKNOWN
```

Only `PASS`, or verified `NONE` where no required checks/statuses exist, may advance. A new head invalidates old health evidence.

Healthy review/CI does not authorize merge. The user authorizes one exact repository + PR + head + review cycle. Live head/health are revalidated immediately before merge.

## Driver boundaries

The driver schedules safe READY/RECOVERING work and stops at durable action/terminal boundaries:

```text
WAITING_USER   # durable authority gate, currently merge authorization
BLOCKED
CANCELLED
COMPLETED
```

Recoverable execution failures use node state `RECOVERING`. Deterministic scheduler/runtime invariant failures become `BLOCKED` + `CODE_FIX_REQUIRED`; there is no coarse `FAILED_RETRYABLE` top-level state.

## Retention

Aged retention is explicit operator maintenance, never automatic. Immediate exact-ID deletion is a separate operator action.

## Core invariants

1. Start pins a freshly queried upstream `main` SHA.
2. The durable graph/job snapshot is the only workflow correctness state.
3. Team semantics are shared and provider-agnostic; workflow persists member/synthesis nodes independently.
4. Research A/B and Review A/B remain independent graph branches.
5. Account scheduling is the only same-account serialization boundary.
6. Exact handoff payloads reach Writer unchanged.
7. `chatgpt-writer` remains separate mutation authority.
8. Provider/external recovery reconciles before resubmission.
9. Review, health, authorization, and merge are exact-head-bound.
10. Scoped Website approval is fail-closed.
11. No degraded quorum, hidden member substitution, or compatibility retry path exists.
12. Stop is terminal cancellation; continue operates only on the existing graph.
13. Authorized merge is squash-only.
