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
- [`SRS-VNEXT.md`](./SRS-VNEXT.md) — proposed core testable vNext requirements.
- [`SRS-VNEXT-ORCHESTRATOR.md`](./SRS-VNEXT-ORCHESTRATOR.md) — Local Agent client versus deterministic Orchestrator/WorkflowEngine boundary.
- [`SRS-VNEXT-PLANNER.md`](./SRS-VNEXT-PLANNER.md) — User Objective / Acceptance Criteria / Plan / PlanTask / Need / WorkItem lifecycle.
- [`SRS-VNEXT-INTERACTION.md`](./SRS-VNEXT-INTERACTION.md) — autonomous-by-default workflow plus durable User/Local-Agent external interaction.
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
Deterministic Orchestrator Runtime
        |
        v
Capabilities / durable workflow state
```

The User should not need to know `/workflow status`, `/workflow continue`, or other internal commands in normal use. The Local Agent queries/updates the workflow tool and explains the authoritative machine state conversationally. Slash commands remain useful as explicit CLI/debug/operator shortcuts.

### Workflow admission protocol

Natural-language requests do not become authoritative workflow state directly.

```text
User source
  -> Local Agent compiles WorkflowAdmissionDraft
  -> deterministic Orchestrator preflight
  -> AdmissionPreview
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

### Latest vNext authority model

```text
User
  = ultimate human authority for reserved decisions

Local Agent
  = reasoning-capable workflow client/operator
  = compiles natural language into typed admission/input messages
  = queries status and presents workflow state naturally
  = may reason, but hidden reasoning is not durable workflow authority

Orchestrator Runtime / WorkflowEngine
  = deterministic control plane
  = validation / persistence / routing / scheduling / reconciliation / gates
  = no model reasoning for authoritative state transitions

Capabilities / specialist agents
  = bounded semantic/reasoning execution
  = Planner / Research / Worker / Reviewer are useful logical roles, not mandatory universal kernel roles
```

Only explicit validated tool/API inputs may move information/authority from User or Local Agent into durable workflow state.

### Domain-agnostic kernel

The generic kernel should understand control-plane objects such as:

```text
Workflow
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
Assessment
Receipt
PendingAction
Timer
ExternalEvent
Budget
AuthorityPolicy
ConvergencePolicy
```

Long-running dependencies may be satisfied by:

```text
WorkItem       -> internal capability execution
PendingAction  -> User/Local external input or authority
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
  -> NeedArtifact
  -> Orchestrator materializes WorkItem or PendingAction
```

Ordinary replanning changes strategy/decomposition, not the definition of success. Requirements/criteria changes follow their own provenance/authority path and may create User-authority PendingActions.

### Capability/profile model

The kernel routes typed Needs through versioned capabilities rather than hard-coding one team topology.

Example profiles:

```text
software_change.v1
  repository_research
  implementation
  git_mutation
  code_review
  ci_verification

deep_research.v1
  web_research
  source_acquisition
  evidence_extraction
  research_synthesis
  citation_verification
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

These files are cross-agent collaboration memory only. Semantic views originate from the reasoning roles; the Orchestrator applies deterministic publication/render policy; Worker performs all Git writes. Temporary files are removed before final exact-head review.

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

Recovery is based on durable workflow state, typed artifacts, exact InputBundles, execution fencing, receipts, timers/events, and external observation. Hidden chain-of-thought or transient conversations are never replay state.

Long-lived workflows bind relevant schema/profile/policy/capability/agent-definition versions and do not silently resume under incompatible definitions.

### vNext research notes

- [`WORKFLOW-VNEXT-RESEARCH.md`](./WORKFLOW-VNEXT-RESEARCH.md) — external systems/research and candidate patterns; non-normative until promoted.

## Architecture decisions

Accepted current ADRs remain historical/as-built authority according to their status. Proposed ADRs 0009–0019 define target vNext intent only.

Notable current/vNext relationship:

- [`ADR/0001-local-control-plane.md`](./ADR/0001-local-control-plane.md) — current Local Agent is user-facing workflow client/authority broker; WorkflowEngine deterministically orchestrates.
- [`ADR/0015-deterministic-local-orchestrator.md`](./ADR/0015-deterministic-local-orchestrator.md) — **Proposed:** preserves and sharpens that client/runtime boundary for vNext.
- [`ADR/0017-autonomous-external-interaction.md`](./ADR/0017-autonomous-external-interaction.md) — **Proposed:** autonomous execution continues until an actual external dependency requires durable interaction.
- [`ADR/0018-workflow-admission-protocol.md`](./ADR/0018-workflow-admission-protocol.md) — **Proposed:** natural-language intent is compiled/preflighted/confirmed as a typed admission protocol before activation.
- [`ADR/0019-domain-agnostic-durable-workflow-kernel.md`](./ADR/0019-domain-agnostic-durable-workflow-kernel.md) — **Proposed:** coding/research/monitoring are profiles above one artifact-based durable workflow kernel.

## Document authority table

| Document | Purpose | Authority |
| --- | --- | --- |
| `SRS.md` | current required invariants | implemented normative requirements |
| `WORKFLOW.md` | current end-to-end flow | operational contract |
| `WORKFLOW-ENGINE.md` | current workflow runtime | as-built runtime design contract |
| `WORKFLOW-GRAPH-ORCHESTRATION.md` | current graph/recovery model | as-built execution contract |
| `WORKFLOW-OPERATOR-CONTRACT.md` | current workflow control/inspection | current operator contract |
| `WORKFLOW-VNEXT.md` | vNext overview | proposed architecture narrative |
| `SRS-VNEXT.md` | vNext core requirements | proposed requirements |
| `SRS-VNEXT-ORCHESTRATOR.md` | client/runtime boundary | proposed specialized requirements |
| `SRS-VNEXT-PLANNER.md` | semantic planning lifecycle | proposed specialized requirements |
| `SRS-VNEXT-INTERACTION.md` | durable external interaction | proposed specialized requirements |
| `SRS-VNEXT-PR-WORKSPACE.md` | software-profile PR collaboration memory | proposed specialized requirements |
| `SRS-VNEXT-GIT-MUTATION.md` | software-profile repository mutation protocol | proposed specialized requirements |
| `ADR/0009..0019` | narrow vNext decisions | proposed decisions |
| `WORKFLOW-VNEXT-RESEARCH.md` | external evidence/candidates | non-normative research |

## Current completion boundary

Workflow vNext remains outside the implemented completion boundary. Major proposed areas include:

```text
natural-language workflow admission protocol
typed domain artifacts
Finding / Need / WorkItem / PendingAction separation
capability registry and workflow profiles
exact sparse InputBundles
artifact lineage / causal invalidation
Local Agent <-> typed workflow protocol <-> deterministic Orchestrator boundary
Planner objective/criteria/task separation
adaptive feedback routing
first-class PendingAction / Timer / ExternalEvent
scoped waiting with continued independent work
runtime-approved dynamic graph motifs
convergence/resource-budget policy
verification capabilities
general long-running/recoverable execution
version-pinned long-lived workflow definitions
software-profile PR collaboration workspace
software-profile single-writer reconciled Git mutation protocol
semantic coordination tracing / outcome evals
```

The vNext kernel explicitly targets non-coding use cases such as deep research and monitoring. Arbitrary user-authored executable DAGs, autonomous production deployment, degraded quorum modes, and multi-writer repository mutation remain separate design questions rather than assumptions of the generic kernel.
