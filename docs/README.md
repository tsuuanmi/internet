# Internet Runtime Documentation

- **Status:** current as-built documentation with explicitly separated vNext proposals
- **Last synchronized:** 2026-09-16
- **Baseline:** durable workflow graph orchestration, node-level recovery, provider progress leases, and provider-agnostic team routing

This directory documents both the current `@tsuuanmi/internet` runtime and explicitly separated vNext design work. The current coding workflow remains an authoritative durable dependency graph: explicit nodes and dependency edges determine readiness, exact-input-bound results preserve completed work, execution IDs fence stale attempts, and recovery targets the smallest failed or orphaned node.

The graph snapshot is current correctness state. The ordered event journal is diagnostic/observability history rather than a second replay engine.

## Documentation authority and precedence

There are three documentation classes:

```text
1. As-built contract
   = describes behavior implemented on main

2. Proposed design contract
   = production-oriented target requirements/decisions not yet implemented

3. Research notes
   = external evidence and candidate ideas, non-normative
```

Precedence for production behavior:

```text
current code + as-built contract
  > proposed vNext documents
  > research notes
```

Precedence inside the proposed vNext design:

```text
narrow Proposed ADR
  > specialized SRS-VNEXT module
  > SRS-VNEXT core requirement summary
  > WORKFLOW-VNEXT architecture narrative
  > WORKFLOW-VNEXT-RESEARCH candidate notes
```

A specialized vNext SRS module applies only to its named subsystem and extends the core `SRS-VNEXT.md`; it does not change unrelated requirements.

A vNext requirement becomes production authority only after implementation, tests, and explicit promotion into the as-built documents. Proposed docs must never be cited as proof that runtime behavior already exists.

## Current as-built runtime

The automatic driver owns scheduling and execution ownership only. `WorkflowEngine` owns workflow-domain transitions. Research A/B and Review A/B become ready independently, while the account scheduler remains the only same-account capacity gate. The separate `chatgpt-writer` account remains the sole workflow mutation authority in the current implementation.

Provider completion separates execution ownership leases from semantic provider progress. Workflow turns use a hard deadline plus a shorter no-meaningful-progress stall lease. Provider stalls, hard timeouts, browser failures, authentication failures, deterministic automation defects, and user-owned actions are classified before recovery policy is chosen.

The current default agent team uses two independent ChatGPT-backed thinker accounts as `Member 1` and `Member 2`. That is routing policy, not team semantics. Gemini remains supported for explicit direct/research/team use but is outside the default workflow route.

## Start here

### Current as-built runtime

- [`internet-team-architecture.md`](./internet-team-architecture.md) — concise architecture and authority/data/control boundaries.
- [`how-it-works.md`](./how-it-works.md) — current server-side implementation and runtime behavior.
- [`WORKFLOW.md`](./WORKFLOW.md) — current user-visible workflow behavior and control surface.
- [`WORKFLOW-ENGINE.md`](./WORKFLOW-ENGINE.md) — current deterministic workflow engine, driver, durable receipts, health and merge gates.
- [`WORKFLOW-GRAPH-ORCHESTRATION.md`](./WORKFLOW-GRAPH-ORCHESTRATION.md) — current durable graph scheduler, recovery/reconciliation, observability, and human-action boundaries.
- [`WORKFLOW-HARDENING.md`](./WORKFLOW-HARDENING.md) — workflow-team observability/control/prompt/concurrency hardening history.
- [`AGENT-TEAM-DESIGN.md`](./AGENT-TEAM-DESIGN.md) — provider-agnostic team quality contract and current routing/concurrency behavior.
- [`WORKFLOW-OPERATOR-CONTRACT.md`](./WORKFLOW-OPERATOR-CONTRACT.md) — current operator semantics.
- [`SRS.md`](./SRS.md) — current implemented normative workflow requirements.
- [`ROADMAP.md`](./ROADMAP.md) — completed roadmap and deferred directions.
- [`TODO.md`](./TODO.md) — current closure boundary / deferred work.
- [`UPDATE.md`](./UPDATE.md) — historical implementation delta.

