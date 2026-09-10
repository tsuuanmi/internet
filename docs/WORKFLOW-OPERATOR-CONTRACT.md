# Workflow Operator Contract

- **Status:** current as-built contract
- **Last synchronized:** 2026-09-09
- **Scope:** starting, discovering, tracking, stopping and explicitly recovering durable workflow jobs

## Goal

The normal workflow is operable from the user-facing `/workflow` command family without reading `~/.dsh/internet/workflows/jobs/*.json` manually.

The durable workflow job and trace stores remain authoritative. Operator commands are views/actions over that state, not a second orchestration system.

## Command surface

```text
/workflow <objective>                 start a new workflow
/workflow list                        list workflows owned by this Local session
/workflow status [jobId]              inspect one workflow
/workflow watch [jobId]               show the current snapshot and rely on live PROGRESS events
/workflow stop [jobId]                abort active work and persist CANCELLED
/workflow continue [jobId]            resume an explicit retry-required boundary
```

Starting a workflow prints its durable job ID immediately.

## Job selection

Commands never guess across ambiguous jobs.

For `status`, `watch`, `stop`, and `continue`:

1. candidates are scoped to the current owner/Local session;
2. an explicit `jobId` must belong to that session;
3. when omitted, exactly one active job is selected automatically;
4. if multiple active jobs exist, the command lists their IDs in the error and requires an explicit target;
5. for non-mutating inspection, one unambiguous historical job may be selected when no active job exists;
6. terminal jobs cannot be stopped or continued.

## `/workflow list`

`list` is a discovery surface. Jobs are ordered by newest `updatedAt` first and include durable job ID, state, update time, and compact objective text.

Example:

```text
JOB                               STATE                            UPDATED                   OBJECTIVE
5cdf77117800086fb4497e8ac76500ad  RESEARCH_RUNNING                 2026-09-09T13:45:15Z      Fix Gemini login UI...
```

## `/workflow status [jobId]`

`status` is a one-shot control-plane view. It includes:

```text
jobId
objective
workflow state / driver-active marker
Research A/B status + attempts + latest trace stage
writer state
Review A/B status + attempts + latest trace stage
PR URL/base/head/exact head SHA
review cycle
CI/health receipt when present
pending action and expected head when present
last durable update
```

When structured trace evidence exists, a lane can show the exact latest round/account/stage/failure kind rather than only the flattened lane error.

Example:

```text
Workflow 5cdf77117800086fb4497e8ac76500ad
State: RESEARCH_RUNNING · driver active

Research
  A  FAILED   attempt 1 · round 2 · gemini-thinker · provider_turn · FAILED · provider_error
     Gemini failed to execute the newest response; retry the provider turn
  B  RUNNING  attempt 1 · round 2 · chatgpt-thinker · provider_turn · STARTED
```

Full research/review payloads are not dumped into routine status.

## `/workflow watch [jobId]`

The workflow already emits compact `PROGRESS` events to its owning Local session while it runs. `watch` therefore does not create another polling/state machine or duplicate workflow truth.

It returns the authoritative current status snapshot and explicitly confirms that live compact workflow/team events continue through the existing event stream.

This design keeps durable job/trace state authoritative while still giving the user continuous progress without a second orchestration mechanism.

## `/workflow stop [jobId]`

`stop` is immediate terminal cancellation:

```text
resolve exact job
-> WorkflowDriver.cancel(jobId)
-> abort active AbortController
-> propagate AbortSignal into team/writer/browser work
-> await active run settlement
-> persist CANCELLED
-> never resume this job automatically after restart
```

The response includes the most recent structured trace context when available.

`stop` is not pause. `CANCELLED` remains terminal.

## `/workflow continue [jobId]`

`continue` resumes only an explicit durable retry/recovery path. It delegates validation to the workflow engine, restores the persisted resume state, and re-enqueues the driver.

It does not reset a workflow to `CREATED`, re-run completed lanes blindly, or make terminal jobs resumable.

## Parallel lane visibility

Research A/B and Review A/B are independent concurrent workflow lanes. Status/progress may therefore show both active at once:

```text
Research
  A RUNNING · round 2 · gemini-thinker
  B RUNNING · round 1 · chatgpt-thinker
```

The engine launches both incomplete lane promises before awaiting either. Same-account turns may still serialize through the account scheduler; that is independent of workflow-lane concurrency.

## Action-required visibility

When user authority is required, status exposes the concrete pending action and exact head where applicable.

Example:

```text
ACTION REQUIRED: MERGE_AUTHORIZATION_REQUIRED
expected_head=<exact SHA>
```

Approval itself remains governed by the existing exact repository + PR + head authorization policy.

## Failure detail

The private bounded workflow team trace records:

```text
phase
lane
attempt
round
accountId
provider
stage
status
timestamps
structured failure kind/message/retryability
bounded completed-turn text
```

Provider/browser errors are visible as execution failures, not mistaken for intellectual disagreement or valid teammate output.

## Invariants

- routine workflow operation does not require filesystem inspection;
- omitted job IDs are used only when unambiguous;
- status/watch read authoritative durable state;
- live progress uses the existing event stream rather than a duplicate watcher state machine;
- stop settles active work before terminal cancellation is persisted;
- cancelled jobs do not restart automatically;
- continue requires an explicit durable recovery path;
- A/B lane concurrency remains visible and preserved;
- full model payloads are not injected into Local progress events.
