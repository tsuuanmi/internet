# Workflow Team Observability, Control, and Routing Hardening

- **Status:** implemented
- **Last synchronized:** 2026-09-10
- **Scope:** team execution, operator observability/control, structured failure evidence, prompt strategy, lane concurrency, and provider-agnostic member routing

This document records focused post-P13 hardening prompted by real provider failures. It is intentionally not a new numbered roadmap phase.

## Triggering incidents

A real workflow job reached `FAILED_RETRYABLE` after a Gemini Website turn returned a generic provider execution error. The adapter correctly classified the response as `provider_error`, and the sibling research lane was preserved. The incident exposed two distinct concerns:

1. operator output needed to identify the exact team/lane/member/round/stage and failure source more clearly;
2. the intellectual team abstraction was unnecessarily coupled in wording and default routing to provider names.

The runtime therefore separates **member semantics** from **provider routing**.

## Implemented architecture

### One shared team core

`internet_team` and workflow research/review use one shared `runTeam(...)` core. Workflow does not invoke the public tool wrapper internally.

The core owns:

```text
round ordering
member turns
purpose-specific prompt composition
strongest-answer synthesis
structured progress
structured failure classification
completed-turn transcript capture
AbortSignal propagation
```

Public-tool and workflow adapters retain their own invocation, session, persistence, and presentation responsibilities.

### Provider-agnostic member semantics

Reasoning prompts use only ordered member roles:

```text
Member 1
Member 2
...
```

Prompts do not identify participants as ChatGPT, Gemini, or semantic account IDs. Peer output is delimited as untrusted evidence. The synthesizer is instructed to keep the strongest supported parts, reject weaker parts, resolve disagreement using evidence/task constraints, and explicitly state unresolved verification needs.

Provider/account identity remains internal routing and diagnostic metadata.

### Current default routing

New team/workflow executions currently use:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
Writer   -> chatgpt-writer
```

The two thinker identities are separately authenticated and independently scheduled. For genuine account independence they should be logged into two different ChatGPT accounts.

`gemini-thinker` remains supported for direct chat/research and explicit team composition, but it is temporarily excluded from the default team/workflow route. The writer account is never reused as a thinker.

Existing durable jobs keep their persisted account routing. This prevents a retry from silently changing participants mid-job. A new workflow must be started to pick up the new default route.

### Prompt strategies

The shared core uses explicit strategies:

```text
generic-debate
workflow-research
workflow-review
```

All three are provider-agnostic. Workflow research emphasizes implementation readiness. Workflow review keeps exact repository/PR/head/output requirements authoritative over peer text and preserves the strict review JSON contract.

### Structured team progress and failures

The shared core emits:

```text
prepare_prompt
provider_turn
synthesis
complete
```

Events identify the backing account/provider internally, round where applicable, status, timestamps, and failure kind/retryability. Provider/browser failures retain exact execution context and already completed turns; failures never become member contributions.

### Durable bounded traces

Workflow team evidence is stored separately from compact job JSON under:

```text
<workflow data>/workflows/team-traces/<jobId>.json
```

The private bounded trace records phase, lane, attempt, round, account, provider, stage, status, failure metadata, and bounded completed-turn text. Concurrent lanes may interleave trace events without introducing a lane mutex.

### Clear operator projection

`/workflow status` now starts with a pipeline summary and then shows Research/Review Team A/B individually. Normal execution is rendered as `Member 1..N`.

Example:

```text
Workflow <jobId>
State: FAILED_RETRYABLE
Current: Research · retry required

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
    Diagnostic: <accountId> · <provider>
```

Backing account/provider is shown only as explicit failure diagnostic evidence.

`/workflow watch` returns the same authoritative snapshot while compact `PROGRESS` events identify phase, Team A/B, attempt, round, Member N, stage, status, and failure information. It does not introduce a second workflow state machine.

### Stop and recovery

`/workflow stop [jobId]` delegates to `WorkflowDriver.cancel()`: abort active work, await settlement, persist terminal `CANCELLED`, and prevent restart resume.

`/workflow continue [jobId]` resumes only an explicit durable recovery target. It never resets the workflow or changes a persisted job's account routing.

## Concurrent lanes

Research A/B and Review A/B remain independent lane promises launched before either sibling is awaited:

```text
Research Team A  ─────────────────►
Research Team B  ─────────────────►

Review Team A    ─────────────────►
Review Team B    ─────────────────►
```

Same-account turns may serialize through `maxConcurrentTurnsPerAccount`. That account safety policy is separate from workflow-lane concurrency; workflow adds no A-then-B mutex.

## Login and stable ports

The second thinker is appended to the semantic account catalog so existing ports stay stable:

```text
39000 chatgpt-thinker
39001 chatgpt-writer
39002 gemini-thinker
39003 chatgpt-thinker-2
```

Each account has its own portable account file and login lifecycle.

## Verification coverage

Tests cover:

```text
provider-agnostic member prompts and synthesis
default two-ChatGPT routing
explicit Gemini team composition without provider identity in prompts
separate portable account isolation for both thinkers and writer
four stable login ports
workflow routing persistence and parser validation
structured member/provider failure metadata
team-centric status/watch rendering
Research A/B concurrent launch
Review A/B concurrent launch
trace persistence and retention cleanup
plugin registration with Gemini disabled
```

The repository Verify workflow remains the release gate: browser-vendor verification, Biome, TypeScript, Vitest, build/dist consistency, and package verification.

## Retry/failover policy

This change intentionally does **not** add automatic provider-turn failover or silently substitute another member during an existing durable job. Such behavior would change the team composition mid-run and complicate deterministic evidence.

A future health-aware routing policy may be added only with a concrete specification for bounded retries, routing receipts, cancellation, and exact durable member identity.

## Completion invariants

The implementation must preserve:

- one shared team execution core;
- provider-agnostic `Member 1..N` reasoning semantics;
- strongest-supported synthesis rather than equal-weight merging;
- current default new-job route of two independent ChatGPT thinker accounts;
- explicit Gemini support without making Gemini a default dependency;
- persisted per-job routing that does not silently mutate on retry;
- separate `chatgpt-writer` mutation authority;
- exact-head review/handoff/merge invariants;
- concurrent Research A/B and Review A/B lanes;
- account-scheduler ownership of same-account serialization;
- exact provider failures inspectable through diagnostics without leaking provider identity into normal prompts;
- full payloads outside Local progress injection;
- terminal stop and explicit durable recovery;
- no duplicate team loop, compatibility fallback, or hidden automatic failover.
