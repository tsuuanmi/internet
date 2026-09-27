# Workflow vNext Component Port Contracts

- **Status:** proposed architecture contract; not production authority
- **Date:** 2026-09-27
- **Related research:** [Workflow component decomposition](../../research/WORKFLOW-COMPONENT-LANDSCAPE.md)

## 1. Purpose

Workflow vNext is composed from replaceable components.

The stable boundary is the Internet-owned input/output contract. The implementation in the middle is replaceable.

~~~text
Input contract
    |
    v
Component port
    |
    +-- implementation A
    +-- implementation B
    +-- implementation C
    |
    v
Output contract
~~~

A replacement is valid when it satisfies the same versioned contract and conformance suite without requiring callers or downstream consumers to change.

## 2. Contract invariants

Every port MUST define:

- a stable port identifier;
- a versioned input schema;
- a versioned output schema;
- a versioned error schema;
- side-effect classification;
- idempotency semantics;
- cancellation semantics where relevant;
- timeout/deadline semantics where relevant;
- stable Internet-owned IDs and references;
- explicit authority/provenance requirements where relevant;
- conformance tests shared by all implementations.

Ports MUST NOT expose implementation-specific types as semantic identifiers.

Examples of forbidden cross-boundary leakage:

~~~text
LangGraph checkpoint ID as Workflow identity
Restate invocation ID as WorkItem identity
Temporal Workflow ID as Internet run identity
OCI registry URL as Artifact identity
Cedar entity UID as canonical principal identity
~~~

These values MAY appear in implementation diagnostics or opaque adapter metadata, but downstream Internet components MUST operate on Internet IDs.

## 3. Common envelopes

Conceptual common request envelope:

~~~text
ComponentRequestV1 {
  requestId
  contract: { id, version }
  deadline?
  traceContext?
  caller?
}
~~~

Conceptual common result envelope:

~~~text
ComponentResultV1<T> {
  requestId
  contract: { id, version }
  result: T
}
~~~

Common error taxonomy:

~~~text
INVALID_INPUT
UNSUPPORTED_VERSION
NOT_FOUND
CONFLICT
STALE_BINDING
NOT_AUTHORIZED
DEPENDENCY_UNAVAILABLE
TRANSIENT_FAILURE
PERMANENT_FAILURE
CANCELLED
TIMEOUT
UNCERTAIN_SIDE_EFFECT
~~~

Individual ports MAY refine these errors but SHOULD reuse the common classes.

## 4. Versioning rules

Contract versions are semantic versions of the Internet boundary, not versions of the selected implementation.

Within one contract version:

- adding optional fields is allowed only when old implementations can safely ignore them;
- changing field meaning is forbidden;
- changing identity or authority semantics is forbidden;
- changing required fields requires a new contract version;
- changing error meaning requires a new contract version.

The initial implementation SHOULD validate schemas strictly and fail fast on unsupported versions rather than silently adapting.

MCP-facing contracts use JSON Schema 2020-12 input/output schemas and structured content.

## 5. TaskLifecyclePort

### Responsibility

Expose the portable asynchronous lifecycle of a long-running capability.

### Canonical implementation

**MCP Tasks (`io.modelcontextprotocol/tasks`)**.

### Input

~~~text
StartTaskRequestV1 {
  requestId
  operation: { id, version }
  subjectRef?
  inputRef?
  deadline?
}
~~~

### Output

~~~text
TaskHandleV1 {
  taskId
  subjectRef?
  status: working | input_required | completed | failed | cancelled
  pollAfter?
}
~~~

Task updates must project to the same stable status vocabulary. Internet domain state remains separate.

### Invariants

- task handle is durable before it is returned;
- task ID is not the Workflow run ID;
- cancellation cannot bypass domain authorization;
- input-required transport cannot manufacture trusted user provenance.

## 6. GraphModelPort

### Responsibility

Pure dependency-graph structure and algorithms.

### Candidate

**petgraph** for a Rust implementation.

### Input

~~~text
DependencyGraphV1 {
  graphId
  revision
  nodes: [{ id, kind, metadata? }]
  edges: [{ from, to, kind? }]
}
~~~

### Output

~~~text
GraphAnalysisV1 {
  acyclic
  topologicalOrder?
  topologicalLayers?
  readyNodes?
  cycles?
}
~~~

