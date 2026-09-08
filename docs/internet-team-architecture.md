# Internet Team Architecture

> **Status:** Target architecture overview  
> **Current implementation:** see [`how-it-works.md`](./how-it-works.md)  
> **Normative requirements:** see [`SRS.md`](./SRS.md)  
> **User-visible coding flow:** see [`WORKFLOW.md`](./WORKFLOW.md)  
> **Deterministic runtime design:** see [`WORKFLOW-ENGINE.md`](./WORKFLOW-ENGINE.md)

This document is intentionally concise. Detailed requirements, decisions, workflow mechanics, roadmap, and implementation work are split into focused documents under `docs/`.

## 1. Goal

Evolve `@tsuuanmi/internet` from browser-backed ChatGPT/Gemini tools into a durable workflow runtime where Website Agents can perform long-running reasoning, repository work, and review without forcing Local to absorb or rewrite all intermediate reasoning.

The central optimization is:

> **Keep Local focused on the user and authority; let WorkflowEngine own deterministic orchestration; move broad cognition and repository mutation to Website Agents with the right context and capabilities.**

## 2. Roles

### User — authority

The user owns the meaningful final acceptance decision in the standard coding workflow: merge authorization.

### Local Agent — user-facing authority broker

Local is responsible for:

- receiving `/workflow <task>`;
- preserving user intent and constraints;
- receiving compact progress/action-required events;
- carrying approval/rejection/cancel decisions;
- exceptions and authority changes;
- targeted verification when justified.

Local is not required to perform broad code reading, routine implementation, normal-path summarization, or deterministic phase tracking.

### WorkflowEngine — deterministic control plane

WorkflowEngine owns:

- durable job state;
- exact workflow transitions;
- team fan-out and retries;
- deterministic workflow prompts;
- verbatim handoff delivery;
- writer/review sequencing;
- PR/remediation lifecycle;
- scoped confirmation handling;
- merge authorization state;
- compact event emission.

### Website thinking teams — cognition plane

Thinking/review teams perform repository reading, research, architecture/root-cause analysis, critique/debate, and independent PR review.

Workflow-owned teams are run directly by the engine against the lower-level team runtime rather than through a free-form intermediary subagent.

The default final synthesizer is `chatgpt-thinker`, independent of speaking order.

### ChatGPT writer — terminal action plane

A separate ChatGPT Website account acts as the GitHub writer.

Validated capabilities include private-repository read, branch creation, file mutation, commit, pull-request creation/update, and merge when permitted.

### GitHub / CI — shared empirical artifact

The PR becomes the canonical shared implementation artifact for exact diff, commits, review, CI, remediation history, and merge state.

## 3. Standard coding workflow

```text
USER
  |
  | /workflow <task>
  v
LOCAL
  resolve objective / repo / revision
  |
  v
WORKFLOW ENGINE
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
     code / commit / PR
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
       LOCAL PRESENTS PR
              |
              v
        USER AUTHORIZES
              |
              v
         WRITER MERGES
              |
              v
             DONE
```

## 4. Data plane and control plane

### Data plane

```text
Team final output -> Writer
Review final output -> Writer
Repository/PR -> Review teams
```

These payloads are delivered verbatim in the normal path and do not need to enter Local context.

### Deterministic control plane

```text
WorkflowEngine -> start teams
WorkflowEngine -> wait for required handoffs
WorkflowEngine -> start writer
WorkflowEngine -> start review
WorkflowEngine -> request remediation
WorkflowEngine -> enforce review/merge gates
```

### Authority plane

```text
User -> authorize/reject merge and other escalated decisions
Local -> present action-required state and carry the user's decision
```

## 5. Explicit workflow trigger

The normal UX remains:

```text
/workflow <task>
```

Automatic intent detection is deferred.

`/workflow` becomes a thin adapter over `internet_workflow.start(...)`; it is not a macro that injects the entire workflow protocol as one prompt.

See [`ADR/0006-workflow-command-starts-real-engine.md`](./ADR/0006-workflow-command-starts-real-engine.md).

