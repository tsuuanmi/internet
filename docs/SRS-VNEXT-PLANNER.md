# Software Requirements Specification — vNext Planner Lifecycle

- **Status:** proposed requirements; not implemented production contract
- **Version:** 0.2
- **Started:** 2026-09-16
- **Parent:** [`SRS-VNEXT.md`](./SRS-VNEXT.md)
- **Decision:** [`ADR/0016-planner-objective-plan-task-boundary.md`](./ADR/0016-planner-objective-plan-task-boundary.md)

## 1. Purpose and authority

This module defines proposed requirements for the semantic planning boundary between accepted User intent, Objective interpretation, AcceptanceCriteria, task decomposition, execution Needs, runtime WorkItems/PendingActions, and later plan/requirements revisions.

It extends the core vNext requirements. Current code and as-built contracts remain production authority until these requirements are implemented and promoted.

The **Local Agent** is a reasoning-capable workflow client/operator under ADR-0015/ADR-0018. The **Orchestrator Runtime** remains deterministic and owns authoritative routing/materialization/invalidation/state transitions.

## 2. Functional requirements

### PL-FR-001 — Persist accepted User source

The workflow shall durably preserve the accepted User source and explicit User constraints from the admission protocol before semantic planning.

### PL-FR-002 — Orchestrator does not interpret objective semantics

The Orchestrator Runtime shall not rewrite, summarize, resolve ambiguity in, or infer acceptance criteria from free-form User text.

When semantic interpretation is required, it shall route a Planner/clarification reasoning capability according to typed policy.

The Local Agent may perform conversational interpretation for admission UX, but that interpretation is authoritative only when submitted through the typed admission protocol with provenance.

### PL-FR-003 — Planner-owned ObjectiveArtifact

Planner shall produce a structured `ObjectiveArtifact` that references the accepted source/admission and preserves explicit User-owned constraints by identity/provenance.

### PL-FR-004 — Objective distinct from Plan

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

The Orchestrator Runtime shall not add dependencies by interpreting task prose.

### PL-FR-015 — Explicit execution Need required

A semantic task requiring agent/tool execution shall have an explicit typed Need or equivalent schema-defined execution intent produced by an authorized reasoning role.

### PL-FR-016 — Orchestrator does not infer capability from task prose

The Orchestrator Runtime shall not map natural-language task descriptions directly to providers/capabilities.

Capability routing shall operate on typed Need fields through the registered capability policy.

### PL-FR-017 — PlanTask causal ownership

A task-linked Need may identify PlanTask as causal request owner so returned output can be attached to the task without automatically invoking Planner again.

### PL-FR-018 — Runtime-owned execution materialization

Once a typed Need is valid, the deterministic Orchestrator Runtime shall resolve capability/policy and materialize the required runtime dependency.

A Need requiring internal execution may materialize as a WorkItem. A Need requiring external authority/input may materialize as a PendingAction.

### PL-FR-019 — Task execution completion differs from acceptance

The runtime shall distinguish at least:

```text
WorkItem completed
PlanTask execution completed
AcceptanceCriterion satisfied
WorkflowRun converged
```

### PL-FR-020 — Task result does not imply criterion satisfaction

A produced implementation/evidence Artifact shall not automatically mark related acceptance criteria satisfied unless a current authorized CriterionAssessment/deterministic validation establishes that state under ADR-0021.

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

### PL-FR-023 — Runtime invalidates from explicit refs

The Orchestrator Runtime shall use declared artifact/task/criteria relationships and version lineage for stale-state propagation.

It shall not infer invalidation by reading semantic prose.

### PL-FR-024 — Plan change, requirements change, and clarification are distinct

The workflow shall distinguish at least:

```text
plan_change
requirements_change
clarification
```

### PL-FR-025 — Plan change preserves success definition

`plan_change` shall mean that Objective/AcceptanceCriteria remain active while strategy/decomposition changes.

### PL-FR-026 — Requirements change may alter success definition

`requirements_change` shall represent a proposed change to Objective or AcceptanceCriteria and shall follow applicable authority rules before activation.

### PL-FR-027 — Clarification obtains missing outside information

`clarification` shall represent missing semantic/contextual input required before planning/requirements interpretation can safely continue.

When external input is required, the Orchestrator shall materialize a PendingAction according to interaction policy rather than treating clarification as an execution retry.

### PL-FR-028 — User authorization for user-owned requirement changes

If a proposed criteria/objective revision would weaken, remove, or materially reinterpret User-owned constraints, the Orchestrator shall require explicit User authority unless policy provides a narrower deterministic rule.

### PL-FR-029 — Orchestrator does not judge semantic quality of revised requirements

The Orchestrator shall validate schema/provenance/authority/currentness only. Semantic adequacy belongs to Planner/Reviewer/User according to workflow policy.

### PL-FR-030 — Criteria revision invalidates dependents

When active acceptance criteria are superseded, dependent Plan/Implementation/Review/Assessment/Approval artifacts shall become stale or require re-evaluation according to explicit lineage rules.

### PL-FR-031 — Plan revision preserves unaffected work

When a Plan revision changes only a subset of tasks/assumptions/dependencies, unrelated compatible completed artifacts should remain reusable according to exact-input and lineage policy.

### PL-FR-032 — Planner may re-enter after workflow start

