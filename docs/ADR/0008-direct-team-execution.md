# ADR-0008 — WorkflowEngine Executes Team Runs Directly

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The current workflow prototype asks Local to spawn DSH subagents and instruct those subagents to call `internet_team`. This has useful properties:

- Local can start several subagents concurrently;
- each subagent prepares a focused team task;
- when a subagent completes, DSH can inject its result back to the parent.

However, it also introduces an uncontrolled reasoning layer between the workflow and `internet_team`:

- the subagent may inspect code itself;
- it may paraphrase or summarize the team result;
- it may alter the intended handoff;
- it may return a transformed report to Local rather than preserve the exact team final output.

The underlying `runTeam()` primitive already performs the actual provider debate/synthesis and only needs a durable owner/session identity plus a task.

## Decision

For workflow-owned reasoning/review teams, `WorkflowEngine` should execute the team primitive directly rather than using a free-form DSH subagent as an intermediary.

Conceptually:

```text
OLD
Workflow -> DSH subagent -> internet_team -> subagent summary -> Local

TARGET
WorkflowEngine -> TeamRun -> runTeam() -> exact final output -> handoff
```

This ADR does not remove DSH subagents from the product. They remain useful for open-ended agent work outside the deterministic coding workflow.

## Required retained benefits

The direct execution path must preserve the best properties of background subagents.

### Automatic prompt preparation

The engine owns a deterministic `TeamPromptBuilder` (or equivalent) that constructs the full team task from:

```text
objective
repository
base revision / PR identity
team role
workflow constraints
required output contract
```

Local must not manually prepare these prompts.

### Concurrent team jobs

The engine can start multiple logical team runs concurrently:

```text
team A = RUNNING
team B = RUNNING
```

Provider/account schedulers may still serialize individual browser turns when required for account safety. Logical workflow concurrency is distinct from browser-request concurrency.

### Completion notification

When a team completes, the engine records its final output and emits an internal completion event.

The full result does not need to be injected into Local. Instead:

- the exact payload goes to the intended handoff recipient;
- Local receives only a compact progress event when useful.

## Team session identity

The engine should generate deterministic durable session identities, for example:

```text
<local-agent-id>:workflow:<job-id>:research:A
<local-agent-id>:workflow:<job-id>:research:B
<local-agent-id>:workflow:<job-id>:review:<cycle>:A
<local-agent-id>:workflow:<job-id>:review:<cycle>:B
```

This preserves independent Website conversation histories without requiring a child DSH agent identity.

## Explicit synthesizer

Each team run must use an explicit synthesizer account, defaulting to `chatgpt-thinker`.

Speaking order and synthesizer identity are independent.

## Error handling

The engine owns retry/failure state for each team run.

Example:

```text
team A = DONE
team B = FAILED_RETRYABLE
```

The workflow may retry B without requiring Local to reason about which subagent failed.

## Consequences

### Positive

- Eliminates an unnecessary summarization layer.
- Makes team cardinality and completion deterministic.
- Makes exact handoff fidelity straightforward.
- Keeps automatic prompt preparation and background execution.
- Reduces Local context usage.

### Cost

- WorkflowEngine needs direct access to the lower-level team runtime.
- Team execution, retries, and events become plugin runtime responsibilities rather than generic subagent behavior.

## Invariant

> Deterministic workflow teams are runtime workers, not free-form intermediary agents.
