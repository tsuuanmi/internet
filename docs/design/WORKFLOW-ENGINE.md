# Workflow Engine

- **Status:** current as-built runtime design
- **Last synchronized:** 2026-09-15
- **Authority:** `WorkflowEngine` owns workflow-domain transitions; `WorkflowDriver` owns background scheduling and execution ownership only

The coding workflow is one authoritative durable dependency graph. There is no parallel lane/team state machine, coarse retry engine, or compatibility replay path.

## Core model

The durable hierarchy is:

```text
workflow job
  -> graph snapshot
     -> executable node
        -> execution attempt
           -> provider/browser activity
```

The graph snapshot is correctness state. The ordered event journal is diagnostic history and is never a competing replay-only source of truth.

A logical node has a stable node ID, explicit dependency IDs, an exact input receipt, a logical state, and at most one current execution. A concrete execution has its own `executionId`, attempt number, ownership lease, provider activity, and progress timestamps.

Core invariant:

> A `COMPLETED` node is never rerun while its exact correctness-bearing input receipt still matches.

## Durable files

Workflow-local durable artifacts live under the workflow data directory:

```text
workflows/jobs/<jobId>.json
workflows/handoffs/<jobId>/<handoffId>.json
workflows/node-results/<jobId>/<resultId>.json
workflows/events/<jobId>/<eventSeq>.json
workflows/cleanup-audit/<auditId>.json
```

The obsolete team-trace store is not part of the runtime.

## Graph phases and lifecycle

Workflow phase and lifecycle are separate:

```text
phase      RESEARCH | WRITER | REVIEW | HEALTH | MERGE | DONE
lifecycle  RUNNING | WAITING_USER | RECOVERING | BLOCKED | COMPLETED | CANCELLED
```

Logical node states are:

```text
WAITING
READY
RUNNING
WAITING_USER
RECOVERING
COMPLETED
FAILED
CANCELLED
```

Recoverable execution failure moves the logical node to `RECOVERING`; `FAILED` is terminal for the node under current policy.

Execution states are separate from logical state and are fenced by execution identity. A late result or progress event from an obsolete execution cannot commit against a newer execution.

## Deterministic node identity

Examples:

```text
research:A:round:1:member:1
research:A:synthesis
research:handoff
writer:implementation
review:cycle:1:A:round:1:member:1
review:cycle:1:A:synthesis
review:cycle:1:handoff
writer:remediation:cycle:1
pr-health:cycle:1
merge-authorization:cycle:1
merge:cycle:1
```

Review/remediation/health/merge nodes are cycle/head-bound so evidence from an older PR head cannot become current evidence accidentally.

## Exact input and output receipts

Every executable node receives an immutable input receipt covering all correctness-bearing inputs for that node. Depending on node kind this includes:

```text
node ID
dependency output hashes
repository and base revision
prompt/task/control identity
Website session identity
account/member binding
PR number and exact head SHA
review cycle
```

Every completed node persists its exact payload separately in `WorkflowNodeResultStore` and stores only the result identity/hash receipt in the graph.

Before executing a READY/RECOVERING node, the engine checks for an exact persisted result for the current input hash. If one exists, the result is reconciled into graph completion without another provider turn.

## Shared team execution

`internet_team` and workflow research/review share the same deterministic team primitives:

```text
buildTeamPlan(...)
prepareTeamStep(...)
runTeamStep(...)
```

Workflow persists each plan step as its own graph node; it does not copy a second round/debate loop.

With the current two-member route and configured rounds, plan dependencies determine speaking order. Research A/B and Review A/B remain independent graph branches and may execute concurrently whenever dependencies permit.

The account scheduler remains the sole owner of same-account capacity and same-session ordering.

## Scheduler and driver boundary

`WorkflowDriver` repeatedly performs only orchestration mechanics:

```text
reconcile ownership
-> ask engine to promote dependencies to READY
-> execute READY/recoverable node IDs
-> wait for scheduled recovery when needed
-> stop at terminal/action boundaries
```

Semantic readiness, node transition, failure classification, recovery state, scheduler-failure blocking, graph expansion, handoff gates, PR/head binding, and merge authority are all owned by `WorkflowEngine`.

Unexpected scheduler failure is persisted through `WorkflowEngine.blockSchedulerFailure()` as `BLOCKED` with `CODE_FIX_REQUIRED`; the driver never mutates job JSON directly.

## Execution ownership and restart recovery

Each active execution persists:

```text
executionId
attempt
ownerInstanceId
startedAt
heartbeatAt
leaseUntil
providerState
lastProviderEventAt
lastMeaningfulProgressAt
```

The driver refreshes only the execution ownership lease. Provider progress is a separate signal.

On restart or ownership change:

```text
valid current owner lease
  -> leave execution alone

expired/mismatched owner lease
  -> classify execution as orphaned
  -> fence/supersede that execution
  -> recover the same logical node only
```

Completed siblings and dependencies are not replayed.

## Failure classification and recovery

Failure classification precedes retry policy.

Representative classes:

```text
PROVIDER_STALLED      -> recreate provider session, bounded same-node retry
HARD_TIMEOUT          -> recreate provider session, bounded same-node retry
BROWSER_UNAVAILABLE   -> recreate provider session, bounded same-node retry
PROVIDER_ERROR        -> bounded same-node retry
AUTH_EXPIRED          -> user reauthentication boundary
INVALID_SELECTOR      -> AUTOMATION / CODE_FIX, no provider retry loop
CONFIG_ERROR          -> AUTOMATION / CODE_FIX
EXECUTION_ORPHANED    -> reconcile the same node
CI_PENDING            -> dependency polling/backoff on the same logical attempt
```

