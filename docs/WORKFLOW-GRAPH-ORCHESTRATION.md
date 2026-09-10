# Workflow Graph Orchestration, Recovery, and Observability

- **Status:** proposed implementation contract
- **Last synchronized:** 2026-09-10
- **Scope:** workflow execution graph, durable node state, recovery, retry granularity, provider progress, human-action boundaries, and operator observability

This document specifies the next workflow-runtime hardening step after real long-running browser-provider failures. It is intentionally separate from the current as-built documents until the implementation lands.

The current engine already has durable workflow jobs, lane-level retry/recovery, team traces, an automatic driver, exact handoffs, one-PR idempotency, exact-head review/health gates, and scoped Website approval policy. The remaining problem is that execution is still too coarse at failure boundaries: a later member/round or synthesis failure can force a larger rerun than necessary, `RUNNING` does not prove that a live provider execution exists, provider waits are flattened into generic timeouts, and operator status does not always explain what is active, blocked, stalled, recovering, or waiting for a user.

The authoritative direction is to make workflow execution a **durable dependency graph** whose scheduler drives only ready nodes, whose completed work is reusable only against the exact inputs that produced it, and whose status is an explainable projection of durable graph and live execution state.

## Existing contracts this design must preserve

This proposal refines execution and recovery. It does not weaken existing accepted workflow authority.

The implementation must preserve:

- one shared provider-agnostic team execution core for `internet_team` and workflow research/review;
- stable per-job Website session identities and persisted account routing;
- Research A/B and Review A/B workflow-lane concurrency;
- account-scheduler ownership of same-account capacity/serialization;
- exact verbatim handoffs and handoff integrity;
- deterministic workflow branch and one-PR reconciliation;
- exact-head review, PR-health, remediation, authorization, and merge binding;
- scoped auto-approval for recognized eligible writer implementation actions;
- fail-closed handling for unknown, ambiguous, or scope-mismatched confirmations;
- explicit user authority for merge;
- no hidden member/provider substitution during an existing durable job;
- terminal cancellation semantics.

In particular, a routine recognized GitHub `Allow` prompt for an eligible writer implementation action is **not** automatically a human wait. The existing approval policy remains authoritative: validate scope and auto-confirm when allowed; only ambiguous/out-of-scope/user-owned interaction becomes an action-required boundary.

## Goals

The runtime must:

1. retry only the smallest recoverable executable node;
2. preserve completed work only when its declared input identity still matches;
3. derive execution order from dependencies rather than hard-coded team/round replay;
4. distinguish workflow phase, node state, execution state, and provider/browser state;
5. detect orphaned executions from durable ownership/lease evidence and recover them deterministically;
6. classify failures before deciding retry, backoff, user action, or terminal blocking;
7. reconcile an uncertain prior provider/external action before blindly resubmitting it;
8. treat resumable explicit user interaction as a first-class wait state rather than a provider timeout;
9. expose enough status to understand execution without a dedicated terminal per team/member;
10. scale to more members, rounds, teams, review cycles, and future long-running modes without rewriting orchestration logic.

## Non-goals

This change does not:

- silently replace a durable job's persisted member/account routing;
- add provider-specific reasoning semantics to team prompts;
- reset a workflow from the beginning on `continue`;
- rerun completed nodes merely because a downstream node failed;
- auto-approve unknown, ambiguous, out-of-scope, or user-owned security decisions;
- convert merge authorization into an implicit browser approval;
- hide deterministic automation bugs behind repeated retry loops;
- add degraded one-team/quorum completion to research or review;
- introduce a generic user-defined DAG language;
- introduce a second independent team loop or second workflow state machine beside the graph.

## 1. Durable execution graph

A workflow is represented as executable nodes plus explicit dependency edges.

Conceptually:

```text
Research Team A graph ─┐
                       ├── research handoff gate ──> Writer implementation
Research Team B graph ─┘

Writer implementation ──> PR receipt / exact head
                              |
                              +──> Review Team A cycle/head graph ─┐
                              |                                    |
                              +──> Review Team B cycle/head graph ─┤
                                                                   v
                                                    review decision gate
                                                       |          |
                                             CHANGES_REQUIRED    PASS/PASS
                                                       |          |
                                                       v          v
                                                Writer remediation PR health
                                                       |          |
                                                       +-> new     v
                                                          head   merge authority
                                                                 gate
                                                                  |
                                                                  v
                                                               merge
```

Within one team execution, dependencies encode the actual speaking order. With the current two-member/two-round strategy:

```text
R1/M1 -> R1/M2 -> R2/M1 -> R2/M2 -> synthesis
```

If a future strategy supports independent parallel member turns, its graph may express those edges differently. The scheduler must not hard-code a specific round/member number.

The graph may be **deterministically expanded** as new authoritative facts become available. For example, the review-cycle subgraph cannot be fully bound until the writer has persisted the exact PR head. Graph expansion itself must be a durable engine transition before newly created nodes can run.

## 2. Stable node identity and exact input binding

Logical node identity is separate from concrete execution attempt identity.

Examples:

```text
research:A:round:2:member:1
research:B:synthesis
writer:implementation
review:cycle:1:A:round:1:member:1
review:cycle:1:A:synthesis
writer:remediation:cycle:1
pr-health:cycle:1
merge:cycle:1
```

Review/remediation nodes are cycle-scoped so a new PR head cannot accidentally reuse a completed review from an older head.

Each executable node must persist an immutable input receipt/fingerprint covering all correctness-bearing inputs for that node, such as:

```text
nodeId
inputRevision / inputHash
ordered dependency result hashes
prompt/control hash where applicable
repository/base revision
PR number + expected head SHA where applicable
review cycle where applicable
stable Website session identity
```

Each completed node persists an output/result receipt with at least a deterministic digest.

Core invariant:

> A `COMPLETED` node is reusable only while its exact input receipt still matches. Changed correctness-bearing input creates a new generation/node or explicitly invalidates the old completion before downstream scheduling.

For exact-head review, the expected PR head is part of the input identity. A new remediation head therefore creates a new review generation/cycle rather than mutating old completed review evidence into current evidence.

## 3. Node, execution, and provider state are separate

A single `running` flag is insufficient.

### Node state

Recommended logical node states:

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

Semantics:

- `WAITING`: dependencies or an explicit prerequisite are unsatisfied; blocking reason is mandatory.
- `READY`: all graph dependencies are satisfied and the node may be dispatched.
- `RUNNING`: one current non-fenced execution owns the node.
- `WAITING_USER`: a live execution is intentionally paused for resumable user interaction.
- `RECOVERING`: the previous execution failed/orphaned and code has a concrete recovery action.
- `COMPLETED`: exact input-bound output is durably committed.
- `FAILED`: terminal for this node under current policy; no automatic recovery remains.
- `CANCELLED`: terminal cancellation.

A recoverable execution error must **not** first make the logical node `FAILED` and then reopen it. The concrete execution becomes `FAILED`/`ORPHANED`; the logical node becomes `RECOVERING`. `FAILED` is reserved for non-recoverable or retry-exhausted node state.

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

Each provider attempt receives a unique `executionId`.

### Provider/browser state

Provider observation is more detailed and adapter-facing:

```text
NAVIGATING
THINKING
STREAMING
CONFIRMATION_REQUIRED
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

## 4. Workflow phase and lifecycle are orthogonal

The current coarse top-level state can hide useful distinctions such as `FAILED_RETRYABLE` while the actual failure occurred in Writer.

The target projection should separate at least:

```text
phase      RESEARCH | WRITER | REVIEW | HEALTH | MERGE | DONE
lifecycle  RUNNING | WAITING_USER | RECOVERING | BLOCKED | COMPLETED | CANCELLED
reason     optional structured reason/code
action     optional required/next action
```

Equivalent persisted representation may use a different type shape, but user-visible status must not collapse phase, recoverability, and reason into one ambiguous flag.

Examples:

```text
Phase: Writer
Status: RECOVERING
Reason: PROVIDER_STALLED
Next: retry writer node attempt 2/3
```

```text
Phase: Writer
Status: BLOCKED
Reason: AUTOMATION_BUG.INVALID_SELECTOR
Action: code fix required; automatic provider retry suppressed
```

```text
Phase: Merge
Status: WAITING_USER
Reason: MERGE_AUTHORIZATION_REQUIRED
```

The merge example is a **workflow authority wait**, not a live provider execution wait. The distinction is made explicit in Section 12.

## 5. Preserve the one shared team core

Moving workflow persistence to member-turn nodes must not create a second workflow-specific debate engine.

The current shared team core owns team semantics: speaking order, peer-context construction, purpose-specific prompt strategy, synthesis, provider-agnostic member roles, and failure boundaries. That authority remains shared by `internet_team` and workflow.

The preferred refactor is to make the shared core expose deterministic plan/step primitives, conceptually:

```text
buildTeamPlan(strategy, members, rounds)
prepareTeamStep(node, completed dependency results)
executeTeamStep(node, prepared input)
reduceTeamCompletion(...)
```

Then:

```text
internet_team
  -> same shared TeamPlan/TeamStep primitives
  -> may execute the plan in one in-memory invocation

workflow
  -> same shared TeamPlan/TeamStep primitives
  -> persists graph nodes/executions/results between steps
```

The exact API names are implementation choices. The invariant is not: workflow must not copy the round loop, prompt logic, or synthesis logic into a separate graph-only implementation.

## 6. Scheduler runs READY nodes

The engine should converge on this model:

```text
load durable graph snapshot
-> reconcile existing execution ownership
-> evaluate dependencies and exact input bindings
-> promote eligible WAITING nodes to READY
-> dispatch READY nodes
-> let the existing account scheduler enforce account capacity/session ordering
-> consume execution outcomes
-> persist graph transition
-> repeat until a durable stop/action boundary
```

The graph scheduler controls **semantic dependency readiness**. The account scheduler remains the sole owner of same-account concurrency/capacity. Research A/B and Review A/B therefore remain workflow-level concurrent when their graph dependencies allow it.

The scheduler asks:

```text
Which nodes are READY?
Which nodes already have a current execution?
Which nodes require recovery?
Which dependencies block progress?
Do exact input receipts still match?
Can the current phase gate advance?
```

It must not implement a procedural "restart this team from round 1" fallback.

## 7. Authoritative graph snapshot and event journal

Avoid two competing sources of truth.

The **durable graph/job snapshot is authoritative correctness state**. It contains node state, execution ownership/fencing data, input/output receipts, phase gates, pending action, and external receipts needed to decide the next transition.

The event journal is an ordered durable diagnostic history of meaningful graph/execution transitions. It improves transparency and debugging, but the runtime must not require replaying the entire journal to reconstruct correctness state.

This is intentionally **not full event sourcing**.

Each event should include at least:

```text
eventId
eventSeq            # monotonic per job
graphRevision       # snapshot revision produced/observed
jobId
nodeId when applicable
executionId when applicable
attempt when applicable
occurredAt
type
structured reason/code when applicable
```

Meaningful event examples:

```text
NODE_READY
EXECUTION_STARTED
PROVIDER_THINKING
PROGRESS_OBSERVED
PROVIDER_STREAMING
CONFIRMATION_DETECTED
CONFIRMATION_AUTO_APPROVED
USER_ACTION_REQUIRED
STALL_DETECTED
EXECUTION_ORPHANED
EXECUTION_FENCED
RECOVERY_SCHEDULED
NODE_COMPLETED
NODE_FAILED
```

Concurrent lane transitions receive a deterministic per-job `eventSeq` under the same workflow mutation serialization/guard used to update graph state.

### Commit ordering and crash consistency

A diagnostic event must never be allowed to advance workflow correctness without the authoritative snapshot transition.

The implementation should use one per-job mutation boundary/CAS/lock for graph revisions. Persist the new authoritative snapshot first or atomically with its associated event record. If the event journal is stored separately and an append fails after the snapshot commit, correctness remains in the snapshot and the diagnostic gap must be detectable; the runtime must not roll the workflow backward or infer state from the missing event.

Status may show recent meaningful events, but graph state remains authoritative.

## 8. Execution ownership, leases, and fencing

Execution liveness is not the same as provider progress.

Each active execution should persist enough ownership evidence to determine whether another driver may safely recover it:

```text
executionId
nodeId
attempt
ownerInstanceId
startedAt
heartbeatAt / leaseUntil
status
```

The driver refreshes an **execution ownership lease** while it owns the work. A process restart, crashed driver, or expired lease makes the prior execution orphanable even if a stale browser page still exists.

Provider progress timing is tracked separately in Section 11.

### Fencing

When recovery supersedes an execution:

```text
old execution -> FENCED
fresh executionId -> STARTING
```

A late result from a fenced execution must never commit node completion or overwrite the current execution receipt.

The store must validate the current `executionId`/graph revision before accepting a completion so stale concurrent work cannot win a race.

## 9. Reconciliation and orphan recovery

`/workflow continue` and process restart begin with reconciliation, not replay.

For each durable `RUNNING`, `WAITING_USER`, or `RECOVERING` node:

```text
valid current ownership lease + matching live execution
  -> retain/re-attach according to runtime capability