Planner shall be invokable when a later typed Need requires replanning, criteria revision proposal, semantic clarification, or plan/shared-view synthesis.

### PL-FR-033 — Planner is not a fixed phase gate

The Orchestrator shall not invoke Planner solely because a hard-coded phase number has been reached.

Invocation shall be triggered by initial profile policy or explicit typed semantic demand.

### PL-FR-034 — Planner clarification artifact

When User intent is materially ambiguous and cannot be resolved under deterministic policy, Planner/clarification capability shall produce a structured clarification request/question artifact.

### PL-FR-035 — Local Agent presents clarification safely

Local Agent may present/explain a persisted clarification PendingAction and carry an allowed response, but its hidden reasoning shall not directly mutate Objective/Criteria/Plan state.

### PL-FR-036 — Shared Plan view belongs to Planner semantics

Temporary PR `PLAN.md` content shall derive from a Planner-produced `PlanSharedView` or equivalent accepted semantic artifact.

The Orchestrator may validate/filter/order/render deterministically; Local Agent may inspect/explain but shall not become semantic plan authority.

### PL-FR-037 — Optional Roadmap view

For large workflows, Planner may produce a `RoadmapSharedView` that deterministic publication policy can expose.

### PL-FR-038 — Shared TODO items have semantic provenance

Task/blocker items displayed in `TODO.md` shall originate from typed structured items produced by authorized roles or explicit deterministic runtime status, rather than Local Agent prose synthesis.

### PL-FR-039 — Assumptions are first-class

Material Planner assumptions that affect downstream correctness shall have stable identity or explicit references sufficient for later evidence to contradict/supersede them.

### PL-FR-040 — Evidence may trigger replan without Orchestrator interpretation

When Research/Reviewer determines that evidence invalidates a planning assumption, that reasoning role shall emit the appropriate typed Need/contradiction reference.

The Orchestrator routes/invalidate mechanically from typed relationships.

### PL-FR-041 — Concurrency from declared dependencies

Independent executable task Needs may run concurrently when their declared dependencies, side-effect constraints, and resource policy permit.

The Orchestrator shall not serialize tasks merely because they appeared sequentially in Planner prose.

## 3. Object relationship

```text
Accepted Admission / User source
        |
        v
    Planner WorkItem
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
   WorkItem/PendingAction ...
```

Independent execution dependencies may proceed concurrently under runtime policy.

## 4. Requirements-change flow

```text
Reviewer
  -> Finding: acceptance definition ambiguous/incomplete
  -> Need(requirements_change)
  -> Orchestrator routes Planner WorkItem
  -> Planner proposes AC2 / Objective revision
  -> Orchestrator validates authority/currentness
  -> PendingAction(USER_AUTHORITY) if required
  -> activate AC2 only after valid authority
  -> deterministic lineage invalidation
  -> Planner replan if needed
```

## 5. Plan-change flow

```text
Reviewer
  -> Finding: current strategy is incomplete
  -> Need(plan_change)
  -> Orchestrator routes Planner WorkItem
  -> Plan P2 supersedes P1
  -> Orchestrator invalidates declared affected dependents
  -> typed task Needs become ready
  -> execution continues
```

## 6. Clarification flow

```text
Planner/Reviewer
  -> Need(clarification)
  -> Orchestrator materializes PendingAction if outside input required
  -> Local Agent presents question
  -> allowed response enters through interaction protocol
  -> Orchestrator persists/validates response
  -> Planner/Reviewer resumes under policy
```

## 7. Acceptance scenarios

### Scenario A — ordinary initial planning

1. Admission preserves accepted User source/provenance.
2. Startup profile policy creates Planner WorkItem.
3. Planner returns Objective, AcceptanceCriteria, Plan, optional shared views, and typed executable Needs.
4. Orchestrator validates schema/refs/authority.
5. Orchestrator routes ready typed Needs without interpreting task prose semantically.

### Scenario B — planner changes strategy only

1. Evidence invalidates assumption A3.
2. Reviewer/Planner produces `plan_change` Need with A3 reference.
3. Planner returns P2 superseding P1, changing T4/T5 only.
4. Orchestrator keeps unrelated completed evidence reusable according to lineage/input rules.
5. Orchestrator schedules new typed Needs for changed tasks.

### Scenario C — User criterion needs change

1. Reviewer finds explicit User constraint incompatible with requested outcome.
2. Reviewer emits `requirements_change` Need.
3. Planner proposes revision.
4. Orchestrator detects User-owned criterion provenance and creates User-authority interaction when required.
5. Without authorization, active criteria remain unchanged.

### Scenario D — WorkItem succeeds but criterion fails acceptance

1. Worker completes implementation WorkItem.
2. PlanTask records execution output.
3. Reviewer assesses implementation against AC7.
4. CriterionAssessment is `UNSATISFIED`.
5. Workflow creates repair/replan Need rather than marking workflow successful.

## 8. Non-goals

This module does not make Planner:

- the scheduler;
- the provider/account router;
- the Git writer;
- the workflow lifecycle authority;
- the owner of User authorization;
- the source of runtime retry/budget policy.

It does not make Local Agent the deterministic orchestrator.

Planner owns semantic interpretation/decomposition. Orchestrator Runtime owns deterministic coordination. Assessment/Reviewer/tests/User authority establish acceptance evidence. Worker owns authorized implementation/Git mutation.