Retry budget belongs to provider execution failure. Waiting for CI to finish does not consume that budget.

## Provider progress leases

Browser completion uses two independent deadlines:

```text
workflowHardTimeoutMs  = 900000
workflowStallTimeoutMs = 180000
```

The stall timeout must be lower than the hard timeout.

Meaningful provider progress is emitted only for provider-relevant response/generation transitions such as:

```text
response_started
response_changed
generation_started
generation_stopped
```

A static thinking indicator, spinner, animation, or unrelated DOM churn does not renew the progress lease indefinitely.

Provider progress is persisted only when its `executionId` still matches the current execution for the node.

## Exact handoffs

Research and review synthesis outputs are copied verbatim into SHA-256-bound handoffs. Handoffs contain source, recipient, sequence, exact payload, payload hash, and delivery state.

Website delivery is at-least-once with durable idempotent acknowledgement. Model payload and trusted control messages remain separate.

## Writer authority and PR idempotency

`chatgpt-writer` is the only workflow mutation account and is never used as a reasoning member.

Writer controls include:

```text
START_IMPLEMENTATION
APPLY_REVIEWS
CHECK_PR_HEALTH
MERGE_AUTHORIZED
```

Implementation/retry uses the deterministic workflow branch and reconciles GitHub before creating or mutating a PR. A retry must not interpret a missing model response as proof that no external side effect occurred.

The writer PR must target `main` and remain bound to the exact persisted repository/base/branch authority.

## Website confirmation boundary

Recognized scope-valid Writer confirmations eligible under the approval policy may be auto-approved. Unknown, malformed, ambiguous, out-of-scope, or user-owned decisions fail closed into an explicit action boundary rather than being treated as valid provider output.

Merge authorization is always explicit user authority and is represented as workflow `WAITING_USER`, not routine implementation authority.

## Exact-head review and remediation

Each review synthesis must return a verdict bound to the exact requested PR head:

```text
PASS | CHANGES_REQUIRED
reviewedHeadSha == expected head SHA
```

A changed head creates a new review generation/cycle. Old completed review evidence remains historical and cannot satisfy new-head dependencies.

Default maximum review cycles: `3`.

## PR health

`CHECK_PR_HEALTH` is read-only and exact-head-bound:

```text
PASS | FAIL | PENDING | NONE | UNKNOWN
```

`PASS`, or verified `NONE` when no required checks exist, may advance. `FAIL`/`UNKNOWN` block. `PENDING` schedules another health observation without spending the normal provider failure retry budget.

## Merge authority

Successful exact-head review and health do not authorize merge automatically.

The workflow records `MERGE_AUTHORIZATION_REQUIRED` and enters `WAITING_USER`. Authorization binds repository, PR, exact head SHA, review cycle, authorizing owner session, and timestamp.

`MERGE_AUTHORIZED` immediately revalidates the exact PR/head and uses squash merge only. If authority is stale or squash merge is unavailable, the operation blocks rather than falling back to another merge mode.

## Event journal

Meaningful engine transitions append ordered events with monotonic `eventSeq` and graph revision metadata. Events are classified:

```text
INTERNAL
PROGRESS
ACTION_REQUIRED
```

The snapshot transition is authoritative. A diagnostic journal append failure cannot roll correctness backward.

Local injection is best-effort and contains compact control-plane information rather than research/review payloads.

## Operator projection

`/workflow status` and `/workflow watch` project the graph directly. They expose:

```text
phase + lifecycle
active/recovering node
execution ID / attempt
provider activity
last meaningful progress
dependency blockers
failure code and recovery action
pending user/code action
PR/head/health state
recent meaningful events
next transition
```

Status does not reconstruct a parallel per-team state object and cannot show stale procedural text such as “Writer waiting for research” after the Writer node has already started or failed.

## Stop and continue

`/workflow stop` aborts active work, waits for settlement, and persists terminal `CANCELLED`. Cancelled workflows do not auto-resume.

`/workflow continue` operates on the existing durable graph. It never creates a new job, resets research, changes account routing, or replays completed exact-input nodes. Normal recoverable provider failures are scheduled automatically; manual continue is an operator recovery boundary for explicitly blocked/recoverable durable state.

## Retention and exact deletion

Retention remains explicit operator maintenance:

```text
COMPLETED  -> eligible after 30 days
CANCELLED  -> eligible after 14 days
```

Cleanup validates exact `jobId + updatedAt` and deletes only that workflow's:

```text
job record
handoff files
node-result files
event-journal files
```

Aged cleanup retains a private audit receipt. Immediate `/workflow delete <jobId>` uses the same scoped artifact deletion after cancelling/settling active work; it does not delete GitHub PR/branch state or provider Website conversations.

## Runtime invariants

1. The graph/job snapshot, not model memory or diagnostic events, determines the next transition.
2. A `COMPLETED` exact-input node is never rerun because a downstream node fails.
3. Recovery targets the smallest recoverable logical node.
4. Every current execution is fenced by `executionId`; stale progress/results cannot commit.
5. Provider progress timing is separate from execution ownership liveness.
6. Provider/account identity never substitutes for team-member reasoning identity.
7. Team prompts and step planning are shared by direct teams and workflow.
8. Research A/B and Review A/B remain graph-level concurrent; the account scheduler owns account capacity.
9. Handoff payloads are exact immutable data; trusted controls are separate.
10. `chatgpt-writer` is isolated as the sole mutation authority.
11. Review, health, authorization, and merge evidence are exact-head-bound.
12. Deterministic automation defects are surfaced directly and are not hidden behind repeated provider retry.
13. Stop is terminal cancellation.
14. Exact deletion removes only the selected workflow's local durable artifacts.
