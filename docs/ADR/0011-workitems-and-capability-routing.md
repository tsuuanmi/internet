# ADR-0011 — Separate Semantic Needs from Runtime WorkItems and Route by Capability

- **Status:** Proposed
- **Date:** 2026-09-16
- **Supersedes:** none
- **Related:** ADR-0001, ADR-0005, ADR-0009, ADR-0010

## Context

ADR-0010 establishes that agents emit typed semantic needs and that the Orchestrator/runtime routes those needs instead of allowing direct agent-to-agent invocation.

A production runtime needs one more boundary. A semantic request is not itself an execution record. If a `Need` also carries retry state, executor identity, node topology, result receipts, and budget state, model-produced reasoning becomes entangled with deterministic workflow control.

The runtime also needs to support one semantic request being implemented by either:

- one executable node;
- parallel nodes plus a join;
- a small deterministic subgraph;
- a cached/reused prior result without new execution.

Therefore semantic intent, runtime work, graph mechanics, and durable result data must remain separate.

## Decision

The vNext workflow uses four distinct concepts:

```text
Finding
  -> Need
  -> WorkItem
  -> Graph node(s) / execution(s)
  -> Artifact(s)
```

### Finding

A durable observation that a criterion is unmet, evidence is insufficient, artifacts conflict, or another correctness concern remains unresolved.

### Need

A typed semantic request describing **what capability or information is required** to make progress on a Finding or decision.

A Need may be model-produced, but it is data. It is not execution authority.

### WorkItem

A code-owned, workflow-scoped control object created only after a Need passes deterministic validation, deduplication, policy, and authority checks.

A WorkItem describes **what bounded runtime work is authorized**.

### Graph node / execution

The mechanical realization of a WorkItem. One WorkItem may map to one node or to a deterministic graph motif containing multiple nodes.

### Artifact

An immutable or explicitly superseded durable domain result produced by a WorkItem or deterministic runtime operation.

## WorkItem contract

A WorkItem should persist at least:

```text
workItemId
workflowId
causedByNeedId
requestOwnerRef
capabilityId + capabilityVersion
inputBundleRef + inputHash
policy/budget binding
priority
idempotency/equivalence key
sideEffectClass
lifecycle state
attempt/execution references
result artifact references
structured failure/block reason
createdAt / updatedAt
```

The exact storage schema is an implementation detail, but these semantics are correctness-bearing.

## WorkItem lifecycle

The target lifecycle is conceptually:

```text
PENDING
READY
RUNNING
COMPLETED
FAILED
CANCELLED
```

A WorkItem lifecycle is not required to duplicate graph-node lifecycle one-for-one. The graph remains the execution authority. A WorkItem is the semantic control record connecting Need, policy, execution, and result artifacts.

Examples:

- one WorkItem can remain `RUNNING` while two parallel graph nodes execute;
- one WorkItem can become `COMPLETED` when a deterministic join commits its result artifact;
- a deduplicated Need can attach to an existing compatible WorkItem instead of creating another one.

## Capability routing

Needs request semantic capabilities, not concrete roles, providers, accounts, sessions, or graph node kinds.

Example:

```yaml
need:
  type: external_evidence
  question: Does package X guarantee behavior Y?
```

The runtime resolves this through a code-owned capability registry.

Conceptual descriptor:

```yaml
capabilityId: external_research
version: 1
accepts:
  - external_evidence
produces:
  - evidence_packet
sideEffectClass: read_only
supportsParallel: true
allowedExecutors:
  - research
```

The descriptor is authoritative runtime configuration. Agent text cannot redefine it.

## Model authority boundary

A model may propose:

```text
Need type
bounded question/problem
subject/finding references
blocking/non-blocking semantics when allowed by schema
human-readable explanation
```

A model shall not authoritatively choose:

```text
provider account
Website session
retry count/backoff
execution attempt identity
graph node IDs or edges
budget overrides
side-effect authority
repository/PR mutation permission
human authorization state
```

Those are deterministic control-plane decisions.

If a model output contains such fields, the runtime ignores/rejects them unless the relevant schema explicitly defines them as non-authoritative suggestions.

## Capability registry boundary

The capability registry is code/configuration-owned and versioned.

It defines at minimum:

```text
accepted Need types
produced Artifact types
side-effect class
required authority/gates
eligible logical executors
parallelism characteristics
input schema
output schema
risk/policy hooks
```

Adding a new provider account does not create a new semantic capability. Adding a new semantic capability requires an explicit registry/schema change.

## Side-effect classes

At minimum, the runtime should distinguish:

```text
read_only
repository_mutation
external_mutation
human_authority_required
```

A read-only Need cannot be silently promoted into mutation authority.

Existing repository/head/user authority rules continue to apply to mutation WorkItems.

## Deduplication

Equivalent unresolved Needs may share a compatible WorkItem only when deterministic equivalence policy establishes that their correctness-bearing inputs and requested capability are compatible.

The runtime must not deduplicate solely from natural-language similarity.

A completed WorkItem may be reused only when its result artifacts remain valid under exact-input and freshness rules.

## Graph realization

A WorkItem is materialized only through runtime-approved node/subgraph templates.

Examples:

```text
external_research
  -> one research node

parallel_external_research
  -> research A
  -> research B
  -> evidence join

implementation_change
  -> worker mutation
  -> validation
```

The Need never directly creates graph edges.

## Failure and retry

Execution retry policy belongs to the WorkItem/graph runtime, not to the requesting agent.

A retry must preserve:

- causal Need ownership;
- exact InputBundle identity unless an explicit new WorkItem is created;
- side-effect/idempotency constraints;
- bounded retry policy;
- stale execution fencing.

If retry would require materially changed inputs or authority, the runtime creates/requires a new Need or WorkItem rather than mutating the old one invisibly.

## Consequences

### Positive

- reasoning intent is decoupled from execution mechanics;
- runtime can choose one node, fan-out, join, reuse, or specialist execution without changing agent schemas;
- capability routing becomes provider/account independent;
- retries, budgets, deduplication, and side-effect policy become deterministic;
- semantic traces can explain why each execution exists.

### Costs

- WorkItem persistence and lifecycle become first-class runtime responsibilities;
- mapping from Need to capability to graph motif must be versioned and tested;
- observability must distinguish Need, WorkItem, graph node, execution attempt, and Artifact.

## Invariants

> A Need expresses semantic demand; it does not carry execution authority.

> Only the deterministic runtime may create WorkItems and materialize graph nodes/edges.

> WorkItems route by semantic capability; provider/account/session selection is lower-level execution policy.

> One WorkItem may materialize as one node or a deterministic subgraph, but never as arbitrary model-authored topology.
