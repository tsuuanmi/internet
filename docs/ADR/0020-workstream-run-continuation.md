# ADR-0020 — Separate Workstream Continuity from WorkflowRun Lifecycle

- **Status:** Proposed
- **Date:** 2026-09-16
- **Related:** ADR-0018, ADR-0019, ADR-0021, `WORKFLOW-VNEXT-USE-CASES.md`

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

The continuation binds explicit source references such as:

```text
continuesFromWorkflowRun
selected sourceArtifactRefs/source hashes
sourceWorkstream
new User source/admission
```

This preserves historical correctness and makes the semantic transition auditable.

## In-run feedback is different from continuation

A non-terminal run may wait for User validation or feedback and then resume the same run.

```text
implementation/review
 -> DeliveryCheckpoint at exact PR head H7
 -> PendingAction(user validation / merge / feedback)
 -> User feedback
 -> same run resumes
 -> H8 implementation
 -> fresh assessment/review
```

Thus:

> feedback to an active/waiting run resumes that run; follow-up work after terminal completion creates a continuation run.

## DeliveryArtifact / DeliveryCheckpoint

Producing a usable artifact does not imply terminal workflow completion.

A DeliveryArtifact/checkpoint identifies at least:

```text
deliverable type
artifact references
exact version/head/identity
instructions for User evaluation where relevant
criteria/assessment state references
createdAt
supersedes prior delivery checkpoint when applicable
```

A newer implementation head supersedes an older exact-head software delivery checkpoint and stales dependent assessments/authority according to ADR-0021.

## User feedback

User feedback enters through the Local Agent/workflow interaction protocol with explicit provenance and target binding.

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
informational/no-change
```

Typed results then drive deterministic invalidation/routing.

## Cross-run artifact reuse and retention safety

A continuation WorkflowRun may consume correctness-bearing content produced by a completed source run, but it must not become operationally dependent on source-run files being retained forever.

The architecture therefore distinguishes **historical source ownership** from **child-run durable possession**.

```text
Source Artifact
  owned by producing WorkflowRun
  immutable/superseding history

Imported Artifact / ImportedArtifactSnapshot
  owned/persisted by receiving child WorkflowRun
  exact content/schema snapshot required by the child
  lineage points to sourceRunId/sourceArtifactId/sourceHash
```

For the initial production implementation, correctness-bearing source artifacts selected for continuation shall be imported/copied into child-owned durable storage before child activation/execution depends on them.

Conceptually:

```text
ResearchRun R1
  Report RP1 hash=H1
  Evidence E1 hash=H2

SoftwareRun R2
  ImportedReport IR1
    contentHash=H1
    sourceRunId=R1
    sourceArtifactId=RP1
    sourceHash=H1

  ImportedEvidence IE1
    contentHash=H2
    sourceRunId=R1
    sourceArtifactId=E1
    sourceHash=H2
```

The original artifacts remain historically owned by R1. The imported child copies do not rewrite that ownership or history; they create an exact retention-safe dependency in R2.

This avoids global cross-run reference-counted garbage collection for the first implementation while permitting R1 to become retention-eligible later without breaking R2 reproducibility.

Artifact import/reuse remains subject to schema compatibility, freshness, sensitivity, access, and receiving-profile policy.

## Research-to-implementation transition

A research report is not automatically an implementation plan.

The continuation software run invokes Planner to translate the new User request plus imported research artifacts into software-specific:

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

When target resolution is unambiguous, it submits explicit typed target references through the workflow protocol.

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
- supports PR delivery/User testing loops without falsely completing the software run;
- makes later follow-ups auditable rather than mutating old history;
- child runs remain reproducible after parent retention cleanup.

### Costs

- runtime/client needs Workstream plus WorkflowRun identity;
- Local Agent needs safe natural-language target resolution;
- continuation needs explicit artifact import policy and additional storage;
- duplicated immutable snapshots may use more disk than global reference counting, intentionally trading storage for simpler correctness initially;
- status UI must distinguish current run state from broader workstream history.

## Invariants

> Workstream is long-lived project continuity; WorkflowRun is one bounded admitted execution lifecycle.

> A terminal WorkflowRun is never reopened merely because the User asks for new follow-up work.

> User feedback to a non-terminal waiting/active WorkflowRun may resume the same run through typed external input.

> Producing a report, PR, or other usable DeliveryArtifact does not by itself imply WorkflowRun completion.

> Cross-run continuation preserves source ownership/lineage while importing exact correctness-bearing snapshots into child-owned durable state so parent retention cannot silently break child reproducibility.

> Completed-run semantic history is never silently rewritten.

> The Orchestrator operates on typed Workstream/WorkflowRun/artifact references and does not interpret conversational referents or feedback prose semantically.
