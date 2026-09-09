# Workflow Operator Contract

- **Status:** proposed user-facing control contract; not implemented yet
- **Last synchronized:** 2026-09-09
- **Scope:** starting, discovering, tracking, watching, stopping and recovering durable workflow jobs

## Goal

The normal workflow must be operable from the same user-facing `/workflow` surface without requiring the operator to inspect `~/.dsh/internet/workflows/jobs/*.json` manually.

The operator should always be able to answer four questions quickly:

```text
What workflows exist?
What is this workflow doing now?
Where exactly is it blocked or failing?
How do I stop it safely?
```

The durable workflow state remains authoritative. These commands are views/actions over that state, not a second orchestration system.

## Command family

Target command surface:

```text
/workflow <objective>                 start a new workflow
/workflow list                        list workflows owned by this Local session
/workflow status [jobId]              inspect one workflow
/workflow watch [jobId]               continuously follow durable progress
/workflow stop [jobId]                abort active work and persist CANCELLED
/workflow continue [jobId]            resume an explicit retry-required boundary
```

Merge authorization remains an explicit authority boundary. The exact command/UI used for approve/reject may stay on the existing deterministic workflow control path, but status/watch must show when approval is required and the exact PR/head involved.

## Job selection when `jobId` is omitted

Commands must never guess across ambiguous jobs.

For `status`, `watch`, `stop`, and `continue`:

1. scope candidates to the current owner/Local session;
2. if exactly one active matching workflow exists, use it;
3. if no active workflow exists and the command permits a historical target, use the latest non-cleaned job only when unambiguous;
4. if multiple candidates remain plausible, show a compact candidate list and require an explicit `jobId`.

A job ID should be printed immediately when `/workflow <objective>` starts so it can always be copied into later commands.

## `/workflow list`

Purpose: discovery, not deep inspection.

Suggested output:

```text
JOB                               STATE               UPDATED                OBJECTIVE
5cdf77117800086fb4497e8ac76500ad  RESEARCH_RUNNING    2026-09-09 20:45:15    Fix Gemini login UI...
...
```

Useful fields:

```text
jobId
state
updatedAt
objective
PR number/head when present
pending action when present
```

Default ordering: newest `updatedAt` first.

The command should make active/non-terminal jobs easy to distinguish from historical `DONE` / `CANCELLED` jobs.

## `/workflow status [jobId]`

Purpose: one-shot control-plane inspection.

It should show the end-to-end pipeline, including both A/B lanes and the exact current team turn where available.

Example:

```text
Workflow 5cdf77117800086fb4497e8ac76500ad
State: RESEARCH_RUNNING
Objective: Fix the Gemini login UI that the screen is not center...

Research
├─ A  FAILED    attempt 1
│  ├─ round 1 · chatgpt-thinker · completed
│  ├─ round 1 · gemini-thinker  · completed
│  ├─ round 2 · chatgpt-thinker · completed
│  └─ round 2 · gemini-thinker  · provider_turn · FAILED
│     provider_error: Gemini failed to execute the newest response; retry the provider turn
└─ B  RUNNING   attempt 1
   └─ round 2 · chatgpt-thinker · provider_turn · running

Writer
└─ waiting for research A/B

Review
├─ A pending
└─ B pending

PR
└─ not created

Last durable update: 2026-09-09 20:45:15 +07
```

When a PR exists, include:

```text
repository
PR number / URL
base branch
head branch
exact head SHA
review cycle
review A/B exact-head result
CI/health state
merge authorization state
```

Status should not dump full model payloads by default. A separate bounded trace/detail view can expose completed turn evidence when needed.

## `/workflow watch [jobId]`

Purpose: follow a long-running workflow without repeatedly re-running `status`.

`watch` is a presentation/read layer only. It must consume durable job/trace events and must not become another correctness state machine.

Useful event examples:

```text
20:41:02  Research A · round 1 · chatgpt-thinker · started
20:41:02  Research B · round 1 · chatgpt-thinker · started/queued
20:42:17  Research A · round 1 · chatgpt-thinker · completed
20:42:18  Research A · round 1 · gemini-thinker · started
20:42:22  Research B · round 1 · gemini-thinker · started
20:45:15  Research A · round 2 · gemini-thinker · FAILED provider_error
20:45:16  Research B · continuing
```

