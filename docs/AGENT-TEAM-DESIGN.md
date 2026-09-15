# Agent Team Design Contract

- **Status:** current as-built contract
- **Last synchronized:** 2026-09-15
- **Scope:** `internet_team` and workflow research/review teams

## Core intent

An agent team exists to produce a result stronger than asking one member alone. It is not a vote, equal-weight merge, concatenation, or provider-brand abstraction.

```text
Member reasoning
+ peer critique/refinement
+ evidence-based disagreement resolution
+ explicit synthesis
= strongest supported combined answer
```

Team prompts expose only ordered `Member 1..N` roles. Provider and authenticated account identities are execution metadata, not reasoning authority. Peer output is delimited as untrusted evidence.

## Shared semantic core

Both public `internet_team` and workflow teams use the same deterministic team primitives:

```text
buildTeamPlan(strategy, members, rounds)
prepareTeamStep(plan, step, completed dependencies)
runTeamStep(prepared step)
```

The public tool executes the plan in-memory. Workflow persists the same member/synthesis steps as graph nodes and durable results. Workflow never invokes the public tool as an internal RPC and never reimplements the round loop or prompt/synthesis semantics.

## Dependency semantics

`TeamPlan` owns the dependencies that describe the information a step consumes.

For each member turn:

- speaking order remains deterministic;
- the step depends on the immediately preceding step when needed for sequencing;
- it also depends on the latest prior contribution from every other member whose output is included in the prepared peer context.

For synthesis:

- the step depends on every member step whose output appears in the synthesis transcript.

This means workflow exact-input receipts bind all correctness-bearing peer outputs rather than only a coarse team completion.

## Default execution shape

With two members and two rounds:

```text
R1/M1 -> R1/M2 -> R2/M1 -> R2/M2 -> synthesis
```

Current default backing route:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
Synthesizer -> chatgpt-thinker
```

This is routing policy, not a team-engine assumption. `gemini-thinker` remains available for explicit team composition. `chatgpt-writer` is not a team member.

## Prompt strategies

```text
generic-debate
workflow-research
workflow-review
```

`generic-debate` serves `internet_team`.

`workflow-research` keeps workflow objective/repository/base facts authoritative and asks members to improve implementation correctness, scope, sequencing, validation, failure awareness, and simplicity.

`workflow-review` keeps PR/head/output constraints authoritative. Final synthesis must satisfy the strict exact-head review contract.

## Workflow team graphs

Research A/B and Review A/B are independent team graphs. Each graph contains durable member nodes plus one synthesis node; there is no opaque “run whole team” workflow unit.

```text
Research A: member nodes -> synthesis A
Research B: member nodes -> synthesis B
```

When root/dependent nodes in A and B are READY, the workflow scheduler may dispatch both branches. Same-account capacity and same-session serialization remain responsibilities of the account scheduler.

```text
graph concurrency != same-account concurrency
```

## Failure semantics

Provider/browser failures are orchestration failures, never member contributions. A failed member step carries exact member/account/round/stage diagnostics internally. Completed exact-input sibling nodes remain reusable.

The current workflow has no degraded single-member/team quorum. Required research/review team synthesis results must exist before their gates advance.

## Public `internet_team` versus workflow

`internet_team` owns public arguments, generic session naming, optional transcript projection, and presentation. Its execution may remain in-memory because the call itself is the durable boundary from the caller's perspective.

Workflow owns deterministic job-scoped Website session identities, durable graph/result persistence, exact input receipts, recovery/fencing, handoff gates, and operator projection.

Both use the same `TeamPlan` and prompt/step semantics.

## Acceptance invariants

- one shared deterministic team semantic core;
- provider-agnostic `Member 1..N` prompts;
- peer output is untrusted evidence;
- synthesis targets the strongest supported combined answer;
- exact step dependencies cover every peer output actually consumed;
- workflow persists member/synthesis steps independently rather than replaying an opaque team call;
- Research A/B and Review A/B can progress independently;
- account scheduling is the only same-account serialization authority;
- writer identity remains separate from team reasoning;
- provider failures never become valid reasoning content;
- no degraded quorum or hidden member substitution.
