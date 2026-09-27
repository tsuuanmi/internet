# Research — Workflow Component Decomposition and Replacement Landscape

- **Status:** exploratory architecture research; not production authority
- **Date:** 2026-09-27
- **Related:** [Agnostic Internet capability surface](AGNOSTIC-CAPABILITY-SURFACE.md), [Remote Controller ↔ Local Agent](../proposals/REMOTE-CONTROLLER-LOCAL-AGENT.md)

## 1. Goal

Separate Internet-specific collaboration/correctness semantics from commodity workflow-runtime machinery, then evaluate existing replacements component by component.

> Own collaboration/correctness semantics. Compose runtime mechanisms.

## 2. Current source generations

Current src/workflow contains two broad generations.

### Legacy / v3 orchestration

Representative files:

~~~text
engine.ts
graph.ts
graph-builder.ts
graph-reducer.ts
driver.ts
scheduler.ts
job-store.ts
handoff-store.ts
node-result-store.ts
operator.ts
control.ts
events.ts
types.ts
~~~

This stack encodes the older concrete research/writer/review workflow. Once the vNext/capability path covers required production behavior, prefer retirement rather than finding a one-for-one replacement for every legacy class.

### vNext capability/runtime stack

~~~text
kernel/
semantic/
runtime/
interactions/
admission/
profiles/
capability-registry.ts
artifact-store.ts
work-item-store.ts
input-bundle-store.ts
run-store.ts
pending-action-store.ts
team-runner.ts
writer-runner.ts
~~~

This is the appropriate migration base.

## 3. Internet-owned semantics

