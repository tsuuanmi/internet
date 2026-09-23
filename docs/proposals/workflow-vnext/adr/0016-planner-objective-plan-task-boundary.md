# ADR-0016 — Separate Objective, Acceptance Criteria, Plan Tasks, Needs, and WorkItems

- **Status:** Proposed
- **Date:** 2026-09-16
- **Related:** ADR-0010, ADR-0011, ADR-0012, ADR-0015, ADR-0018, ADR-0021

## Context

With the **Orchestrator Runtime** explicitly deterministic and non-reasoning, while the **Local Agent** is a reasoning-capable workflow client, semantic planning needs a precise contract.

A common failure mode in agent workflows is collapsing these concepts into one planner response:

```text
user request
+ interpretation
+ acceptance criteria
+ implementation steps
+ execution order
+ agent selection
+ completion judgment
```

That makes replanning dangerous because changing the plan may also silently change the definition of success, and it forces the control plane to interpret planner prose in order to schedule work.

The workflow should preserve semantic intent, planning, execution demand, runtime authorization, and acceptance judgment as separate objects.

## Decision

The target semantic/control chain is:

```text
WorkflowAdmissionSpec / UserObjectiveInput
  -> Planner WorkItem
  -> ObjectiveArtifact
  -> AcceptanceCriteriaArtifact
  -> PlanArtifact
       -> PlanTask(s)
       -> Need(s) for executable semantic demand
  -> Orchestrator Runtime validates/routes
       -> WorkItem(s) or PendingAction(s)
```

These concepts are distinct and versioned independently.

## Source user intent

The exact User source and explicit User constraints are preserved through the admission protocol. Planner consumes the accepted admission/source representation; it does not depend on Local Agent hidden reasoning.

Conceptually:

```yaml
userObjectiveInputId: UO-1
rawText: ...
repository: tsuuanmi/internet
baseBranch: main
explicitConstraints:
  - do not modify source code
explicitAuthority:
  merge: user_only
```

The Local Agent may compile natural language into admission fields with provenance under ADR-0018. The deterministic Orchestrator persists/validates the accepted machine-readable source but does not semantically reinterpret it.

## ObjectiveArtifact

Planner produces a structured interpretation of what outcome the workflow is trying to achieve.

It references the original accepted source/admission and preserves explicit User-owned constraints by identity/provenance.

```yaml
objectiveId: O-1
source: UO-1
summary: Add a minimal Development section documenting test execution.
constraints:
  - ref: UO-1.constraint-1
```

The Objective is semantic meaning, not execution order.

## AcceptanceCriteriaArtifact

Acceptance criteria define what must be true for the work to be considered acceptable.

They are separate from the Plan.

```yaml
criteriaSetId: AC-1
objectiveRef: O-1
criteria:
  - id: AC-1.1
    text: README contains a Development section.
    origin: planner_derived
  - id: AC-1.2
    text: Source code is unchanged.
    origin: user
    sourceRef: UO-1.constraint-1
```

A normal Plan revision must not silently mutate acceptance criteria.

## Criteria authority

Acceptance criteria have provenance and authority.

At minimum:

```text
user
policy
planner_derived
```

Planner may add/refine planner-derived criteria when permitted, but shall not weaken, remove, or reinterpret user/policy-owned criteria without an explicit higher-authority revision path.

If later evidence indicates that user-owned requirements are ambiguous or inconsistent, Planner emits a typed `clarification` or `requirements_change` Need rather than silently rewriting them.

## PlanArtifact

A Plan describes the semantic strategy for satisfying a specific Objective and AcceptanceCriteria version.

It contains:

```text
plan identity/version
objective reference
acceptance-criteria reference
assumptions
semantic tasks
partial-order dependencies
important risks/unknowns
explicit plan-level shared view
```

A Plan does not contain runtime execution attempts, provider accounts, browser sessions, retries, leases, or graph-node identities.

## PlanTask

A PlanTask is a semantic unit of intended work.

```yaml
taskId: T-12
title: Verify the repository test command
dependsOn: [T-3]
completionCriteriaRefs: [AC-1.3]
```

PlanTask is not WorkItem.

PlanTask lifecycle describes semantic planning state, while WorkItem lifecycle describes authorized runtime execution.

## Hierarchy and partial order

Planner may decompose work hierarchically and declare only necessary semantic ordering.

```text
T1 Implement feature
  T1.1 Research current behavior
  T1.2 Modify implementation
  T1.3 Validate behavior

T1.1 -> T1.2 -> T1.3
```

Independent tasks remain unordered so the Orchestrator can expose concurrency when their typed Needs become executable.

The Orchestrator does not invent dependencies by interpreting task prose.

## Executable semantic demand

The Orchestrator shall not inspect a PlanTask description and infer which agent/capability should run.

When a task requires execution, Planner or another authorized reasoning role emits a typed Need linked to that task.

```yaml
needId: N-22
ownerRef: planTask:T-12
needType: repository_evidence
question: What command does this repository currently use to run tests?
```

The deterministic Orchestrator validates the Need and resolves it through the capability/policy registry.

```text
PlanTask T-12
  -> Need N-22
  -> capability repository_research
  -> WorkItem W-31
```

