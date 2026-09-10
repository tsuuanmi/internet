# Internet Runtime Documentation

- **Status:** current as-built documentation plus proposed graph-orchestration contract
- **Last synchronized:** 2026-09-10
- **Baseline:** workflow-team observability/control hardening plus provider-agnostic member routing

This directory documents the current `@tsuuanmi/internet` runtime. The durable coding workflow, automatic driver, exact handoffs, separate writer, exact-head review/health/merge gates, provider-agnostic agent-team execution, concurrent workflow lanes, structured team traces, and user-facing workflow operator controls are implemented. New workflows pin a fresh upstream `main` HEAD rather than Local worktree HEAD, successful workflow merges are squash-only so they add one commit to `main`, and one exact workflow can be removed with `/workflow delete <jobId>`.

The current default agent team uses two independent ChatGPT-backed thinker accounts as `Member 1` and `Member 2`. That is a routing choice, not a team semantic. Gemini remains supported for explicit direct chat/research/team use but is temporarily outside the default team/workflow route.

A new proposed runtime-hardening contract is documented in [`WORKFLOW-GRAPH-ORCHESTRATION.md`](./WORKFLOW-GRAPH-ORCHESTRATION.md). It is **not yet as-built behavior**. It defines the intended move from coarse lane/team retry to durable dependency-graph scheduling, node-level recovery, execution fencing, progress leases, explicit `WAITING_USER` states, deterministic automation-error classification, and graph-derived operator status.

## Start here

- [`internet-team-architecture.md`](./internet-team-architecture.md) — concise architecture and authority/data/control boundaries.
- [`how-it-works.md`](./how-it-works.md) — current server-side implementation and runtime behavior.
- [`WORKFLOW.md`](./WORKFLOW.md) — user-visible workflow behavior and control surface.
- [`WORKFLOW-ENGINE.md`](./WORKFLOW-ENGINE.md) — current deterministic state machine, driver, durable receipts, traces, retries, health and merge gates.
- [`WORKFLOW-HARDENING.md`](./WORKFLOW-HARDENING.md) — implemented workflow-team observability/control/prompt/concurrency hardening and current routing adjustment.
- [`WORKFLOW-GRAPH-ORCHESTRATION.md`](./WORKFLOW-GRAPH-ORCHESTRATION.md) — proposed durable graph scheduler, node-level retry/reconciliation, event journal, provider progress, human-action states, and explainable status contract.
- [`AGENT-TEAM-DESIGN.md`](./AGENT-TEAM-DESIGN.md) — provider-agnostic team quality contract, current two-ChatGPT routing, and lane concurrency contract.
- [`WORKFLOW-OPERATOR-CONTRACT.md`](./WORKFLOW-OPERATOR-CONTRACT.md) — start/list/status/watch/stop/continue/delete operator semantics.
- [`SRS.md`](./SRS.md) — normative workflow requirements.
- [`ROADMAP.md`](./ROADMAP.md) — completed P0-P13 roadmap and explicitly deferred directions.
- [`TODO.md`](./TODO.md) — implementation closure boundary and currently accepted next hardening work.
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
| `WORKFLOW-ENGINE.md` | current deterministic runtime/state | as-built runtime design contract |
| `WORKFLOW-GRAPH-ORCHESTRATION.md` | next graph/recovery/observability architecture | proposed implementation contract |
| `internet-team-architecture.md` | concise architecture | architecture overview |
| `AGENT-TEAM-DESIGN.md` | provider-agnostic team quality + current routing + parallel lane requirements | current team contract |
| `WORKFLOW-OPERATOR-CONTRACT.md` | user-facing workflow control/inspection semantics | current operator contract |
| `WORKFLOW-HARDENING.md` | implemented post-roadmap hardening rationale and acceptance criteria | current hardening record |
| ADRs | why accepted choices exist | historical design authority |
| `ROADMAP.md` | completed phases / deferred directions | planning history |
| `TODO.md` | implementation closure / accepted next work / deferred items | working backlog boundary |
| `UPDATE.md` | historical changes through P13 | implementation history |

## Current completion boundary

The explicit P0-P13 coding-workflow roadmap remains complete. The workflow-team hardening and current provider-agnostic member routing are implemented without inventing a new numbered phase.

Real workflow runs have now established a concrete next hardening requirement: durable graph scheduling and node-level recovery/observability. That work is accepted in [`WORKFLOW-GRAPH-ORCHESTRATION.md`](./WORKFLOW-GRAPH-ORCHESTRATION.md) but is not yet implemented and must not be described as current runtime behavior.

Other work remains deliberately deferred until a concrete need exists, including dynamic provider/account health routing, automatic task detection, Website-level cross-conversation/project memory as a correctness dependency, generic user-defined arbitrary DAG workflows, multi-writer pooling, sophisticated artifact storage, autonomous production deployment, and broad non-coding generalization.
