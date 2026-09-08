# ADR-0005 — Long-Running Work Uses Durable Jobs and Events

- **Status:** Accepted, amended 2026-09-08
- **Date:** 2026-09-08

## Context

Website teams and the terminal writer can run for a long time. A coding workflow can include:

- two thinking teams;
- final synthesis in each team;
- verbatim handoffs to the writer;
- implementation and PR creation;
- two review teams;
- remediation and repeated review;
- merge authorization;
- merge execution.

Keeping one Local tool call alive across the entire lifecycle is fragile and unnecessarily occupies Local execution/context. The workflow also needs to continue independently of one model turn and pause safely when user authority is required.

## Decision

Long-running workflows are represented as **durable jobs** with explicit code-owned state and event-driven continuation.

Starting `/workflow <task>` should return quickly with a `job_id`. WorkflowEngine continues work independently and emits only useful compact events to Local.

## Example state machine

```text
CREATED
  |
  v
RESEARCH_RUNNING
  |
  v
RESEARCH_HANDOFFS_DELIVERING
  |
  v
WRITER_RUNNING
  |
  v
PR_OPEN
  |
  v
REVIEW_RUNNING
  |
  v
REVIEW_HANDOFFS_DELIVERING
  |
  +----> WRITER_REMEDIATING -> REVIEW_RUNNING
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

Exception/failure states may include:

```text
BLOCKED
UNKNOWN_CONFIRMATION
FAILED_RETRYABLE
FAILED_TERMINAL
CANCELLED
```

Routine recognized implementation/PR confirmation prompts do not need a top-level human wait state; they may be handled by the scoped auto-approval policy in ADR-0007.

## Event classes

### INTERNAL

Not normally surfaced to Local.

Examples:

```text
TEAM_COMPLETED
HANDOFF_DELIVERED
WRITER_RECEIPT_UPDATED
```

### PROGRESS

Compact optional user-facing progress.

Examples:

```text
PR_OPENED
REVIEW_CYCLE_STARTED
REMEDIATION_STARTED
```

### ACTION_REQUIRED

Must notify Local.

Examples:

```text
MERGE_AUTHORIZATION_REQUIRED
WRITER_BLOCKED
UNKNOWN_CONFIRMATION
REVIEW_LIMIT_REACHED
ACCOUNT_REAUTH_REQUIRED
```

Full team/reviewer reasoning is data-plane content and is not a Local progress event.

## Wait tool

A `wait(job_id, timeout)` convenience capability may exist, but it is not the primary architecture.

Preferred model:

```text
start -> job_id

... Local continues other work ...

runtime injects compact event later
```

If DSH provides a host-native background completion/event injection mechanism, the plugin should integrate with that mechanism rather than invent a busy-poll loop.

## Persistence

At minimum persist:

```text
job_id
objective
repository/base revision
team-run identities and status
account routing
current state
handoff receipts
writer conversation identity
PR identity once created
review cycle count
pending action
merge authorization binding
last durable event
```

Do not persist secrets in job state.

## Idempotency

State transitions and external actions should be idempotent where practical.

Examples:

- do not deliver the same handoff twice without an idempotency key;
- do not create duplicate PRs after retry if the existing PR receipt is known;
- do not execute merge twice;
- invalidate merge authorization if the expected reviewed PR head changes.

## Consequences

- Local is not held hostage by long browser calls.
- Most workflow execution can proceed without user interruption until merge.
- Multiple workflows can coexist.
- Recovery and observability improve.
- Runtime complexity increases because jobs, storage, events, and idempotency become first-class concerns.

## Invariant

> Long-running Website work belongs to a durable code-owned workflow state machine, not to one fragile synchronous Local invocation or one giant prompt.
