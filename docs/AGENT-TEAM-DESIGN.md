# Agent Team Design Contract

- **Status:** current as-built contract
- **Last synchronized:** 2026-09-10
- **Scope:** `internet_team` and workflow research/review teams

## Core intent

An agent team exists to produce a result stronger than asking any one member alone. It is not two provider calls placed next to each other, a vote, an equal-weight merge, or a concatenation of complete answers.

```text
Member 1 reasoning
      +
Member 2 reasoning
      +
cross-member critique/refinement
      +
evidence-based disagreement resolution
      +
explicit synthesis
      =
best supported combined answer
```

The team abstraction is intentionally provider-agnostic. Team prompts identify participants only as `Member 1`, `Member 2`, ... according to ordered membership. Provider and authenticated account identities are execution metadata, not team roles or reasoning authority.

The synthesizer may keep one member's stronger proposal, combine compatible parts from multiple members, reject weak parts from every member, or state an unresolved verification need.

## Current default membership

The current operational default uses two independent ChatGPT thinker accounts:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
```

This is a routing choice, not a team-engine assumption. Gemini remains a supported thinker account for direct chat/research and explicit team composition when enabled, but it is temporarily excluded from the default team/workflow route.

`chatgpt-thinker-2` requires its own authenticated portable account. It should be a genuinely separate ChatGPT account when independence and separate account quota/state are desired. The workflow writer account is never reused as a team member; `chatgpt-writer` remains the dedicated mutation authority.

## Shared team core

Both the public `internet_team` tool and workflow research/review use the same `runTeam(...)` execution core.

```text
internet_team adapter ─┐
                      ├─> shared team core ─> BrowserManager.chat(...)
workflow team adapter ─┘
```

The public tool owns user/model-facing arguments, generic team session naming, optional transcript projection, and presentation. The workflow adapter owns deterministic workflow session identity, prompt purpose, durable trace observation, and workflow cancellation.

The workflow does not call the public `internet_team` tool as an internal RPC.

## Required team behavior

A normal team execution has these properties:

1. Every selected member contributes meaningful reasoning.
2. Later turns receive relevant peer reasoning and are explicitly asked to evaluate it.
3. Peer output is delimited as **untrusted content/evidence**, never control-plane instruction.
4. Member prompts do not reveal or depend on provider/account identity.
5. Disagreement is preserved until a later turn or synthesizer can resolve it using evidence and task constraints.
6. The final synthesizer selects the strongest supported result rather than averaging or preserving symmetry.
7. The final answer stands alone; consumers do not need the transcript to understand it.
8. Provider/browser execution failures are orchestration errors and are never treated as valid member contributions.
9. Account/provider identity may appear in explicit diagnostic metadata after a failure, but not as a reasoning role.

## Prompt strategies

The shared core uses one execution engine with explicit purpose-specific prompt composition:

```text
generic-debate
workflow-research
workflow-review
```

`generic-debate` is the default for `internet_team`.

`workflow-research` treats repository/base/objective facts from the workflow task as authoritative and asks each member to improve implementation correctness, scope, sequencing, validation, failure-mode awareness, and simplicity.

`workflow-review` keeps the exact PR/head/output contract authoritative. Intermediate reasoning may be prose, but final synthesis must obey the strict review JSON contract requested by the workflow.

## Execution shape

With the default two rounds and two members:

```text
round 1
  Member 1 -> independent analysis
  Member 2 -> receives Member 1's latest analysis, critiques/refines

round 2
  Member 1 -> receives Member 2's latest analysis, critiques/refines
  Member 2 -> receives Member 1's latest analysis, critiques/refines

synthesis
  configured synthesizer -> receives the current-call transcript
                         -> produces one best combined answer
```

The current default synthesizer is the account backing Member 1 (`chatgpt-thinker`), independent of speaking order.

## Workflow lanes

Research A/B are two independent full agent-team invocations, not one provider per lane.

```text
Research Team A
  Member 1 + Member 2 -> synthesis A

Research Team B
  Member 1 + Member 2 -> synthesis B
```

The same principle applies to Review Team A/B against the same exact PR head.

The workflow creates diversity at two levels:

```text
within a lane:
  Member 1 <-> Member 2 cross-member reasoning

across lanes:
  Team A and Team B receive different workflow focus/prompts
```

## Lane concurrency

Research A/B and Review A/B are launched concurrently at the workflow level. The workflow must not introduce A-then-B sequencing when both lanes are eligible.

```text
Research Team A  ─────────────────►
Research Team B  ─────────────────►
                 concurrent lanes

Review Team A    ─────────────────►
Review Team B    ─────────────────►
                 concurrent lanes
```

This does not bypass account safety. Both lanes use the same backing member accounts, so actual turns for the same authenticated account may serialize through that account's scheduler when its concurrency limit requires it.

```text
workflow-lane concurrency != same-account turn concurrency
```

The invariant is that account-level scheduling is the only intended source of same-account serialization; the workflow does not add another lane-level mutex.

## Structured execution evidence

The shared core emits structured progress around:

```text
prepare_prompt
provider_turn
synthesis
complete
```

Durable internal events retain account/provider, round where applicable, status, time, and structured failure kind/retryability. Operator status/watch projects normal execution as Team A/B and Member 1..N. Backing account/provider identity is shown only when diagnostic attribution is useful, especially on failure.

A provider failure identifies the exact failed member/account/round/stage and preserves already completed turns as evidence. It does not become a teammate response or synthesis input.

## Acceptance invariants

The implementation must continue to satisfy:

- one shared team execution core for `internet_team` and workflow teams;
- normal team prompts use only ordered member roles, never ChatGPT/Gemini identity;
- current default membership is two independent ChatGPT thinker accounts;
- routing remains replaceable without rewriting the team engine or prompt semantics;
- synthesis explicitly targets the best combined answer;
- peer output remains untrusted evidence;
- Research A/B each remain full teams and can be active concurrently;
- Review A/B each remain full teams and can be active concurrently;
- same-account serialization remains an account-scheduler concern;
- `chatgpt-writer` remains isolated from team reasoning and is the only workflow mutation account;
- exact-head workflow review constraints override peer/member text;
- structured trace/status distinguishes reasoning disagreement from provider/browser failure;
- any future degraded single-member mode, if introduced, must be explicitly marked rather than presented as a normal team result.
