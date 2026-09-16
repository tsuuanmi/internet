# Software Requirements Specification — vNext Planner Lifecycle

- **Status:** proposed requirements; not implemented production contract
- **Version:** 0.1
- **Started:** 2026-09-16
- **Parent:** [`SRS-VNEXT.md`](./SRS-VNEXT.md)
- **Decision:** [`ADR/0016-planner-objective-plan-task-boundary.md`](./ADR/0016-planner-objective-plan-task-boundary.md)

## 1. Purpose and authority

This module defines proposed requirements for the semantic planning boundary between user intent, objective interpretation, acceptance criteria, task decomposition, execution Needs, and runtime WorkItems.

It extends the core vNext requirements. Current code and as-built contracts remain production authority until these requirements are implemented and promoted.

Local/Orchestrator remains deterministic and non-reasoning under ADR-0015.

## 2. Functional requirements

### PL-FR-001 — Persist raw user objective

The workflow shall persist the original user request and explicit user constraints as `UserObjectiveInput` before semantic planning.

### PL-FR-002 — Local does not interpret objective semantics

Local shall not rewrite, summarize, resolve ambiguity in, or infer acceptance criteria from free-form user text.

When semantic interpretation is required, Local shall route a Planner/clarification WorkItem according to deterministic policy.

### PL-FR-003 — Planner-owned ObjectiveArtifact

Planner shall produce a structured `ObjectiveArtifact` that references the source `UserObjectiveInput` and preserves explicit user-owned constraints by identity/provenance.

### PL-FR-004 — Objective is distinct from Plan

The desired semantic outcome shall be versioned independently from the execution strategy used to achieve it.

### PL-FR-005 — Separate AcceptanceCriteriaArtifact

Acceptance criteria shall be represented separately from PlanArtifact.

A Plan revision shall not implicitly revise acceptance criteria.

### PL-FR-006 — Criteria identity and provenance

Every acceptance criterion shall have stable identity and provenance sufficient to distinguish at least:

```text
user
policy
planner_derived
```

### PL-FR-007 — User/policy criteria authority

Planner shall not remove, weaken, or semantically replace user- or policy-owned criteria without an explicit authority path allowed by workflow policy.

### PL-FR-008 — Planner-derived criteria revision

Planner may add or revise planner-derived criteria when policy permits, but each revision shall create a new criteria-set version with supersession provenance.

### PL-FR-009 — Plan binds objective and criteria versions

Every PlanArtifact shall reference the exact ObjectiveArtifact and AcceptanceCriteriaArtifact versions it is designed to satisfy.

### PL-FR-010 — Plan contains semantic strategy

PlanArtifact shall contain semantic decomposition, assumptions, partial-order task dependencies, and relevant risks/unknowns, but shall not contain provider/session/retry/lease/runtime-node authority.

### PL-FR-011 — First-class PlanTask identity

Every semantic PlanTask shall have stable plan-scoped identity.

### PL-FR-012 — PlanTask is not WorkItem

PlanTask lifecycle and WorkItem lifecycle shall remain distinct.

A PlanTask shall never be considered executed merely because it exists in a Plan.

### PL-FR-013 — Hierarchical decomposition allowed

Planner may represent task hierarchy/grouping when useful.

Parent/group tasks shall not automatically become executable WorkItems.

### PL-FR-014 — Partial-order dependencies

Planner should express only necessary semantic ordering/dependency relationships.

Local shall not add dependencies by interpreting task prose.

### PL-FR-015 — Explicit execution Need required

A semantic task requiring agent/tool execution shall have an explicit typed Need or equivalent schema-defined execution intent produced by an authorized reasoning role.

### PL-FR-016 — Local does not infer capability from task prose

Local shall not map natural-language task descriptions directly to providers/capabilities.

Capability routing shall operate on typed Needs.

### PL-FR-017 — PlanTask causal ownership

A task-linked Need may identify `PlanTask` as causal request owner so returned output can be attached to the task without automatically invoking Planner again.

### PL-FR-018 — WorkItem materialization remains Local-owned

Once a typed Need is valid, Local shall deterministically resolve capability/policy and materialize the runtime WorkItem.

### PL-FR-019 — Task execution completion differs from acceptance

The runtime shall distinguish at least:

```text
WorkItem completed
PlanTask execution completed
AcceptanceCriterion satisfied
Workflow converged
```

### PL-FR-020 — Task result does not imply criterion satisfaction

A produced implementation/evidence Artifact shall not automatically mark related acceptance criteria satisfied unless an explicit deterministic validation or authorized Reviewer judgment does so.

### PL-FR-021 — PlanRevisionArtifact required

Replanning shall create a new PlanRevision/Plan version rather than silently editing the active Plan in place.

### PL-FR-022 — Plan revision change set

A Plan revision shall identify at least:

```text
superseded plan version
reason
added tasks
removed/superseded tasks
changed dependencies
changed assumptions
explicit affected references
```

### PL-FR-023 — Local invalidates from explicit refs

Local shall use declared artifact/task/criteria relationships and version lineage for stale-state propagation.

Local shall not infer invalidation by reading semantic prose.

### PL-FR-024 — Plan change and requirements change are distinct

The workflow shall distinguish at least:

```text
plan_change
requirements_change
clarification
```

### PL-FR-025 — Plan change preserves success definition

`plan_change` shall mean that objective/acceptance criteria remain active while strategy/decomposition changes.

### PL-FR-026 — Requirements change may alter success definition

`requirements_change` shall represent proposed change to Objective or AcceptanceCriteria and shall follow applicable authority rules before activation.

### PL-FR-027 — User authorization for user-owned requirement changes

