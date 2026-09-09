# Workflow Team Observability and Control Hardening

- **Status:** implemented
- **Last synchronized:** 2026-09-09
- **Scope:** workflow team execution, operator observability/control, structured failure evidence, prompt strategy, and lane concurrency

This document records the focused post-P13 hardening prompted by a real workflow provider failure. It is intentionally not a new numbered roadmap phase.

## Triggering incident

A real job remained in `RESEARCH_RUNNING` with Research A failed while Research B continued. The durable lane error was:

```text
Gemini failed to execute the newest response; retry the provider turn
```

The Gemini Website had returned its provider-owned execution failure message. Detection was correct and the sibling lane was preserved, but the operator-facing state did not identify the exact round/account/stage without manual JSON/UI inspection.

The incident exposed four concrete gaps:

1. the normal `/workflow` surface only started jobs;
2. workflow team failures were flattened to a lane-level error string;
3. the best-of-both ChatGPT+Gemini team intent was implicit rather than enforced by prompt strategy;
4. lane-level concurrency needed explicit regression protection.

## Implemented architecture

### One shared team core

`internet_team` and workflow research/review continue to use one shared `runTeam(...)` execution core. Workflow does not invoke the public tool wrapper as an internal RPC.

The shared core now owns:

```text
round ordering
provider turns
purpose-specific prompt composition
best-of-both synthesis
structured progress
structured failure classification
completed-turn transcript capture
AbortSignal propagation
```

Adapters retain their proper responsibilities: the public tool owns user/model-facing invocation and presentation; workflow owns deterministic session identity, durable observation, and workflow state.

### Best-of-both prompts

Explicit strategies are implemented for:

```text
generic-debate
workflow-research
workflow-review
```

Peer output is clearly delimited as untrusted content/evidence. Synthesis is instructed to select the strongest supported combined answer rather than average or concatenate model outputs.

Workflow review keeps authoritative exact PR/head/output constraints above peer content and requires the existing strict JSON final contract.

### Structured team progress and failures

The shared team core emits progress around:

```text
prepare_prompt
provider_turn
synthesis
complete
```

Events identify account/provider, round where applicable, timestamps, status, and failure kind/retryability.

Provider/browser failures retain exact execution context and already completed turns. A provider error is never forwarded as a valid teammate contribution.

### Durable bounded traces

Workflow team evidence is persisted separately from compact workflow job JSON:

```text
<workflow data>/workflows/team-traces/<jobId>.json
```

The trace is private, bounded by event count and completed-model text size, and records:

```text
phase
lane
attempt
round
accountId
provider
stage
status
failure kind/message/retryability
bounded completed-turn text
```

Trace writes remain synchronous/serialized within the plugin process, so concurrent workflow lanes can safely append through the same store without introducing an asynchronous lane mutex.

Terminal operator retention cleanup removes the corresponding trace along with the selected workflow artifacts.

### Compact Local progress

Durable trace evidence is written first. The observer then publishes compact `PROGRESS` metadata to the existing workflow event sink.

Full research/review responses are not injected into Local progress context.

## Operator surface

The normal command family is now:

```text
/workflow <objective>
/workflow list
/workflow status [jobId]
/workflow watch [jobId]
/workflow stop [jobId]
/workflow continue [jobId]
```

Job selection is owner-session scoped and fails on ambiguity rather than guessing.

`status` combines compact job state with the latest bounded trace evidence so an operator can see phase/lane/attempt/round/account/stage/failure plus writer, PR/head, review, CI and pending-action state.

`watch` returns the current authoritative snapshot while the existing workflow/team `PROGRESS` event stream continues to surface live updates. It does not create a second polling/correctness state machine.

`stop` delegates to `WorkflowDriver.cancel()`: abort active work, await settlement, then persist terminal `CANCELLED`.

`continue` only resumes an explicit engine-approved durable recovery path.

## Concurrent lanes

Research A/B and Review A/B remain independent lane promises and are launched before either sibling is awaited.

```text
Research A  ─────────────────►
Research B  ─────────────────►

Review A    ─────────────────►
Review B    ─────────────────►
```

Regression tests now protect both phases.

Same-account provider turns may still serialize through the account scheduler according to `maxConcurrentTurnsPerAccount`. That safety policy is intentionally separate from workflow-lane concurrency; the workflow adds no A-then-B mutex.

## Failure and retry policy

Structured failures classify retryability, but this hardening does **not** add automatic provider-turn retry. Observability and explicit durable workflow recovery remain authoritative.

Any future automatic provider-turn retry requires a separate concrete justification and must be bounded, durable, cancellation-aware, and incapable of duplicating acknowledged handoffs or GitHub mutations.

## Verification coverage

The implementation adds/updates tests for:

```text
best-of-both generic prompts and synthesis
workflow research prompt strategy
structured provider failure metadata
progress event ordering
bounded/private team trace persistence
workflow operator job selection and controls
status rendering of exact failed provider turn
Research A/B concurrent launch
Review A/B concurrent launch
trace cleanup with terminal retention
plugin registration/guidance
```

The repository Verify workflow remains the release gate and runs browser-vendor verification, Biome, TypeScript checking, Vitest, build/dist consistency, and package verification.

## Completion invariants

This hardening is complete when the code continues to preserve all of the following:

- one shared team execution core;
- normal teams use both thinker accounts and synthesize the strongest supported answer;
- workflow-specific prompts do not duplicate the execution engine;
- exact-head review/handoff/merge invariants remain authoritative;
- Research A/B and Review A/B are workflow-level concurrent;
- same-account serialization remains an account-scheduler concern;
- exact provider failures are inspectable without guessing;
- full payloads remain outside Local progress injection;
- stop is terminal cancellation and survives restart correctly;
- no compatibility shim, duplicate team loop, or automatic retry fallback is introduced.
