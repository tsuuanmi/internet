# ADR-0011 — Separate Semantic Needs from Runtime WorkItems and Route by Capability

- **Status:** Proposed
- **Date:** 2026-09-16
- **Updated:** 2026-09-16 after core-SRS harmonization
- **Supersedes:** none
- **Related:** ADR-0009, ADR-0010, ADR-0012, ADR-0017, ADR-0019

## Context

ADR-0010 establishes that reasoning roles emit typed semantic Needs and that the deterministic Orchestrator materializes them instead of allowing direct agent-to-agent invocation.

A production runtime needs a strict boundary between semantic demand and execution authority. If a Need also carries retry state, executor identity, execution topology, result receipts, and budget state, model-produced reasoning becomes entangled with deterministic control.

Not every Need is executable work: some Needs require external authority/input and therefore materialize as PendingActions. For executable Needs, one semantic request may be realized by:

- one execution;
- parallel executions plus a deterministic join;
- a bounded runtime-approved execution motif/subgraph;
- reuse of an already-compatible completed result without new execution.

Semantic intent, runtime authorization, execution mechanics, external interaction, and durable semantic results must remain separate.

## Decision

The vNext control chain distinguishes:

```text
Finding / PlanTask / criterion / decision
  -> Need
      +-> WorkItem
      |    -> execution(s) / approved motif
      |    -> Artifact(s) / Receipt(s)
      |
      +-> PendingAction
           -> typed external response
           -> Artifact / authority result / resolution
```

### Need

A typed semantic request describing **what capability, information, or external input/authority is required**.

A Need may be model-produced, but it is data. It is neither execution authority nor response authority.

### WorkItem

A deterministic-runtime-owned, WorkflowRun-scoped control object created only after an executable Need passes validation, deduplication, policy, authority, and capability-resolution checks.

A WorkItem describes **what bounded runtime work is authorized**.

### PendingAction

A deterministic-runtime-owned external dependency created when the validated Need requires input/authority outside autonomous capability execution.

PendingAction semantics are defined further by ADR-0017/SRS-VNEXT-INTERACTION.

### Execution realization

The mechanical realization of a WorkItem. A WorkItem may map to one execution or a deterministic runtime-approved execution motif. Graph nodes are one possible implementation mechanism; they are not a mandatory semantic object for every profile.

### Artifact / Receipt

Artifacts carry durable semantic products/results. Receipts carry execution/transport/side-effect evidence. They are not interchangeable with WorkItems or Needs.

## WorkItem contract

A WorkItem should persist at least:

```text
workItemId
workflowRunId
causedByNeedId
requestOwnerRef
capabilityId + capabilityVersion
inputBundleRef + inputHash
policy/budget/authority binding
priority when supported
idempotency/equivalence key
sideEffectClass
lifecycle state
attempt/execution references
result Artifact/Receipt references
structured failure/block reason
createdAt / updatedAt
```

The exact storage schema is implementation-specific, but these semantics are correctness-bearing.

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

WorkItem lifecycle is independent from semantic PlanTask lifecycle and need not duplicate any internal graph-node lifecycle one-for-one.

Examples:

- one WorkItem can remain `RUNNING` while parallel executions execute under one approved motif;
- one WorkItem can become `COMPLETED` when a deterministic join commits its validated result Artifact(s);
- a deduplicated compatible Need can attach to an existing active WorkItem rather than creating another one;
- a completed compatible WorkItem may satisfy a later equivalent Need through exact reuse policy without new execution.

## Capability routing

Executable Needs request semantic capabilities, not providers/accounts/sessions or graph node kinds.

Example:

```yaml
need:
  type: external_evidence
  question: Does package X guarantee behavior Y?
```

The Orchestrator resolves this through a code/configuration-owned capability registry.

Conceptual descriptor:

```yaml
capabilityId: external_research
version: 1
accepts:
  - external_evidence
produces:
  - EvidenceArtifact
sideEffectClass: read_only
supportsParallel: true
eligibleExecutors:
  - research
```

