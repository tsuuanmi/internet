# Workflow Engine — Current Runtime Design

- **Status:** implemented
- **Last synchronized:** 2026-09-09

This document describes the deterministic runtime behind `/workflow <task>`. The user-visible path is in [`WORKFLOW.md`](./WORKFLOW.md).

## Core components

```text
/workflow command
  -> WorkflowEngine
  -> WorkflowJobStore
  -> WorkflowHandoffStore
  -> WorkflowDriver
  -> WorkflowTeamPromptBuilder
  -> BrowserWorkflowTeamRunner
  -> BrowserWorkflowWriterRunner
  -> approval/confirmation policy
  -> WorkflowEventSink / DshWorkflowEventSink
  -> WorkflowRetentionManager
```

### WorkflowEngine

Owns authoritative transitions, state guards, handoff gates, reviewer/head validation, health/merge authority and durable mutation semantics.

### WorkflowDriver

Automatically advances only states that are safe for deterministic code to continue. Active runs deduplicate by `jobId`. Startup discovery resumes safe runnable jobs and leaves human/action-required boundaries stopped.

### WorkflowJobStore

Persists private atomic per-job JSON and strictly validates nested authority/state on load. Corrupted account/session/PR/authorization state fails closed rather than being shallow-cast.

### WorkflowHandoffStore

Persists exact model payloads, deterministic logical identity, SHA-256 and delivery metadata. It recomputes identity/hash during parsing and rejects tampering.

### Team runtime

Research/review lanes call the lower-level browser team primitive directly. Stable session identity is exact and workflow-owned; the lower-level runtime no longer appends hidden workflow suffixes.

### Writer runtime

All implementation/remediation/health/merge controls route through the explicit `chatgpt-writer` account and the stable per-job writer session.

### Event sink

Durable mutations may publish compact `PROGRESS` / `ACTION_REQUIRED` observations. Publication is best-effort after state commit and never changes correctness.

### Retention manager

Provides explicit terminal-job preview/cleanup. It is never called by the automatic driver and has no background scheduler.

## Account routing

Semantic identities are authoritative:

```text
chatgpt-thinker
gemini-thinker
chatgpt-writer
```

Provider is derived metadata. Runtime authentication and capability boundaries require explicit `accountId`.

## Stable workflow sessions

```text
<owner>:workflow:<job>:research:A
<owner>:workflow:<job>:research:B
<owner>:workflow:<job>:review:A
<owner>:workflow:<job>:review:B
<owner>:workflow:<job>:writer
```

Review cycle and exact PR head are durable facts, not session-ID components.

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

Parallel A/B status is represented inside lane state rather than multiplying top-level states.

## Research phase

Research A/B are started logically together. Each prompt contains exact objective, repository/base authority, lane role and output contract. Same-account Website turns may serialize through the account scheduler while different accounts remain independent.

A completed sibling lane is not rerun just because another lane failed.

## Handoff phase

Each final team/reviewer result is persisted exactly:

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

The SHA is over exact UTF-8 payload bytes. Re-preparing identical logical handoffs is revision-idempotent. Changed content for an existing logical handoff is rejected.

Website transport is modeled as at-least-once. Durable acknowledgement makes replay safe; exactly-once UI delivery is not assumed.

## Control messages

Trusted controls are typed separately from model data:

```text
START_IMPLEMENTATION
APPLY_REVIEWS
RETRY
CHECK_PR_HEALTH
MERGE_AUTHORIZED
```

This preserves the invariant that a handoff payload equals the exact source final output.

## Writer implementation and PR idempotency

The deterministic workflow branch is derived from job identity. `START_IMPLEMENTATION` requires the writer to reconcile the exact head branch before creating a PR:

- reuse exactly one matching open PR;
- block on closed/merged identity conflict;
- block on duplicate/conflicting PR identity;
- never create another PR merely because control execution was retried.

Successful strict writer output persists the PR receipt:

```text
repository
PR number
PR URL
base branch
head branch
head SHA
```

## Website approval boundary

The BrowserManager supplies actual runtime account/session identity. Caller-provided scope cannot self-assert it.

Auto-Allow requires exact match on:

```text
chatgpt-writer
writer session
repository
workflow state
action allowlist
workflow branch or persisted PR identity
```

Unknown or ambiguous UI is `UNKNOWN_CONFIRMATION`. Premature merge is not implementation authority.

## Exact-head review loop

Review A/B inspect the actual PR and requested current head. Each reviewer must return a strict control-plane result with:

```text
PASS | CHANGES_REQUIRED
reviewedHeadSha == exact requested head
```

The complete reviewer JSON remains the data-plane handoff.

If changes are required, both handoffs are delivered before `APPLY_REVIEWS`. Remediation must preserve repository/PR/base/head identity and return a different head SHA. Review state is reset for the new head while stable reviewer sessions are reused.

The default maximum is three review cycles.

## Event publication

Every durable mutation that changes `lastEvent` passes through one publication boundary.

```text
INTERNAL         -> engine/store only
PROGRESS         -> eligible for Local injection
ACTION_REQUIRED  -> eligible for Local injection
```

`DshWorkflowEventSink` resolves the exact persisted `ownerSessionId` through DSH agents and injects compact metadata. It does not send full research/reviewer payloads. Missing/disposed agents and injection failures are ignored after the state commit.

## Automatic driver

The driver advances runnable states until it reaches an explicit stop boundary. It does not introduce another LLM orchestration layer.

Safe restart behavior:

- discover durable jobs;
- resume only states whose next action is code-owned and retry-safe;
- preserve completed handoffs/lanes;
- do not wake jobs waiting on user authority or known exceptions;
- preserve intentional-shutdown aborts as runnable state instead of manufacturing user-facing failure.

Unexpected driver errors become `FAILED_RETRYABLE` with an explicit `resumeState`.

## PR health receipt

Health is bound to exact authority:

```text
repository
PR number
head SHA
state: PASS | FAIL | PENDING | NONE | UNKNOWN
checkedAt
```

`CHECK_PR_HEALTH` is read-only. The Website writer reads live PR/check policy and returns deterministic state; the engine validates exact repository/PR/head binding.

Acceptable merge health is:

```text
PASS
NONE  # only when absence of required checks/statuses is established
```

`PENDING` is retryable. `FAIL` is not merge-eligible. `UNKNOWN` fails closed. Any new head invalidates the old receipt.

## Merge authority

`request_merge` may proceed only after exact-head review gates pass and the current health receipt is acceptable.

The action-required request includes the concrete PR and expected head. `approve(jobId, expectedHeadSha)` must exactly match the pending head and persists authorization bound to repository, PR, branch, head SHA, review cycle, owner session and authorization timestamp.

Approval transitions to `MERGING`, not back to ready state.

Immediately before merge the writer re-reads both PR head and health. Only an exact still-authorized head may execute `MERGE_AUTHORIZED`. A successful merge persists a merge receipt and moves the job to `DONE`.

## Cancel / reject / continue

- `cancel` aborts and settles active driver work before persisting `CANCELLED`.
- merge `reject` removes authorization and returns to a quiet ready state; it does not automatically request again.
- `continue` resumes the exact persisted `resumeState` for explicit exception recovery.

There is no generic fallback to `CREATED`.

## Maintenance / retention

Terminal cleanup is intentionally outside the driver.

Eligibility is based on authoritative `updatedAt`:

```text
DONE      30 days
CANCELLED 14 days
```

`preview` is read-only. `cleanup` requires exact `jobId + updatedAt` from preview, validates the expected per-job handoff files and private permissions, removes only that job and its exact handoffs, and keeps a private durable audit receipt. Repeating the same completed cleanup returns the retained audit result.

## Runtime invariants

1. Job state, not model memory, determines the next phase.
2. Provider identity never substitutes for account identity.
3. Full team/reviewer payloads are not correctness-bearing Local context.
4. Handoff payloads are immutable exact data; controls are separate.
5. PR, review, health and merge authorization are bound to exact head state.
6. Retry prefers resume/reconcile over duplicate external action.
7. Website confirmation policy fails closed.
8. Merge requires explicit user authority.
9. Restart recovery resumes only safe code-owned work.
10. Retention deletion is explicit operator maintenance only.