owner missing, lease expired, browser/provider dead, or execution cannot be resumed
  -> record EXECUTION_ORPHANED
  -> fence prior execution
  -> recover only that logical node
```

Browser/session existence alone is not authoritative proof that the original in-process execution is still able to commit.

Observed acceptance case:

```text
Team B member turns complete
Team B synthesis STARTED
no valid live execution remains
```

Required recovery:

```text
old synthesis execution -> ORPHANED/FENCED
retry Team B synthesis only
preserve all exact-input-matching member results
```

## 10. Retry means reconcile before resubmit

Execution fencing prevents duplicate **durable commits**. It does not by itself prevent duplicate provider turns or duplicate external side effects.

Therefore node recovery follows this order:

```text
1. fence/supersede the old execution if necessary
2. inspect durable provider/external receipts
3. reconcile the provider conversation or external artifact when possible
4. recover an already completed response/result if it can be identified safely
5. only resubmit/re-execute when reconciliation proves it is needed or policy explicitly allows at-least-once retry
```

Persist a request/input fingerprint for provider turns so recovery can reason about which logical request was submitted.

For team/research turns, the runtime should prefer recovering an already completed provider response over sending the same member prompt twice. If a provider cannot expose enough identity to prove exactly-once turn execution, the runtime may use bounded at-least-once provider retry, but it must still prevent duplicate durable node completion and record that reconciliation was ambiguous.

For Writer, existing external idempotency remains mandatory: deterministic branch/job identity and exact PR reconciliation are checked before creating or mutating external GitHub artifacts again. A writer retry must not treat "no final model JSON received" as proof that no repository action occurred.

A retry may use a fresh BrowserContext/runtime execution while retaining the existing stable job-scoped Website session identity required by the workflow contract.

## 11. Progress leases instead of one wall-clock timeout

A fixed `300000ms` completion timeout is not sufficient for High-thinking modes or future long-running research.

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
thinking phase changed
provider tool/action activity changed
browser state transitioned toward completion
```

A static spinner, unchanged "thinking" label, animation, or unrelated DOM churn must not refresh progress indefinitely.

Conceptually:

```text
hardExpired = now - startedAt >= hardTimeoutMs
stalled = now - lastMeaningfulProgressAt >= stallTimeoutMs
```

