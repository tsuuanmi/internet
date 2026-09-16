# Software Requirements Specification — vNext Deterministic Local Orchestrator

- **Status:** proposed requirements; not implemented production contract
- **Version:** 0.1
- **Started:** 2026-09-16
- **Parent:** [`SRS-VNEXT.md`](./SRS-VNEXT.md)
- **Decision:** [`ADR/0015-deterministic-local-orchestrator.md`](./ADR/0015-deterministic-local-orchestrator.md)

## 1. Purpose

This module defines the production boundary for Local/Orchestrator.

Local is the deterministic workflow controller. It coordinates typed state and bounded reasoning capabilities; it does not itself act as a reasoning agent.

For current production behavior, current code and as-built contracts remain authoritative.

## 2. Core requirements

### LO-FR-001 — Local equals Orchestrator

`Local` and `Orchestrator` shall refer to the same logical workflow control-plane actor.

### LO-FR-002 — WorkflowEngine is internal control-plane implementation

`WorkflowEngine` shall be treated as a deterministic implementation component within the Local/Orchestrator boundary, not as an independent semantic role.

### LO-FR-003 — No Local model reasoning

Local/Orchestrator shall not invoke an LLM/model to choose workflow transitions, interpret semantic artifacts, summarize research, create plans, review implementation, resolve contradictions, or synthesize shared collaboration content.

### LO-FR-004 — Deterministic transition rule

Given the same authoritative workflow state, accepted typed artifacts, observed external receipts/state, and policy/schema versions, Local shall choose the same workflow transition without model inference.

### LO-FR-005 — Typed-input-only control

Local control decisions shall depend on structured schema fields, durable state, explicit policy, and typed external observations/receipts rather than semantic interpretation of free-form prose.

### LO-FR-006 — No prose fallback

If required routing/control meaning cannot be determined from validated structured input and policy, Local shall reject/block or route a reasoning WorkItem. It shall not infer the missing meaning from explanatory prose.

### LO-FR-007 — Semantic work is delegated

Operations requiring semantic judgment shall be represented as WorkItems for a registered reasoning capability.

Initial examples include:

```text
objective interpretation/decomposition -> Planner
acceptance-criteria creation/revision -> Planner
repository/external evidence gathering -> Research
research synthesis -> Research/Synthesis capability
implementation design/execution -> Worker
implementation correctness judgment -> Reviewer
contradiction/evidence judgment -> Reviewer/Verification capability
semantic clarification question creation -> Planner/Reviewer/Clarification capability
```

### LO-FR-008 — Local schema validation is not semantic validation

Local may validate artifact schema, required fields, provenance, producer authority, exact-input bindings, versions, hashes, and lifecycle compatibility.

Local shall not substitute its own judgment for whether the artifact's semantic conclusion is substantively correct.

### LO-FR-009 — Raw user objective preservation

A free-form user objective shall be persisted as user-owned input without semantic rewriting by Local.

### LO-FR-010 — Planner handles semantic decomposition

When workflow policy requires objective decomposition, acceptance criteria, implementation planning, or ambiguity resolution, Local shall route the raw user objective and relevant structured context to Planner rather than constructing those semantics itself.

### LO-FR-011 — Policy routing is deterministic

Mapping a validated Need type to a registered capability shall be a code/configuration-owned deterministic operation.

Example:

```text
Need.type = external_evidence
  -> capability = external_research
```

The content/question inside that Need is authored by the requesting reasoning role, not invented by Local.

### LO-FR-012 — Result return is mechanical

Returning a WorkItem result to its causal request owner shall be determined from persisted ownership/routing fields, not from Local interpreting what the result means.

### LO-FR-013 — Request owner retains semantic consequence authority

When Research answers a Reviewer-owned Need, Local shall return the EvidenceArtifact to that Reviewer/finding. Local shall not decide that the evidence means `implementation_change` or `plan_change` unless a typed artifact/policy already encodes that outcome.

### LO-FR-014 — Deterministic InputBundle projection

Local shall construct InputBundles from explicit dependency rules, accepted artifact references, current authoritative runtime facts, and projection policy.

