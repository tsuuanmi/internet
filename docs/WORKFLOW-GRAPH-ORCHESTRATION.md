# Workflow Graph Orchestration, Recovery, and Observability

- **Status:** proposed implementation contract
- **Last synchronized:** 2026-09-10
- **Scope:** workflow execution graph, durable node state, event journal, recovery, retry granularity, provider progress, human-action boundaries, and operator observability

This document specifies the next workflow-runtime hardening step after real long-running browser-provider failures. It is intentionally separate from the current as-built documents until the implementation lands.

The current engine already has durable workflow jobs, lane-level retry/recovery, team traces, and an automatic driver. The remaining problem is that execution is still too coarse at failure boundaries: a later member/round or synthesis failure can force a larger rerun than necessary, `RUNNING` does not prove that a live provider execution exists, provider waits are flattened into generic timeouts, and operator status does not always explain what is active, blocked, stalled, or waiting for a user.

The authoritative direction is to make the workflow a **durable dependency graph** whose nodes are driven by explicit events and whose current state is a projection of that graph.

## Goals

The runtime must:

1. retry only the smallest failed executable node;
2. preserve completed work unless an input dependency is explicitly invalidated;
3. derive execution order from dependencies rather than hard-coded round/team sequencing;
4. distinguish workflow state, execution state, and provider/browser state;
5. detect orphaned executions and recover them deterministically;
6. classify failures before deciding whether to retry;
7. treat explicit user interaction as a first-class wait state, not a provider timeout;
8. expose enough status to understand what is happening without a dedicated terminal per team/member;
9. scale to more members, rounds, teams, and future long-running modes without rewriting orchestration logic.

## Non-goals

This change does not:

- silently replace a durable job's persisted member/account routing;
- add provider-specific reasoning semantics to team prompts;
- reset a workflow from the beginning on `continue`;
- rerun completed nodes merely because a downstream node failed;
- auto-approve security-sensitive or ambiguous user-confirmation UI;
- hide deterministic automation bugs behind repeated retry loops;
- introduce a second independent workflow state machine beside the graph.

## 1. Durable execution graph

A workflow is represented as executable nodes plus dependency edges.

Conceptually:

```text
Workflow
└── Research
    ├── Team A
    │   ├── Round 1 / Member 1
    │   ├── Round 1 / Member 2
    │   ├── Round 2 / Member 1
    │   ├── Round 2 / Member 2
    │   └── Synthesis
    └── Team B
        ├── Round 1 / Member 1
        ├── Round 1 / Member 2
        ├── Round 2 / Member 1
        ├── Round 2 / Member 2
        └── Synthesis

Research A synthesis ─┐
                      ├── Writer
Research B synthesis ─┘

Writer ───────────────┬── Review A graph
                      └── Review B graph

Review result(s) ─────────> remediation / health / merge gates
```

Execution order is derived from edges. For example:

```text
R1/M1 ─┐
       ├──> R2/M1
R1/M2 ─┘
```

or, if a strategy later requires a sequential exchange:

```text
R2/M1 -> R2/M2 -> R2/M3
```

The scheduler must not need special-case code for a specific round/member number.

### Node identity

Every executable node has a stable logical identity, for example:

```text
research:A:round:2:member:1
research:B:round:2:member:2
research:B:synthesis
writer:implementation
review:A:round:1:member:1
review:A:synthesis
```

Logical node identity is separate from a concrete execution attempt.

## 2. Node, execution, and provider state are separate

A single `running` flag is insufficient.

### Node state

Recommended logical states:

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

`WAITING` always carries an explicit blocking reason. `FAILED` is terminal for that node unless an operator or code revision deliberately reopens it.

### Execution state

A concrete attempt tracks runtime ownership:

```text
QUEUED
STARTING
ACTIVE
FENCED
ORPHANED
SUCCEEDED
FAILED
CANCELLED
```

### Provider/browser state

Provider observation is more detailed:

```text
NAVIGATING
THINKING
STREAMING
WAITING_USER
STALLED
RATE_LIMITED
AUTH_REQUIRED
BROWSER_DEAD
COMPLETED
```

The workflow may therefore truthfully report:

```text
node       RUNNING
execution  ACTIVE
provider   THINKING
```

or:

```text
node       RECOVERING
execution  ORPHANED
provider   BROWSER_DEAD
```

## 3. Completed nodes are durable and normally immutable

Core invariant:

> A `COMPLETED` node must not run again unless one of its declared input dependencies is explicitly invalidated.

If Team B fails at Round 2 / Member 2, earlier work remains:

```text
Team B
  Round 1 / Member 1  COMPLETED
  Round 1 / Member 2  COMPLETED
  Round 2 / Member 1  COMPLETED
  Round 2 / Member 2  RECOVERING
```

Recovery retries only `Round 2 / Member 2`.

Likewise, if all member turns are complete and synthesis becomes orphaned, recovery retries synthesis only.

This rule prevents wasted provider time, changed research evidence between retries, and unnecessary token usage.

## 4. Scheduler: run the next READY graph node

The engine should converge on this model:

```text
load durable graph
-> reconcile existing executions
-> evaluate dependencies
-> promote WAITING nodes whose dependencies are satisfied to READY
-> dispatch READY nodes within concurrency/capacity policy
-> consume events
-> update projections
-> repeat until a durable stop boundary
```

The scheduler asks:

```text
Which nodes are READY?
Which nodes are already active?
Which nodes require recovery?
Which dependencies block progress?
Can the parent/stage complete?
```

It should not implement a procedural "start team at round 1 and replay until the end" fallback.

## 5. Event journal is the execution history

State is a projection; events are the durable explanation of how the workflow reached that state.

Each node emits meaningful events such as:

```text
NODE_READY
EXECUTION_STARTED
PROVIDER_SESSION_STARTED
PROVIDER_THINKING
PROGRESS_OBSERVED
PROVIDER_STREAMING
USER_ACTION_REQUIRED
STALL_DETECTED
EXECUTION_ORPHANED
EXECUTION_FENCED
RECOVERY_SCHEDULED
NODE_COMPLETED
NODE_FAILED
```

Every event includes at least:

```text
jobId
nodeId
executionId when applicable
attempt
occurredAt
type
reason/code when applicable
```

Provider/account metadata remains diagnostic execution metadata, not team reasoning identity.

The current compact job JSON may remain a current-state snapshot, while the event journal provides ordered execution evidence. Full event sourcing is not required; an append-only durable diagnostic journal plus deterministic state projection is sufficient.

## 6. Execution fencing

Every provider attempt receives a unique `executionId`.

When recovery starts:

```text
old execution -> FENCED
fresh executionId -> STARTING
```

A late result from a fenced execution must never commit node completion.

This prevents duplicated durable results when an old browser/provider request finishes after a retry has already started.

## 7. Reconciliation and orphan recovery

`/workflow continue` and process restart must begin with reconciliation, not replay.

For every durable `RUNNING`, `WAITING_USER`, or `RECOVERING` node, determine whether its recorded execution still exists and is valid.

```text
recorded execution exists and is live
  -> retain it

recorded execution missing/dead
  -> EXECUTION_ORPHANED
  -> fence prior execution identity
  -> recover only that logical node
```

Observed acceptance case:

```text
Team B members complete
Team B synthesis STARTED
no live browser/provider execution remains
```

Required recovery:

```text
synthesis execution -> ORPHANED
retry Team B synthesis only
preserve all member/round results
```

`continue` is therefore graph reconciliation and redrive, not "restart the current team".

## 8. Retry policy is failure-class aware

Retry belongs to the failed execution/node, not to the whole team.

Recommended failure classes:

```text
PROVIDER_EXPLICIT_ERROR
NETWORK_DISCONNECT
BROWSER_CRASH
STALL_TIMEOUT
HARD_TIMEOUT
RATE_LIMIT
AUTH_EXPIRED
RESULT_EXTRACTION_ERROR
USER_DENIED
AUTOMATION_BUG
INVALID_SELECTOR
UNKNOWN_PROVIDER_STATE
```

Example policies:

```text
PROVIDER_EXPLICIT_ERROR
  -> bounded node retry

NETWORK_DISCONNECT / BROWSER_CRASH
  -> recreate provider browser/session
  -> retry the same node

STALL_TIMEOUT / HARD_TIMEOUT
  -> fence execution
  -> recreate provider session
  -> bounded node retry

RESULT_EXTRACTION_ERROR
  -> retry extraction first when the provider result is still available
  -> do not invoke the model again unless required

AUTH_EXPIRED
  -> mark account unhealthy
  -> require re-authentication or an explicit routing policy

USER_DENIED
  -> BLOCKED or terminal node failure according to the operation contract

AUTOMATION_BUG / INVALID_SELECTOR
  -> do not consume repeated automatic provider retries
  -> surface a deterministic implementation failure
```

The observed `InvalidSelectorError` from a selector equivalent to:

```text
button[name=/.../] >> visible=true
```

