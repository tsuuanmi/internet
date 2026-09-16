# Internet Runtime Documentation

- **Status:** current as-built documentation with explicitly separated vNext proposals
- **Last synchronized:** 2026-09-16
- **Baseline:** durable workflow graph orchestration, node-level recovery, provider progress leases, and provider-agnostic team routing

This directory documents both the current `@tsuuanmi/internet` runtime and explicitly separated vNext design work. Current code and the as-built contracts remain authoritative until corresponding vNext behavior is implemented, tested, and promoted.

## Documentation authority and precedence

```text
1. As-built contract
   = implemented behavior on main

2. Proposed design contract
   = target requirements/decisions not yet implemented

3. Research notes
   = external evidence/candidate ideas, non-normative
```

Production precedence:

```text
current code + as-built contract
  > proposed vNext documents
  > research notes
```

Proposed-vNext precedence:

```text
narrow Proposed ADR
  > specialized SRS-VNEXT module
  > SRS-VNEXT core requirement summary
  > WORKFLOW-VNEXT architecture narrative
  > WORKFLOW-VNEXT-RESEARCH candidate notes
```

## Current as-built runtime

The current architecture already separates the user-facing Local Agent from deterministic workflow state:

```text
User
  <-> Local Agent
        workflow client / authority broker
        |
        | /workflow / internet_workflow
        v
      WorkflowEngine + driver/runtime
        deterministic durable orchestration
```

The separate `chatgpt-writer` account remains the sole workflow repository-mutation authority in the current implementation.

Current operator commands include:

```text
/workflow <objective>
/workflow list
/workflow status [jobId]
/workflow watch [jobId]
/workflow stop [jobId]
/workflow continue [jobId]
/workflow delete <jobId>
```

## Start here

### Current as-built runtime

- [`internet-team-architecture.md`](./internet-team-architecture.md) — concise architecture and authority/data/control boundaries.
- [`how-it-works.md`](./how-it-works.md) — current server-side implementation and runtime behavior.
- [`WORKFLOW.md`](./WORKFLOW.md) — current user-visible workflow behavior and control surface.
- [`WORKFLOW-ENGINE.md`](./WORKFLOW-ENGINE.md) — current deterministic workflow runtime, receipts, health, and merge gates.
- [`WORKFLOW-GRAPH-ORCHESTRATION.md`](./WORKFLOW-GRAPH-ORCHESTRATION.md) — current durable graph scheduler, recovery/reconciliation, observability, and human-action boundaries.
- [`WORKFLOW-HARDENING.md`](./WORKFLOW-HARDENING.md) — workflow-team hardening history.
- [`AGENT-TEAM-DESIGN.md`](./AGENT-TEAM-DESIGN.md) — provider-agnostic team contract.
- [`WORKFLOW-OPERATOR-CONTRACT.md`](./WORKFLOW-OPERATOR-CONTRACT.md) — current operator semantics.
- [`SRS.md`](./SRS.md) — current implemented normative workflow requirements.
- [`ROADMAP.md`](./ROADMAP.md) — completed roadmap and deferred directions.
- [`TODO.md`](./TODO.md) — current closure/deferred-work boundary.
- [`UPDATE.md`](./UPDATE.md) — historical implementation delta.

### Workflow vNext proposed design

The vNext north star is broader than coding automation. It targets a **domain-agnostic durable workflow runtime** that is:

```text
efficient
deterministic at the control plane
artifact-based
recoverable
capability-driven
autonomous by default
interruptible only by explicit external dependencies/authority
accessible through natural language via a reasoning Local Agent
```

Software engineering, deep research, monitoring, report/document generation, and future task classes are intended to become workflow profiles/capability compositions above the same generic kernel.

These are production-oriented proposals, not implemented behavior:

- [`WORKFLOW-VNEXT.md`](./WORKFLOW-VNEXT.md) — target domain-agnostic adaptive artifact-based architecture.
- [`WORKFLOW-VNEXT-USE-CASES.md`](./WORKFLOW-VNEXT-USE-CASES.md) — concrete end-to-end product journeys: feature-to-PR/user-feedback/merge and research-to-report-to-implementation continuation.
- [`SRS-VNEXT.md`](./SRS-VNEXT.md) — harmonized core umbrella vNext requirements.
- [`SRS-VNEXT-ADMISSION.md`](./SRS-VNEXT-ADMISSION.md) — natural-language to machine-readable admission requirements.
- [`SRS-VNEXT-KERNEL.md`](./SRS-VNEXT-KERNEL.md) — domain-agnostic durable kernel requirements.
- [`SRS-VNEXT-ORCHESTRATOR.md`](./SRS-VNEXT-ORCHESTRATOR.md) — Local Agent client versus deterministic Orchestrator boundary.
- [`SRS-VNEXT-PLANNER.md`](./SRS-VNEXT-PLANNER.md) — User Objective / Acceptance Criteria / Plan / PlanTask / Need / WorkItem lifecycle.
- [`SRS-VNEXT-INTERACTION.md`](./SRS-VNEXT-INTERACTION.md) — autonomous-by-default workflow plus durable User/Local-Agent external interaction.
- [`SRS-VNEXT-CONVERGENCE.md`](./SRS-VNEXT-CONVERGENCE.md) — criterion-scoped assessment and deterministic profile convergence.
- [`SRS-VNEXT-CONTINUATION.md`](./SRS-VNEXT-CONTINUATION.md) — Workstream/WorkflowRun continuity, User feedback, delivery checkpoints, and retention-safe cross-run artifact lineage.
- [`SRS-VNEXT-PR-WORKSPACE.md`](./SRS-VNEXT-PR-WORKSPACE.md) — curated temporary PR collaboration memory for the software-engineering profile.
- [`SRS-VNEXT-GIT-MUTATION.md`](./SRS-VNEXT-GIT-MUTATION.md) — expected-head scoped Git mutation/reconciliation for the software-engineering profile.

Proposed ADRs:

- [`ADR/0009-typed-artifact-agent-protocol.md`](./ADR/0009-typed-artifact-agent-protocol.md)
- [`ADR/0010-adaptive-feedback-routing.md`](./ADR/0010-adaptive-feedback-routing.md)
- [`ADR/0011-workitems-and-capability-routing.md`](./ADR/0011-workitems-and-capability-routing.md)
- [`ADR/0012-input-bundles-and-context-projection.md`](./ADR/0012-input-bundles-and-context-projection.md)
- [`ADR/0013-pr-workspace-projection.md`](./ADR/0013-pr-workspace-projection.md)
- [`ADR/0014-reconciled-git-mutation-protocol.md`](./ADR/0014-reconciled-git-mutation-protocol.md)
- [`ADR/0015-deterministic-local-orchestrator.md`](./ADR/0015-deterministic-local-orchestrator.md)
- [`ADR/0016-planner-objective-plan-task-boundary.md`](./ADR/0016-planner-objective-plan-task-boundary.md)
- [`ADR/0017-autonomous-external-interaction.md`](./ADR/0017-autonomous-external-interaction.md)
- [`ADR/0018-workflow-admission-protocol.md`](./ADR/0018-workflow-admission-protocol.md)
- [`ADR/0019-domain-agnostic-durable-workflow-kernel.md`](./ADR/0019-domain-agnostic-durable-workflow-kernel.md)
- [`ADR/0020-workstream-run-continuation.md`](./ADR/0020-workstream-run-continuation.md)
- [`ADR/0021-criterion-assessment-and-convergence.md`](./ADR/0021-criterion-assessment-and-convergence.md)

### Product interaction model

The intended product experience is natural language first:

```text
User natural language
        ^
        |
        v
Local Agent
  reasoning workflow client
  - Intake Compiler
  - Operator Interface
        |
        | typed workflow protocol
        v
WorkflowService / API boundary
        |
        v
Deterministic Orchestrator Runtime
        |
        v
Capabilities / durable workflow state
```

The User should not need to know `/workflow status`, `/workflow continue`, or other internal commands in normal use. The Local Agent queries/updates the workflow tool and explains authoritative machine state conversationally. Slash commands remain useful as explicit CLI/debug/operator shortcuts.

### Workflow admission protocol

Natural-language requests do not become authoritative workflow state directly.

```text
User source
  -> Local Agent compiles WorkflowAdmissionDraft
  -> deterministic Orchestrator preflight
  -> durable AdmissionPreview / confirmation when required
  -> AUTO_SUBMIT / LOCAL_CONFIRM / USER_CONFIRM
  -> exact accepted AdmissionSpec/hash
  -> workflow activation
  -> Planner/semantic execution
```