The descriptor is authoritative runtime configuration. Model output cannot redefine it.

## Model authority boundary

A model may propose schema-allowed semantic fields such as:

```text
Need type
bounded question/problem
subject/finding/task references
human-readable explanation
schema-defined semantic metadata
```

A model shall not authoritatively choose:

```text
provider account/session
retry count/backoff
execution attempt identity
graph node IDs/edges
resource-budget override
side-effect authority
repository/PR mutation permission
human authorization state
PendingAction responder policy
```

Those are deterministic control-plane decisions.

## Capability registry boundary

The capability registry is code/configuration-owned and versioned.

It defines at minimum:

```text
accepted Need types
produced Artifact/Receipt types
side-effect class
required authority/gates
eligible executor classes
parallelism characteristics
input/output schemas
capability version
risk/policy hooks
```

Adding a new provider account does not create a new semantic capability. Adding a new semantic capability requires an explicit registry/schema/profile change.

## Side-effect classes

At minimum, the runtime should distinguish:

```text
read_only
repository_mutation
external_mutation
human_authority_required
```

A read-only Need cannot be silently promoted into mutation authority.

Domain-specific mutation rules remain profile-specific; for example, repository/head/merge rules belong to the software profile.

## Deduplication and reuse

Equivalent unresolved Needs may share a compatible WorkItem only when deterministic equivalence policy establishes that capability, exact correctness-bearing inputs, authority, freshness, side-effect semantics, and required outputs are compatible.

Natural-language similarity alone is never sufficient correctness authority.

A completed WorkItem/result may be reused only while exact-input, freshness, schema/profile/capability-version, and lineage policy remain compatible.

## Execution realization

A WorkItem is realized only through runtime-approved execution structures.

Examples:

```text
external_research
  -> one research execution

parallel_external_research
  -> research A
  -> research B
  -> deterministic evidence join

software implementation_change
  -> Worker mutation
  -> validation/reconciliation
```

The Need never directly authors execution topology.

Profiles/runtime implementations may use graph nodes internally, but generic correctness semantics are expressed in WorkItems, exact dependencies, execution attempts, Artifacts, Assessments, Receipts, and Awaitables.

## Failure and retry

Execution retry policy belongs to deterministic runtime policy, not the requesting agent.

A retry must preserve:

- causal Need ownership;
- exact InputBundle identity unless explicit replacement/new WorkItem policy applies;
- side-effect/idempotency constraints;
- bounded retry policy;
- execution fencing.

If retry would require materially changed correctness-bearing inputs or authority, runtime shall create/rebind/replace work through explicit policy rather than mutating the old exact execution invisibly.

## Consequences

### Positive

- reasoning intent is decoupled from execution mechanics;
- Needs can represent either internal capability work or external dependencies;
- runtime can choose one execution, fan-out/join, reuse, or specialist execution without changing semantic Need schemas;
- capability routing becomes provider/account independent;
- retries, budgets, deduplication, and side-effect policy remain deterministic;
- semantic traces can explain why each execution exists;
- non-graph profiles are not forced into software-era graph vocabulary.

### Costs

- WorkItem persistence/lifecycle become first-class runtime responsibilities;
- Need materialization must distinguish WorkItem versus PendingAction;
- mapping from Need to capability/execution motif must be versioned and tested;
- observability must distinguish Need, WorkItem, execution attempt, Artifact, Receipt, and PendingAction.

## Invariants

> A Need expresses semantic demand; it carries neither execution authority nor external-response authority.

> Only the deterministic Orchestrator may create authoritative WorkItems/PendingActions and materialize execution/dependency structures.

> WorkItems route by semantic capability; provider/account/session selection is lower-level execution policy.

> One WorkItem may realize as one execution or a deterministic approved motif, but never arbitrary model-authored executable topology.

> Graph nodes are an implementation mechanism where useful, not the universal semantic workflow model.
