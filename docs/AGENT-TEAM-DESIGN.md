# Agent Team Design Contract

- **Status:** current as-built contract
- **Last synchronized:** 2026-09-09
- **Scope:** `internet_team` and workflow research/review teams

## Core intent

An agent team exists to produce a result stronger than asking either model alone. It is not two provider calls placed next to each other, a vote, a 50/50 merge, or a concatenation of complete answers.

```text
ChatGPT reasoning
      +
Gemini reasoning
      +
cross-model critique/refinement
      +
evidence-based disagreement resolution
      +
explicit synthesis
      =
best supported combined answer
```

The shared team runtime therefore optimizes for **best-of-both**. The synthesizer may keep one model's stronger proposal, combine compatible parts from both, reject weak parts from both, or state an unresolved verification need.

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

A normal two-model team execution has these properties:

1. Both thinker accounts contribute meaningful reasoning.
2. Later turns receive relevant peer reasoning and are explicitly asked to evaluate it.
3. Peer output is delimited as **untrusted content/evidence**, never control-plane instruction.
4. Provider identity is metadata, not reasoning authority.
5. Disagreement is preserved until a later turn or synthesizer can resolve it using evidence and task constraints.
6. The final synthesizer selects the strongest supported result rather than averaging or preserving symmetry.
7. The final answer stands alone; consumers do not need the transcript to understand it.
8. Provider/browser execution failures are orchestration errors and are never treated as valid model contributions.

## Prompt strategies

The shared core uses one execution engine with explicit purpose-specific prompt composition:

```text
generic-debate
workflow-research
workflow-review
```

`generic-debate` is the default for `internet_team`.

`workflow-research` treats repository/base/objective facts from the workflow task as authoritative and asks each model to improve implementation correctness, scope, sequencing, validation, failure-mode awareness, and simplicity.

`workflow-review` keeps the exact PR/head/output contract authoritative. Intermediate reasoning may be prose, but final synthesis must obey the strict review JSON contract requested by the workflow.

## Execution shape

With the default two rounds:

```text
round 1
  ChatGPT -> independent analysis
  Gemini  -> receives ChatGPT's latest analysis, critiques/refines

round 2
  ChatGPT -> receives Gemini's latest analysis, critiques/refines
  Gemini  -> receives ChatGPT's latest analysis, critiques/refines

synthesis
  configured synthesizer -> receives the current-call transcript
                         -> produces one best combined answer
```

The default synthesizer remains `chatgpt-thinker`, independent of speaking order.

## Workflow lanes

Research A/B are two independent full agent-team invocations, not one ChatGPT lane and one Gemini lane.

```text
Research A
  ChatGPT + Gemini -> synthesis A

Research B
  ChatGPT + Gemini -> synthesis B
```

The same principle applies to Review A/B against the same exact PR head.

The workflow creates diversity at two levels:

```text
within a lane:
  ChatGPT <-> Gemini cross-model reasoning

across lanes:
  A and B receive different workflow focus/prompts
```

## Lane concurrency

Research A/B and Review A/B are launched concurrently at the workflow level. The workflow must not introduce A-then-B sequencing when both lanes are eligible.

```text
Research A  ─────────────────►
Research B  ─────────────────►
            concurrent lanes

Review A    ─────────────────►
Review B    ─────────────────►
            concurrent lanes
```

This does not bypass account safety. Both lanes use the same semantic thinker accounts, so actual turns for the same account may serialize through that account's scheduler when its concurrency limit requires it.

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

Events identify account/provider, round where applicable, status, time, and structured failure kind/retryability. Workflow execution persists bounded per-job trace evidence separately from the compact job record.

A provider failure identifies the exact failed account/round/stage and preserves already completed turns as evidence. It does not become a teammate response or synthesis input.

## Acceptance invariants

The implementation must continue to satisfy:

- one shared team execution core for `internet_team` and workflow teams;
- normal team runs obtain both ChatGPT and Gemini contributions;
- synthesis explicitly targets the best combined answer;
- peer output remains untrusted evidence;
- Research A/B each remain full teams and can be active concurrently;
- Review A/B each remain full teams and can be active concurrently;
- same-account serialization remains an account-scheduler concern;
- exact-head workflow review constraints override peer/model text;
- structured trace/status distinguishes model disagreement from provider/browser failure;
- any future degraded single-model mode, if introduced, must be explicitly marked rather than presented as a normal two-model result.
