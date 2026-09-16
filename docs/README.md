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

These are production-oriented proposals, not implemented behavior:

- [`WORKFLOW-VNEXT.md`](./WORKFLOW-VNEXT.md) — target adaptive artifact-based architecture.
- [`SRS-VNEXT.md`](./SRS-VNEXT.md) — proposed core testable vNext requirements.
- [`SRS-VNEXT-ORCHESTRATOR.md`](./SRS-VNEXT-ORCHESTRATOR.md) — Local Agent client versus deterministic Orchestrator/WorkflowEngine boundary.
- [`SRS-VNEXT-PLANNER.md`](./SRS-VNEXT-PLANNER.md) — User Objective / Acceptance Criteria / Plan / PlanTask / Need / WorkItem lifecycle.
- [`SRS-VNEXT-INTERACTION.md`](./SRS-VNEXT-INTERACTION.md) — autonomous-by-default workflow plus durable User/Local-Agent external interaction.
- [`SRS-VNEXT-PR-WORKSPACE.md`](./SRS-VNEXT-PR-WORKSPACE.md) — curated temporary PR collaboration memory.
- [`SRS-VNEXT-GIT-MUTATION.md`](./SRS-VNEXT-GIT-MUTATION.md) — expected-head scoped Git mutation/reconciliation.

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

### Latest vNext authority model

```text
User
  = ultimate human authority for reserved decisions

Local Agent
  = reasoning-capable user-facing workflow client/operator
  = may start/query/watch/respond/signal through tool/API
  = not durable workflow correctness state

Orchestrator Runtime / WorkflowEngine
  = deterministic control plane
  = validation / persistence / routing / scheduling / reconciliation / gates
  = no model reasoning for state transitions

Planner / Research / Reviewer / Worker
  = bounded semantic/reasoning capabilities

Worker
  = sole repository writer
```

Only explicit validated tool/API inputs may move information/authority from User or Local Agent into durable workflow state.

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

Target external-interaction surface conceptually adds:

```text
pending actions via status/watch
respond(actionId, typed response)
signal(input) for unsolicited user/client directives
```

Resolving a PendingAction automatically re-evaluates readiness; `continue` remains an operator recovery command rather than semantic-response protocol.

### Planner semantics

```text
UserObjectiveInput
  -> ObjectiveArtifact
  -> AcceptanceCriteriaArtifact
  -> PlanArtifact / PlanTask
  -> NeedArtifact
  -> Orchestrator materializes WorkItem
```

Ordinary replanning changes strategy/decomposition, not the definition of success. Requirements/criteria changes follow their own provenance/authority path and may create User-authority PendingActions.

### PR collaboration memory

The PR may temporarily contain:

```text
.internet/workspace/
  PLAN.md
  TODO.md
  RESEARCH.md
  STATUS.md
  # ROADMAP.md optional
```

These files are cross-agent collaboration memory only. Semantic views originate from the reasoning roles; the Orchestrator applies deterministic publication/render policy; Worker performs all Git writes. Temporary files are removed before final exact-head review.

### vNext research notes

- [`WORKFLOW-VNEXT-RESEARCH.md`](./WORKFLOW-VNEXT-RESEARCH.md) — external systems/research and candidate patterns; non-normative until promoted.

## Architecture decisions

Accepted current ADRs remain historical/as-built authority according to their status. Proposed ADRs 0009–0017 define target vNext intent only.

Notable current/vNext relationship:

- [`ADR/0001-local-control-plane.md`](./ADR/0001-local-control-plane.md) — current Local Agent is user-facing workflow client/authority broker; WorkflowEngine deterministically orchestrates.
- [`ADR/0015-deterministic-local-orchestrator.md`](./ADR/0015-deterministic-local-orchestrator.md) — **Proposed:** preserves and sharpens that client/runtime boundary for vNext.
- [`ADR/0017-autonomous-external-interaction.md`](./ADR/0017-autonomous-external-interaction.md) — **Proposed:** autonomous execution continues until an actual external dependency requires durable interaction.

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
| `SRS-VNEXT-PR-WORKSPACE.md` | PR collaboration memory | proposed specialized requirements |
| `SRS-VNEXT-GIT-MUTATION.md` | repository mutation protocol | proposed specialized requirements |
| `ADR/0009..0017` | narrow vNext decisions | proposed decisions |
| `WORKFLOW-VNEXT-RESEARCH.md` | external evidence/candidates | non-normative research |

## Current completion boundary

Workflow vNext remains outside the implemented completion boundary. Major proposed areas include:

```text
typed domain artifacts
Finding / Need / WorkItem separation
capability registry
exact sparse InputBundles
artifact lineage / causal invalidation
Local Agent <-> workflow tool <-> deterministic Orchestrator boundary
Planner objective/criteria/task separation
adaptive feedback routing
first-class PendingAction and external interaction
scoped waiting with continued independent work
runtime-approved dynamic graph motifs
convergence/resource-budget policy
verification capabilities
curated PR collaboration workspace
single-writer reconciled Git mutation protocol
semantic coordination tracing / outcome evals
```

Deferred topics remain separate until a concrete need exists, including generic user-defined arbitrary DAG workflows, broad non-coding generalization, autonomous production deployment, degraded quorum modes, and multi-writer repository mutation.