It shall not add arbitrary artifacts because they appear semantically related after reading prose.

### LO-FR-015 — Deterministic graph materialization

Local shall instantiate only runtime-approved graph motifs/subgraphs selected by validated capability/policy fields.

Local shall not ask a model to invent workflow topology.

### LO-FR-016 — Deterministic readiness and scheduling

Readiness, dependencies, resource limits, provider/account capacity, retries, and execution fencing shall be evaluated by code-defined policy.

### LO-FR-017 — Deterministic invalidation

Artifact/review/plan invalidation shall follow explicit exact-input, lineage, version, and dependency rules.

Local shall not invalidate or preserve artifacts because they merely "seem related".

### LO-FR-018 — Deterministic convergence

Workflow convergence shall be evaluated from explicit predicates over typed state, such as blocking-findings state, exact-head approvals, required validation/check states, contradiction state, and acceptance-criteria satisfaction artifacts.

### LO-FR-019 — Limits are deterministic policy

Retry limits, WorkItem budgets, concurrency limits, stagnation counters, timeouts, and other resource bounds shall be code/policy-owned.

Agents shall not silently change these values.

### LO-FR-020 — Local may render non-semantic projections

Local may deterministically render content directly from structured state when no semantic synthesis is required.

Examples:

```text
STATUS.md
workflow status JSON
operator status output
exact-head/check summary
machine-generated TODO entries from already-accepted structured SharedTodoItems
```

### LO-FR-021 — Local shall not summarize research

Local shall not read Research artifacts and create a new semantic research summary.

If a shared research synthesis is required, a Research/Synthesis capability shall produce the corresponding typed shared-view artifact.

### LO-FR-022 — Local shall not rewrite plans

Local shall not modify Planner meaning while projecting `PLAN.md` or `ROADMAP.md`.

The visible semantic content shall originate from an accepted Planner-produced shared-view artifact or another explicitly authorized reasoning artifact.

### LO-FR-023 — Local shall not invent TODO semantics

`TODO.md` shall be composed from accepted structured task/blocker/shared-TODO artifacts and deterministic runtime fields.

If prioritization, grouping, or rewriting requires semantic judgment, that operation shall be delegated to Planner/Reviewer or another registered reasoning capability.

### LO-FR-024 — Shared-view artifacts are explicit

Reasoning roles may emit an explicitly publishable shared-view artifact or field, such as:

```text
PlanSharedView
ResearchSharedView
ReviewSharedTodoItem
RoadmapSharedView
```

Shared views shall preserve source/provenance references.

### LO-FR-025 — Shared-view publication is deterministic

Local may accept a shared view for PR publication only by code/policy checks such as:

```text
schema valid
producer role authorized for the channel
source artifact active/not superseded
publication class allowed
sensitivity/retention policy allowed
size/count bounds satisfied
synchronization trigger reached
```

Local shall not apply subjective importance scoring to prose.

### LO-FR-026 — Semantic synthesis becomes a WorkItem

When multiple artifacts must be merged, prioritized, reconciled, or summarized in a way that requires understanding their meaning, Local shall create a synthesis/decision WorkItem rather than performing the operation itself.

### LO-FR-027 — Worker remains sole repository writer

Local shall not write repository commits directly.

All repository mutation shall execute through Worker under an authorized Git mutation WorkItem.

### LO-FR-028 — Local owns repository desired state, not implementation reasoning

For exact workspace projection and cleanup, Local may derive exact desired repository state deterministically from accepted structured artifacts.

For product implementation, Local provides objective/constraints/scope but shall not synthesize the implementation itself.

### LO-FR-029 — Mutation reconciliation is deterministic

Local shall verify Worker mutation receipts against observed Git/PR state, expected head, allowed paths, desired hashes/postconditions, and policy.

### LO-FR-030 — No autonomous stale-head semantic recovery

When Git head changes unexpectedly, Local may mechanically detect and classify the stale condition.

If adapting to the changed code requires semantic reasoning, Local shall route a new Planner/Worker/Reviewer WorkItem rather than deciding the adaptation itself.

### LO-FR-031 — No hidden emergency LLM

