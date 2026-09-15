# Workflow Graph Orchestration, Recovery, and Observability

- **Status:** current as-built execution contract
- **Last synchronized:** 2026-09-15
- **Scope:** durable node graph, exact receipts, execution ownership, recovery, provider progress, human-action boundaries, and operator observability

The workflow runtime uses one authoritative durable dependency graph. Coarse team/lane replay state and the obsolete team-trace correctness store are not part of the current engine.

## 1. Authoritative model

A workflow consists of deterministic nodes plus explicit dependencies:

```text
Research A graph --\
                    -> research handoff gate -> Writer implementation -> PR head H1
Research B graph --/                                             |
                                                                  +-> Review A cycle 1 graph --\
                                                                  +-> Review B cycle 1 graph --- review decision

CHANGES_REQUIRED -> Writer remediation -> H2 -> fresh review cycle
PASS/PASS        -> PR health -> merge authorization -> merge
```

Within the current two-member/two-round team:

```text
R1/M1 -> R1/M2 -> R2/M1 -> R2/M2 -> synthesis
```

`TeamPlan` owns these dependencies. For larger teams, member dependencies also include every latest prior peer contribution actually consumed by the prepared prompt. Synthesis depends on all member steps whose outputs it consumes.

Graph expansion is deterministic. Review nodes cannot be exact-input-bound until Writer has persisted the PR/head they must review.

## 2. Stable node identity and exact input binding

Logical node identity is separate from execution-attempt identity. Examples:

```text
research:A:round:2:member:1
research:B:synthesis
writer:implementation
review:cycle:1:A:round:1:member:1
writer:remediation:cycle:1
pr-health:cycle:1
merge:cycle:1
```

An executable node receives an exact input receipt whose hash binds its correctness-bearing inputs. Depending on node kind this includes dependency result hashes, prepared prompt/control hash, repository/base revision, PR/head, review cycle, account/route, lane/team identity, and stable Website session identity.

A completed node stores an output receipt referencing a durable node result.

> A `COMPLETED` node is reusable only while its exact input receipt still matches.

A new PR head therefore creates a new review/remediation generation rather than mutating old evidence into current evidence.

## 3. State dimensions

### Node state

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

Current runtime meanings:

- `WAITING`: dependency/prerequisite unsatisfied.
- `READY`: exact input is bound and the node may be dispatched.
- `RUNNING`: one current execution owns the node.
- `RECOVERING`: previous execution failed/orphaned and has a concrete recovery plan.
- `COMPLETED`: exact input-bound output is durably committed.
- `FAILED`: terminal/action boundary for this node under current policy.
- `CANCELLED`: terminal cancellation.
- `WAITING_USER`: modeled for a live resumable execution, but no current headless workflow provider adapter enters this state; see Section 10.

Recoverable errors do not pass through temporary `FAILED`; the logical node stays recoverable as `RECOVERING` while the concrete attempt is failed/orphaned/fenced.

### Execution state

```text
QUEUED | STARTING | ACTIVE | FENCED | ORPHANED | SUCCEEDED | FAILED | CANCELLED
```

Every provider attempt receives a unique `executionId`, positive attempt, owner instance, start/heartbeat/lease timestamps, and provider/progress evidence.

### Provider state

```text
NAVIGATING | THINKING | STREAMING | CONFIRMATION_REQUIRED | WAITING_USER |
STALLED | RATE_LIMITED | AUTH_REQUIRED | BROWSER_DEAD | COMPLETED
```

Not every modeled provider state is currently emitted by every adapter. Current team/Writer execution actively projects thinking/streaming/progress and terminal failure evidence.

### Workflow phase/lifecycle

```text
phase      RESEARCH | WRITER | REVIEW | HEALTH | MERGE | DONE
lifecycle  RUNNING | WAITING_USER | RECOVERING | BLOCKED | COMPLETED | CANCELLED
```

Phase and lifecycle are orthogonal. Top-level `WAITING_USER` is currently used for durable user authority such as merge authorization and does not imply a live browser lease.

## 4. Shared team boundary

Workflow graph persistence must not become a second team engine.

```text
internet_team -> TeamPlan/prepare/run step -> in-memory execution
workflow      -> TeamPlan/prepare/run step -> durable node execution
```

Shared team code owns speaking order, peer-context dependencies, prompt strategy, and synthesis semantics. Workflow owns graph/result persistence, recovery, and authority gates.

## 5. Scheduler boundary

`WorkflowDriver` repeatedly:

```text
load authoritative job/graph
-> reconcile execution ownership
-> promote dependency-satisfied nodes with exact inputs
-> dispatch READY/RECOVERING nodes
-> let account scheduler enforce account/session capacity
-> persist engine transitions/results
-> repeat until action/terminal boundary
```

The graph scheduler answers semantic readiness. The account scheduler remains the sole same-account concurrency authority. Research A/B and Review A/B therefore remain independently runnable.

## 6. Snapshot, results, and events

The graph/job snapshot is correctness authority. Completed payloads live in `WorkflowNodeResultStore`; the graph output receipt references them. Handoffs and external PR/health/merge receipts remain separate exact durable artifacts.

The event journal is ordered diagnostic history, not event sourcing. Current persisted event shape is:

```text
schema/version
jobId
eventSeq            # monotonic per job
graphRevision
type
class = INTERNAL | PROGRESS | ACTION_REQUIRED
at
nodeId? / executionId?
message?
```

The job mutation boundary increments graph/event revisions deterministically. Notification failure cannot roll graph correctness backward.

Richer event IDs/structured reason fields may be added if a concrete diagnostics requirement needs them; they are not part of the current correctness contract.

## 7. Ownership leases and fencing

An active execution persists enough evidence to decide whether the current driver may safely own it:

```text
executionId
attempt
ownerInstanceId
startedAt
heartbeatAt
leaseUntil
state
providerState/progress timestamps
```

Process restart or expired ownership makes the old execution orphanable. Browser/session existence alone is not ownership proof.

When recovery supersedes an execution, stale results cannot commit because completion validates the current execution identity. Late progress from a superseded execution is ignored.

## 8. Reconcile before resubmit

Recovery order is:

```text
1. identify/fence stale execution when required
2. inspect exact node/provider/external receipts
3. recover an existing safely identifiable result
4. only then perform bounded same-node resubmission/re-execution
```

Provider request receipts bind stable logical request identity to prompt/session/conversation evidence. Ambiguous provider completion fails closed instead of blindly sending the prompt again.

Writer retry additionally reconciles deterministic branch and one-PR identity before another repository mutation attempt.

## 9. Progress leases

Provider work tracks:

```text
startedAt
lastProviderEventAt
lastMeaningfulProgressAt
```

Hard deadline and semantic no-progress stall deadline are separate. Response/generation changes count as progress; static thinking labels/spinners and unrelated DOM churn do not refresh the semantic stall lease indefinitely.

Ownership lease and provider progress lease are different concepts: ownership says who may commit; progress says whether owned provider work is advancing.

## 10. Human interaction and approval

There are two authority classes.

### Scoped Website confirmations

For Writer implementation/remediation:

```text
recognized + scope-valid eligible GitHub confirmation -> auto-approve
unknown/malformed/ambiguous/scope-mismatched           -> do not click; action-required block
premature merge                                         -> never covered by implementation authority
```

Current `BrowserManager.chatAccount()` closes its per-turn context when the provider call exits. Therefore an unknown confirmation currently becomes a durable blocked/action-required workflow state; the runtime does **not** claim that a manually reachable live browser session remains open.

The graph reducer/model reserves node/provider `WAITING_USER` for a future adapter that can intentionally preserve a live execution, suspend stall policy, expose reachability, and resume the same execution safely. That behavior is not part of current as-built provider execution.

### Workflow authority gates

Merge authorization is durable control-plane state:

```text
phase      MERGE
lifecycle  WAITING_USER
action     MERGE_AUTHORIZATION_REQUIRED
```

No live provider browser is implied. After exact user authorization, the merge graph continues against the same exact head and revalidates live head/health before mutation.

## 11. Failure classification and recovery

Failure class and retry disposition are separate. Current classes include:

```text
PROVIDER | TRANSPORT | BROWSER | AUTH | OUTPUT | AUTOMATION | USER
```

Representative policy:

```text
provider stall/hard timeout/browser transient -> bounded same-node recovery
provider result ambiguity                     -> OUTPUT + USER_ACTION/fail closed
auth expired                                  -> action-required reauthentication
invalid selector/parser                       -> AUTOMATION + CODE_FIX
unknown confirmation                          -> USER + action-required block
```

The observed selector/parser class is an automation defect, not a provider timeout and not evidence that a permission itself needs manual approval.

## 12. Exact-head review/remediation

Review input includes exact PR head. If cycle 1 reviews `H1` and remediation creates `H2`, the engine creates fresh cycle-2 review nodes bound to `H2`. Old `H1` results remain evidence but cannot satisfy `H2` review/health/merge dependencies.

There is no degraded quorum: both required research syntheses and both required review syntheses must satisfy their gates.

## 13. Operator projection

Status/watch read graph state plus recent events and answer:

```text
phase + lifecycle
exact current node(s)
execution attempt/ownership/provider activity
waiting dependency blockers
failure class/code and recovery/action
PR/head/review/health/merge state
recent meaningful events
```

Normal team display uses Team A/B and `Member 1..N`; raw account/provider identity is diagnostic detail.

Projection invariants:

1. a `RUNNING` node has one current execution;
2. a `WAITING` node explains its dependency/prerequisite;
3. a `RECOVERING` node exposes failure, attempt/budget, and next action;
4. a completed node has exact durable result evidence;
5. stale child text cannot override current graph state;
6. driver “healthy” cannot mask an orphaned execution.

## 14. Continue and stop

`/workflow continue`:

```text
uses the existing job/graph
preserves exact-input-matching completed work and stable routing/session IDs
reopens at most one engine-approved failed recovery target
lets normal reconciliation/scheduling continue from that frontier
```

It does not create a new job, reset research, restart a whole team, change routing, or bypass external reconciliation.

`/workflow stop` stops new dispatch, aborts active work, waits for settlement/fencing, and persists terminal `CANCELLED`. A cancelled job is not resumable through `continue`.

## 15. Current acceptance coverage

Automated coverage includes:

```text
TeamPlan exact peer dependencies including >2 members
exact prompt/input receipts
later member recovery without sibling replay
synthesis-only orphan recovery
restart reconciliation from durable RUNNING ownership
provider-result ambiguity fail-closed
selector defect -> code-fix boundary
exact-head H1 -> H2 review-cycle isolation
no degraded research quorum
graph-derived operator failure/blocker projection
scheduler failure persistence
semantic stall vs hard timeout
Writer hard/stall deadlines + scoped confirmation authority
formatter/typecheck/test/build/dist/package verification
```

## 16. Deferred gaps

The following are intentionally not claimed as current behavior:

- live resumable headless-browser user interaction (`WAITING_USER`) with safe reachability/resume;
- multi-process/distributed graph mutation ownership beyond the current revision-guarded local store;
- richer event records beyond the current ordered diagnostic contract;
- hidden provider/member failover or degraded quorum;
- arbitrary user-authored DAGs.

These should be implemented only from a concrete requirement, not through compatibility scaffolding.
