# Internet Team Documentation

This directory separates the Internet Team design into focused documents rather than a single giant architecture file.

## Start here

- [`internet-team-architecture.md`](./internet-team-architecture.md) — concise architecture overview and system boundaries.
- [`SRS.md`](./SRS.md) — normative software requirements for the target runtime.
- [`WORKFLOW.md`](./WORKFLOW.md) — end-to-end coding workflow, handoff rules, job states, and review loop.
- [`ROADMAP.md`](./ROADMAP.md) — implementation phases and dependency order.
- [`TODO.md`](./TODO.md) — concrete engineering work, ordered by ROI and dependency.
- [`UPDATE.md`](./UPDATE.md) — validated discoveries and changes from the previous architecture assumptions.

## Architecture decisions

- [`ADR/0001-local-control-plane.md`](./ADR/0001-local-control-plane.md) — Local is the control plane, not the reasoning/data relay.
- [`ADR/0002-verbatim-handoffs.md`](./ADR/0002-verbatim-handoffs.md) — team and review outputs are delivered verbatim to the writer.
- [`ADR/0003-multi-account-capability-routing.md`](./ADR/0003-multi-account-capability-routing.md) — separate ChatGPT thinker and writer accounts with capability-aware routing.
- [`ADR/0004-pr-centric-review-loop.md`](./ADR/0004-pr-centric-review-loop.md) — implementation and post-review are centered on a GitHub PR.
- [`ADR/0005-durable-jobs-and-events.md`](./ADR/0005-durable-jobs-and-events.md) — long-running work uses durable jobs and event-driven continuation.

## Current implementation documentation

- [`how-it-works.md`](./how-it-works.md) — current implemented behavior.
- [`chatgpt-ui-inspection.md`](./chatgpt-ui-inspection.md) — ChatGPT website UI observations.
- [`gemini-ui-inspection.md`](./gemini-ui-inspection.md) — Gemini website UI observations.
- [`provider-ui-inspection.md`](./provider-ui-inspection.md) — provider-agnostic UI observations.

## Document roles

| Document | Purpose | Authority |
| --- | --- | --- |
| SRS | What the target system must do | Normative target requirements |
| ADR | Why a major design choice was made | Accepted design decision |
| WORKFLOW | How the target workflow behaves | Operational design |
| ROADMAP | In what order to build it | Planning |
| TODO | Concrete implementation tasks | Working plan |
| UPDATE | What changed and what has been validated | Current design delta |
| how-it-works | What the plugin does today | Current implementation |

The target architecture documents describe desired behavior. They must not be confused with `how-it-works.md`, which remains the source for current implemented behavior until the corresponding changes land.
