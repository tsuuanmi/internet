# Architecture Update — 2026-09-08

This document records validated discoveries and architecture changes. Normative details live in SRS/ADR/WORKFLOW documents.

## Validated capabilities

The connected ChatGPT Website GitHub integration has been validated end-to-end against private repositories for:

- repository/file fetch;
- branch creation;
- file creation/update;
- commit creation;
- pull-request creation;
- pull-request merge.

A dedicated ChatGPT Website writer account can therefore serve as the terminal GitHub agent without requiring Local to implement or push code first.

## Newly refined architecture

### 1. `/workflow <task>` remains explicit

Automatic task detection is deferred.

The user starts the coding workflow explicitly with:

```text
/workflow <task>
```

But the command must evolve from the current giant-prompt prototype into a thin adapter over `internet_workflow.start(...)` and a durable `WorkflowEngine`.

### 2. Local is not the state machine

Updated responsibility split:

```text
User
  = authority

Local
  = user-facing authority broker / workflow client

WorkflowEngine
  = deterministic orchestration control plane

Website teams
  = repository reading / reasoning / review

Writer
  = repository mutation / PR / authorized merge execution
```

Local remains able to inspect details on exception, but code-owned workflow state decides what happens next.

### 3. Workflow-owned teams should run directly

The current prompt asks Local to spawn free-form DSH subagents which then call `internet_team`. That preserves useful background execution, but introduces an avoidable transformation layer because a child agent may inspect code itself or summarize the team result before returning.

Target behavior:

```text
WorkflowEngine
  -> TeamRun A / TeamRun B
  -> lower-level team runtime
  -> ChatGPT final synthesis
  -> exact final output
  -> writer handoff
```

The engine itself prepares deterministic team tasks, starts multiple logical teams, tracks completion/retry, and uses compact completion events.

### 4. Preserve the good background-subagent UX

Even without a free-form child agent intermediary, the workflow should preserve:

- automatic prompt preparation;
- multiple concurrent logical team runs;
- durable independent Website conversations;
- automatic completion/event injection to Local;
- ability for Local to continue other work while teams run.

The difference is that Local receives compact workflow events instead of raw/transformed reasoning payloads.

### 5. Implementation/PR confirmations can auto-allow

Starting `/workflow` authorizes the scoped actions required to produce and remediate a reviewable PR for the selected repository.

Recognized confirmations for branch/file/commit/PR actions may therefore be auto-confirmed when the active job, repository, writer session, action, workflow state, and branch/PR identity all match.

Unknown confirmation UI must fail closed and notify Local.

### 6. Merge is the normal human authority gate

PR creation is not the normal user checkpoint.

After review gates pass:

```text
READY_FOR_MERGE_AUTHORIZATION
  -> Local presents concrete PR
  -> user approves/rejects
```

Only after explicit user approval may the writer request merge and the controller click the Website merge `Allow` prompt.

Merge authorization should be bound to the exact reviewed PR head SHA; a changed head invalidates stale authorization.

### 7. `internet_workflow` is the preferred workflow API name

Conceptual operations:

```text
start
status
approve
reject
cancel
continue
```

`/workflow` remains the standard UX wrapper.

## Existing architecture points retained

The following remain unchanged:

- first-class semantic account identities now exist for `chatgpt-thinker`, `chatgpt-writer`, and `gemini-thinker`; provider-keyed browser/storage state is the next migration step;
- team synthesis is explicitly routed through a configured provider; ChatGPT is the default synthesizer;
- ChatGPT browser default is `high`;
- two thinking teams feed exact outputs to the writer;
- two post-PR review teams feed exact outputs back to the writer;
- PR is the canonical shared implementation artifact;
- Local does not summarize normal team/review handoffs;
- durable jobs/events replace one long Local call;
- technical merge capability does not equal merge authorization.

## Updated target path

```text
User
  -> /workflow <task>
  -> Local resolves repo/revision
  -> WorkflowEngine creates durable job
  -> Team A + Team B run directly
  -> ChatGPT synthesizes each
  -> exact outputs -> Writer
  -> START_IMPLEMENTATION
  -> Writer creates PR
     -> scoped implementation confirmations auto-allowed when recognized
  -> Review A + Review B inspect PR directly
  -> exact review outputs -> Writer
  -> APPLY_REVIEWS
  -> Writer updates same PR
  -> review gates pass
  -> Local presents merge request
  -> user authorizes exact reviewed head
  -> Writer merges; merge confirmation executed on user's behalf
  -> DONE
```

## Documents

Normative/design details now live in:

- `SRS.md`
- `WORKFLOW.md`
- `WORKFLOW-ENGINE.md`
- `ADR/0001-local-control-plane.md`
- `ADR/0002-verbatim-handoffs.md`
- `ADR/0003-multi-account-capability-routing.md`
- `ADR/0004-pr-centric-review-loop.md`
- `ADR/0005-durable-jobs-and-events.md`
- `ADR/0006-workflow-command-starts-real-engine.md`
- `ADR/0007-approval-policy.md`
- `ADR/0008-direct-team-execution.md`
- `ROADMAP.md`
- `TODO.md`

`internet-team-architecture.md` remains a concise overview rather than accumulating implementation detail.