### Invariants

- stable node IDs are owned by Internet;
- graph algorithms are deterministic for the same canonical input;
- this port has no worker execution, checkpoint, retry or persistence responsibility.

## 7. AgentGraphExecutorPort

### Responsibility

Execute a stateful/conditional agent graph when a semantic capability benefits from agentic graph execution.

### Candidate

**LangGraph**.

### Input

~~~text
AgentGraphRequestV1 {
  executionId
  graphDefinitionRef
  inputBundleRef
  initialState
  allowedCapabilities[]
  sideEffectClass
}
~~~

### Output

~~~text
AgentGraphResultV1 {
  executionId
  status
  outputArtifacts[]
  summary?
}
~~~

### Invariants

- LangGraph thread/checkpoint identifiers remain adapter-local;
- produced outputs must be promoted through normal Internet artifact validation;
- HITL inside LangGraph cannot replace Internet authority/PendingAction semantics;
- external mutation still requires Internet reconciliation policy.

## 8. DurableExecutionPort

### Responsibility

Commodity durable invocation, retry, worker recovery and resumable execution mechanics.

### Candidates

Restate first PoC; DBOS and Temporal alternatives.

### Input

~~~text
ExecutionRequestV1 {
  executionId
  workItemId
  inputBundleId
  capability: { id, version }
  sideEffectClass
  idempotencyKey
  retryPolicyRef?
}
~~~

### Output

~~~text
ExecutionOutcomeV1 {
  executionId
  status: succeeded | failed | cancelled | uncertain
  resultRef?
  error?
}
~~~

### Invariants

- runtime retry never overrides side-effect/reconciliation policy;
- an uncertain external mutation is not automatically retried;
- runtime-native invocation IDs are not semantic IDs;
- successful results still pass exact InputBundle currentness validation before promotion.

## 9. WorkQueuePort

### Responsibility

Queueing, concurrency and flow control only.

### Input

~~~text
EnqueueWorkV1 {
  workItemId
  capability
  priority?
  concurrencyKey?
}
~~~

### Output

~~~text
QueueReceiptV1 {
  workItemId
  accepted
}
~~~

### Invariants

- queue order is not semantic workflow order;
- readiness remains an Internet semantic decision before enqueue;
- queue implementation may be Restate vqueues, Temporal task queues, DBOS queues or another backend.

## 10. DurableWaitPort

### Responsibility

Durable timers, wait/signal mechanics and runtime wakeup.

### Input

~~~text
WaitRequestV1 {
  waitId
  subjectRef
  deadline?
  signalType?
}
~~~

### Output

~~~text
WaitResultV1 {
  waitId
  status: signaled | timed_out | cancelled
  signalRef?
}
~~~

PendingAction meaning remains above this port.

## 11. ArtifactMetadataPort

### Responsibility

Persist and query Internet artifact envelopes and lineage metadata.

### Input

~~~text
ArtifactRecordV1 {
  artifactId
  runId
  type
  schemaRef
  producer
  inputBundleId?
  lineage[]
  payloadDigest
  createdAt
}
~~~

### Output

Create/get/list/query results using the same canonical ArtifactRecord schema.

### Invariants

- artifact identity is content/semantic derived according to Internet rules;
- metadata is immutable after creation;
- payload backend location is not part of artifact identity.

## 12. ArtifactBlobStorePort

### Responsibility

Store and retrieve immutable artifact payload bytes.

### Candidate

OCI/ORAS for large/shareable blobs; local/object-store implementations remain possible.

### Input/output

~~~text
put(bytes, mediaType) -> BlobRefV1 { digest, size, mediaType }
get(digest)            -> BlobPayloadV1
exists(digest)         -> boolean
~~~

### Invariants

- digest must verify retrieved bytes;
- location/registry is adapter configuration, not semantic identity;
- deletion must respect metadata references/retention policy.

## 13. LineageExporterPort

### Responsibility

Publish a non-authoritative interoperable view of Internet lineage.

### Candidate

OpenLineage.

### Input

~~~text
LineageEventV1 {
  runRef
  artifactRef?
  relation?
  producer?
  timestamp
}
~~~

### Output

~~~text
LineageExportReceiptV1 {
  accepted
  externalRef?
}
~~~

