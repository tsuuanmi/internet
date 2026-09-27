# ADR-0022 — Use Contract-First Replaceable Workflow Components

- **Status:** Proposed
- **Date:** 2026-09-27
- **Related:** ADR-0015, ADR-0019, [Component Port Contracts](../COMPONENT-PORTS.md), [Component Migration Plan](../COMPONENT-MIGRATION-PLAN.md)

## Context

Workflow vNext needs several concerns that existing tools already solve well: asynchronous task lifecycle, graph algorithms, durable execution, queues, waits/signals, artifact payload storage, authorization policy evaluation, observability, and worker execution.

Adopting one framework for all of them would create a new monolith and couple Internet semantics to that framework. Splitting every method into a separately injected interface would create the opposite problem: excessive abstraction and wiring with little independent replaceability.

## Decision

Workflow vNext uses **contract-first replaceable components**.

The stable boundary is a versioned Internet input/output/error contract. The implementation behind that contract is replaceable and MUST NOT leak implementation-specific semantic identities into adjacent components.

~~~text
Input contract
    |
    v
Internet port
    |
    +-- implementation A
    +-- implementation B
    +-- implementation C
    |
    v
Output contract
~~~

Replacement is proven by shared conformance tests, not merely by the existence of an interface.

## Granularity

A port is a semantic replacement boundary, not automatically a separate process or dependency-injection slot.

Create a distinct boundary when lifecycle, authority, failure isolation, persistence/retention, scaling, caller population, or replacement cadence materially differs.

Group closely related capabilities behind a composite subsystem when they are normally implemented/configured together.

Current top-level shape:

~~~text
TaskLifecyclePort

GraphSubsystem
  GraphModelPort
  AgentGraphExecutorPort (optional)

DurableRuntimePort
  DurableExecutionPort
  WorkQueuePort
  DurableWaitPort
  ExecutionJournalPort

ArtifactSubsystem
  ArtifactMetadataPort
  ArtifactBlobStorePort
  LineageExporterPort (optional)

AuthorizationPolicyPort
TelemetryPort
WorkerDispatcherPort
~~~

Sub-contracts remain independently testable and may be split into separate implementations later without changing the top-level semantic contract.

## Best-of-breed implementations

The architecture intentionally allows different tools to implement different functions.

Current candidates include:

~~~text
task lifecycle        -> MCP Tasks
graph algorithms      -> petgraph
agent graph execution -> LangGraph when useful
durable runtime       -> Restate PoC; DBOS/Temporal alternatives
artifact blobs        -> OCI/ORAS
lineage export        -> OpenLineage
authorization policy  -> Cedar
telemetry             -> OpenTelemetry
workers               -> DSH / Codex / Claude / future
~~~

No candidate becomes part of the semantic contract merely because it is the first implementation.

## Internet-owned semantics

Internet continues to own semantics that external runtimes do not define correctly for this product:

- Need / Artifact / InputBundle identity and causal lineage;
- exact-state currentness and invalidation;
- trusted authority provenance and PendingAction bindings;
- side-effect classification and reconcile-before-resubmit policy;
- convergence and domain profiles;
- exact repository/PR/head validity where the software profile requires it.

## Identity rule

Implementation-native handles are adapter-local.

Examples that MUST NOT become canonical Internet IDs:

- MCP task ID as WorkflowRun ID;
- Restate invocation ID as WorkItem ID;
- Temporal Workflow ID as WorkflowRun ID;
- LangGraph checkpoint ID as semantic graph node ID;
- OCI registry URL as Artifact ID;
- Cedar entity UID as canonical principal ID.

Opaque implementation references MAY be retained for diagnostics and reconciliation.

## Failure and authority rule

A component may implement mechanics but may not silently weaken Internet semantics.

Examples:

- a runtime retry engine may not automatically retry an uncertain external mutation;
- an MCP `input_required` interaction may not manufacture `user_explicit` provenance;
- a graph executor checkpoint may not become authoritative artifact state;
- an OpenLineage export failure may not invalidate authoritative artifact creation;
- an observability failure may not change Workflow correctness state.

## Conformance

Every replaceable implementation MUST pass the reusable black-box conformance suite for its port.

Where a subsystem exposes sub-ports, conformance runs at both relevant levels:

~~~text
DurableRuntime conformance
  + DurableExecution conformance
  + WorkQueue conformance
  + DurableWait conformance
  + ExecutionJournal conformance
~~~

Implementation-specific tests may exist in addition to, never instead of, contract conformance.

## Consequences

Positive:

- individual tools can be replaced independently;
- implementation choices can differ by language or deployment;
- external frameworks do not define Internet semantics;
- migrations can proceed boundary by boundary with TDD;
- a failed technology experiment can be removed without rewriting adjacent layers.

Costs:

- explicit schema/version design is required up front;
- adapters and conformance suites add code;
- cross-component transactions must be designed carefully rather than relying on one framework's hidden state;
- runtime capability compatibility must be validated at startup.

## Rejected alternatives

### One framework owns the Workflow

Rejected because it recreates framework lock-in and makes artifact, authority, task, graph, and runtime semantics move together.

### One top-level port per small operation

Rejected because it creates excessive wiring and false replaceability.

### Keep current concrete stores/driver/graph as permanent architecture

Rejected because those implementations solve commodity mechanics and should remain replaceable.

## Design rule

> **Stable contracts outside; replaceable functions inside. Group by real lifecycle and failure boundaries, not by class count.**