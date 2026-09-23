# ADR-0009 — Use Typed Durable Artifacts as the Agent Communication Protocol

- **Status:** Proposed
- **Date:** 2026-09-16
- **Updated:** 2026-09-16 after core-SRS harmonization
- **Related:** ADR-0010, ADR-0011, ADR-0012, ADR-0019

## Context

The current workflow preserves research and review outputs verbatim and delivers them between agents. That protects fidelity, but the payload is still primarily free-form Markdown.

Free-form handoffs are useful for human-readable reasoning, yet they are a weak workflow protocol because the runtime must infer control meaning from prose. Examples include:

- whether a Reviewer needs more research, implementation change, plan change, requirements change, or clarification;
- which Finding a new EvidenceArtifact resolves;
- whether a result applies to the current criterion/plan/deliverable/exact subject;
- who should consume the result next;
- whether two requests are duplicates;
- whether an Artifact may be safely reused after state changes.

Adaptive durable workflows therefore require explicit machine-readable semantic state and causal relationships.

## Decision

Correctness-bearing communication between reasoning capabilities and the deterministic Orchestrator shall evolve toward **typed, schema-versioned, durable Artifacts/Assessments**.

Markdown/prose remains allowed as explanatory content, but it is not authoritative workflow control.

Conceptual common envelope:

```yaml
schemaVersion: "1"
artifactId: artifact_0192
workflowRunId: run_123
producer:
  capability: review
  executionRef: exec_77
context:
  criterionSetVersion: AC-4
  inputBundleRef: IB-31
type: finding
payload:
  findingId: F-9
  need:
    type: external_evidence
    question: Does package X guarantee behavior Y?
markdown: |
  Human/model-readable explanation.
```

The exact schema differs by Artifact/Assessment type, but every correctness-bearing object must expose enough structured identity for deterministic validation, persistence, routing, lineage, stale-state detection, and reuse decisions.

## Semantic families

Initial target families include:

```text
User source / imported source input
Objective / constraints / acceptance criteria
Plan / plan revision / assumptions
claim / evidence / contradiction
Finding
Need
implementation/generated output
validation/verification result
CriterionAssessment / review assessment
Report
Delivery
UserFeedback
proposed requirements revision
```

Runtime control records such as WorkItem, InputBundle, PendingAction, Timer, ExternalEvent, execution receipts, budgets, and routing decisions are distinct from semantic Artifacts even when they reference one another.

## Artifact properties

Correctness-bearing Artifacts/Assessments should be:

- schema-versioned;
- immutable after commit, or changed only through explicit supersession/versioning;
- hashable/content-addressable where practical;
- bound to WorkflowRun identity;
- bound to exact criterion/plan/input/deliverable/repository/head context where applicable;
- attributable to a producer capability/execution;
- machine-validated before authoritative state transition or routing;
- persisted outside transient Local/provider conversation context;
- lineage-addressable for reuse/invalidation/continuation.

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
typed Artifact / Assessment
  + exact structured payload
  + optional explanatory prose
  -> deterministic validation / persistence / routing
```

A correctness-bearing schema transformation is allowed only when it is explicit, versioned, provenance-preserving, and deterministic or produced through a typed authorized capability contract. Silent LLM reinterpretation is not a valid transport mechanism.

## Shared state and exact delivery

The durable Artifact set forms semantic shared state, but persistence is not broadcast delivery.

Capability executions receive the smallest exact relevant subset through InputBundles rather than the entire accumulated workflow history.

An Artifact may exist in shared state while being absent from a particular WorkItem InputBundle.

The ArtifactStore is not itself the workflow state machine. WorkflowRun/control records remain authoritative for lifecycle, execution authorization, dependencies, interaction, budgets, and convergence.

## Roles versus capabilities

The generic kernel is capability-driven and does not require one universal role topology.

Planner, Research, Worker, Reviewer, Synthesis, Verification, and other logical roles may be useful executor identities for particular profiles, but capability contracts are the stable semantic execution boundary.

### Software-profile Worker terminology

For software/profile flows that contain an implementation/generation role, the target logical role previously called **Writer** is named **Worker**.

In that profile, Worker may cover capabilities such as:

- authorized implementation/repository mutation;
- generated output production from validated inputs.

This naming does **not** make Worker mandatory for research, monitoring, or other profiles.

The existing account/route name `chatgpt-writer` may remain temporarily as a transport identifier during migration. Renaming the logical software role does not require an immediate account migration.

## Consequences

### Positive

- routing can be deterministic instead of prose-inferred;
- Findings, Evidence, Assessments, Deliveries, and feedback can have persistent lifecycle/provenance;
- exact-input reuse/invalidation extends beyond PR head checks;
- equivalent requests can be deduplicated under typed policy;
- capability executions receive smaller task-relevant context;
- replay/debugging/audit become more precise;
- new profiles/capabilities can be added without changing upstream prose conventions;
- software-era Worker terminology no longer leaks into every generic workflow.

### Costs

- schemas require versioning and migration policy;
- Artifact/Assessment validation/storage becomes first-class runtime responsibility;
- reasoning executors must produce outputs satisfying structured contracts;
- runtime must distinguish semantic Artifacts from control records and explanatory prose.

## Invariants

> Correctness-bearing semantic coordination is represented by validated typed Artifacts/Assessments, not inference over unstructured conversation text.

> Routing may preserve explanatory prose, but authoritative control meaning comes from validated structured fields.

> Persistence in shared Artifact state does not imply broadcast delivery; exact InputBundles determine correctness-bearing consumption.

> The generic kernel is capability-driven; Worker is a software-profile logical role where applicable, not a mandatory universal actor.

> The existing `chatgpt-writer` account name may remain a transport detail during migration without defining generic workflow semantics.