is a deterministic browser-automation defect, not evidence that the model timed out. Re-running the writer unchanged can reproduce the same error indefinitely. This class must be visible separately from retryable provider failures.

## 9. Progress leases instead of one wall-clock timeout

A fixed `300000ms` timeout is not enough for High-thinking modes or future long-running research.

Track at least:

```text
startedAt
lastProviderEventAt
lastMeaningfulProgressAt
```

Meaningful progress may include:

```text
response text changed
new streaming chunk/token
thinking state changed
provider event/tool activity
browser state transition
```

A static spinner or unchanged "thinking" indicator must not refresh progress forever.

Conceptually:

```text
hardExpired = now - startedAt >= hardTimeoutMs
stalled = now - lastMeaningfulProgressAt >= stallTimeoutMs
```

If `hardExpired`, fence and apply hard-timeout policy. If `stalled` and no valid live activity exists, recover. Otherwise continue waiting.

Timeout values should be mode-aware rather than one global constant. Exact defaults belong in runtime configuration, but the state model must support distinct soft inspection, stall, and hard limits.

## 10. Human interaction is a first-class state

Browser providers can legitimately wait for the user:

```text
GitHub permission approval
OAuth consent
OTP / 2FA
CAPTCHA
login confirmation
account selection
security confirmation
connector approval
```

These are not provider stalls.

Required transition:

```text
RUNNING
-> USER_ACTION_REQUIRED event
-> WAITING_USER
-> user completes action
-> RUNNING
-> COMPLETED
```

While `WAITING_USER`:

- normal thinking/stall timeout is suspended;
- retry budget is not consumed merely because the user has not acted;
- the live browser/session is preserved;
- `/workflow status` explains the exact requested action and how to reach the session;
- `/workflow continue` must not create a duplicate writer/member execution while the original one is still live.

A separate, much longer human-action TTL may be configured if needed, but expiration must be reported as a human-action boundary rather than a generic provider timeout.

## 11. Provider observations do not directly mutate workflow parents

Keep dependency boundaries explicit:

```text
browser/provider observation
-> provider event
-> node reducer
-> node state
-> graph evaluator
-> parent/team/stage projection
```

For example, a DOM stall emits `STALL_DETECTED`; it must not directly set `Team B = FAILED`.

This keeps provider-specific browser automation isolated from provider-agnostic workflow orchestration.

## 12. Parent/team/stage state is derived from graph state

A parent summarizes child nodes but does not erase their detail.

Example propagation:

```text
member node permanently fails
-> dependent synthesis cannot become READY
-> team becomes FAILED/BLOCKED
-> research stage evaluates required quorum
```

While automatic recovery is still scheduled, use `RECOVERING`, not the contradictory combination `FAILED + retryable`.

A terminal failure means either:

- the failure is not recoverable under current policy; or
- retry budget is exhausted; or
- explicit user/action authority is required and represented as a separate boundary.

## 13. Status is an observability projection of the graph

Because lower-level teams/members do not each have a dedicated terminal, operator transparency is part of runtime correctness.

`/workflow status` should answer:

```text
What is the workflow doing?
Which exact node is active?
Does a live execution exist?
What is the provider doing?
What blocks waiting nodes?
What failure occurred?
What recovery will happen next?
What user action is required?
```

Recommended projection:

```text
Workflow <jobId>
State: WRITER_RUNNING · healthy

Progress
  Research     COMPLETED
  Writer       RUNNING
  Review       WAITING
  PR           WAITING

Active execution
  Node          Writer
  Account       chatgpt-writer
  Provider      chatgpt-web
  Node state    RUNNING
  Execution     ACTIVE
  Provider      THINKING
  Attempt       1/3
  Started       ...
  Last progress ...
  Stall lease   healthy

Graph
  Research A synthesis   COMPLETED
  Research B synthesis   COMPLETED
  Writer                 RUNNING
  Review A               WAITING · blocked by Writer
  Review B               WAITING · blocked by Writer
  PR                     WAITING · blocked by review gate

Recent events
  ... Team B synthesis   COMPLETED
  ... Writer             READY
  ... Writer             STARTED
  ... Provider           THINKING
  ... Provider           PROGRESS

Next
  Writer success -> Review A + Review B become READY
  Writer stall   -> fence execution and retry Writer only
```

Do not dump heartbeat noise. Show only recent meaningful events by default; a deeper inspect/events command may expose more diagnostic history.

### Projection invariants