### Workflow vNext proposed design

These documents are production-oriented design contracts but are **not implemented behavior**:

- [`WORKFLOW-VNEXT.md`](./WORKFLOW-VNEXT.md) — target adaptive artifact-based architecture, authority model, WorkItems, InputBundles, capability routing, feedback loops, and convergence.
- [`SRS-VNEXT.md`](./SRS-VNEXT.md) — proposed core testable requirements and explicit production boundaries.
- [`SRS-VNEXT-PR-WORKSPACE.md`](./SRS-VNEXT-PR-WORKSPACE.md) — proposed requirements for projecting selected safe workflow artifacts into the implementation PR as a temporary shared agent workspace.
- [`ADR/0009-typed-artifact-agent-protocol.md`](./ADR/0009-typed-artifact-agent-protocol.md) — typed durable artifacts as the correctness-bearing inter-agent protocol.
- [`ADR/0010-adaptive-feedback-routing.md`](./ADR/0010-adaptive-feedback-routing.md) — Orchestrator-mediated semantic Needs, causal ownership, and feedback routing.
- [`ADR/0011-workitems-and-capability-routing.md`](./ADR/0011-workitems-and-capability-routing.md) — separation of Need, runtime WorkItem, graph realization, and capability routing.
- [`ADR/0012-input-bundles-and-context-projection.md`](./ADR/0012-input-bundles-and-context-projection.md) — exact sparse InputBundles and non-broadcast context projection.
- [`ADR/0013-pr-workspace-projection.md`](./ADR/0013-pr-workspace-projection.md) — PR branch as a temporary shared projection of authoritative artifacts, with cleanup before final exact-head review.

Target terminology uses **Worker** for the logical implementation/generation role. The existing `chatgpt-writer` identifier remains a current implementation detail until separately migrated.

### vNext research notes

- [`WORKFLOW-VNEXT-RESEARCH.md`](./WORKFLOW-VNEXT-RESEARCH.md) — external systems/research and candidate patterns. Non-normative; ideas must be promoted into ADR/SRS before becoming vNext design authority.

## Architecture decisions

The ADRs below are accepted historical decisions unless explicitly marked Proposed in the ADR itself:

- [`ADR/0001-local-control-plane.md`](./ADR/0001-local-control-plane.md) — Local brokers user authority; WorkflowEngine owns deterministic orchestration.
- [`ADR/0002-verbatim-handoffs.md`](./ADR/0002-verbatim-handoffs.md) — team/reviewer finals move verbatim to the writer.
- [`ADR/0003-multi-account-capability-routing.md`](./ADR/0003-multi-account-capability-routing.md) — semantic account identity and capability-aware routing.
- [`ADR/0004-pr-centric-review-loop.md`](./ADR/0004-pr-centric-review-loop.md) — the PR is the canonical implementation/review artifact.
- [`ADR/0005-durable-jobs-and-events.md`](./ADR/0005-durable-jobs-and-events.md) — long-running work is durable and event-driven.
- [`ADR/0006-workflow-command-starts-real-engine.md`](./ADR/0006-workflow-command-starts-real-engine.md) — `/workflow` starts real deterministic code.
- [`ADR/0007-approval-policy.md`](./ADR/0007-approval-policy.md) — scoped implementation confirmation policy and explicit merge authority.
- [`ADR/0008-direct-team-execution.md`](./ADR/0008-direct-team-execution.md) — workflow teams run directly over the lower-level shared team runtime.
- [`ADR/0009-typed-artifact-agent-protocol.md`](./ADR/0009-typed-artifact-agent-protocol.md) — **Proposed:** typed durable artifacts become the correctness-bearing agent communication protocol.
- [`ADR/0010-adaptive-feedback-routing.md`](./ADR/0010-adaptive-feedback-routing.md) — **Proposed:** agents emit typed Needs; Orchestrator/runtime routes capabilities and returns results to the causal request owner.
- [`ADR/0011-workitems-and-capability-routing.md`](./ADR/0011-workitems-and-capability-routing.md) — **Proposed:** semantic Needs are separated from code-owned WorkItems and graph execution; routing is capability-based.
- [`ADR/0012-input-bundles-and-context-projection.md`](./ADR/0012-input-bundles-and-context-projection.md) — **Proposed:** each executable WorkItem is bound to one exact sparse InputBundle.
- [`ADR/0013-pr-workspace-projection.md`](./ADR/0013-pr-workspace-projection.md) — **Proposed:** selected safe artifacts may be projected into the PR branch as a temporary shared workspace; runtime state remains authoritative and final review occurs only after cleanup.

