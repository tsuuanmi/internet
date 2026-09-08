# ADR-0001 — Local Is the User-Facing Authority Broker

- **Status:** Accepted, amended 2026-09-08
- **Date:** 2026-09-08

## Context

The earlier architecture assigned too many responsibilities to the Local Agent: user interaction, task authority, repository reading, reasoning, implementation, review, and merge.

The validated GitHub-connected ChatGPT Website writer can read private repositories, create branches, modify files, commit, open/update pull requests, and execute merge actions when authorized. Website thinking teams can perform broad repository reading and reasoning.

A further refinement is now required: Local should not itself be the deterministic workflow state machine. That responsibility belongs to plugin code.

## Decision

Local is the **user-facing authority broker and workflow client**.

A dedicated `WorkflowEngine` is the **deterministic orchestration control plane**.

### Local owns

- user interaction;
- interpretation of the explicit `/workflow <task>` request;
- authoritative user intent, constraints, Tasks, and Decisions;
- receiving compact progress/action-required events;
- approving, rejecting, retrying, cancelling, or escalating when authority is required;
- targeted inspection when an exception or high-risk condition warrants it;
- presenting the final merge request to the user.

### WorkflowEngine owns

- durable workflow state;
- team fan-out;
- team completion tracking;
- prompt construction for workflow-owned team runs;
- deterministic handoff delivery;
- writer start/remediation control messages;
- PR/review lifecycle;
- retry/idempotency policy;
- approval-state detection and scoped auto-approval policy;
- event generation and resumption.

### Website teams own

- broad repository reading;
- reasoning/research;
- independent analysis;
- PR review.

### Writer owns

- repository mutation;
- branch/commit/PR creation and update;
- remediation;
- merge execution after user authorization.

## Control plane vs data plane

```text
USER AUTHORITY
User
  -> approve / reject / cancel / merge decision

USER-FACING AUTHORITY BROKER
Local
  -> starts workflow, receives events, carries user decisions

DETERMINISTIC CONTROL PLANE
WorkflowEngine
  -> state transitions / routing / retries / gates

DATA PLANE
Team outputs -> Writer
Review outputs -> Writer
Repository/PR -> Reviewers
```

Local must not summarize reasoning payloads as part of normal routing.

## Local reads on exception, not by default

Local should inspect source, raw team outputs, detailed diffs, or CI/runtime evidence when required by:

- a high-risk change;
- conflicting reviewer results;
- a `BLOCKED` writer state;
- an authoritative Task/Decision change;
- unclear or failed CI/runtime evidence;
- a security, persistence, concurrency, migration, or authorization concern;
- explicit user request.

## Consequences

### Positive

- Local context is reserved for user interaction and decision-relevant state.
- Workflow correctness is enforced by code instead of a giant prompt.
- Website quota and long-lived context are used more effectively.
- Fewer summarization/transformation layers can distort implementation intent.
- Local can coordinate multiple long-running workflows without being the implementation worker.

### Negative / risks

- The plugin gains a real state-machine/runtime responsibility.
- Correctness now depends on robust job persistence, eventing, routing, and recovery.
- A writer can still produce poor code; quality therefore depends on the full pipeline, review loop, and CI/runtime evidence.

## Invariant

> User owns authority. Local brokers that authority. WorkflowEngine deterministically orchestrates. Website teams reason. Writer mutates.
