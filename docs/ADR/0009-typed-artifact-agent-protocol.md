# ADR-0009 — Use Typed Durable Artifacts as the Agent Communication Protocol

- **Status:** Proposed
- **Date:** 2026-09-16

## Context

The current workflow preserves research and review outputs verbatim and delivers them between agents. That protects fidelity, but the payload is still primarily free-form Markdown.

Free-form handoffs are useful for human-readable reasoning, yet they are a weak workflow protocol because the runtime must infer control meaning from prose. Examples include:

- whether a reviewer needs more research or an implementation change;
- which finding a new evidence packet resolves;
- whether a result applies to the current plan/head;
- who should consume the result next;
- whether two requests are duplicates;
- whether an artifact may be safely reused after state changes.

A dynamic graph requires explicit machine-readable state and causal relationships.

## Decision

Correctness-bearing inter-agent communication shall evolve toward **typed, schema-versioned, durable artifacts**.

Markdown remains allowed as an explanatory field, but it is not authoritative workflow control.

Conceptual common envelope:

```yaml
schemaVersion: "1"
artifactId: artifact_0192
workflowId: wf_123
producer:
  role: reviewer
  instance: review-a
context:
  planVersion: 4
  headSha: def456
type: action_request
payload:
  need: external_evidence
  subject:
    findingId: REV-A-009
  question: Does package X guarantee behavior Y?
  blocking: true
markdown: |
  Human/model-readable explanation.
```

The exact schema may differ by artifact type, but every correctness-bearing artifact must expose enough structured identity for deterministic validation, persistence, routing, and reuse decisions.

## Artifact classes

Initial target classes include:

```text
objective / constraints / acceptance criteria
plan / plan revision
claim / evidence / contradiction
finding
need / action request
implementation result
validation result
review result / approval
external receipt
routing decision
```

The runtime may add more classes as concrete requirements appear.

## Artifact properties

Correctness-bearing artifacts should be:

- schema-versioned;
- immutable after commit, or replaced only through explicit supersession;
- hashable/content-addressable where practical;
- bound to workflow identity;
- bound to exact plan/repository/PR/head context where applicable;
- attributable to a producer role/node;
- machine-validated before state transition or routing;
- persisted outside transient model conversation context.

## Relationship to ADR-0002

ADR-0002 remains valid in spirit: routing must not silently rewrite another agent's reasoning.

This ADR extends that principle.

The new target is not:

```text
free-form payload -> Local summary -> next agent
```

and not merely:

```text
free-form payload -> verbatim next agent
```

Instead:

```text
typed artifact
  + exact structured payload
  + optional verbatim explanatory Markdown
  -> deterministic persistence/routing
```

A schema transformation is allowed only when it is an explicit, versioned runtime operation that preserves provenance. Silent LLM reinterpretation is not a valid transport mechanism.

## Shared state

The durable artifact set forms a workflow blackboard/shared state. Agents receive the smallest relevant subset of exact artifacts needed for their task rather than the entire accumulated transcript.

This does not make the artifact store an event-sourced workflow engine. The authoritative graph/job snapshot may remain the state-machine authority while artifacts provide the correctness-bearing data referenced by graph nodes and transitions.

## Logical Worker terminology

The target logical role previously called **Writer** becomes **Worker**.

For the current simplification, Worker combines two conceptual capabilities:

- **Worker:** execute implementation/mutation work;
- **Generator:** produce final/generated artifacts from validated inputs.

The existing account/route name `chatgpt-writer` may remain temporarily as an implementation identifier. Renaming the logical role does not require an immediate account migration.

## Consequences

### Positive

- routing can be deterministic instead of prose-inferred;
- findings and evidence can have persistent lifecycle and provenance;
- exact-input reuse/invalidation can extend beyond PR head checks;
- equivalent requests can be deduplicated;
- agents can receive smaller, task-relevant context;
- workflow replay/debugging becomes more precise;
- future specialist roles can be added without changing upstream agents' prose conventions.

### Costs

- schemas require versioning and migration policy;
- artifact validation/storage becomes a first-class runtime responsibility;
- models must produce outputs that satisfy structured contracts;
- the runtime must distinguish human-readable explanation from authoritative structured fields.

## Invariants

> Correctness-bearing inter-agent coordination is represented by validated typed artifacts, not by inference over unstructured conversation text.

> Routing may preserve and present explanatory Markdown, but control meaning comes from structured artifact fields.

> The target logical implementation/generation role is Worker; the existing `chatgpt-writer` account name may remain a transport detail during migration.
