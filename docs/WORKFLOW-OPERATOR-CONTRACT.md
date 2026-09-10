# Workflow Operator Contract

- **Status:** current as-built contract
- **Last synchronized:** 2026-09-10
- **Scope:** starting, discovering, tracking, stopping and explicitly recovering durable workflow jobs

## Goal

The normal workflow is operable from the user-facing `/workflow` command family without reading `~/.dsh/internet/workflows/jobs/*.json` manually.

The durable workflow job and trace stores remain authoritative. Operator commands are views/actions over that state, not a second orchestration system.

The operator view should answer immediately:

```text
Which workflow phase is active?
Which Team A/B is running or failed?
Which round/member/stage is each team on?
What failed, is it retryable, and which backing provider/account produced the failure?
What is waiting on that result?
```

## Command surface

```text
/workflow <objective>                 start a new workflow
/workflow list                        list workflows owned by this Local session
/workflow status [jobId]              inspect one workflow
/workflow watch [jobId]               show the current snapshot and rely on live PROGRESS events
/workflow stop [jobId]                abort active work and persist CANCELLED
/workflow continue [jobId]
/workflow delete <jobId>            resume an explicit retry-required boundary
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

## `/workflow status [jobId]`

`status` is a one-shot control-plane view with two levels:

1. a compact end-to-end `Pipeline` summary;
2. detailed per-team execution state.

Normal team presentation is provider-agnostic. `Member 1`, `Member 2`, ... are derived from the job's ordered thinker routing. Backing account/provider identity is included only under `Diagnostic` when a failure requires source attribution.

Example retry-required state:

```text
Workflow a3bbaeabf4b8495b0956b754a35c3263
State: FAILED_RETRYABLE
Current: Research · retry required
Objective: Fix the login UI alignment

Pipeline
  Research  Team A=failed · Team B=completed
  Writer    waiting for research
  Review    Team A=pending · Team B=pending
  PR        not created

Research teams
  Team A — FAILED (attempt 1)
    Step: round 1 · Member 2 · provider turn · FAILED · provider_error
    Members: Member 1=completed round 1 · Member 2=failed round 1
    Error: provider_error · retryable
      Provider failed to execute the newest response; retry the provider turn
    Diagnostic: chatgpt-thinker-2 · chatgpt-web

  Team B — COMPLETED (attempt 1)
    Step: synthesis · COMPLETED
    Members: Member 1=completed round 2 · Member 2=completed round 2
    Result: ready for handoff

Writer
  Account: chatgpt-writer
  Status: waiting for research

Review teams
  Team A — PENDING (attempt 0)
  Team B — PENDING (attempt 0)

PR
  not created

ACTION REQUIRED: RETRY_REQUIRED
  One or more research lanes failed; retry runs only incomplete lanes.
```

This layout deliberately distinguishes workflow state (`FAILED_RETRYABLE`) from the exact team execution failure (`Research Team A`, `Member 2`, `round 1`, `provider turn`, `provider_error`).

Full research/review payloads are not dumped into routine status.

## `/workflow watch [jobId]`

The workflow emits compact `PROGRESS` events to its owning Local session while it runs. `watch` returns the same authoritative status snapshot and confirms the live dimensions being followed:

```text
phase · Team A/B · attempt · round · Member 1..N · stage · status
```

Example live events:

```text
Research · Team A · attempt 1 · round 1 · Member 1 · provider turn · STARTED
Research · Team B · attempt 1 · round 1 · Member 1 · provider turn · STARTED
Research · Team A · attempt 1 · round 1 · Member 1 · provider turn · COMPLETED
Research · Team A · attempt 1 · round 1 · Member 2 · provider turn · STARTED
Research · Team A · attempt 1 · round 1 · Member 2 · provider turn · FAILED · provider_error · source=chatgpt-thinker-2/chatgpt-web · <message>
```

The backing account/provider is added only on failed progress events for diagnostics. Ordinary progress stays member-oriented.

`watch` does not create another polling/state machine or duplicate workflow truth. Durable job/trace state remains authoritative.

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

The response includes the most recent structured team/member context when available.

`stop` is not pause. `CANCELLED` remains terminal.

## `/workflow continue [jobId]
/workflow delete <jobId>`

`continue` resumes only an explicit durable retry/recovery path. It delegates validation to the workflow engine, restores the persisted resume state, and re-enqueues the driver.

It does not reset a workflow to `CREATED`, re-run completed lanes blindly, or make terminal jobs resumable.

## Parallel team visibility

Research Team A/B and Review Team A/B are independent concurrent workflow lanes. Status/progress may therefore show both active at once:

```text
Pipeline
  Research  Team A=running · Team B=running

Research teams
  Team A — RUNNING (attempt 1)
    Step: round 2 · Member 1 · provider turn · STARTED
  Team B — RUNNING (attempt 1)
    Step: round 1 · Member 2 · provider turn · STARTED
```

The engine launches both incomplete lane promises before awaiting either. Same-account turns may still serialize through the backing account scheduler; that is independent of workflow-lane concurrency.

## Action-required visibility

When user authority is required, status exposes the concrete pending action and exact head where applicable.

Example:

```text
ACTION REQUIRED: MERGE_AUTHORIZATION_REQUIRED
expected_head=<exact SHA>
```

Approval itself remains governed by the existing exact repository + PR + head authorization policy.

## Failure detail

The private bounded workflow team trace retains authoritative diagnostic fields:

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

The operator projection converts normal account identity to `Member N`; raw account/provider data remains available for explicit failure diagnostics. Provider/browser errors are visible as execution failures, not mistaken for intellectual disagreement or valid member output.

## Invariants

- routine workflow operation does not require filesystem inspection;
- omitted job IDs are used only when unambiguous;
- status/watch read authoritative durable state;
- status clearly separates pipeline state from Team A/B execution detail;
- ordinary team presentation is provider-agnostic;
- backing provider/account identity appears only when diagnostic attribution is useful;
- live progress uses the existing event stream rather than a duplicate watcher state machine;
- stop settles active work before terminal cancellation is persisted;
- cancelled jobs do not restart automatically;
- continue requires an explicit durable recovery path;
- A/B lane concurrency remains visible and preserved;
- full model payloads are not injected into Local progress events.


### Explicit deletion

`/workflow delete <jobId>` always requires an exact workflow ID. If the selected workflow is still non-terminal, the operator cancels and settles it first, then removes that job's durable handoffs, bounded team trace, and job record. Omitted IDs are never inferred for deletion.