The system preserves the distinction between:

```text
what the User explicitly said
what the Local Agent inferred
what policy defaulted
what the User confirmed
what Planner later derived
```

A schema-valid request is not automatically semantically aligned. The Orchestrator validates structure/policy; semantic alignment is handled by Local Agent/User interaction according to confirmation policy.

### Workstream and continuation lifecycle

The product experience may span several bounded WorkflowRuns under one long-lived Workstream.

```text
Workstream: Feature / Idea X

  ResearchRun R1
    -> ReportArtifact

  SoftwareRun R2
    -> PR DeliveryArtifact
    -> User local test / feedback
    -> revised DeliveryArtifact
    -> merge
```

Key rule:

```text
feedback to a non-terminal active/waiting run
  -> resume the same run

follow-up after terminal completion
  -> create a continuation WorkflowRun with explicit lineage
```

A reviewed PR, report candidate, dataset, or other usable result may be delivered before the run is terminal. `Artifact delivered != WorkflowRun completed`.

Cross-run continuation preserves source ownership and imports exact correctness-bearing child snapshots with source run/artifact/hash lineage before depending on source payloads that may later be retention-cleaned.

### Latest vNext authority model

```text
User
  = ultimate human authority for reserved decisions

Local Agent
  = reasoning-capable workflow client/operator
  = compiles natural language into typed admission/input messages
  = queries status and presents workflow state naturally
  = resolves conversational references to exact typed targets before mutation
  = may reason, but hidden reasoning is not durable workflow authority

WorkflowService / API
  = caller authorization + typed request dispatch boundary

Orchestrator Runtime
  = deterministic control plane
  = validation / persistence / Need materialization / routing
  = scheduling / fencing / reconciliation / invalidation / gates
  = assessment freshness + profile convergence evaluation
  = no model reasoning for authoritative state transitions

Capabilities / specialist agents
  = bounded semantic/reasoning execution
  = Planner / Research / Worker / Reviewer are useful logical roles, not mandatory universal kernel roles
```

Only explicit validated tool/API inputs may move information/authority from User or Local Agent into durable workflow state.

### Domain-agnostic kernel

The generic kernel should understand control-plane objects such as:

```text
Workstream
WorkflowRun
WorkflowAdmissionSpec
Objective
Constraint
Criterion
Plan
Finding
Need
WorkItem
InputBundle
Artifact
DeliveryArtifact
Assessment
Receipt
PendingAction
Timer
ExternalEvent
Budget
AuthorityPolicy
ConvergencePolicy
```

A typed Need may materialize as:

```text
WorkItem       -> internal executable capability
PendingAction  -> external input/authority
```

Long-running dependencies may additionally wait on:

```text
Timer          -> durable time-based wakeup
ExternalEvent  -> webhook/signal/observed condition
```

The scheduler works over durable dependencies and typed state, not coding-specific concepts.

### Autonomous external interaction

vNext targets autonomous execution by default:

```text
ready autonomous work exists
  -> Orchestrator continues it

external input/authority required for one dependency
  -> durable PendingAction
  -> only dependent path waits
  -> unrelated ready work continues

no autonomous work remains + blocking PendingAction exists
  -> WAITING_EXTERNAL
```

A `PendingAction` is distinct from a WorkItem. It may require:

```text
USER_AUTHORITY
LOCAL_AGENT_INPUT
USER_OR_LOCAL
```

Target external-interaction surface conceptually includes:

```text
Query   -> read authoritative state
Update  -> validated tracked mutation
Signal  -> asynchronous external/user input
Respond -> resolve one persisted PendingAction
```

Resolving a PendingAction automatically re-evaluates readiness; `continue` remains an operator recovery command rather than semantic-response protocol.

### Planner semantics

```text
User/Admission source
  -> ObjectiveArtifact
  -> AcceptanceCriteriaArtifact
  -> PlanArtifact / PlanTask
  -> Need
  -> Orchestrator materializes WorkItem or PendingAction
```

Ordinary replanning changes strategy/decomposition, not the definition of success. Requirements/criteria changes follow their own provenance/authority path and may create User-authority PendingActions.

