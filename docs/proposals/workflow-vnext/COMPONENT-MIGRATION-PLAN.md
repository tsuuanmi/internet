# Workflow vNext Component Migration Plan

- **Status:** proposed implementation plan; not production authority
- **Date:** 2026-09-27
- **Depends on:** [Component Port Contracts](COMPONENT-PORTS.md)

## 1. Current production boundary

The current `internet_workflow` DSH tool still exposes the legacy operation model:

~~~text
admit
confirm
activate
test
status
cancel
continue
~~~

It calls `WorkflowService`, which still operates on the legacy `WorkflowJob` / `WorkflowJobStore` / engine-driver model.

The vNext kernel/semantic/runtime/interactions stack therefore exists alongside, rather than underneath, the current production tool boundary.

This means the migration should not preserve today's tool shape as the portable contract.

## 2. Migration rule

Do not replace the current runtime in one large step.

Do not maintain two permanent production workflow paths either.

Use temporary test-only parallelism where useful, then cut over one boundary at a time.

~~~text
characterize
  -> extract contract
  -> implement current adapter
  -> implement replacement adapter
  -> run shared conformance suite
  -> cut over
  -> delete superseded mechanism
~~~

Every behavioral change follows Red -> Green -> Refactor.

## 3. Stage A — contract package

Add a host/runtime-neutral package for versioned Workflow contracts.

Suggested responsibility:

~~~text
workflow/contracts/
  common
  task
  graph
  execution
  queue
  wait
  artifact
  authorization
  worker
  telemetry
~~~

Requirements:

- no DSH imports;
- no MCP SDK imports;
- no Restate/LangGraph/petgraph/ORAS/Cedar imports;
- no browser/provider imports;
- schemas serializable through JSON Schema where they cross process/protocol boundaries;
- canonical validation and hashing remain Internet-owned.

## 4. Stage B — contract conformance harness

Create reusable black-box contract tests before introducing new dependencies.

Suggested test groups:

~~~text
tests/workflow/contracts/
  graph-model.contract.test
  durable-execution.contract.test
  artifact-blob-store.contract.test
  authorization-policy.contract.test
  worker-dispatcher.contract.test
~~~

Each implementation factory is run against the same suite.

Example concept:

~~~text
graphModelContract(() => new CurrentGraphModel())
graphModelContract(() => new PetgraphGraphModel())
~~~

No test should inspect implementation-specific state unless it belongs to an adapter-specific test suite.

## 5. Stage C — MCP Tasks edge

Replace portable long-running lifecycle first because its boundary is already standardized.

New path:

~~~text
workflow_start / research
        |
        v
MCP Tasks adapter
        |
        v
Internet capability request
~~~

The initial portable implementation requires MCP 2026-07-28 + `io.modelcontextprotocol/tasks`.

No blocking/custom-handle/legacy Tasks fallback is added.

Existing DSH-native behavior may remain during migration, but it is not the portable contract and should not be used to define Tasks semantics.

Acceptance tests:

- durable handle exists before response;
- reconnect and `tasks/get` recover status;
- cancellation reaches domain authorization before effect;
- `input_required` preserves exact PendingAction identity;
- task completion contains schema-valid structured result;
- transport task ID never substitutes for Internet run/action IDs.

## 6. Stage D — split graph model from execution

### D1. Extract GraphModelPort

Move deterministic DAG operations away from legacy `graph.ts` state-machine concerns.

Candidate implementation sequence:

1. implement the port using current TypeScript graph algorithms;
2. run conformance suite;
3. add Rust/petgraph adapter;
4. run the same suite;
5. switch dependency injection if the petgraph adapter materially improves correctness/maintenance/performance.

Do not couple this decision to LangGraph.

### D2. Add AgentGraphExecutorPort only for actual agentic graphs

Introduce LangGraph only when a concrete planner/reviewer capability needs conditional/stateful graph execution.

LangGraph is not required for the base dependency DAG.

## 7. Stage E — split artifact envelope from payload storage

Current `WorkflowArtifactStore` hashes and writes an artifact envelope containing inline payload JSON.

Refactor into:

~~~text
ArtifactSubsystem
  |
  +-- ArtifactMetadataPort
  +-- ArtifactBlobStorePort
  +-- LineageExporterPort (optional)
~~~

Keep these sub-ports separate because authoritative metadata, payload storage and optional lineage export have different lifecycle/failure semantics.

Red characterization tests first:

- same semantic inputs produce the same artifact identity;
- payload digest mismatch is rejected;
- metadata immutability remains;
- lineage normalization remains deterministic;
- missing blob does not silently become a valid artifact;
- exporter failure cannot corrupt authoritative artifact state.

Then add implementations:

~~~text
ArtifactBlobStorePort
  current inline/local adapter
  ORAS/OCI adapter

LineageExporterPort
  no-op implementation for local testing
  OpenLineage exporter
~~~

After cutover, large payloads can move out of semantic metadata without changing artifact references.

## 8. Stage F — authorization policy port

Separate three responsibilities currently easy to conflate:

~~~text
Authentication/provenance establishment
        -> trusted host/MCP adapter

Exact subject/resource construction
        -> Internet

Policy decision
        -> AuthorizationPolicyPort
~~~

First implement `AuthorizationPolicyPort` using current Internet rules.

Then add Cedar behind the same port.

Conformance scenarios:

- unknown principal denied;
- `USER_AUTHORITY` cannot be satisfied by local-agent provenance;
- exact subject version mismatch denied;
- stale PR/head binding denied;
- policy engine error fails closed for consequential actions;
- read-only policy may differ from external-mutation policy without changing caller API.

## 9. Stage G — runtime mechanics ports

Split `runtime/execution-manager.ts` and scheduler/driver mechanics into explicit runtime ports.

Suggested top-level boundary:

~~~text
DurableRuntimePort
  - DurableExecutionPort
  - WorkQueuePort
  - DurableWaitPort
  - ExecutionJournalPort
~~~

The application layer depends on the composite runtime port. Sub-ports remain independently testable and replaceable but should not be injected separately unless a real implementation split requires it.

Keep outside those ports:

~~~text
InputBundle currentness
side-effect class
uncertain mutation policy
semantic result promotion
artifact invalidation
convergence
~~~

First adapter: current TypeScript implementation.

Second adapter PoC: Restate.

Only delete current lease/heartbeat/retry/recovery machinery after Restate passes fault-injection tests.

Required fault tests:

- crash before dispatch;
- crash after dispatch but before result persistence;
- duplicate delivery;
- worker dies after external mutation;
- stale InputBundle before commit;
- PendingAction response after process restart;
- cancellation racing completion;
- runtime restart while waiting on external input.

DBOS/Temporal can later implement the same ports without changing semantics.

## 10. Stage H — worker dispatch

Convert `team-runner.ts` and `writer-runner.ts` from concrete workflow roles into capability worker adapters.

Target:

~~~text
WorkerDispatcherPort
  |
  +-- DSH adapter
  +-- Codex adapter
  +-- Claude adapter
  +-- website/research adapter
~~~

Worker selection is based on capability and policy, not hard-coded workflow phase names.

Research/review/implementation outputs return artifact candidates and receipts through the same contract.

## 11. Stage I — telemetry

Add `TelemetryPort` after stable semantic IDs exist across the new ports.

Use OpenTelemetry spans for operations with duration and events for point-in-time state changes.

Telemetry remains removable/non-authoritative.

## 12. Stage J — portable capability cutover

Replace the current portable workflow surface with semantic tools such as:

~~~text
workflow_start
workflow_get
workflow_respond
workflow_cancel
~~~

Internal admission/activate/continue stages are not portable operations.

Current DSH-native advanced/operator controls may exist separately while needed, but the portable contract has one path.

## 13. Stage K — legacy retirement

After the vNext path passes end-to-end production scenarios, remove the superseded legacy stack.

Primary retirement candidates:

~~~text
engine.ts
graph.ts
graph-builder.ts
graph-reducer.ts
job-store.ts
handoff-store.ts
node-result-store.ts
legacy driver/operator/control/event code
legacy workflow tool operation compatibility
~~~

Exact deletion list must be based on import/call-site inspection at implementation time.

Do not leave permanent compatibility aliases or parallel workflow engines.

## 14. Dependency direction

Target dependency rule:

~~~text
tools / MCP / DSH adapters
          |
          v
capability application layer
          |
          v
Internet semantic contracts
          |
          v
component ports
          |
          v
implementation adapters
  MCP Tasks / petgraph / LangGraph / Restate / ORAS / Cedar / OTel / workers
~~~

Implementation adapters may depend on Internet port contracts.

Internet semantic contracts must never depend on implementation adapters.

## 15. First implementation PR scope

The smallest useful implementation PR should **not** attempt all replacements.

Recommended first PR:

1. add component contract types/schemas;
2. add common error/versioning rules;
3. add conformance harness;
4. extract `GraphModelPort` with current TypeScript adapter;
5. extract `ArtifactBlobStorePort` with current local/inline adapter;
6. keep production behavior unchanged;
7. no new framework dependency yet.

This establishes the seams first.

Second PR can add MCP Tasks at the portable edge.

Third/following PRs can add petgraph, ORAS, Cedar and durable-runtime adapters independently.

## 15.1 Port granularity acceptance rule

Before creating a new top-level port, answer:

1. Can this concern fail independently?
2. Can it be authorized independently?
3. Does it have a different persistence/retention lifecycle?
4. Does it have different scaling requirements?
5. Are there realistic alternative implementations that would be swapped without swapping neighboring concerns?
6. Does another component consume it directly?

If most answers are no, prefer a sub-contract inside an existing subsystem rather than another top-level dependency.

Current grouping decision:

~~~text
Top-level:
  TaskLifecyclePort
  GraphSubsystem
  DurableRuntimePort
  ArtifactSubsystem
  AuthorizationPolicyPort
  TelemetryPort
  WorkerDispatcherPort

Sub-contracts:
  GraphModelPort
  AgentGraphExecutorPort
  DurableExecutionPort
  WorkQueuePort
  DurableWaitPort
  ExecutionJournalPort
  ArtifactMetadataPort
  ArtifactBlobStorePort
  LineageExporterPort
~~~

## 16. Definition of replaceability

A component is not considered replaceable merely because it has an interface.

It is replaceable only when:

- the port contract is implementation-neutral;
- at least one conformance suite exists;
- implementation-specific IDs do not escape;
- state can be migrated or recreated through canonical Internet state;
- failure semantics are explicit;
- the caller does not branch on implementation kind;
- swapping implementations does not change adjacent port contracts.

> **The interface is the seam; the conformance suite proves the seam is real.**