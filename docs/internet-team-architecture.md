# Internet Team Architecture

> **Status:** Target architecture overview
> **Current implementation:** see [`how-it-works.md`](./how-it-works.md)
> **Normative requirements:** see [`SRS.md`](./SRS.md)
> **Detailed coding flow:** see [`WORKFLOW.md`](./WORKFLOW.md)

This document is intentionally concise. Detailed requirements, decisions, workflow mechanics, roadmap, and implementation work are split into focused documents under `docs/`.

## 1. Goal

Evolve `@tsuuanmi/internet` from a set of browser-backed ChatGPT/Gemini tools into a workflow runtime where the Local Agent coordinates long-running Website Agents without needing to absorb or rewrite all of their reasoning.

The central optimization is:

> **Keep Local focused on user interaction, authority, and orchestration; move broad cognition and repository mutation to Website Agents that already have the appropriate context and capabilities.**

## 2. Roles

### Local Agent — control plane

Local is responsible for:

- user interaction;
- task intent and constraints;
- authoritative Tasks and Decisions;
- spawning and coordinating jobs;
- routing handoffs;
- workflow state;
- user/permission checkpoints;
- exceptions and authority changes;
- targeted verification when justified;
- merge authorization policy.

Local is not required to perform broad code reading, routine implementation, or normal-path summarization between Website Agents.

### Website thinking teams — cognition plane

Thinking teams perform:

- repository reading;
- architecture/root-cause analysis;
- research;
- critique/debate;
- test and review planning;
- independent PR review.

The default team may use ChatGPT and Gemini together. Each team has an explicit final synthesizer; by default this is the ChatGPT thinker account.

### ChatGPT writer — terminal action plane

A separate ChatGPT Website account acts as the terminal GitHub writer.

Validated capabilities include private-repository read, branch creation, file mutation, commit, pull-request creation, and merge when permitted.

The writer converts team conclusions into a concrete PR and later remediates review findings.

### GitHub / CI — shared empirical artifact

The PR becomes the canonical shared implementation artifact for:

- exact diff;
- commits;
- comments;
- CI;
- remediation history;
- merge state.

## 3. Standard coding workflow

```text
USER
  |
  v
LOCAL
  create job / establish intent
  |
  +---------------------------+
  |                           |
  v                           v
TEAM A                      TEAM B
  |                           |
  v                           v
ChatGPT synthesis          ChatGPT synthesis
  |                           |
  +------ verbatim handoffs --+
              |
              v
       CHATGPT WRITER
              |
         create PR
              |
  +-----------+-----------+
  |                       |
  v                       v
REVIEW TEAM A          REVIEW TEAM B
  |                       |
  +---- verbatim handoffs -+
              |
              v
       CHATGPT WRITER
       remediate same PR
              |
              v
        review gates pass
              |
              v
        LOCAL AUTHORIZATION
              |
        writer/local merge
              |
              v
             DONE
```

## 4. Data plane and control plane

The architecture deliberately separates knowledge transfer from workflow control.

### Data plane

```text
Team final output -> Writer
Review final output -> Writer
Repository/PR -> Review teams
```

These payloads should be delivered verbatim in the normal path.

### Control plane

```text
Local -> start teams
Local -> start implementation after required handoffs
Local -> start review
Local -> request remediation after review handoffs
Local -> authorize/reject merge
Local -> handle BLOCKED/exception states
```

Local may transport payloads, but should not silently summarize or rewrite them.

## 5. Account model

Provider identity is not enough.

The target model introduces semantic account identities such as:

```text
chatgpt-thinker
  provider: chatgpt-web
  role: thinking/review

chatgpt-writer
  provider: chatgpt-web
  role: terminal writer
  GitHub: read/write/PR/merge capability

gemini-thinker
  provider: gemini-web
  role: thinking/review
```

Authentication state, profiles, schedulers, browser contexts, and conversations must be isolated per account.

The writer account may use GitHub `Allow all actions` when available and intentionally enabled, but technical permission remains separate from workflow authority.

## 6. Handoff model

