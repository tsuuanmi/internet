# Workflow Operator Contract

- **Status:** current as-built operator contract
- **Last synchronized:** 2026-09-15

The operator surface controls and inspects one authoritative durable workflow graph. It does not expose or maintain a second procedural team/lane state machine.

## Commands

```text
/workflow <objective>
/workflow list
/workflow status [jobId]
/workflow watch [jobId]
/workflow stop [jobId]
/workflow continue [jobId]
/workflow delete <jobId>
```

`internet_workflow` remains the lower-level deterministic tool surface.

## Job selection

For commands where `jobId` is optional:

1. an explicit ID always wins;
2. the job must belong to the current Local owner session;
3. when omitted, exactly one active job may be selected automatically;
4. multiple active jobs require an explicit target;
5. non-mutating inspection may select one unambiguous historical job when no active job exists;
6. terminal jobs cannot be stopped or continued.

`delete` is stricter: it always requires exactly one explicit `jobId`.

## `/workflow list`

`list` is discovery only. Jobs are ordered by newest `updatedAt` and expose compact durable identity, lifecycle/phase, update time, repository, and objective information.

## `/workflow status [jobId]`

`status` projects the authoritative graph. It reports the information needed to explain current execution without reading private JSON:

```text
Workflow <jobId>
Phase: <RESEARCH|WRITER|REVIEW|HEALTH|MERGE|DONE>
Status: <RUNNING|WAITING_USER|RECOVERING|BLOCKED|COMPLETED|CANCELLED>

Active/recovery
  Node          <logical node ID / readable label>
  Execution     <execution ID when active>
  Attempt       <current / max when applicable>
  Activity      <provider state when applicable>
  Last progress <timestamp when applicable>
  Failure       <structured code when applicable>
  Recovery      <next recovery action when applicable>

Graph
  <node>  <state> [blocked by dependencies]
  ...

External state
  PR/head/health/authorization when available

Action
  <pending user/code action when present>

Recent events
  <meaningful ordered journal entries>
```

Normal research/review presentation uses `Member 1..N`. Raw account/provider identity is diagnostic metadata, not reasoning identity.

A recoverable provider failure appears as the exact node in `RECOVERING`, not as a coarse workflow-wide `FAILED_RETRYABLE` state. Completed siblings remain completed.

Example:

```text
Workflow a3bbaeabf4b8495b0956b754a35c3263
Phase: RESEARCH
Status: RECOVERING

Active/recovery
  Node      research:A:round:1:member:2
  Attempt   2/3
  Failure   HARD_TIMEOUT
  Recovery  RECREATE_SESSION

Graph
  research:A:round:1:member:1  COMPLETED
  research:A:round:1:member:2  RECOVERING
  research:B:round:1:member:1  COMPLETED
  research:B:round:1:member:2  READY
```

Full research/review payloads are never dumped into routine status.

## `/workflow watch [jobId]`

`watch` returns the same authoritative status snapshot. Live compact `PROGRESS`/`ACTION_REQUIRED` notifications use the existing workflow event stream; watch does not create a second polling or correctness state machine.

Useful live dimensions include:

```text
phase
nodeId
executionId
attempt
provider activity
meaningful progress
failure/recovery action
```

The ordered event journal is diagnostic history. The graph snapshot remains authoritative.

## `/workflow stop [jobId]`

`stop` is terminal cancellation:

```text
resolve exact job
-> WorkflowDriver.cancel(jobId)
-> abort active executions
-> await run settlement
-> persist graph lifecycle CANCELLED
-> never auto-resume this job
```

`CANCELLED` is not pause.

## `/workflow continue [jobId]`

`continue` operates on the existing durable graph and only on a valid engine-approved recovery boundary.

It must not:

```text
create a new job
reset research or review
replay completed exact-input nodes
change persisted account routing
duplicate a live execution
blindly repeat Writer external actions
```

Normal recoverable provider failures are already scheduled by the driver. `continue` is an operator escape hatch for explicitly resumable durable state, not the primary retry loop.

## `/workflow delete <jobId>`

`delete` always requires an exact workflow ID. If the selected workflow is non-terminal, the operator first cancels and settles it through `WorkflowDriver.cancel(jobId)`.

Deletion then removes only that workflow's local durable artifacts:

```text
job record
handoff files
node-result files
event-journal files
```

It does not delete the GitHub PR/branch or provider Website conversations.

## Parallel graph visibility

Research A/B and Review A/B are independent graph branches. Status may therefore show multiple READY/RUNNING nodes concurrently. The workflow graph controls semantic dependencies; account scheduling alone controls same-account capacity and same-session ordering.

Example:

```text
Phase: RESEARCH
Status: RUNNING

Graph
  research:A:round:1:member:1  RUNNING
  research:B:round:1:member:1  RUNNING
  research:A:round:1:member:2  WAITING · blocked by A/M1
  research:B:round:1:member:2  WAITING · blocked by B/M1
```

## Action-required visibility

Pending action is explicit and structured.

Merge authority example:

```text
Phase: MERGE
Status: WAITING_USER
Action: MERGE_AUTHORIZATION_REQUIRED
expected_head=<exact SHA>
```

Deterministic automation failure example:

```text
Phase: WRITER
Status: BLOCKED
Action: CODE_FIX_REQUIRED
Failure: INVALID_SELECTOR
```

Unknown or user-owned confirmation decisions fail closed rather than being interpreted as successful model output.

## Failure and recovery detail

Diagnostics come from the graph execution record, structured failure receipt, node result store, and recent ordered events. Relevant fields include:

```text
nodeId
executionId
attempt
providerState
lastProviderEventAt
lastMeaningfulProgressAt
failure class/code/message/retry disposition
recovery action/notBefore/maxAttempts
blocking dependencies
```

Provider/browser failures are execution failures, never member answers or intellectual disagreement.

## Scheduler health

A running driver is not by itself proof that work is healthy. Status derives health from the graph and execution ownership evidence.

A durable RUNNING node without a valid execution owner lease is reconciled to node-level recovery rather than remaining indefinitely “driver active”. Scheduler invariant failure is persisted by `WorkflowEngine` as `BLOCKED` + `CODE_FIX_REQUIRED`.

## Retention

Aged cleanup is explicit operator maintenance:

```text
COMPLETED  -> eligible after 30 days
CANCELLED  -> eligible after 14 days
```

Cleanup requires exact `jobId + updatedAt`, validates scoped private artifacts, removes the selected job/handoffs/node-results/events, and retains a private cleanup audit receipt.

## Invariants

- routine operation never requires filesystem inspection;
- status/watch read the authoritative graph snapshot;
- the event journal explains history but does not compete with graph correctness state;
- completed exact-input nodes remain completed across downstream recovery;
- normal recovery targets the smallest failed/orphaned node;
- stale execution progress/results cannot commit after execution fencing;
- normal team presentation is provider-agnostic;
- provider/account identity appears only where diagnostic attribution is useful;
- exact-ID deletion never guesses a target;
- stop is terminal cancellation;
- merge always requires exact-head user authority.