If `hardExpired`, apply hard-timeout policy. If `stalled` and no valid live activity exists, recover. Otherwise continue waiting.

Timeout policy is mode-aware and failure-aware rather than one global constant. Exact default values belong in runtime configuration/tests, not hard-coded into this architecture document.

The **execution ownership lease** from Section 8 proves which driver owns the execution. The **provider progress lease** in this section decides whether the owned provider work is making progress. They must not be conflated.

## 12. Human interaction and approval policy

There are two different human boundaries and they have different runtime semantics.

### A. Resumable live browser interaction

Examples may include:

```text
OTP / 2FA
CAPTCHA
account selector
certain OAuth/connector consent
unknown confirmation requiring inspection
```

When policy decides the current live execution can safely remain open for user interaction:

```text
RUNNING
-> USER_ACTION_REQUIRED event
-> WAITING_USER
-> user completes action
-> RUNNING
-> COMPLETED
```

While this node is `WAITING_USER`:

- ordinary thinking/stall timeout is suspended;
- retry budget is not consumed merely because the user has not acted;
- the live execution/browser is preserved when safe;
- status exposes the exact requested action and how to reach that session;
- `continue` must not create a duplicate execution while the original ownership lease is valid.

A separate human-action TTL may exist, but expiration is a user-interaction boundary, not a generic provider timeout.

Some auth failures cannot safely resume the current provider turn. Those should become an account reauthentication action-required/block state rather than pretending the existing Writer/member execution can wait indefinitely.

### B. Workflow authority gates

Merge authorization is an explicit workflow control-plane gate. It does not require a provider execution to remain alive while the user decides.

The workflow may project:

```text
phase      MERGE
lifecycle  WAITING_USER
action     MERGE_AUTHORIZATION_REQUIRED
```

but there is no implication that a live browser turn is consuming a provider lease during that wait.

### Existing scoped Website approval remains authoritative

For Writer implementation/remediation:

```text
recognized + scope-valid eligible GitHub confirmation
  -> auto-approve
  -> remain RUNNING

unknown / malformed / ambiguous / scope-mismatched confirmation
  -> do not click
  -> durable action-required boundary
  -> preserve live interaction only when safe
```

For merge:

```text
no user merge authorization
  -> never auto-authorize merge

exact user merge authorization already durable
+ exact state/head still valid
+ recognized Website merge confirmation
  -> controller may confirm the Website prompt
```

Therefore a plain "Writer requests GitHub permission" is not enough to decide `WAITING_USER`; the approval classifier must first determine action identity and scope.

## 13. Failure classification and recovery policy

Failure classification should separate broad class from concrete code so the taxonomy can grow without one flat enum.

Example shape:

```text
class: PROVIDER | TRANSPORT | BROWSER | AUTH | OUTPUT | AUTOMATION | USER
code:  PROVIDER_ERROR | RATE_LIMITED | NETWORK_DISCONNECT | BROWSER_CRASH |
       AUTH_EXPIRED | RESULT_EXTRACTION_ERROR | INVALID_SELECTOR |
       USER_DENIED | UNKNOWN_CONFIRMATION | ...
retry: IMMEDIATE | BACKOFF | RECREATE_SESSION | USER_ACTION | CODE_FIX | NONE
```

Example policy:

```text
PROVIDER / PROVIDER_ERROR
  -> bounded same-node retry

PROVIDER / RATE_LIMITED
  -> bounded backoff; do not silently substitute another durable member

TRANSPORT / NETWORK_DISCONNECT
BROWSER / BROWSER_CRASH
  -> reconcile, recreate runtime/browser context as needed, retry same node

OUTPUT / RESULT_EXTRACTION_ERROR
  -> retry extraction/reconciliation first; do not invoke the model again if the result is recoverable

AUTH / AUTH_EXPIRED
  -> account-health/action-required path; reauthenticate or follow an explicit routing policy

USER / USER_DENIED
  -> block/fail according to the authority contract

AUTOMATION / INVALID_SELECTOR
  -> deterministic implementation defect; suppress repeated automatic provider retry and surface code-fix-required diagnostics
```