Failure to export lineage must not mutate authoritative Internet lineage state.

## 14. AuthorizationPolicyPort

### Responsibility

Evaluate whether an already-authenticated principal may perform an action on an exact resource in a given context.

### Candidate

Cedar.

### Input

~~~text
AuthorizationRequestV1 {
  principal
  action
  resource
  context {
    provenance?
    sideEffectClass?
    exactBindings?
  }
}
~~~

### Output

~~~text
AuthorizationDecisionV1 {
  decision: allow | deny
  diagnostics?
}
~~~

### Invariants

- the policy engine does not authenticate the principal;
- the policy engine does not manufacture `user_explicit` provenance;
- exact head/revision/action bindings are supplied by Internet;
- deny/error is fail-closed for consequential actions.

## 15. TelemetryPort

### Responsibility

Emit non-authoritative traces, events and metrics.

### Candidate

OpenTelemetry.

### Input

~~~text
TelemetryEventV1 {
  name
  timestamp
  runId?
  taskId?
  workItemId?
  executionId?
  artifactId?
  actionId?
  attributes
}
~~~

### Invariants

- telemetry failure never changes Workflow correctness state;
- event names are stable and contain no dynamic IDs;
- IDs are attributes for correlation;
- operations with duration should be represented as spans rather than point events.

## 16. WorkerDispatcherPort

### Responsibility

Dispatch a validated WorkItem/InputBundle to a compatible worker implementation.

### Implementations

DSH, Codex, Claude, future workers.

### Input

~~~text
WorkerRequestV1 {
  workItemId
  inputBundleId
  capability
  sideEffectClass
  authorityRef?
  budgetRef?
}
~~~

### Output

~~~text
WorkerResultV1 {
  workItemId
  outcome
  producedArtifactCandidates[]
  receipts[]
  reconciliationRef?
}
~~~

### Invariants

- worker prose is not automatically a semantic artifact;
- outputs pass schema/promotion validation;
- external mutations require a reconciliation contract;
- worker model/provider identity is metadata, not capability identity.

## 17. Component dependency rule

Ports may depend on semantic IDs from upstream contracts but must not depend on another implementation's internal handle.

Allowed:

~~~text
WorkerDispatcher receives inputBundleId
ArtifactMetadata references payloadDigest
Authorization receives actionId + exact subject version
~~~

Forbidden:

~~~text
GraphModel reads Restate journal internals
Cedar policy references LangGraph checkpoint IDs
ArtifactStore requires Temporal Workflow IDs
WorkerDispatcher mutates MCP Task state directly
~~~

Cross-component orchestration belongs in the Internet capability layer.

## 18. Conformance testing

Each port MUST ship a reusable black-box conformance suite.

Examples:

### GraphModel

- rejects cycles;
- deterministic topological order/layers;
- stable node identity;
- valid readiness projection.

### DurableExecution

- process crash and resume;
- duplicate delivery;
- retryable failure;
- cancellation;
- uncertain external mutation;
- result after stale InputBundle is rejected by outer semantic layer.

### ArtifactBlobStore

- digest verification;
- immutable read-after-write;
- missing object behavior;
- large payload streaming;
- concurrent identical writes.

### AuthorizationPolicy

- explicit allow;
- default deny;
- malformed context;
- stale exact binding;
- policy error fails closed for consequential action.

An implementation is admitted only after passing the same conformance suite as the implementation it replaces.

## 19. Implementation loading

Component selection is configuration/dependency injection, not semantic branching.

Conceptually:

~~~text
ports = {
  taskLifecycle: McpTasksAdapter,
  graphModel: PetgraphAdapter,
  agentGraphExecutor: LangGraphAdapter,
  durableExecution: RestateAdapter,
  artifactMetadata: MetadataStoreAdapter,
  artifactBlobs: OrasAdapter,
  lineageExporter: OpenLineageAdapter,
  authorizationPolicy: CedarAdapter,
  telemetry: OpenTelemetryAdapter,
  workerDispatcher: CompositeWorkerAdapter,
}
~~~

A startup compatibility check validates required contract versions. There is no silent fallback to another implementation.

## 20. Design rule

> **Stable contracts outside; replaceable functions inside.**

This rule applies recursively. A component may itself be composed from smaller replaceable ports, but it may not leak those internal implementation contracts outward.