### Assessment and convergence

Workflow vNext distinguishes:

```text
WorkItem completed
!= PlanTask execution complete
!= Criterion assessed satisfied
!= WorkflowRun converged
```

Semantic criterion satisfaction is represented by current typed `CriterionAssessment`/Assessment artifacts bound to exact criterion/subject/input/evidence identity.

Baseline semantic verdicts are:

```text
SATISFIED
UNSATISFIED
INCONCLUSIVE
```

The Orchestrator evaluates deterministic profile convergence over current typed state; it does not decide semantic truth by reading prose. Budget/timeout/stagnation exhaustion never means success.

### Capability/profile model

The kernel routes typed Needs through versioned capabilities rather than hard-coding one team topology.

Example profiles:

```text
software_change.v1
  planning
  repository_research
  implementation
  git_mutation
  code_review / assessment
  ci_verification

deep_research.v1
  planning
  web_research
  source_acquisition
  evidence_extraction
  research_synthesis
  citation_verification / assessment
  report_generation

monitoring.v1
  observation
  periodic_refresh
  condition_evaluation
  notification_artifact
```

Software-specific concepts such as PR, Git head, CI, merge authority, and the temporary PR shared workspace remain first-class for the software profile but are not generic-kernel requirements.

### PR collaboration memory — software profile

A software workflow may temporarily contain:

```text
.internet/workspace/
  PLAN.md
  TODO.md
  RESEARCH.md
  STATUS.md
  # ROADMAP.md optional
```

These files are cross-agent collaboration memory only. Semantic views originate from reasoning roles; the Orchestrator applies deterministic publication/render policy; Worker performs all Git writes. Temporary files are removed before final exact-head review.

### Recoverability and long-running execution

The target runtime must survive:

```text
Local Agent disconnect/restart
Orchestrator process restart
provider/browser/session failure
partial execution failure
transport loss
long User waits
multi-day timers
uncertain side-effect responses
runtime/profile/model upgrades during long workflows
```

Recovery is based on durable workflow state, typed Artifacts/Assessments, exact InputBundles, execution fencing, Receipts, Timers/Events, and external observation. Hidden chain-of-thought or transient conversations are never replay state.

Long-lived WorkflowRuns bind relevant schema/profile/policy/capability/agent-definition versions and do not silently resume under incompatible definitions.

### Migration boundary

The current `WorkflowJob` v3 software runtime remains supported while vNext is introduced.

```text
current jobs/ + current v3 behavior
        coexist with
vNext admissions/runs/artifacts/work-items/actions/workstreams
```

vNext should adapt existing production executors and recovery/fencing mechanics where appropriate before introducing duplicate execution implementations.

### vNext research notes

- [`WORKFLOW-VNEXT-RESEARCH.md`](./WORKFLOW-VNEXT-RESEARCH.md) — external systems/research and candidate patterns; non-normative until promoted.

## Architecture decisions

Accepted current ADRs remain historical/as-built authority according to their status. Proposed ADRs 0009–0021 define target vNext intent only.

Notable current/vNext relationship:

- [`ADR/0001-local-control-plane.md`](./ADR/0001-local-control-plane.md) — current Local Agent is user-facing workflow client/authority broker; WorkflowEngine deterministically orchestrates.
- [`ADR/0015-deterministic-local-orchestrator.md`](./ADR/0015-deterministic-local-orchestrator.md) — **Proposed:** preserves and sharpens that client/runtime boundary for vNext.
- [`ADR/0017-autonomous-external-interaction.md`](./ADR/0017-autonomous-external-interaction.md) — **Proposed:** autonomous execution continues until an actual external dependency requires durable interaction.
- [`ADR/0018-workflow-admission-protocol.md`](./ADR/0018-workflow-admission-protocol.md) — **Proposed:** natural-language intent is compiled/preflighted/confirmed as a typed durable admission protocol before activation.
- [`ADR/0019-domain-agnostic-durable-workflow-kernel.md`](./ADR/0019-domain-agnostic-durable-workflow-kernel.md) — **Proposed:** coding/research/monitoring are profiles above one Artifact/Assessment-based durable workflow kernel.
- [`ADR/0020-workstream-run-continuation.md`](./ADR/0020-workstream-run-continuation.md) — **Proposed:** continuous User projects span bounded WorkflowRuns through explicit continuation and retention-safe Artifact lineage.
- [`ADR/0021-criterion-assessment-and-convergence.md`](./ADR/0021-criterion-assessment-and-convergence.md) — **Proposed:** semantic criterion satisfaction is represented by exact-subject typed Assessments and completion is a deterministic profile convergence predicate.