| Concern | Current files | Direction |
|---|---|---|
| Typed semantic artifacts and causal references | kernel/types.ts, kernel/identity.ts, kernel/validation.ts | Keep contract; storage may change |
| Capability identity and side-effect classification | capability-registry.ts, runtime/routing.ts | Keep semantic registry |
| Exact InputBundle construction | runtime/scheduler.ts, input-bundle-store.ts | Keep InputBundle semantics; persistence may change |
| Artifact currentness / causal invalidation | runtime/invalidation.ts, semantic/promotion.ts | Keep |
| Semantic result promotion | semantic/promotion.ts | Keep |
| Authority semantics | semantic/authority.ts, authorization.ts, approval-policy.ts | Keep |
| PendingAction contract | interactions/types.ts, validation.ts, response-policy.ts | Keep exact bindings/provenance/revision rules |
| Admission policy | admission/** and profile admission code | Keep semantics; hide internal stages behind workflow_start |
| Convergence | semantic/convergence.ts and profile policy | Keep |
| Domain profiles | profiles/** | Keep as profile modules |
| Exact software delivery/review semantics | software profile, review-result.ts, repository bindings | Keep |
| Reconcile-before-resubmit | execution/provider contracts | Keep invariant |
| Retention policy | retention.ts | Keep policy; delegate physical GC |

## 4. Commodity / replaceable mechanics

| Concern | Current files | Replacement direction |
|---|---|---|
| Client async task lifecycle | tool/job projection | **MCP Tasks** |
| Client input-required transport | PendingAction presentation/response plumbing | **MCP Tasks input_required + tasks/update** |
| Worker lease/heartbeat/attempt state | runtime/execution-manager.ts, execution-state.ts, execution-store.ts | durable execution runtime |
| Retry/resume machinery | execution-manager.ts, runtime/driver.ts, recovery code | durable execution runtime |
| Queueing/concurrency/flow control | runtime/scheduler.ts + driver loops | Restate/Temporal/DBOS/Inngest/Hatchet |
| Durable timers/waits | timeout/external-event mechanics | durable runtime timers/signals |
| Generic invocation/result persistence | result/work-item/run/execution stores | runtime journal/database |
| JSON-file persistence | artifact/input/pending/run stores | transactional DB/runtime state + optional CAS/blob |
| Process recovery/restart scheduling | runtime/driver.ts and reconciliation scans | durable runtime |
| Runtime status notification | polling/progress plumbing | MCP Tasks notifications/subscriptions |
| Physical retention/GC | retention filesystem cleanup | runtime/database TTL/GC |
| Worker implementation | team-runner.ts, writer-runner.ts | DSH/Codex/Claude/future adapters |

## 5. Mixed components that must be split

### runtime/scheduler.ts

Keep: Need materialization policy, capability routing, exact artifact/fact selection, InputBundle creation and readiness semantics.

Replaceable: queueing, worker wakeup, concurrency, retry scheduling and timer/wait implementation.

### runtime/execution-manager.ts

Keep: side-effect class, exact InputBundle currentness, result promotion contract, reconcile-before-resubmit and uncertain-mutation policy.

Replaceable: lease ownership, heartbeat, attempt bookkeeping, worker recovery, retry engine and execution persistence.

### interactions/service.ts

Keep: action identity, revision fencing, responder policy, provenance, exact artifact/subject bindings, idempotent/conflicting response rules.

Replaceable: delivery of input to client, suspended wait mechanism and runtime wakeup.

### Stores

Keep schemas, identity/hash rules, immutability and required optimistic revisions. Replace one-file-per-record persistence, directory enumeration and manual restart scans.

## 6. Replacement landscape

### MCP Tasks — adopt now at the portable edge

SEP-2663 is Final for MCP 2026-07-28. Tasks provides durable async handles, working/input_required/completed/failed/cancelled states, tasks/get, tasks/update, tasks/cancel, TTL and optional notifications.

It deliberately does not provide domain DAGs, artifact lineage, exact PR/head validity, causal invalidation, authority or convergence.

Therefore:

~~~text
MCP Task = portable execution handle
Internet Workflow = domain collaboration/correctness semantics
~~~

Tasks should be required for portable long-running operations; no second fallback lifecycle initially.

Sources:
- https://tasks.extensions.modelcontextprotocol.io/
- https://tasks.extensions.modelcontextprotocol.io/seps/2663-tasks-extension
- https://blog.modelcontextprotocol.io/posts/2026-07-28/

### Restate — first runtime-substitution PoC

Restate provides durable execution, durable RPC, workflows, virtual objects/keyed state, signals, durable promises, timers, queues/vqueues, flow control, recovery and observability. It is self-hostable and designed to run as a lightweight single binary.

It maps well to custom execution leases, worker recovery, queueing, durable waits, restart scans, state persistence and flow control.

Do not adopt blindly: Internet semantics remain above it, it adds a runtime service, and the Rust SDK is still described as actively evolving.

Assessment: **best first PoC for commodity runtime replacement, not yet a migration commitment.**

Sources:
- https://restate.dev/
- https://docs.restate.dev/concepts/services/
- https://restate.dev/blog/announcing-restate-1-7
- https://github.com/restatedev/sdk-rust

### Temporal — maturity benchmark, potentially heavier than needed

Temporal provides durable replay/history, Activities, task queues, retries, signals/updates/queries, child workflows, timers, HITL patterns and worker crash recovery.

It could replace almost all generic scheduler/execution/recovery machinery, but has a larger operational footprint and deterministic replay/versioning constraints. The native Rust SDK is currently Public Preview.

Assessment: **excellent benchmark and strong option if Internet becomes a larger service deployment; likely too heavy as the first local-plugin substrate.**

Sources:
- https://docs.temporal.io/
- https://docs.temporal.io/ai
- https://docs.temporal.io/workflow-definition
- https://github.com/temporalio/sdk-rust

### DBOS — lightweight database-backed alternative

DBOS provides workflows-as-code, durable steps, persisted queues/concurrency, workflow events and crash recovery backed by PostgreSQL.

Assessment: **strong alternative if a Postgres-backed Python/TypeScript runtime is acceptable; benchmark against Restate.**

Sources:
- https://docs.dbos.dev/python/tutorials/workflow-tutorial
- https://docs.dbos.dev/python/tutorials/queue-tutorial
- https://docs.dbos.dev/python/tutorials/workflow-communication

### Inngest — strong event/HITL runtime, lower local-first fit

Inngest provides checkpointed steps, independent retries, waitForEvent/waitForSignal, HITL approval patterns, concurrency/throttling and durable-agent patterns.

Assessment: **excellent reference/cloud option; less natural as the initial local plugin runtime.**

Sources:
- https://www.inngest.com/docs/learn/how-functions-are-executed
- https://www.inngest.com/docs/learn/durable-agents
- https://www.inngest.com/docs/ai-patterns/human-in-the-loop

### Hatchet — capable durable task/workflow engine

Hatchet checkpoints tasks in a transactionally safe durable event log and supports retries and recovery across Python/TypeScript/Go.

Assessment: **capable but no current advantage over Restate/DBOS strong enough to prioritize first.**

Source:
- https://hatchet.run/platform/durable-execution

### LangGraph — reasoning/executor adapter, not Workflow source of truth

LangGraph provides checkpoints, durable graph execution, thread state and resumable interrupts. It is attractive for reasoning graphs and agent loops, but its graph/checkpoint would overlap Internet's explicit Artifact/InputBundle/authority/convergence model.

Assessment: **possible planner/reasoning executor; do not make it the authoritative Workflow substrate.**

Sources:
- https://reference.langchain.com/python/langgraph.checkpoint
- https://reference.langchain.com/python/langgraph/types/interrupt

### Dapr Workflows — mature but infrastructure-heavy for this product

Dapr Workflows uses event-sourced history backed by Actors/state stores. It solves durability correctly but requires adopting Dapr's sidecar/actor infrastructure model.

Assessment: **useful reference, low fit for a local-first Internet plugin.**

Source:
- https://docs.dapr.io/contributing/protocol-reference/workflow-protocol/workflow-protocol-state-and-history/

## 7. Component-by-component recommendation

| Internet component | Own semantic? | Replace now? | Candidate |
|---|---:|---:|---|
| Portable async task lifecycle | No | **Yes** | **MCP Tasks** |
| Input-required client transport | No | **Yes** | **MCP Tasks** |
| PendingAction authority/exact bindings | **Yes** | No | Internet |
| Semantic artifact model | **Yes** | No | Internet |
| Artifact physical persistence | No | Later | runtime DB/CAS |
| Exact InputBundle | **Yes** | No | Internet |
| InputBundle physical persistence | No | Later | runtime DB |
| Capability registry semantics | **Yes** | No | Internet |
| Capability implementation discovery | No | Later | host/plugin adapters |
| Planning contract | **Yes** | No | Internet |
| Planner implementation | No | Ongoing | Internet Team/local/future planner |
| Need materialization policy | **Yes** | No | Internet |
| Queue/concurrency | No | **PoC** | **Restate vqueues** |
| Worker lease/heartbeat | No | **PoC** | durable runtime |
| Retry engine | Mixed | **PoC mechanism** | durable runtime |
| External mutation reconciliation | **Yes invariant** | No | Internet + worker adapter |
| Scheduler process loop | No | **PoC** | Restate/Temporal/DBOS |
| Durable timers/waits | No | **PoC** | Restate/Temporal/Inngest |
| Execution/result persistence | No | **PoC** | Restate/DBOS/Temporal |
| Run lifecycle projection | Mixed | Partly | convergence + Tasks projection |
| Convergence | **Yes** | No | Internet |
| Repository exact-head rules | **Yes** | No | Internet profile |
| Review validity | **Yes** | No | Internet profile |
| Worker implementation | No | Yes | DSH/Codex/Claude |
| Physical retention/GC | No | Later | runtime/storage |
| Retention policy | **Yes** | No | Internet |
| Observability/tracing | No | Yes | OpenTelemetry + runtime UI |
| Legacy v3 graph/job engine | No long-term | **Retire** | vNext capability path |

## 8. Target architecture

~~~text
MCP client / Local Agent host
          |
          v
      MCP Tasks
 portable async lifecycle
          |
          v
Internet Workflow Capability
          |
  +-------+-----------------------------------+
  | Internet-owned semantic contracts        |
  | Need / Artifact / InputBundle            |
  | authority / PendingAction                |
  | exact-state / invalidation               |
  | reconciliation policy / convergence      |
  | domain profiles                          |
  +-------------------+----------------------+
                      |
               runtime ports
                      |
       +--------------+-------------------+
       |              |                   |
   Scheduler      State/Journal       Worker dispatch
       |              |                   |
       +--------------+-------------------+
                      |
            commodity runtime
          (first PoC: Restate)
                      |
              capability workers
        DSH / Codex / Claude / web
~~~

## 9. Recommended sequence

1. Characterize current vNext semantic invariants with TDD.
2. Implement MCP 2026-07-28 + Tasks at the portable edge without changing the scheduler yet.
3. Extract runtime ports for durable execution, state/journal, flow control, timers/waits and worker dispatch.
4. Build a Restate vertical-slice PoC for queue + execution ownership + retry + wait/signal + restart recovery.
5. Compare crash/replay/duplicate-delivery/uncertain-mutation/approval-after-restart/exact-head scenarios against current runtime.
6. If Restate materially reduces failure/code surface, migrate additional commodity mechanics. Otherwise benchmark DBOS/Temporal through the same ports.
7. Retire legacy v3 only after the portable vNext path covers production behavior. Do not maintain dual runtimes permanently.

## 10. Current recommendation

1. **Adopt MCP Tasks now** for portable long-running client lifecycle.
2. **Keep Internet semantic artifacts, exact-state, authority, PendingAction, reconciliation and convergence.**
3. **Do not treat JSON stores, custom leases/retries/drivers as permanent architecture.**
4. **Use Restate as the first runtime-substitution PoC**, not as an immediate wholesale migration.
5. **Use Temporal as the maturity benchmark**, DBOS as the lightweight DB-backed alternative, Inngest/Hatchet as reference alternatives.
6. **Do not use LangGraph as Workflow source of truth.** Use it only where its agent/reasoning graph is useful behind a capability.
7. **Retire legacy/v3 rather than adapting it indefinitely.**

The long-term goal is that replacing the workflow runtime is as ordinary as replacing Codex with DSH: stable Internet semantic contracts above replaceable runtime components.