Team and review final outputs are delivered unchanged.

Conceptually:

```text
handoff.payload == source.final_output
```

An external envelope may include:

```text
handoff_id
job_id
source
recipient
sequence
repository/base revision
payload hash
delivery receipt
```

The writer starts a phase only after all configured required handoffs have been delivered.

See [`ADR/0002-verbatim-handoffs.md`](./ADR/0002-verbatim-handoffs.md).

## 7. PR-centric review

The writer creates the PR before post-review.

Review teams inspect the real PR directly. Local no longer needs to create/push an implementation simply to expose code to Website reviewers.

Real remediation may create follow-up commits; orchestration should not create commits solely for transport.

See [`ADR/0004-pr-centric-review-loop.md`](./ADR/0004-pr-centric-review-loop.md).

## 8. Durable jobs

The workflow can run much longer than one Local turn and may pause for user/platform approval.

Therefore long-running work uses persistent job state and compact events rather than one blocking tool call.

Typical states include:

```text
CREATED
TEAM_RUNNING
HANDOFFS_DELIVERING
WRITER_RUNNING
AWAITING_EXTERNAL_APPROVAL
PR_OPEN
REVIEW_RUNNING
WRITER_REMEDIATING
READY_FOR_MERGE_AUTHORIZATION
MERGING
DONE
```

See [`ADR/0005-durable-jobs-and-events.md`](./ADR/0005-durable-jobs-and-events.md).

## 9. Local verification policy

Local reads on exception, not by default.

Targeted inspection is appropriate when:

- change risk is high;
- writer becomes BLOCKED;
- review teams disagree materially;
- CI/runtime evidence is inadequate;
- Task/Decision authority may need to change;
- user asks Local to inspect directly.

This avoids duplicated broad exploration while preserving independent judgment where it matters.

## 10. Quality model

No writer is assumed infallible.

Quality comes from the pipeline:

```text
independent thinking
-> verbatim implementation handoff
-> concrete PR
-> independent post-review
-> remediation
-> CI/runtime evidence
-> authorization gate
```

A Local writer could also produce poor code; the architecture therefore relies on independent review and empirical verification rather than trusting one implementation agent.

## 11. Current validated facts

As of 2026-09-08:

- ChatGPT Website can access private repositories through the connected GitHub integration when permissioned.
- The integration has been validated for branch/file/commit/PR operations.
- Merge execution has also been validated.
- GitHub permission mode for the writer can be configured to `Allow all actions` where available.
- The current plugin still models account/runtime identity too strongly by provider and therefore does not yet implement the full multi-account design.
- The current team orchestrator synthesizes with the last provider; target behavior is explicit ChatGPT synthesis.
- The current ChatGPT thinking default is Medium; target behavior is High.

## 12. Detailed documents

- [`README.md`](./README.md) — documentation index
- [`SRS.md`](./SRS.md) — normative target requirements
- [`WORKFLOW.md`](./WORKFLOW.md) — coding workflow
- [`ROADMAP.md`](./ROADMAP.md) — implementation phases
- [`TODO.md`](./TODO.md) — prioritized engineering tasks
- [`UPDATE.md`](./UPDATE.md) — latest validated architecture changes
- [`ADR/0001-local-control-plane.md`](./ADR/0001-local-control-plane.md)
- [`ADR/0002-verbatim-handoffs.md`](./ADR/0002-verbatim-handoffs.md)
- [`ADR/0003-multi-account-capability-routing.md`](./ADR/0003-multi-account-capability-routing.md)
- [`ADR/0004-pr-centric-review-loop.md`](./ADR/0004-pr-centric-review-loop.md)
- [`ADR/0005-durable-jobs-and-events.md`](./ADR/0005-durable-jobs-and-events.md)

## 13. Defining principle

> **Local is the workflow authority and control plane. Website teams provide broad cognition, a separate capability-bearing ChatGPT account performs concrete GitHub work, reasoning/review outputs are handed to that writer without Local reinterpretation, and the PR/CI loop provides independent verification before an authorized merge.**
