# Internet Runtime Documentation

- **Status:** current as-built documentation plus explicitly marked follow-up proposals
- **Last synchronized:** 2026-09-09
- **Baseline:** `main` after P13 operations/retention (`eaa8f15baea0ea6b153599f7c259864a4e482a43`)

This directory documents the current `@tsuuanmi/internet` runtime after the P0-P13 workflow roadmap was completed. The coding workflow is no longer a target-only design: the durable engine, automatic driver, exact handoffs, writer path, PR review/remediation loop, exact-head health gate, explicit merge authorization, and operator-only retention cleanup are implemented.

A small number of follow-up documents may describe concrete observed problems and proposed hardening. Those documents are explicitly marked **proposed** and must not be read as current implementation until the corresponding code lands.

## Start here

- [`internet-team-architecture.md`](./internet-team-architecture.md) — concise architecture and authority/data/control boundaries.
- [`how-it-works.md`](./how-it-works.md) — current server-side implementation and runtime behavior.
- [`WORKFLOW.md`](./WORKFLOW.md) — user-visible `/workflow <task>` behavior and stop boundaries.
- [`WORKFLOW-ENGINE.md`](./WORKFLOW-ENGINE.md) — deterministic state machine, driver, durable receipts, retries, health and merge gates.
- [`WORKFLOW-HARDENING.md`](./WORKFLOW-HARDENING.md) — **proposed** workflow-team observability/control/prompt hardening based on a real provider failure.
- [`SRS.md`](./SRS.md) — normative requirements satisfied by the current coding workflow.
- [`ROADMAP.md`](./ROADMAP.md) — completed P0-P13 roadmap and explicitly deferred directions.
- [`TODO.md`](./TODO.md) — completed checklist plus concrete follow-up work and intentionally deferred items.
- [`UPDATE.md`](./UPDATE.md) — consolidated implementation delta through P13.

## Architecture decisions

The ADRs are accepted historical decisions and are intentionally not rewritten merely because implementation has caught up with them:

- [`ADR/0001-local-control-plane.md`](./ADR/0001-local-control-plane.md) — Local brokers user authority; WorkflowEngine owns deterministic orchestration.
- [`ADR/0002-verbatim-handoffs.md`](./ADR/0002-verbatim-handoffs.md) — team/reviewer finals move verbatim to the writer.
- [`ADR/0003-multi-account-capability-routing.md`](./ADR/0003-multi-account-capability-routing.md) — semantic account identity and capability-aware routing.
- [`ADR/0004-pr-centric-review-loop.md`](./ADR/0004-pr-centric-review-loop.md) — the PR is the canonical implementation/review artifact.
- [`ADR/0005-durable-jobs-and-events.md`](./ADR/0005-durable-jobs-and-events.md) — long-running work is durable and event-driven.
- [`ADR/0006-workflow-command-starts-real-engine.md`](./ADR/0006-workflow-command-starts-real-engine.md) — `/workflow` starts real deterministic code.
- [`ADR/0007-approval-policy.md`](./ADR/0007-approval-policy.md) — scoped implementation confirmation policy and explicit merge authority.
- [`ADR/0008-direct-team-execution.md`](./ADR/0008-direct-team-execution.md) — workflow teams run directly over the lower-level browser team runtime.

## Provider UI inspection notes

These documents describe observed Website surfaces used by browser automation. They are operational observations rather than workflow-roadmap status documents, so the P13 documentation sync does not rewrite them unless the observed UI changes:

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
| `WORKFLOW-ENGINE.md` | deterministic runtime/state | runtime design contract |
| `internet-team-architecture.md` | concise architecture | architecture overview |
| `WORKFLOW-HARDENING.md` | concrete follow-up proposal; not current behavior | proposed hardening contract |
| ADRs | why accepted choices exist | historical design authority |
| `ROADMAP.md` | completed phases / deferred directions | planning history |
| `TODO.md` | implementation closure / concrete follow-up / deferred items | working backlog boundary |
| `UPDATE.md` | consolidated changes through latest implemented phase | implementation delta |

## Current completion boundary

The explicit coding-workflow roadmap is complete through P13. No P14 is implied. Concrete observed problems may still justify focused fixes without restarting phase numbering; `WORKFLOW-HARDENING.md` is one such follow-up proposal.

The following remain deliberately deferred until a concrete need justifies them: automatic task detection, Website-level cross-conversation/project memory as a correctness dependency, generic arbitrary DAG workflows, multi-writer pooling, a sophisticated artifact database, autonomous production deployment, and broad non-coding generalization.