## 6. Account model

Provider identity is not enough.

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

## 7. Handoff model

Team and review final outputs are delivered unchanged:

```text
handoff.payload == source.final_output
```

Metadata such as source, sequence, payload hash, and receipt sits outside the payload.

The writer starts a phase only after all configured required handoffs have been delivered.

## 8. Direct team execution

WorkflowEngine should retain the useful properties of background DSH subagents without relying on them as reasoning intermediaries.

It therefore provides:

- automatic deterministic team prompt construction;
- multiple concurrent logical team runs;
- durable independent Website conversations;
- team retry/completion tracking;
- compact completion events to Local;
- exact final outputs directly to handoff recipients.

See [`ADR/0008-direct-team-execution.md`](./ADR/0008-direct-team-execution.md).

## 9. PR-centric review

The writer creates the PR before post-review.

Review teams inspect the real PR directly. Local no longer needs to create/push an implementation simply to expose code to Website reviewers.

## 10. Approval policy

The standard workflow distinguishes producing a reviewable PR from accepting it into the target branch.

Recognized in-scope implementation confirmations may be auto-confirmed when the job/controller can reliably bind them to the active repository, writer, action, state, and branch/PR.

Unknown confirmations fail closed.

Merge remains the normal human gate:

```text
review gates pass
-> READY_FOR_MERGE_AUTHORIZATION
-> Local presents concrete PR
-> user approves exact reviewed head
-> writer merges
```

See [`ADR/0007-approval-policy.md`](./ADR/0007-approval-policy.md).

## 11. Durable jobs and events

The workflow can run much longer than one Local turn.

Therefore long-running work uses persistent job state and compact events rather than one blocking tool call.

Local normally receives only useful progress or action-required events, not raw team/reviewer reasoning.

See [`ADR/0005-durable-jobs-and-events.md`](./ADR/0005-durable-jobs-and-events.md) and [`WORKFLOW-ENGINE.md`](./WORKFLOW-ENGINE.md).

## 12. Local verification policy

Local reads on exception, not by default.

Targeted inspection is appropriate when risk is high, writer becomes `BLOCKED`, review teams disagree materially, CI/runtime evidence is inadequate, Task/Decision authority may need to change, or the user asks Local to inspect directly.

## 13. Quality model

No writer is assumed infallible.

Quality comes from the pipeline:

```text
independent thinking
-> verbatim implementation handoff
-> concrete PR
-> independent post-review
-> remediation
-> CI/runtime evidence
-> explicit merge authorization
```

## 14. Current validated facts

As of 2026-09-08:

- ChatGPT Website can access private repositories through the connected GitHub integration when permissioned.
- Branch/file/commit/PR operations and merge execution have been validated.
- Website actions may still surface an `Allow` confirmation.
- The current plugin still models account/runtime identity too strongly by provider.
- The current `/workflow` command is prompt-driven rather than a real durable workflow engine.
- The team orchestrator now routes synthesis through an explicit configured provider; ChatGPT is the default.
- Ordinary ChatGPT browser turns now default to High reasoning unless explicitly overridden.

## 15. Detailed documents

- [`README.md`](./README.md) — documentation index
- [`SRS.md`](./SRS.md) — normative target requirements
- [`WORKFLOW.md`](./WORKFLOW.md) — user-visible coding workflow
- [`WORKFLOW-ENGINE.md`](./WORKFLOW-ENGINE.md) — deterministic runtime design
- [`ROADMAP.md`](./ROADMAP.md) — implementation phases
- [`TODO.md`](./TODO.md) — prioritized engineering tasks
- [`UPDATE.md`](./UPDATE.md) — latest architecture changes
- [`ADR/`](./ADR/) — accepted architecture decisions

## 16. Defining principle

> **User owns authority, Local brokers authority, WorkflowEngine deterministically orchestrates, Website teams reason, the writer performs scoped GitHub work, and the PR/review loop provides independent verification before an explicitly authorized merge.**
