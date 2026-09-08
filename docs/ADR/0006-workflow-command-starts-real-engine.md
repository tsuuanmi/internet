# ADR-0006 — `/workflow` Starts a Real Workflow Engine

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The current `/workflow <objective>` command resolves repository metadata and then injects one large multi-phase prompt into the Local Agent. The command itself does not own durable workflow state, team cardinality, handoff delivery, writer lifecycle, review lifecycle, or approval gates.

That design is useful as a prototype but leaves orchestration correctness to model compliance.

## Decision

Keep the explicit UX:

```text
/workflow <task>
```

Do not add automatic task detection at this stage.

However, `/workflow` becomes a thin adapter over a real workflow API:

```text
/workflow <task>
  -> resolve repository + revision
  -> internet_workflow.start(...)
  -> WorkflowEngine
  -> durable job_id
```

The command must not encode the full workflow as one giant follow-up prompt.

## Responsibilities of the command

The command should only:

1. validate the objective;
2. resolve the current Git worktree/upstream repository;
3. resolve the authoritative starting revision;
4. call the workflow service;
5. report the resulting `job_id` and initial state.

## Responsibilities of WorkflowEngine

WorkflowEngine owns:

- exact workflow state transitions;
- two-team fan-out and completion tracking;
- deterministic team/review prompt construction;
- verbatim handoff delivery;
- writer mailbox/control-message sequencing;
- PR lifecycle;
- review/remediation loops;
- scoped approval behavior;
- merge authorization state;
- retries, idempotency, cancellation, and recovery;
- compact progress/action-required events back to Local.

## Model/code boundary

Code decides:

```text
what happens next
which worker/account is used
what payload is delivered
when a stage is complete
when approval is required
```

Models decide:

```text
how to reason
what implementation is best
what problems exist
how to fix them
```

Prompts remain important, but they belong inside individual workflow nodes rather than describing the whole orchestration protocol.

## API naming

The preferred Local-facing tool/service name is:

```text
internet_workflow
```

Possible operations:

```text
start
status
approve
reject
cancel
continue
```

`/workflow` remains the normal user entry point.

## Consequences

- Workflow behavior becomes testable as code.
- Missing/reordered phases become much harder.
- Durable resume/retry becomes possible.
- Local is no longer responsible for remembering the workflow protocol.
- The implementation is more complex than prompt-only orchestration, but the complexity represents real product behavior rather than hidden prompt convention.

## Invariant

> `/workflow` is an explicit UX trigger for deterministic code, not a macro that asks Local to simulate a workflow from prose.