1. Every `RUNNING` node points to an observable execution.
2. Every `WAITING` node explains its blocking dependency/reason.
3. Every `WAITING_USER` node explains the required action and active session.
4. Every `RECOVERING` node explains the failure, attempt, and next recovery action.
5. Every terminal node has a durable completion/failure event.
6. Status must never show stale child text such as `Writer: waiting for research` after research is already complete and the writer has failed or started.

## 14. `driver active` is not sufficient health information

Replace or supplement the coarse driver label with explicit runtime projection:

```text
Driver       HEALTHY
Scheduler    WAITING_ON_ACTIVE_EXECUTION
Active       1
Recovering   0
Blocked      2
```

A healthy driver with no live execution for a durable `RUNNING` node must trigger reconciliation rather than continue displaying a misleading healthy state.

## 15. `continue` semantics

`/workflow continue` must:

```text
load the existing durable graph
reconcile non-terminal executions
preserve all completed nodes/results/session identities
recover the smallest orphaned/failed recoverable node
resume graph scheduling from current dependencies
```

It must not:

```text
create a new job
reset research
restart a whole team because one child failed
change persisted account routing
start a duplicate execution when a live WAITING_USER node already exists
```

Manual retry remains an operator escape hatch, not the normal recovery mechanism.

## 16. Clean implementation boundary

This should become one authoritative execution model rather than adding compatibility layers around the existing coarse retry loop.

Preferred implementation properties:

- one durable graph model;
- one scheduler;
- one node reducer/event path;
- one recovery policy layer;
- provider adapters emit observations/events only;
- operator status reads graph + execution/event projections;
- no duplicate old/new retry engines;
- no provider-specific orchestration branches in the graph core.

If the durable schema must change incompatibly, prefer an explicit schema-version boundary over silent partial interpretation. Do not keep parallel legacy state paths indefinitely.

## 17. Required acceptance cases

### A. Later member failure

Given:

```text
Team B Round 1 complete
Team B Round 2 / Member 1 complete
Team B Round 2 / Member 2 fails
```

Then:

```text
retry Round 2 / Member 2 only
preserve all completed nodes
```

### B. Orphaned synthesis

Given:

```text
all Team B member work complete
Team B synthesis STARTED
no matching live execution exists
```

Then:

```text
mark old execution ORPHANED/FENCED
retry Team B synthesis only
```

### C. Long valid thinking

Given a provider is still making meaningful progress beyond the old 300-second wall-clock limit, the node must remain active until stall/hard-timeout policy is actually reached.

### D. Stalled provider

Given no meaningful progress beyond the configured stall lease, fence the execution, recreate the provider session if required, and retry only that node within its budget.

### E. User permission prompt

Given Writer requests GitHub permission:

```text
Writer -> WAITING_USER
normal provider timeout suspended
retry budget unchanged
status exposes action/session
```

After approval:

```text
Writer -> RUNNING -> COMPLETED
Review A/B -> READY
```

### F. Deterministic selector/automation failure

Given browser automation throws an invalid-selector/parser error, classify it as `INVALID_SELECTOR`/`AUTOMATION_BUG`, surface the exact node and adapter diagnostic, and do not loop through automatic provider retries that cannot fix the code defect.

### G. Continue with a live user wait

Given a live Writer is `WAITING_USER`, `/workflow continue` must report/reuse that execution rather than starting another Writer turn.

### H. Restart recovery

After process restart, rebuild graph readiness from durable node/event state and continue at the smallest unfinished valid node without replaying completed work.

## 18. Implementation order

Recommended order:

1. define durable node IDs, node/execution/provider state types, and graph dependencies;
2. add event journal/reducer semantics and execution IDs;
3. implement graph readiness/scheduler projection;
4. add reconciliation and execution fencing;
5. move retry from lane/team granularity to node granularity;
6. add progress leases and mode-aware timeout policy;
7. add `WAITING_USER` and human-action detection contract;
8. classify deterministic browser-automation failures separately from provider failures;
9. rebuild `/workflow status|watch` from graph/execution/event projections;
10. remove obsolete coarse retry/replay paths once the graph runtime is authoritative;
11. add acceptance tests for the real failure cases above.

## Completion criteria

This hardening is complete only when a long-running workflow can be understood and recovered from durable state without opening every underlying provider session and without manually restarting whole teams.

The defining behavior is:

> **The workflow is a durable graph. Events explain what happened. The scheduler runs only READY nodes. Recovery retries only the smallest failed/orphaned node. Completed work is preserved. Human interaction is explicit. Status makes every active, blocked, recovering, and terminal state explainable.**
