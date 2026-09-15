# Internet Team Architecture

> **Status:** current as-built architecture  
> **Last synchronized:** 2026-09-15  
> **Implementation:** [`how-it-works.md`](./how-it-works.md)  
> **Operational flow:** [`WORKFLOW.md`](./WORKFLOW.md)  
> **Runtime state machine:** [`WORKFLOW-ENGINE.md`](./WORKFLOW-ENGINE.md)

## Goal

`@tsuuanmi/internet` is a browser-backed multi-account Website runtime. Agent-team reasoning is provider-agnostic; deterministic code preserves workflow correctness and user authority; a separate writer account performs scoped GitHub work.

> **User owns authority, Local brokers authority, WorkflowEngine owns domain transitions, WorkflowDriver schedules durable graph work, provider-agnostic teams reason, and exact PR/head/health evidence gates merge.**

## Runtime planes

### Authority plane

```text
User  -> exact merge/exception authority
Local -> compact action presentation + decision transport
```

### Deterministic control plane

```text
WorkflowEngine
WorkflowDriver
WorkflowJobStore + graph snapshot
WorkflowNodeResultStore
WorkflowHandoffStore
WorkflowEventJournal
approval policy
retention manager
```

The graph/job snapshot is the sole correctness authority. The event journal is ordered diagnostic history, not event-sourced state.

### Cognition/data plane

```text
Research Team A/B -> exact synthesis payloads -> Writer
PR -> Review Team A/B -> exact synthesis payloads -> Writer
```

### Action plane

```text
chatgpt-writer
  -> repository read/mutation
  -> deterministic branch + one PR reconciliation
  -> read-only PR health
  -> exact authorized squash merge
```

## Shared team boundary

The public tool and workflow share deterministic team semantics:

```text
                           TeamPlan / TeamStep
                         /                    \
internet_team in-memory                       workflow durable graph
execution                                     node execution
```

The shared team layer owns speaking order, peer-context dependencies, prompt strategies, strongest-answer synthesis, and structured step failures. The workflow adapter owns graph persistence/recovery; the public adapter owns public arguments/session presentation.

Workflow never invokes `internet_team` as an internal RPC and does not duplicate the debate/synthesis loop.

## Provider-agnostic member model

Normal team roles are ordinal:

```text
Member 1
Member 2
...
```

Underlying account/provider identity is routing/diagnostic metadata. Peer contributions are untrusted evidence. Current default route for new workflows:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
Writer   -> chatgpt-writer
```

`gemini-thinker` remains available for explicit direct/research/team use. Existing workflows retain persisted routing.

## Durable workflow graph

The standard workflow is a dependency graph, not a lane replay state machine:

```text
Research A member graph -> synthesis A --\
                                      research handoff gate -> Writer implementation
Research B member graph -> synthesis B --/

Writer -> exact PR head H1
       -> Review A cycle 1 graph --\
       -> Review B cycle 1 graph --- review decision

CHANGES_REQUIRED -> Writer remediation -> H2 -> fresh review cycle
PASS/PASS        -> PR health -> merge authority -> merge
```

Each executable node has a stable logical `nodeId`, exact input receipt, optional current execution, and exact output/result receipt. Provider attempts have separate `executionId` values and ownership leases. Completed nodes are reusable only while their exact correctness-bearing input matches.

## Concurrency boundary

Research A/B and Review A/B are independent graph branches. READY work can be dispatched concurrently. The account scheduler remains the sole same-account capacity/session-ordering authority.

## Stable Website conversations

```text
<local>:workflow:<job>:research:A
<local>:workflow:<job>:research:B
<local>:workflow:<job>:review:A
<local>:workflow:<job>:review:B
<local>:workflow:<job>:writer
```

Review cycle and exact head are durable prompt/input facts rather than new conversation identities.

## Recovery boundary

Recovery is reconcile-before-resubmit:

```text
fence/supersede stale execution when required
-> inspect node/provider/external receipts
-> recover safely identifiable result
-> otherwise bounded same-node retry
```

A later member failure does not replay earlier members. An orphaned synthesis does not replay member turns. Writer retry reconciles deterministic branch/PR identity before another external mutation attempt.

There is no hidden member/provider substitution and no degraded research/review quorum.

## Observability

`/workflow status` and `/workflow watch` project the authoritative graph and recent diagnostic events. Routine display uses Team A/B and `Member 1..N`; account/provider identity is diagnostic detail. Full reasoning/review payloads remain outside Local progress injection.

Top-level lifecycle is independent from phase:

```text
phase      RESEARCH | WRITER | REVIEW | HEALTH | MERGE | DONE
lifecycle  RUNNING | WAITING_USER | RECOVERING | BLOCKED | COMPLETED | CANCELLED
```

Current `WAITING_USER` runtime use is a durable authority gate such as merge authorization. Unknown Website confirmations fail closed into an action-required blocked boundary; the current headless workflow does not claim to preserve a reachable live browser session for manual inspection.

## Handoffs and exact-head authority

Research/review synthesis payloads are handed to the writer verbatim with SHA-256 identity and idempotent delivery receipts. Review, health, authorization, and merge are bound to the exact PR head. Remediation creates a new head and fresh review cycle; older evidence cannot satisfy it.

## Retention

Retention remains explicit operator maintenance. Exact cleanup validates job identity and removes only the selected job, handoffs, node results, and event journal while retaining cleanup audit evidence. Immediate exact-ID deletion is separate from aged cleanup.

## Deferred boundary

Dynamic member substitution, degraded quorum, arbitrary user-defined DAGs, live resumable headless-browser user interaction, multi-writer pooling, Website memory as correctness state, autonomous deployment, and broad non-coding generalization remain deferred until concrete requirements justify them.