## Provider UI inspection notes

These documents describe observed Website surfaces used by browser automation. They remain provider-specific even though team reasoning is provider-agnostic:

- [`chatgpt-ui-inspection.md`](./chatgpt-ui-inspection.md)
- [`gemini-ui-inspection.md`](./gemini-ui-inspection.md)
- [`provider-ui-inspection.md`](./provider-ui-inspection.md)

## Document authority table

| Document | Purpose | Authority |
| --- | --- | --- |
| `README.md` (repository root) | install, tools, commands, operator usage | public usage reference |
| `how-it-works.md` | current implementation | as-built source of truth |
| `SRS.md` | current required invariants | implemented normative requirements |
| `WORKFLOW.md` | current end-to-end user flow | operational contract |
| `WORKFLOW-ENGINE.md` | current deterministic workflow runtime | as-built runtime design contract |
| `WORKFLOW-GRAPH-ORCHESTRATION.md` | current graph/recovery/observability architecture | as-built execution contract |
| `internet-team-architecture.md` | current concise architecture | architecture overview |
| `AGENT-TEAM-DESIGN.md` | current team quality/routing/concurrency semantics | current team contract |
| `WORKFLOW-OPERATOR-CONTRACT.md` | current workflow control/inspection semantics | current operator contract |
| `WORKFLOW-HARDENING.md` | hardening rationale/acceptance history | hardening history |
| `WORKFLOW-VNEXT.md` | target adaptive artifact-based architecture | proposed design contract |
| `SRS-VNEXT.md` | target core workflow requirements | proposed requirements |
| `SRS-VNEXT-PR-WORKSPACE.md` | target PR-workspace projection/cleanup/CI requirements | proposed specialized requirements |
| `ADR/0009..0013` | narrow vNext architectural decisions | proposed decisions |
| `WORKFLOW-VNEXT-RESEARCH.md` | external research/candidate patterns | non-normative research |
| accepted ADRs | historical accepted architectural decisions | accepted design authority |
| `ROADMAP.md` | completed phases / deferred directions | planning history |
| `TODO.md` | implementation closure / deferred items | working backlog boundary |
| `UPDATE.md` | historical changes | implementation history |

## Current completion boundary

The current coding-workflow roadmap, provider-agnostic team hardening, and durable graph-orchestration hardening are implemented. The runtime has one authoritative graph/scheduler/reducer/recovery path; obsolete coarse team trace/replay state and compatibility execution paths are not retained.

Workflow vNext is intentionally outside this completion boundary. In particular, the following remain proposals until implementation lands:

```text
typed domain artifacts as primary communication protocol
first-class Finding / Need / WorkItem separation
capability registry
exact sparse InputBundles
artifact lineage / causal invalidation
Reviewer -> Research -> Reviewer adaptive routing
Planner re-entry
runtime-approved dynamic graph motifs
convergence/resource-budget policy
verification capabilities
PR workspace projection / checkpoint commits / cleanup-before-final-review
semantic coordination tracing / outcome evals
```

Other work remains deliberately deferred until a concrete need exists, including dynamic member/provider health substitution beyond same-node recovery, automatic task detection, Website-level cross-conversation/project memory as a correctness dependency, generic user-defined arbitrary DAG workflows, degraded one-team quorum modes, multi-writer pooling, autonomous production deployment, and broad non-coding generalization.