The exact UI may be terminal refresh or appended events. Required behavior is the same:

- show state transitions promptly;
- show phase/lane/round/account/stage;
- show PR/head/CI/approval transitions;
- show failures compactly;
- stop watching when the job reaches a terminal or action-required boundary unless the user explicitly keeps it open.

`watch` must not hold authority, create retries, or change workflow behavior.

## `/workflow stop [jobId]`

Purpose: immediate safe terminal cancellation.

Required semantics:

```text
resolve exact job
  -> abort the WorkflowDriver's active AbortController
  -> propagate cancellation to active team/writer/browser operation
  -> settle the active promise
  -> persist CANCELLED
  -> never resume that job automatically after restart
```

A successful stop should return where execution was interrupted, for example:

```text
Workflow 5cdf7711... cancelled.
Stopped at: research B · round 2 · gemini-thinker · provider_turn
State: CANCELLED
```

`stop` is terminal. It is not pause.

If pause/resume is ever introduced, it needs a separate durable `PAUSED`-style state and explicit design. Do not reinterpret `CANCELLED` as resumable.

## `/workflow continue [jobId]`

Purpose: resume only a workflow that has an explicit durable retry/recovery path, such as `FAILED_RETRYABLE` with a persisted `resumeState`.

It must not provide a generic reset-to-start behavior.

Expected semantics:

```text
FAILED_RETRYABLE + valid resumeState
  -> validate durable state
  -> restore exact resume state
  -> enqueue driver
```

If the job is `CANCELLED`, `DONE`, or otherwise not resumable, the command should refuse clearly.

## Merge/action-required visibility

When user authority is required, both `status` and `watch` must show the exact concrete action rather than a generic waiting state.

Example:

```text
ACTION REQUIRED: merge authorization
PR: #24
Expected head: abcdef1234...
Review: PASS / PASS on this exact head
CI: PASS on this exact head
```

Any later approval remains bound to the exact PR/head. If the head changes, stale approval must not be reused.

## Parallel lane visibility

Research A/B and Review A/B are independent workflow lanes and are intended to run concurrently.

The operator surface must make this visible rather than rendering the workflow as if lane B starts only after lane A completes.

Example:

```text
Research
├─ A RUNNING · round 2 · gemini-thinker
└─ B RUNNING · round 1 · chatgpt-thinker
```

The implementation must preserve concurrent lane scheduling: start both incomplete A/B lane executions before awaiting either result. There must be no workflow-level pattern equivalent to:

```text
await runLaneA()
await runLaneB()
```

Instead, lane execution should be logically/concurrently launched together and independently persisted as each settles.

Individual provider turns may still be serialized by an account-level scheduler when the same authenticated account has a configured concurrency limit. That safety limit is distinct from workflow-lane concurrency. The workflow must not add extra serialization on top of the account scheduler.

In other words:

```text
required:
  Research A  ───────────────►
  Research B  ───────────────►
              concurrent lanes

not required/unsafe to fake:
  two simultaneous turns on one account when that account scheduler forbids it
```

This preserves the prior behavior where the two teams can make progress in parallel while respecting account/browser safety constraints.

## Failure detail and trace drill-down

Routine status should stay compact, but the durable trace must be rich enough to diagnose a failure without guessing.

At minimum the trace should retain:

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
structured failure kind/message
```

Completed model text may be retained in a bounded trace store where policy allows. Full transcripts should not be injected into Local progress events.

## Acceptance criteria

The operator contract is satisfied when:

1. starting a workflow returns a durable job ID;
2. `list` discovers current-session workflows without filesystem inspection;
3. `status` identifies phase/lane/attempt/round/account/stage and current PR/head/CI/action state;
4. `watch` follows the same durable truth without creating a second workflow state machine;
5. `stop` aborts active work and persists terminal `CANCELLED`;
6. cancelled jobs do not resume after plugin restart;
7. `continue` only resumes explicit retry-required states and never resets blindly;
8. action-required output identifies the exact PR/head or exception involved;
9. Research A/B and Review A/B are visibly and operationally concurrent at the workflow-lane level;
10. account scheduler limits may serialize same-account turns, but no additional workflow-level serialization is introduced.