If the typed Need instead requires outside authority/input, the Orchestrator may materialize a `PendingAction` rather than a WorkItem.

This preserves:

```text
Planner owns semantic decomposition.
Orchestrator Runtime owns deterministic execution materialization.
Local Agent remains the reasoning client/operator at the workflow API boundary.
```

## PlanTask result ownership

A Need emitted for a PlanTask may use the PlanTask as causal request owner.

A result can therefore return to the task record without requiring Planner to be invoked after every execution.

```text
T-12
 -> N-22
 -> W-31
 -> Evidence E-44
 -> T-12 execution result
```

This only records that the requested work produced an output. It does not imply that acceptance criteria are satisfied.

CriterionAssessment/Reviewer/deterministic validation remains responsible for acceptance evidence under ADR-0021.

## Task completion versus acceptance

The workflow shall distinguish:

```text
WorkItem completed
PlanTask execution completed
AcceptanceCriterion satisfied
WorkflowRun converged
```

These are not synonyms.

## Replanning

Planner may emit a `PlanRevisionArtifact` when assumptions, decomposition, or strategy change.

A revision must state:

```text
superseded Plan version
reason
added tasks
removed/superseded tasks
changed dependencies
changed assumptions
explicit affected references
```

The Orchestrator uses these explicit relationships for deterministic invalidation. It does not infer impact from prose.

## Replanning does not equal requirements change

Distinct Need classes include:

```text
plan_change
requirements_change
clarification
```

`plan_change` means the desired outcome and active acceptance criteria remain the same while strategy/decomposition changes.

`requirements_change` means Objective or AcceptanceCriteria may need revision.

`clarification` requests external/contextual information required before semantic interpretation can safely continue.

These paths have different authority consequences.

## Requirements revision

Planner may propose an Objective/AcceptanceCriteria revision, but the **Orchestrator Runtime** activates it only when deterministic authority policy permits.

For planner-derived criteria, policy may allow direct supersession.

For user-owned criteria, revision normally requires explicit User authorization through the external-interaction protocol.

```text
Reviewer
 -> Need(requirements_change)
 -> Planner WorkItem
 -> ProposedCriteriaRevision
 -> Orchestrator authority check
 -> PendingAction(USER_AUTHORITY) if required
 -> activate AC-v2 only after valid response
```

The Orchestrator performs only schema/provenance/authority/state transitions. It does not decide whether revised wording is semantically better.

## Invalidation semantics

A Plan revision should invalidate only downstream work that explicitly consumed affected plan inputs.

A Criteria revision is broader: any Plan, implementation, review, assessment, or approval that consumed changed criteria becomes stale according to lineage policy.

```text
AC1 -> AC2
  => dependent Plan/Implementation/Review/Assessment may become stale

P4 -> P5 with only T-18 changed
  => unrelated T-2 research may remain reusable
```

## Shared `PLAN.md`

The PR workspace `PLAN.md` is rendered from a Planner-produced shared view, not synthesized by Local Agent or Orchestrator.

```yaml
type: PlanSharedView
planRef: P5
content: |
  Objective: ...
  Acceptance criteria: ...
  Current approach: ...
  Major tasks: ...
```

The Orchestrator validates active version/provenance and deterministic publication policy before authorizing Worker publication.

## Planner re-entry

Planner is demand-driven, not only a startup phase.

Planner may be invoked for:

```text
initial objective interpretation
initial acceptance-criteria derivation
initial planning
plan revision
requirements/criteria revision proposal
semantic clarification question generation
roadmap/shared-plan synthesis
```

The Orchestrator does not invoke Planner merely because a fixed phase number was reached. It routes Planner when startup profile policy or an explicit typed Planning/Requirements Need requires it.

## Consequences

### Positive

- replanning cannot silently redefine success;
- deterministic control never needs to interpret Plan prose to select execution;
- semantic task hierarchy remains independent of provider/runtime topology;
- partial-order plans allow safe concurrency without over-serializing work;
- user-owned requirements retain explicit authority;
- plan revisions can invalidate only affected descendants rather than restarting the workflow;
- Planner can re-enter cleanly when later evidence changes strategy.

### Costs

- more explicit artifact types/versions are required;
- executable PlanTasks need linked Needs rather than implicit prose;
- requirements-change, clarification, and plan-change paths must be distinguished;
- Planner output schemas become more structured.

## Invariants

> Objective, acceptance criteria, Plan, PlanTask, Need, WorkItem, and PendingAction are distinct objects with distinct authority/lifecycle semantics.

> Acceptance criteria define success and are not silently rewritten by ordinary replanning.

> The deterministic Orchestrator never infers executable capability or dependency structure from Plan prose.

> A PlanTask becomes executable only through explicit typed semantic demand produced by an authorized reasoning role.

> User/policy-owned criteria cannot be weakened by Planner without the required authority transition.

> Replanning changes strategy; requirements revision changes the definition of success; clarification obtains missing outside information. The workflow treats these as different operations.

> Local Agent is the reasoning workflow client/operator, not the owner of WorkItem materialization, invalidation, scheduling, or criterion state.