The observed `InvalidSelectorError` from a selector equivalent to:

```text
button[name=/.../] >> visible=true
```

is an automation defect in confirmation detection, not evidence that ChatGPT timed out or that the permission prompt itself required manual approval. Re-running unchanged automation can reproduce the same failure indefinitely.

## 14. Parent/team/stage state is derived from graph state

A parent summarizes child nodes but does not erase their detail.

Example propagation:

```text
member execution fails recoverably
-> member node RECOVERING
-> dependent nodes WAITING on that exact member node
-> team/phase projection shows RECOVERING

member node fails terminally
-> dependent synthesis cannot become READY
-> team projection BLOCKED/FAILED
-> research/review gate evaluates its required dependency set
```

This proposal does **not** introduce degraded research/review quorum. Under the current workflow contract, required Team A/B handoffs remain required unless a separate future specification changes that policy.

While automatic recovery exists, use `RECOVERING`, not a contradictory terminal-looking `FAILED + retryable` combination.

## 15. Exact-head review/remediation graph

Exact-head authority must remain visible in graph identity and dependencies.

Example:

```text
Writer implementation
  -> PR receipt(head=H1)
     -> Review cycle 1 Team A nodes(inputs include H1)
     -> Review cycle 1 Team B nodes(inputs include H1)
        -> review decision for H1

if CHANGES_REQUIRED:
  -> Writer remediation cycle 1(inputs include H1 + exact review handoffs)
     -> PR receipt(head=H2)
        -> Review cycle 2 Team A nodes(inputs include H2)
        -> Review cycle 2 Team B nodes(inputs include H2)
           -> review decision for H2

if PASS/PASS for exact Hn:
  -> PR health node(inputs include Hn)
  -> merge-authorization gate(bound to Hn)
  -> pre-merge revalidation(bound to Hn)
  -> merge execution
```

Old review nodes remain durable evidence but cannot satisfy dependencies for a new head because their input/head identity differs.

## 16. Status is an observability projection of the graph

Because lower-level teams/members do not each have a dedicated terminal, operator transparency is part of runtime correctness.

`/workflow status` should answer:

```text
What phase is active?
What is the workflow lifecycle/health?
Which exact graph node is active?
Does a valid current execution exist?
What generic provider activity is happening?
What blocks each waiting node?
What failure occurred and how was it classified?
What recovery/user action happens next?
```

Recommended projection:

```text
Workflow <jobId>
Phase: Writer
Status: RUNNING · healthy

Progress
  Research     COMPLETED
  Writer       RUNNING
  Review       WAITING
  PR           WAITING

Active execution
  Node          Writer implementation
  Execution     ACTIVE
  Attempt       1/3
  Activity      THINKING
  Started       ...
  Last progress ...
  Stall lease   healthy

Graph
  Research A synthesis   COMPLETED
  Research B synthesis   COMPLETED
  Writer implementation RUNNING
  Review A               WAITING · blocked by Writer/PR head
  Review B               WAITING · blocked by Writer/PR head

Recent events
  ... Team B synthesis   COMPLETED
  ... Writer             READY
  ... Writer             STARTED
  ... Provider activity  THINKING
  ... Provider activity  PROGRESS

Next
  Writer success -> persist/reconcile PR -> Review A/B become READY
  Writer stall   -> reconcile/fence -> recover Writer node only
```

For normal research/review display, keep `Member 1..N` semantics. Raw provider/account identity remains diagnostic detail rather than reasoning identity. Writer may continue to show its dedicated semantic account because that account is itself a workflow authority role.

Do not dump heartbeat noise. Show only recent meaningful events by default; deeper inspect/events diagnostics may expose more history without becoming another correctness state machine.

