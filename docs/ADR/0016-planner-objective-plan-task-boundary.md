# ADR-0016 — Separate Objective, Acceptance Criteria, Plan Tasks, Needs, and WorkItems

- **Status:** Proposed
- **Date:** 2026-09-16
- **Related:** ADR-0010, ADR-0011, ADR-0012, ADR-0015

## Context

With Local/Orchestrator explicitly deterministic and non-reasoning, semantic planning must have a precise contract.

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

That makes replanning dangerous because changing the plan may also silently change the definition of success, and it forces Local to interpret planner prose in order to schedule work.

Classical planning separates desired goal state from executable actions with preconditions/effects. Hierarchical Task Network planning similarly treats planning as decomposition into tasks rather than equating the semantic task hierarchy with runtime execution mechanics.

The workflow should preserve that separation.

## Decision

The target semantic/control chain is:

```text
UserObjectiveInput
  -> ObjectiveArtifact
  -> AcceptanceCriteriaArtifact
  -> PlanArtifact
       -> PlanTask(s)
       -> NeedArtifact(s) for executable semantic demand
  -> Local materializes WorkItem(s)
```

These concepts are distinct and versioned independently.

## UserObjectiveInput

The original user request and explicit user constraints are persisted as user-owned input.

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

Local records this input but does not semantically interpret it.

## ObjectiveArtifact

Planner produces a structured interpretation of what outcome the workflow is trying to achieve.

It references the original `UserObjectiveInput` and must preserve user-owned constraints.

Example:

```yaml
objectiveId: O-1
source: UO-1
summary: Add a minimal Development section documenting test execution.
constraints:
  - ref: UO-1.constraint-1
```

The Objective is semantic meaning, not execution order.

## AcceptanceCriteriaArtifact

Acceptance criteria define **what must be true for the work to be considered acceptable**.

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

If later evidence indicates that user-owned requirements are ambiguous or inconsistent, Planner emits a typed clarification/requirements-change Need rather than silently rewriting them.

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

Example:

```yaml
taskId: T-12
title: Verify the repository test command
dependsOn: [T-3]
completionCriteriaRefs: [AC-1.3]
```

PlanTask is **not** WorkItem.

PlanTask lifecycle describes semantic planning state, while WorkItem lifecycle describes authorized execution.

## Hierarchy and partial order

Planner may decompose work hierarchically:

```text
T1 Implement feature
  T1.1 Research current behavior
  T1.2 Modify implementation
  T1.3 Validate behavior
```

Only necessary ordering constraints should be declared.

```text
T1.1 -> T1.2
T1.2 -> T1.3
```

Independent tasks remain unordered so Local can deterministically expose concurrency when execution Needs are ready.

Local does not invent dependencies from task prose.

## Executable semantic demand

Local shall not inspect a PlanTask description and infer which agent/capability should run.

When a task requires execution, Planner or another authorized reasoning role emits a typed Need linked to that task.

Example:

```yaml
needId: N-22
ownerRef: planTask:T-12
needType: repository_evidence
question: What command does this repository currently use to run tests?
```

Local then resolves the Need through the capability registry and materializes the WorkItem.

```text
PlanTask T-12
  -> Need N-22
  -> capability repository_research
  -> WorkItem W-31
```

This preserves:

```text
Planner owns semantic decomposition.
Local owns deterministic execution materialization.
```

## PlanTask result ownership

A Need emitted for a PlanTask may use the PlanTask as causal request owner.

A result can therefore return to the task record without requiring Planner to be invoked after every execution.

Example:

```text
T-12
 -> N-22
 -> W-31
 -> Evidence E-44
 -> T-12 execution result
```

This only records that the requested work produced an output. It does not imply that acceptance criteria are satisfied.

Reviewer and deterministic validations remain responsible for acceptance judgments.

## Task completion versus acceptance

The workflow shall distinguish:

```text
WorkItem completed
PlanTask execution completed
AcceptanceCriterion satisfied
Workflow converged
```

These are not synonyms.

For example, Worker can successfully produce a patch, making the implementation WorkItem complete, while Reviewer later determines the relevant criterion is unsatisfied.

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

Example:

```yaml
planRevisionId: P5
supersedes: P4
affected:
  tasks: [T-12, T-18]
  assumptions: [A-3]
```

Local uses these explicit relationships for invalidation. Local does not infer impact from prose.

## Replanning does not equal requirements change

Two distinct Need classes should be supported:

```text
plan_change
requirements_change / clarification
```

`plan_change` means:

> The desired outcome remains the same, but the strategy/decomposition must change.

`requirements_change` means:

> The objective or acceptance criteria themselves may need revision.

These paths have different authority consequences.

A Reviewer that discovers a missing implementation step should request `plan_change`.

A Reviewer that discovers the current success definition is ambiguous/incomplete should request `requirements_change` or clarification.

## Requirements revision

Planner may propose an Objective/AcceptanceCriteria revision, but Local only activates it when authority policy permits.

For planner-derived criteria, policy may allow direct supersession.

For user-owned criteria, revision normally requires explicit user authorization.

```text
Reviewer
 -> Need(requirements_change)
 -> Planner
 -> ProposedCriteriaRevision
 -> Local authority check
 -> User approval if required
 -> activate AC-v2
```

Local performs only the authority/state transition. It does not decide whether the revised wording is semantically better.

## Invalidation semantics

A Plan revision should invalidate only downstream work that explicitly consumed affected plan inputs.

A Criteria revision is broader: any Plan, implementation, review, or approval that consumed changed criteria becomes stale according to lineage policy.

Conceptually:

```text
AC1 -> AC2
  => dependent Plan/Implementation/Review may become stale

P4 -> P5 with only T-18 changed
  => unrelated T-2 research may remain reusable
```

## Shared `PLAN.md`

The PR workspace `PLAN.md` is rendered from a Planner-produced shared view, not synthesized by Local.

Example:

```yaml
type: PlanSharedView
planRef: P5
content: |
  Objective: ...
  Acceptance criteria: ...
  Current approach: ...
  Major tasks: ...
```

Local validates that the view belongs to the active Plan, then deterministic publication policy may include it in the desired workspace state.

## Planner re-entry

Planner is demand-driven, not necessarily only a startup phase.

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

Local does not invoke Planner simply because a fixed phase number was reached. It invokes Planner when deterministic policy sees an explicit Planning/Requirements Need.

## Consequences

### Positive

- replanning cannot silently redefine success;
- Local never needs to interpret Plan prose to select execution;
- semantic task hierarchy remains independent of provider/runtime topology;
- partial-order plans allow safe concurrency without over-serializing work;
- user-owned requirements retain explicit authority;
- plan revisions can invalidate only affected descendants rather than restarting the workflow;
- Planner can re-enter cleanly when later evidence changes strategy.

### Costs

- more explicit artifact types/versions are required;
- executable PlanTasks need linked Needs rather than relying on implicit prose;
- requirements-change and plan-change paths must be distinguished;
- Planner output schemas become more structured.

## Invariants

> Objective, acceptance criteria, Plan, PlanTask, Need, and WorkItem are distinct objects with distinct authority/lifecycle semantics.

> Acceptance criteria define success and are not silently rewritten by ordinary replanning.

> Local never infers executable capability or dependency structure from Plan prose.

> A PlanTask becomes executable only through an explicit typed Need or equivalent schema-defined execution intent produced by an authorized reasoning role.

> User/policy-owned criteria cannot be weakened by Planner without the required authority transition.

> Replanning changes strategy; requirements revision changes the definition of success, and the workflow treats those as different operations.
