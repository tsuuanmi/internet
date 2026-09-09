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

The giant-prompt prototype has now been replaced by a thin adapter over a durable `WorkflowEngine`: `/workflow` resolves repository authority and exact `HEAD`, creates a job, and returns the job ID.

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

Workflow-owned research now bypasses the old free-form DSH child intermediary and calls the lower-level team runtime directly. This removes an avoidable transformation layer while retaining deterministic independent team lanes.

Implemented behavior:

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

## Multi-account foundation implemented

P1 TODO #4–#7 are implemented together as a coherent identity-boundary change:

```text
accounts/chatgpt-thinker.json
accounts/chatgpt-writer.json
accounts/gemini-thinker.json

chatgpt-thinker/login-profile
chatgpt-writer/login-profile
gemini-thinker/login-profile

<accountId>/conversations/<sha256(sessionId)>.json
```

`BrowserManager` browser pools, launches, schedulers, remote logins, active contexts, delayed closes, and account commit queues are keyed by `accountId`. `chatgpt-thinker` and `chatgpt-writer` therefore have independent authentication state and independent scheduler locks even though both use the ChatGPT Web implementation.

## Writer and PR path implemented

P5 TODO #19–#21 now connects the exact research data plane to the separate Website writer account:

```text
Research A exact final
  -> chatgpt-writer conversation
Research B exact final
  -> same chatgpt-writer conversation
START_IMPLEMENTATION
  -> same conversation
Writer verifies repo/base, implements, validates
  -> create/update exactly one PR
  -> strict PR_OPEN receipt or BLOCKED
```

The writer conversation is stable for the workflow job and is intended to continue through later remediation. Durable delivery receipts prevent acknowledged Research A/B handoffs from being resent when a transient writer-control call is retried. Successful output persists repository, PR number/URL, base/head, and exact head SHA in the job before review begins. Merge remains explicitly outside this phase.

## Scoped Website approval controller implemented

P6 TODO #22–#25 now turns the accepted ADR-0007 policy into code. Website GitHub confirmation handling is no longer a generic “click Allow” behavior. The controller first recognizes a narrow confirmation surface, parses one supported action and its repository/branch/PR identity, then evaluates that observation against deterministic workflow context.

The phase-1 auto-approval boundary is:

```text
chatgpt-writer only
+ exact writer conversation
+ exact repository
+ permitted WRITER_RUNNING / WRITER_REMEDIATING state
+ allowlisted implementation/remediation action
+ exact workflow branch / persisted PR identity
=> scoped Allow
```

Everything else fails closed. The workflow supplies only expected approval scope; BrowserManager injects the actual account/session identity at the Website boundary. Unknown, malformed, ambiguous, or scope-mismatched confirmations become durable `UNKNOWN_CONFIRMATION` ACTION_REQUIRED state and retain `WRITER_RUNNING` as the explicit resume target. Repository authority is checked before merge classification: a cross-repo merge prompt is unknown, while a correctly scoped premature merge attempt becomes ordinary writer `BLOCKED` and is never auto-clicked before the later user-owned merge gate.

The deterministic initial workflow branch is `internet-workflow/<job_id>` so branch identity can be checked before a PR receipt exists. Once the writer opens a PR, the persisted PR head and number become the authority for remediation confirmations.

## Existing architecture points retained

The following remain unchanged:

- first-class semantic account identities now exist for `chatgpt-thinker`, `chatgpt-writer`, and `gemini-thinker`; portable account state, login profiles, BrowserManager maps, durable conversations, and scheduler locks are all account-scoped;
- authenticated runtime APIs require explicit `accountId`; provider is derived from the account catalog and is never used as an implicit account selector;
- portable account files use schema version 2 with both `accountId` and provider identity, and version-1 provider-keyed files are intentionally not migrated or read as fallback;
- team synthesis is explicitly routed through the configured `chatgpt-thinker` account, independent of speaking order;
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


## P7 — Exact-head PR review and remediation

P7 now drives two independent reviewer lanes against the actual persisted pull request and exact head SHA. Reviewer
finals are strict JSON carrying `PASS` / `CHANGES_REQUIRED` plus an asserted `reviewedHeadSha`; malformed or stale-head
results fail closed. Both complete reviewer payloads are stored and delivered verbatim to the persistent writer.

If both reviewers pass, the workflow stops at `READY_FOR_MERGE_AUTHORIZATION`. Otherwise a separate `APPLY_REVIEWS`
control instructs the writer to remediate the same PR. The engine requires unchanged PR identity and an advanced head
SHA before starting the next review cycle. Review conversations remain stable per job, the default cycle limit is three,
and limit exhaustion or writer/confirmation failures surface as explicit action-required states. Website memory remains
a deferred optimization; it is not used for review correctness.
