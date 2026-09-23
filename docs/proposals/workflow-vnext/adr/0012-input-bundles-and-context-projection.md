# ADR-0012 — Bind Every Agent WorkItem to an Exact Sparse InputBundle

- **Status:** Proposed
- **Date:** 2026-09-16
- **Related:** ADR-0009, ADR-0010, ADR-0011

## Context

The vNext artifact model introduces durable shared state. Without a second boundary, shared state can become an implicit broadcast bus where every downstream agent receives the whole workflow history.

That creates several production risks:

- unrelated or stale reasoning contaminates later decisions;
- exact-input reuse becomes ambiguous;
- prompt size grows with workflow age;
- reviewer/research independence is weakened;
- a malformed or adversarial artifact can spread beyond its actual dependency scope;
- it becomes difficult to explain which evidence a result actually consumed.

Therefore artifact visibility and agent input delivery must be distinct concepts.

## Decision

Every executable WorkItem shall be bound to a deterministic, persisted **InputBundle** that enumerates the exact correctness-bearing artifacts and runtime facts supplied to that WorkItem.

Conceptual shape:

```yaml
inputBundleId: IB-31
workflowId: WF-7
workItemId: W-31
schemaVersion: "1"
objectiveRef: O-1
artifactRefs:
  - PLAN:P4
  - FINDING:F17
  - EVIDENCE:E12
runtimeBindings:
  repository: tsuuanmi/internet
  headSha: abc123
  capabilityVersion: 1
projectionPolicyVersion: 2
inputHash: sha256(...)
```

The canonical hash is computed from a deterministic representation of all correctness-bearing inputs.

## Sparse context projection

Shared-state visibility does not imply prompt inclusion.

The runtime shall project only the minimum artifact set required by the WorkItem contract and explicit dependencies.

Excluded by default:

```text
unrelated research branches
unrelated reviewer opinions
superseded artifacts
stale exact-head results
full workflow transcript
provider/account implementation detail unless required
prior model prose with no declared dependency
```

An artifact may exist in the workflow store while being absent from a WorkItem's InputBundle.

## Correctness-bearing versus explanatory context

Input may be divided into:

```text
correctnessBearing
explanatory
```

Only correctness-bearing inputs participate in exact reuse/invalidation unless the schema explicitly promotes explanatory material to correctness-bearing status.

This prevents cosmetic context from invalidating cached work while ensuring that evidence/criteria actually relied upon are bound.

## Projection authority

The projection algorithm is runtime-owned and versioned.

Models may reference desired context semantically, but they do not authoritatively decide which hidden/shared artifacts are injected.

Projection policy may depend on:

```text
WorkItem capability
direct artifact dependencies
request owner/finding
current plan version
repository/PR/head
risk class
freshness policy
access/authority policy
```

## Input closure

Before execution, the runtime shall verify that the InputBundle is closed over required direct dependencies.

If artifact `A` claims correctness dependence on artifact `B`, a WorkItem consuming `A` must either:

- consume the required dependency identity transitively through a validated artifact receipt; or
- include `B` explicitly according to the artifact schema.

The implementation may optimize representation, but cannot lose dependency identity required for invalidation.

## Immutable execution binding

Once a WorkItem execution attempt starts, its canonical InputBundle identity does not change.

If new evidence or plan state becomes necessary, the current WorkItem must:

- complete/fail against its original inputs; or
- be cancelled/fenced and replaced by a new WorkItem/InputBundle under explicit policy.

The runtime shall not silently mutate an active prompt/input set and still represent it as the same exact execution.

## Result binding

Every correctness-bearing result Artifact produced by agent execution shall reference the WorkItem and InputBundle/input hash that produced it.

Conceptually:

```text
Artifact E44
  producedByWorkItem = W31
  producedFromInputBundle = IB31
  producedFromInputHash = ...
```

This allows deterministic provenance and stale-result rejection.

## Review independence

Reviewer InputBundles should include authoritative task/criteria, exact implementation/head, required evidence, and explicitly relevant prior findings, but should not automatically include another reviewer's conclusions when independent review is required.

A later synthesis/join WorkItem may consume both reviewer artifacts explicitly.

This separates:

```text
independent evaluation
from
cross-review synthesis
```

## Research independence

Parallel Research WorkItems may intentionally receive different or identical InputBundles according to the chosen motif.

If independence is desired, one researcher's generated conclusions are not injected into another's InputBundle unless a later critique/refinement stage explicitly depends on them.

## Security and trust boundary

All model-produced explanatory text remains untrusted data when inserted into another WorkItem.

InputBundle construction shall preserve type delimiters/provenance so downstream agents can distinguish:

```text
authoritative workflow facts
validated artifacts
untrusted model-produced content
external source excerpts
runtime control instructions
```

Model-produced content cannot become runtime instruction authority merely because it is present in the bundle.

## Invalidation

An existing result can be reused only when its InputBundle's correctness-bearing identity remains compatible.

Examples that require invalidation/re-evaluation:

```text
PR head changes
relevant acceptance criterion changes
required evidence is superseded/invalidated
capability contract version changes in a correctness-relevant way
projection policy changes which correctness-bearing inputs apply
freshness requirement expires
```

Unrelated new artifacts elsewhere in shared state do not invalidate the WorkItem.

## Consequences

### Positive

- exact provenance becomes inspectable;
- context size is bounded by task relevance rather than workflow age;
- independent reviewers/researchers remain truly independent;
- stale result invalidation is precise;
- cross-agent error propagation is reduced;
- caching and deduplication have a deterministic key.

### Costs

- projection policy must be explicitly designed and versioned;
- dependency closure and provenance become runtime responsibilities;
- debugging tools must show both shared state and per-WorkItem projected state.

## Invariants

> Shared artifact state is not a broadcast transcript.

> Every executable WorkItem is bound to one immutable exact InputBundle identity.

> Only artifacts and runtime facts declared by that InputBundle may be treated as correctness-bearing inputs to the result.

> Model output never acquires control authority merely by being included in another agent's context.
