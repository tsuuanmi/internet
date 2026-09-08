# ADR-0005 — Long-Running Work Uses Durable Jobs and Events

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

Website teams and the terminal writer can run for a long time. A coding workflow can include:

- two parallel thinking teams;
- final synthesis in each team;
- two verbatim handoffs to the writer;
- implementation;
- a GitHub permission checkpoint;
- pull-request creation;
- two parallel review teams;
- remediation;
- repeated review;
- merge authorization;
- merge execution.

Keeping one Local tool call alive across the entire lifecycle is fragile and unnecessarily occupies Local execution/context. Browser work may also pause for user approval or survive longer than one Local turn.

## Decision

Long-running Internet Team workflows are represented as **durable jobs** with explicit state and event-driven continuation.

Starting a job should return quickly with a `job_id`. The runtime continues work independently and emits events when Local/user attention is needed or when a major milestone completes.

## Example state machine

```text
CREATED
  |
  v
TEAM_A_RUNNING + TEAM_B_RUNNING
  |
  v
TEAM_RESULTS_READY
  |
  v
HANDOFFS_DELIVERING
  |
  v
WRITER_READY
  |
  v
WRITER_RUNNING
  |
  +----> AWAITING_EXTERNAL_APPROVAL ----+
  |                                      |
  +<-------------------------------------+
  |
  v
PR_OPEN
  |
  v
REVIEW_A_RUNNING + REVIEW_B_RUNNING
  |
  v
REVIEWS_READY
  |
  v
REVIEWS_DELIVERED
  |
  +----> WRITER_REMEDIATING -> PR_OPEN
  |
  v
READY_FOR_MERGE_AUTHORIZATION
  |
  v
AWAITING_MERGE_AUTHORIZATION
  |
  v
MERGING
  |
  v
DONE
```

Failure/exception states may include:

```text
BLOCKED
FAILED_RETRYABLE
FAILED_TERMINAL
CANCELLED
```

## Event model

Events should be compact and workflow-oriented.

Examples:

```text
TEAM_RESULT_READY
HANDOFF_DELIVERED
WRITER_STARTED
AWAITING_EXTERNAL_APPROVAL
PR_OPENED
REVIEW_RESULT_READY
REVIEWS_DELIVERED
NEEDS_FIX
READY_FOR_MERGE_AUTHORIZATION
MERGED
JOB_FAILED
```

Local should be notified only when the event is useful to control flow or user interaction.

## Wait tool

A `wait(job_id, timeout)` capability may exist for clients that want synchronous behavior, but it is not the primary architecture.

The preferred model is:

```text
start_job -> job_id

... Local continues other work ...

runtime injects/returns event later
```

If the host DSH runtime already supports background agents that inject completion messages into a parent conversation, the Internet plugin should integrate with that mechanism rather than implement an incompatible polling loop.

## Persistence

Job state must be recoverable after:

- Local turn completion;
- plugin/browser restart where feasible;
- temporary provider failure;
- user approval delay.

At minimum persist:

```text
job_id
objective
repository/base revision
required teams
account routing
current state
handoff receipts
writer conversation identity
PR identity once created
review cycle count
pending approval kind
last durable event
```

Do not persist secrets in job state.

## Idempotency

State transitions and external actions should be idempotent where practical.

Examples:

- do not deliver the same handoff twice without an idempotency key;
- do not create duplicate PRs after retry if the existing PR receipt is known;
- do not execute merge twice;
- verify expected PR head before merge.

## Consequences

- Local is not held hostage by a long-running browser call.
- User approval checkpoints can pause and resume cleanly.
- Multiple workflows can coexist.
- Recovery and observability improve.
- Runtime complexity increases because jobs, storage, events, and idempotency become first-class concerns.

## Invariant

> Long-running Website work belongs to a durable workflow state machine, not to one fragile synchronous Local invocation.