If a proposed criteria/objective revision would weaken, remove, or materially reinterpret user-owned constraints, Local shall require explicit user authority unless policy already provides a narrower deterministic rule.

### PL-FR-028 — Local does not judge semantic quality of revised requirements

Local shall only validate schema/provenance/authority for proposed Objective/Criteria revisions.

Semantic adequacy belongs to Planner/Reviewer/User according to workflow policy.

### PL-FR-029 — Criteria revision invalidates dependents

When active acceptance criteria are superseded, dependent Plan/Implementation/Review/Approval artifacts shall become stale or require re-evaluation according to explicit lineage rules.

### PL-FR-030 — Plan revision preserves unaffected work

When a Plan revision changes only a subset of tasks/assumptions/dependencies, unrelated compatible completed artifacts should remain reusable according to exact-input and lineage policy.

### PL-FR-031 — Planner may re-enter after workflow start

Planner shall be invokable when a later typed Need requires replanning, criteria revision proposal, semantic clarification, or plan synthesis.

### PL-FR-032 — Planner is not a fixed phase gate

Local shall not invoke Planner solely because a hard-coded phase number has been reached.

Invocation shall be triggered by initial workflow policy or an explicit typed Need.

### PL-FR-033 — Planner clarification artifact

When user intent is materially ambiguous and cannot be resolved under deterministic policy, Planner/clarification capability shall produce a structured clarification request for Local to present to the user.

### PL-FR-034 — Local presents, does not invent, semantic questions

Local may present a previously produced clarification question and persist the response, but shall not formulate its own semantic interpretation question through model reasoning.

### PL-FR-035 — Shared Plan view belongs to Planner semantics

Temporary PR `PLAN.md` content shall derive from a Planner-produced `PlanSharedView` or equivalent accepted semantic artifact.

Local may render/order/filter it deterministically but shall not rewrite its substantive plan meaning.

### PL-FR-036 — Optional Roadmap view

For large workflows, Planner may produce a `RoadmapSharedView` that Local can publish under deterministic workspace policy.

### PL-FR-037 — Shared TODO items have semantic provenance

Task/blocker items displayed in `TODO.md` shall originate from typed structured items produced by authorized roles or explicit deterministic runtime status, rather than Local prose synthesis.

### PL-FR-038 — Assumptions are first-class

Material Planner assumptions that affect downstream correctness shall have stable identity or explicit references sufficient for later evidence to contradict/supersede them.

### PL-FR-039 — Evidence may trigger replan without Local interpretation

When Research/Reviewer determines that evidence invalidates a planning assumption, that reasoning role shall emit the appropriate typed Need/contradiction reference.

Local shall route/invalidate mechanically from the typed result.

### PL-FR-040 — Concurrency from declared dependencies

Independent executable task Needs may run concurrently when their declared dependencies, side-effect constraints, and resource policy permit.

Local shall not serialize tasks merely because they appeared sequentially in Planner prose.

## 3. Object relationship

```text
UserObjectiveInput UO1
        |
        v
ObjectiveArtifact O1
        |
        +-------------------+
        |                   |
        v                   v
AcceptanceCriteria AC1    assumptions
        |                   |
        +---------+---------+
                  v
              Plan P1
          +-------+-------+
          |               |
       Task T1          Task T2
          |               |
       Need N1          Need N2
          |               |
       WorkItem W1      WorkItem W2
```

When N1 and N2 are independent, Local may schedule W1/W2 concurrently under deterministic policy.

## 4. Requirements-change flow

```text
Reviewer
  -> Finding: acceptance definition ambiguous
  -> Need(requirements_change)
  -> Local routes Planner
  -> Planner proposes AC2 / Objective revision
  -> Local validates authority
  -> user approval if required
  -> activate AC2
  -> deterministic lineage invalidation
  -> Planner replan if needed
```

## 5. Plan-change flow

```text
Reviewer
  -> Finding: current strategy is incomplete
  -> Need(plan_change)
  -> Local routes Planner
  -> Plan P2 supersedes P1
  -> Local invalidates only declared affected dependents
  -> typed task Needs become ready
  -> execution continues
```

## 6. Acceptance scenarios

### Scenario A — ordinary initial planning

1. Local persists raw user objective.
2. Deterministic startup policy creates Planner WorkItem.
3. Planner returns Objective, AcceptanceCriteria, Plan, PlanSharedView, and executable task Needs.
4. Local validates schema/refs/authority.
5. Local routes ready Needs without reading task prose semantically.

### Scenario B — planner changes strategy only

1. Evidence invalidates assumption A3.
2. Reviewer/Planner produces `plan_change` Need with A3 reference.
3. Planner returns P2 superseding P1, changing T4/T5 only.
4. Local keeps unrelated completed task evidence reusable.
5. Local schedules new typed Needs for changed tasks.

### Scenario C — user criterion needs change

1. Reviewer finds explicit user constraint incompatible with requested outcome.
2. Reviewer emits `requirements_change` Need.
3. Planner proposes revision.
4. Local detects user-owned criterion provenance and requests explicit user authorization.
5. Without authorization, active criteria remain unchanged.

### Scenario D — WorkItem succeeds but task fails acceptance

1. Worker completes implementation WorkItem.
2. PlanTask records execution output.
3. Reviewer evaluates implementation against criterion AC7.
4. Reviewer finds AC7 unsatisfied.
5. Workflow creates repair/replan Need rather than marking workflow successful.

## 7. Non-goals

This module does not make Planner:

- the scheduler;
- the provider/account router;
- the Git writer;
- the final acceptance authority;
- the owner of user authorization;
- the source of runtime retry/budget policy.

Planner owns semantic interpretation and decomposition. Local owns deterministic coordination. Reviewer/tests own acceptance evidence. Worker owns authorized implementation/Git mutation.