### Projection invariants

1. Every `RUNNING` node points to exactly one current non-fenced execution.
2. Every `WAITING` node explains its blocking dependency/reason.
3. Every live-interaction `WAITING_USER` node explains the action and execution/session reachability.
4. Every `RECOVERING` node explains the failure, attempt/budget, reconciliation state, and next recovery action.
5. Every terminal node has a durable exact-input-bound result or structured terminal failure receipt.
6. Status never shows stale child text such as `Writer: waiting for research` after research is complete and Writer has started/failed/recovered.
7. A healthy driver cannot mask the absence of a valid execution for a durable `RUNNING` node.

## 17. Driver/scheduler health must be explicit

`driver active` alone is insufficient.

Prefer a runtime projection such as:

```text
Driver       HEALTHY
Scheduler    WAITING_ON_ACTIVE_EXECUTION
Active       1
Recovering   0
Blocked      2
```

A durable `RUNNING` node with no valid current execution/lease triggers reconciliation instead of remaining indefinitely "driver active".

## 18. `continue` and `stop` semantics

### `/workflow continue`

`continue` must:

```text
load the existing durable graph
reconcile non-terminal execution ownership and external/provider receipts
preserve all exact-input-matching completed nodes/results/session identities
recover the smallest orphaned/failed recoverable node
resume scheduling from current dependencies
```

It must not:

```text
create a new job
reset research
restart a whole team because one child failed
change persisted account routing
start a duplicate execution when a valid live WAITING_USER execution exists
blindly repeat a Writer external action without PR/branch reconciliation
```

If a node is already live and merely waiting for user interaction, `continue` reports/reuses that execution rather than duplicating it.

Manual retry remains an operator escape hatch, not the normal recovery mechanism.

### `/workflow stop`

Stop preserves current terminal cancellation authority:

```text
request cancellation
-> stop dispatching new READY nodes
-> abort/fence active executions
-> await/settle active work so stale completions cannot commit
-> persist terminal CANCELLED
```

Completed node evidence may remain in durable state for inspection/retention, but a cancelled job is not resumable through `continue`.

## 19. Clean implementation boundary

This should become one authoritative execution model rather than adding compatibility layers around the existing coarse retry loop.

Preferred implementation properties:

- one durable graph/current-state authority;
- one graph scheduler;
- one shared team semantic/step core;
- one execution-fencing/lease mechanism;
- one recovery policy layer;
- provider adapters emit observations/results, not parent workflow mutations;
- one explicit approval/authority classifier path;
- operator status reads graph + execution + diagnostic event projections;
- no duplicate old/new retry engines;
- no provider-specific orchestration branches in the graph core.

If durable schema must change incompatibly, prefer an explicit schema-version boundary over silent partial interpretation. Do not keep parallel legacy execution engines indefinitely.

## 20. Required acceptance cases

### A. Later member failure

Given:

```text
Team B R1/M1 complete
Team B R1/M2 complete
Team B R2/M1 complete
Team B R2/M2 execution fails recoverably
```

Then:

```text
R2/M2 node -> RECOVERING
retry/reconcile R2/M2 only
preserve earlier exact-input-matching completed nodes
```

### B. Orphaned synthesis

Given:

```text
all Team B member work complete
Team B synthesis durable RUNNING/STARTED
execution owner/lease is no longer valid
```

Then:

```text
old synthesis execution -> ORPHANED/FENCED
retry/reconcile Team B synthesis only
```

### C. Long valid thinking

Given provider work continues to make meaningful progress beyond the old 300-second wall-clock limit, the node remains active until the configured stall/hard policy is actually reached.

### D. Stalled provider

Given no meaningful progress beyond the configured stall lease, reconcile/fence the execution, recreate runtime context when needed, and retry only that node within its budget.

### E. Eligible Writer confirmation

Given Writer presents a recognized scope-valid GitHub confirmation for an eligible implementation/remediation action:

