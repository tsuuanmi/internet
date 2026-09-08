# ADR-0001 — Local Agent Is the Workflow Control Plane

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The earlier architecture assigned too many responsibilities to the Local Agent: user interaction, task authority, repository reading, reasoning, implementation, review, and merge.

The validated GitHub-connected ChatGPT Website account can now read private repositories, create branches, modify files, commit, open pull requests, and execute merge actions when authorized. Website thinking teams can also perform broad repository reading and reasoning.

Keeping source exploration and implementation in Local therefore wastes Local context and creates unnecessary transformation steps between agents.

## Decision

Local is the **control plane** of the workflow.

Its default responsibilities are:

- user-facing interaction;
- understanding task intent and constraints;
- authoritative Task and Decision state;
- spawning and coordinating jobs;
- routing outputs between jobs and capability-bearing agents;
- tracking workflow state;
- handling user/permission checkpoints;
- handling exceptions and conflicts;
- targeted verification when risk or uncertainty warrants it;
- merge authorization policy.

Local is **not** the default implementation worker and is **not** the default repository exploration worker.

Normal-path repository reading is delegated to Website thinking teams. Normal-path repository mutation is delegated to the writer account.

## Control plane vs data plane

The runtime must distinguish:

```text
CONTROL PLANE
Local
  start / stop / route / authorize / retry / escalate

DATA PLANE
Team outputs -> Writer
Review outputs -> Writer
Repository/PR -> Reviewers
```

Local may transport data, but it must not silently transform reasoning payloads as part of normal routing.

## Local reads on exception, not by default

Local should inspect source, raw team outputs, or detailed diffs when required by:

- a high-risk change;
- conflicting reviewer results;
- a BLOCKED writer state;
- an authoritative Task/Decision change;
- unclear or failed CI/runtime evidence;
- a security, persistence, concurrency, migration, or authorization concern;
- explicit user request.

This preserves independent judgment without forcing duplicated broad exploration on every task.

## Consequences

### Positive

- Local context is reserved for user interaction and decision-relevant state.
- Website quota and long-lived context are used more effectively.
- Fewer summarization/transformation layers can distort implementation intent.
- Repository reading and writing are performed by agents that already have the appropriate capability.
- Local can coordinate multiple long-running workflows without being blocked by one implementation.

### Negative / risks

- A writer can still produce poor code.
- Local no longer sees every intermediate reasoning step automatically.
- Correctness depends more strongly on post-review, CI/runtime evidence, and escalation rules.

These risks are accepted because a Local implementation worker can also produce poor code. Quality is therefore enforced by the **pipeline**, not by assuming one writer is intrinsically trusted.

## Invariant

> Local owns authority and orchestration; it does not need to own broad cognition or code mutation.