## Document authority table

| Document | Purpose | Authority |
| --- | --- | --- |
| `SRS.md` | current required invariants | implemented normative requirements |
| `WORKFLOW.md` | current end-to-end flow | operational contract |
| `WORKFLOW-ENGINE.md` | current workflow runtime | as-built runtime design contract |
| `WORKFLOW-GRAPH-ORCHESTRATION.md` | current graph/recovery model | as-built execution contract |
| `WORKFLOW-OPERATOR-CONTRACT.md` | current workflow control/inspection | current operator contract |
| `WORKFLOW-VNEXT.md` | vNext overview | proposed architecture narrative |
| `WORKFLOW-VNEXT-USE-CASES.md` | concrete target product journeys | explanatory design anchor |
| `SRS-VNEXT.md` | vNext core umbrella | proposed requirements |
| `SRS-VNEXT-ADMISSION.md` | workflow admission | proposed specialized requirements |
| `SRS-VNEXT-KERNEL.md` | generic durable kernel | proposed specialized requirements |
| `SRS-VNEXT-ORCHESTRATOR.md` | client/runtime boundary | proposed specialized requirements |
| `SRS-VNEXT-PLANNER.md` | semantic planning lifecycle | proposed specialized requirements |
| `SRS-VNEXT-INTERACTION.md` | durable external interaction | proposed specialized requirements |
| `SRS-VNEXT-CONVERGENCE.md` | criterion assessment and convergence | proposed specialized requirements |
| `SRS-VNEXT-CONTINUATION.md` | Workstream/continuation/user feedback | proposed specialized requirements |
| `SRS-VNEXT-PR-WORKSPACE.md` | software-profile PR collaboration memory | proposed specialized requirements |
| `SRS-VNEXT-GIT-MUTATION.md` | software-profile repository mutation protocol | proposed specialized requirements |
| `ADR/0009..0021` | narrow vNext decisions | proposed decisions |
| `WORKFLOW-VNEXT-RESEARCH.md` | external evidence/candidates | non-normative research |

## Design Gate D0

The production-readiness review/harmonization gate is complete at the design-contract level.

Resolved before runtime implementation:

```text
Local Agent vs Orchestrator authority
Need -> WorkItem | PendingAction
plan_change vs requirements_change vs clarification
graph as implementation mechanism, not universal semantic authority
Workstream vs WorkflowRun
retention-safe continuation imports
CriterionAssessment + profile convergence
v3 coexistence/migration boundary
profile-scoped Worker terminology
```

The first runtime implementation milestone is `WorkflowService` plus centralized caller authorization consistency while preserving v3 behavior.

## Current completion boundary

Workflow vNext remains outside the implemented completion boundary. Major proposed implementation areas include:

```text
WorkflowService / authorization principal boundary
durable natural-language workflow admission protocol
parallel vNext WorkflowRun stores and runtime
typed domain Artifacts/Assessments
Workstream / WorkflowRun / DeliveryArtifact continuation model
Finding / Need / WorkItem / PendingAction separation
capability registry and workflow profiles
exact sparse InputBundles
Artifact lineage / causal invalidation
Planner objective/criteria/task separation
baseline CriterionAssessment/profile convergence
adaptive feedback routing
first-class PendingAction / Timer / ExternalEvent
scoped waiting with continued independent work
runtime-approved execution/dependency motifs
resource-budget / stagnation hardening
verification capabilities
general long-running/recoverable execution
version-pinned long-lived workflow definitions
software-profile PR collaboration workspace
software-profile single-writer reconciled Git mutation protocol
semantic coordination tracing / outcome evals
v3 migration/retirement only after parity
```

The vNext kernel explicitly targets non-coding use cases such as deep research and monitoring. Arbitrary user-authored executable DAGs, autonomous production deployment, degraded quorum modes, and multi-writer repository mutation remain separate design questions rather than assumptions of the generic kernel.