The Local implementation shall have no generic "ask a model what to do next" fallback.

Unsupported control states shall fail closed or dispatch an explicitly registered reasoning capability.

### LO-FR-032 — Human-action presentation is non-semantic

Local may present an already-defined authorization request, clarification question, blocker, or choice to the user and persist the response.

When creating the wording/options themselves requires semantic judgment, they shall originate from a reasoning artifact/capability.

### LO-FR-033 — Operator explanations derive from state

Local may explain status using deterministic templates over structured state.

It shall not produce correctness-bearing explanations by speculative semantic synthesis.

### LO-FR-034 — Recovery shall not require replaying reasoning

Restart/recovery of Local shall reconstruct control state from durable workflow state, artifacts, receipts, and observations without reproducing prior hidden model reasoning.

### LO-FR-035 — Model/provider substitution shall not alter orchestration semantics

Changing the underlying model/provider for Planner, Research, Reviewer, or Worker shall not change Local state-transition rules unless an explicit capability/policy version changes.

## 3. Decision ownership matrix

| Decision | Owner |
| --- | --- |
| workflow/node readiness | Local |
| Need -> capability mapping | Local |
| account/provider availability routing | Local |
| exact InputBundle membership from explicit dependency policy | Local |
| what question needs research | requesting reasoning role |
| research conclusion | Research |
| research synthesis | Research/Synthesis capability |
| implementation plan | Planner |
| acceptance criteria | Planner + applicable User/Reviewer gates |
| implementation solution | Worker |
| code correctness judgment | Reviewer + deterministic validation |
| whether evidence resolves Reviewer finding | Reviewer |
| graph motif selected for a typed capability | Local |
| retry/fencing/idempotency | Local |
| budget/termination predicate | Local |
| shared-view semantic text | source reasoning role |
| whether a schema-valid shared view is publishable under policy | Local |
| Git commit execution | Worker |
| Git postcondition reconciliation | Local |

## 4. Acceptance scenarios

### Scenario A — Research result changes implementation direction

1. Reviewer emits `Need(external_evidence)` with bounded question.
2. Local routes it deterministically to Research.
3. Research returns EvidenceArtifact.
4. Local validates schema/provenance and returns it to Reviewer.
5. Reviewer determines evidence implies implementation change and emits `Need(implementation_change)`.
6. Local routes that Need to Worker.
7. Local never independently interprets the research conclusion.

### Scenario B — Shared research needs synthesis

1. Research A and B each produce evidence plus shared-context candidates.
2. Publication policy detects that one accepted synthesis artifact is required by the selected workspace policy.
3. Local schedules `research_synthesis` WorkItem.
4. Synthesis capability produces `ResearchSharedView` with sourceRefs.
5. Local validates publication rules and deterministically renders `RESEARCH.md`.
6. Worker commits exact workspace projection.

### Scenario C — Ambiguous initial objective

1. Local persists raw user request.
2. Policy routes objective to Planner.
3. Planner returns Objective/AcceptanceCriteria/Plan or a typed ClarificationNeed.
4. Local presents the clarification if needed and records user response.
5. Local does not resolve ambiguity itself.

### Scenario D — Unknown Need type

1. Agent emits schema-valid but unsupported Need type.
2. Local cannot resolve a registered capability.
3. Local rejects/blocks with structured unsupported-capability state.
4. Local does not read the Need explanation and guess a destination.

### Scenario E — Conflicting evidence

1. Two valid EvidenceArtifacts contradict one another.
2. Local records both and explicit contradiction relationship/state when supplied by schema/rules.
3. If resolution requires judgment, Local routes a verification/review/synthesis WorkItem.
4. Local does not select the evidence it finds more plausible.

## 5. Non-goals

Local/Orchestrator is not:

```text
a Planner
a Research agent
a Research summarizer
a Reviewer
a code-quality judge
an implementation generator
a semantic conflict resolver
a hidden general-purpose LLM agent
```

Its purpose is narrower and stronger:

> deterministically coordinate specialized reasoning and mutation capabilities while preserving durable state, exact inputs, authority, and recoverability.
