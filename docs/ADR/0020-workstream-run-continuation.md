# ADR-0020 — Separate Workstream Continuity from WorkflowRun Lifecycle

- **Status:** Proposed
- **Date:** 2026-09-16
- **Related:** ADR-0018, ADR-0019, `WORKFLOW-VNEXT-USE-CASES.md`

## Context

The target product experience is conversational and continuous, but the runtime needs clean bounded lifecycle semantics.

Two common journeys expose the distinction:

1. a software run may produce a reviewed PR, wait for User local testing/feedback, revise the same PR, and eventually merge;
2. a research run may complete with a durable report, after which the User asks to implement that report as software.

Treating every follow-up as either a brand-new unrelated workflow or reopening terminal workflow state creates problems:

- cross-stage artifact lineage becomes implicit;
- terminal-state semantics become ambiguous;
- profile/version/budget boundaries blur;
- a completed research objective could be mutated retrospectively by later implementation work;
- User experience fragments into unrelated jobs despite one continuous project.

## Decision

The architecture distinguishes **Workstream** from **WorkflowRun**.

```text
Workstream
  long-lived User/project continuity container

  +-- WorkflowRun R1: research idea
  |     +-- ReportArtifact
  |
  +-- WorkflowRun R2: implement selected approach
  |     +-- PullRequestArtifact / DeliveryArtifact
  |
  +-- WorkflowRun R3: optional later follow-up
```

A Workstream provides continuity, grouping, navigation, and cross-run lineage. It is not a replacement for each WorkflowRun's durable state machine.

A WorkflowRun is one admitted objective with exact admission identity, profile, policy/version bindings, lifecycle, artifacts, budgets, interactions, and convergence state.

## WorkflowRun lifecycle integrity

Terminal runs remain terminal.

A User follow-up after terminal completion creates a new continuation WorkflowRun rather than changing `COMPLETED -> RUNNING` on the old run.

The continuation binds explicit parent/source references such as:

```text
continuesFromWorkflowRun
inputArtifactRefs
sourceWorkstream
new User source/admission
```

This preserves historical correctness and makes the semantic transition auditable.

## In-run feedback is different from continuation

A non-terminal run may wait for User validation or feedback and then resume the **same run**.

Example software lifecycle:

```text
implementation/review
 -> DeliveryCheckpoint at exact PR head H7
 -> PendingAction(user validation / merge / feedback)
 -> User feedback
 -> same run resumes
 -> H8 implementation
 -> fresh review
```

This is not a new continuation because the original admitted software objective has not yet converged/terminated.

Thus:

> feedback to an active/waiting run resumes that run; follow-up work after terminal completion creates a continuation run.

## DeliveryArtifact / DeliveryCheckpoint

Producing a usable artifact does not imply terminal workflow completion.

The runtime may persist a `DeliveryArtifact` or equivalent checkpoint that identifies:

```text
deliverable type
artifact references
exact version/head/identity
instructions for User evaluation where relevant
criteria/review state references
createdAt
supersedes prior delivery checkpoint when applicable
```

Examples:

```text
reviewed PR ready for local test
research draft ready for User review
report candidate awaiting feedback
built dataset/model package awaiting acceptance
```

A newer implementation head supersedes an older exact-head software delivery checkpoint.

## User feedback

User feedback enters through the Local Agent/workflow interaction protocol with explicit provenance and target binding.

Conceptually:

```text
UserFeedbackInput
  rawSource
  provenance=user_explicit
  target:
    workflowRun
    deliveryArtifact/head when known
  attachment/artifact refs
```

The deterministic Orchestrator does not semantically interpret feedback. Planner/Reviewer or other appropriate reasoning capabilities determine whether it implies:

```text
new evidence
Finding
requirements_change
plan_change
implementation_change
no change / informational input
```

Typed results then drive deterministic invalidation/routing.

## Cross-run artifact reuse

A continuation WorkflowRun may consume artifacts from completed runs through explicit references.

Example:

```text
ResearchRun R1
  Report RP1
  Evidence E1,E2,E3

SoftwareRun R2
  admission.continuesFrom = R1
  semantic inputs = RP1 + selected E*
```

Artifacts remain owned by their producing run. The continuation records consumption/derivation lineage rather than copying semantic authority invisibly.

Artifact reuse remains subject to compatibility/freshness/profile policy.

## Research-to-implementation transition

A research report is not automatically an implementation plan.

The continuation software run normally invokes Planner to translate the accepted research outcome into software-specific:

```text
Objective
AcceptanceCriteria
Plan
Need(s)
```

The Orchestrator only validates/routes typed state and never performs this semantic translation itself.

## Workstream identity and selection

Local Agent should normally hide Workstream/WorkflowRun IDs from the User.

It may resolve natural-language references such as:

```text
"the PR I tested yesterday"
"the research about X"
"implement that report"
"continue the feature work"
```

When target resolution is unambiguous, it issues the corresponding Query/Update/Signal/Respond call.

When multiple plausible active/terminal runs exist and choosing incorrectly would materially affect state, Local Agent asks the User or uses an explicit confirmation flow.

The Orchestrator itself resolves only typed IDs/references; it does not interpret conversational referents.

## Workstream completion

Workstream does not require one universal runtime lifecycle equivalent to WorkflowRun.

Initially it can be a durable grouping/index object with metadata such as:

```text
workstreamId
User-facing title/summary
workflowRunRefs
latest significant artifacts
createdAt/updatedAt
optional status projection
```

A Workstream may remain available for future continuation long after all current runs are terminal.

## Consequences

### Positive

- preserves clean terminal-state semantics;
- gives User one continuous project experience across research and implementation;
- supports explicit cross-run artifact provenance;
- keeps profile/version/budget boundaries per run;
- supports PR delivery/user testing loops without falsely completing the software run;
- makes later follow-ups auditable rather than mutating old history.

### Costs

- runtime/client needs Workstream plus WorkflowRun identity;
- Local Agent needs safe natural-language target resolution;
- cross-run artifact import/reuse policy must be explicit;
- status UI must distinguish current run state from broader workstream history.

## Invariants

> Workstream is long-lived project continuity; WorkflowRun is one bounded admitted execution lifecycle.

> A terminal WorkflowRun is never reopened merely because the User asks for new follow-up work.

> User feedback to a non-terminal waiting/active WorkflowRun may resume the same run through typed external input.

> Producing a report, PR, or other usable DeliveryArtifact does not by itself imply WorkflowRun completion.

> Cross-run continuation uses explicit artifact/run lineage; completed-run semantic history is never silently rewritten.

> The Orchestrator operates on typed Workstream/WorkflowRun/artifact references and does not interpret conversational referents or feedback prose semantically.
