# Internet Runtime Documentation

- **Status:** current as-built documentation
- **Last synchronized:** 2026-09-15
- **Baseline:** durable workflow graph orchestration, node-level recovery, provider progress leases, and provider-agnostic team routing

This directory documents the current `@tsuuanmi/internet` runtime. The coding workflow is an authoritative durable dependency graph: explicit nodes and dependency edges determine readiness, exact-input-bound results preserve completed work, execution IDs fence stale attempts, and recovery targets the smallest failed or orphaned node. The graph snapshot is correctness state; the ordered event journal is diagnostic/observability history rather than a second replay engine.

The automatic driver owns scheduling and execution ownership only. `WorkflowEngine` owns workflow-domain transitions, including scheduler failure blocking. Research A/B and Review A/B become ready independently, while the account scheduler remains the only same-account capacity gate. The separate `chatgpt-writer` account remains the sole workflow mutation authority.

Provider completion now separates execution ownership leases from semantic provider progress. Workflow turns use a hard deadline plus a shorter no-meaningful-progress stall lease; response/generation transitions renew provider progress, while a static thinking control or unrelated DOM churn does not. Provider stalls, hard timeouts, browser failures, authentication failures, deterministic automation defects, and user-owned actions are classified before recovery policy is chosen.

The current default agent team uses two independent ChatGPT-backed thinker accounts as `Member 1` and `Member 2`. That is a routing choice, not a team semantic. Gemini remains supported for explicit direct chat/research/team use but is outside the default workflow route.

## Start here

- [`internet-team-architecture.md`](./internet-team-architecture.md) — concise architecture and authority/data/control boundaries.
- [`how-it-works.md`](./how-it-works.md) — current server-side implementation and runtime behavior.
- [`WORKFLOW.md`](./WORKFLOW.md) — user-visible workflow behavior and control surface.
- [`WORKFLOW-ENGINE.md`](./WORKFLOW-ENGINE.md) — deterministic workflow engine, driver, durable receipts, health and merge gates.
- [`WORKFLOW-GRAPH-ORCHESTRATION.md`](./WORKFLOW-GRAPH-ORCHESTRATION.md) — current durable graph scheduler, node-level recovery/reconciliation, event journal, provider progress, human-action boundaries, and status projection contract.
- [`WORKFLOW-HARDENING.md`](./WORKFLOW-HARDENING.md) — workflow-team observability/control/prompt/concurrency hardening history.
- [`AGENT-TEAM-DESIGN.md`](./AGENT-TEAM-DESIGN.md) — provider-agnostic team quality contract, current two-ChatGPT routing, and lane concurrency contract.
- [`WORKFLOW-OPERATOR-CONTRACT.md`](./WORKFLOW-OPERATOR-CONTRACT.md) — start/list/status/watch/stop/continue/delete operator semantics.
- [`SRS.md`](./SRS.md) — normative workflow requirements.
- [`ROADMAP.md`](./ROADMAP.md) — completed P0-P13 roadmap and explicitly deferred directions.
- [`TODO.md`](./TODO.md) — current closure boundary and deliberately deferred work.
- [`UPDATE.md`](./UPDATE.md) — historical implementation delta through P13.

## Architecture decisions

The ADRs are accepted historical decisions:

- [`ADR/0001-local-control-plane.md`](./ADR/0001-local-control-plane.md) — Local brokers user authority; WorkflowEngine owns deterministic orchestration.
- [`ADR/0002-verbatim-handoffs.md`](./ADR/0002-verbatim-handoffs.md) — team/reviewer finals move verbatim to the writer.
- [`ADR/0003-multi-account-capability-routing.md`](./ADR/0003-multi-account-capability-routing.md) — semantic account identity and capability-aware routing.
- [`ADR/0004-pr-centric-review-loop.md`](./ADR/0004-pr-centric-review-loop.md) — the PR is the canonical implementation/review artifact.
- [`ADR/0005-durable-jobs-and-events.md`](./ADR/0005-durable-jobs-and-events.md) — long-running work is durable and event-driven.
- [`ADR/0006-workflow-command-starts-real-engine.md`](./ADR/0006-workflow-command-starts-real-engine.md) — `/workflow` starts real deterministic code.
- [`ADR/0007-approval-policy.md`](./ADR/0007-approval-policy.md) — scoped implementation confirmation policy and explicit merge authority.
- [`ADR/0008-direct-team-execution.md`](./ADR/0008-direct-team-execution.md) — workflow teams run directly over the lower-level shared team runtime.

## Provider UI inspection notes

These documents describe observed Website surfaces used by browser automation. They remain provider-specific because browser automation must understand each provider UI even though team reasoning is provider-agnostic:

- [`chatgpt-ui-inspection.md`](./chatgpt-ui-inspection.md)
- [`gemini-ui-inspection.md`](./gemini-ui-inspection.md)
- [`provider-ui-inspection.md`](./provider-ui-inspection.md)

## Document authority

| Document | Purpose | Authority |
| --- | --- | --- |
| `README.md` (repository root) | install, tools, commands, operator usage | public usage reference |
| `how-it-works.md` | current implementation | as-built source of truth |
| `SRS.md` | required invariants | normative requirements |
| `WORKFLOW.md` | end-to-end user flow | operational contract |
| `WORKFLOW-ENGINE.md` | deterministic workflow runtime | as-built runtime design contract |
| `WORKFLOW-GRAPH-ORCHESTRATION.md` | graph/recovery/observability architecture | as-built execution contract |
| `internet-team-architecture.md` | concise architecture | architecture overview |
| `AGENT-TEAM-DESIGN.md` | provider-agnostic team quality + current routing + parallel lane requirements | current team contract |
| `WORKFLOW-OPERATOR-CONTRACT.md` | user-facing workflow control/inspection semantics | current operator contract |
| `WORKFLOW-HARDENING.md` | post-roadmap hardening rationale and acceptance criteria | hardening history |
| ADRs | why accepted choices exist | historical design authority |
| `ROADMAP.md` | completed phases / deferred directions | planning history |
| `TODO.md` | implementation closure / deferred items | working backlog boundary |
| `UPDATE.md` | historical changes through P13 | implementation history |

## Current completion boundary

The P0-P13 coding-workflow roadmap, provider-agnostic team hardening, and durable graph-orchestration hardening are implemented. The runtime has one authoritative graph/scheduler/reducer/recovery path; obsolete coarse team trace/replay state and compatibility execution paths are not retained.

Other work remains deliberately deferred until a concrete need exists, including dynamic member/provider health substitution beyond same-node recovery, automatic task detection, Website-level cross-conversation/project memory as a correctness dependency, generic user-defined arbitrary DAG workflows beyond the internal workflow graph, degraded one-team quorum modes, multi-writer pooling, sophisticated artifact storage, autonomous production deployment, and broad non-coding generalization.