```text
confirmation classified
-> controller auto-approves
-> Writer remains RUNNING
-> no user interruption
```

### F. Unknown/ambiguous confirmation

Given a confirmation cannot be matched reliably to current job/repository/action/branch/PR authority:

```text
do not click
-> durable action-required state
-> WAITING_USER only if a live resumable interaction is intentionally preserved
```

### G. Deterministic selector/automation failure

Given confirmation detection throws an invalid-selector/parser error:

```text
class=AUTOMATION
code=INVALID_SELECTOR
retry=CODE_FIX/NONE
```

Surface exact node/adapter diagnostics and do not loop unchanged code through automatic provider retries.

### H. Continue with a live user wait

Given a valid live Writer/member execution is `WAITING_USER`, `continue` must report/reuse it rather than start another execution.

### I. Retry after uncertain provider completion

Given an execution timed out but its provider conversation may have completed afterward, recovery must reconcile the existing conversation/result first and use a safely identifiable completed result when available before resubmitting the logical turn.

### J. Writer external-action ambiguity

Given Writer timed out after possibly creating/updating a workflow branch or PR but before returning final output, recovery must reconcile the deterministic branch/exact PR identity before another mutation attempt. It must not create a second workflow PR.

### K. Review head changes

Given Review cycle 1 completed for head `H1` and remediation changes the PR to `H2`, no `H1` review node/result may satisfy an `H2` review/health/merge dependency.

### L. Concurrent lanes

Given Research A/B or Review A/B are both ready, the graph scheduler may dispatch both without adding an A-then-B mutex; the account scheduler remains the only same-account capacity gate.

### M. Restart recovery

After process restart, reconcile execution leases/ownership and rebuild readiness from the authoritative durable graph without replaying exact-input-matching completed work.

### N. Status consistency

A failed/recovering Writer after completed research must never render `Writer: waiting for research`; status must derive blockers and lifecycle from graph state.

### O. No degraded quorum regression

Failure of one required Research/Review lane cannot silently advance the phase using only the surviving lane unless a separate explicit product contract introduces degraded operation.

## 21. Implementation order

Recommended order:

1. define graph/node schema, phase/lifecycle projection, graph revision, stable node IDs, and input/output receipts;
2. refactor the shared team core into reusable deterministic plan/step primitives without duplicating its reasoning semantics;
3. add execution IDs, ownership leases, and fencing checks;
4. implement graph readiness, deterministic expansion, and scheduler integration while preserving existing account scheduling;
5. add authoritative snapshot mutation guards plus ordered diagnostic graph events;
6. implement reconciliation before resubmit, including provider-turn and Writer external-action receipts;
7. move retry from lane/team granularity to node granularity;
8. add progress leases and mode-aware timeout policy;
9. integrate existing scoped confirmation policy with live `WAITING_USER` handling and action-required projection;
10. classify deterministic automation failures separately from provider failures;
11. rebuild `/workflow status|watch` from graph/execution/event projections;
12. preserve exact-head review/remediation/health/merge bindings through cycle/head-specific inputs;
13. remove obsolete coarse team/lane replay/retry paths once the graph scheduler is authoritative;
14. add acceptance tests for the observed and exact-head/concurrency cases above;
15. update current as-built SRS/engine/operator docs only when production behavior has actually migrated.

## Completion criteria

This hardening is complete only when a long-running workflow can be understood and recovered from durable state without opening every underlying provider session and without manually restarting whole teams.

The defining behavior is:

> **The workflow is a durable dependency graph. Exact input receipts decide whether completed work is reusable. The scheduler runs only READY nodes. Recovery first reconciles uncertain provider/external state and then retries only the smallest recoverable node. Execution leases and fencing prevent stale commits. Existing writer approval and exact-head authority remain intact. Human interaction is explicit. Status makes active, blocked, recovering, user-waiting, and terminal state explainable.**
