# Internet Runtime TODO

- **Status:** current implementation complete through durable graph orchestration and recovery hardening
- **Last synchronized:** 2026-09-15

This file is a closure boundary, not an instruction to keep adding numbered phases. New work should be added only for a concrete observed problem.

## Completed workflow foundation

- ✅ First-class semantic accounts: `chatgpt-thinker`, `chatgpt-thinker-2`, `chatgpt-writer`, `gemini-thinker`.
- ✅ Clean-break account isolation for auth state, browser/runtime maps, schedulers and conversations.
- ✅ `chatgpt-writer` remains isolated as the only workflow mutation authority.
- ✅ `/workflow <task>` creates and automatically drives a durable coding job from a freshly queried upstream `main` HEAD.
- ✅ Deterministic per-job research/review/writer Website session identities.
- ✅ Exact SHA-256-bound research/review handoffs.
- ✅ Deterministic branch / one-PR reconciliation and exact PR/head receipts.
- ✅ Exact-head review/remediation, PR-health gating, explicit merge authorization, pre-merge revalidation, and squash-only merge.
- ✅ Fail-closed scoped Website confirmation policy.
- ✅ Terminal cancellation, exact-ID deletion, and explicit operator retention cleanup.

## Completed shared team runtime

- ✅ `internet_team` and workflow use one provider-agnostic deterministic TeamPlan/step semantic core.
- ✅ Workflow persists member and synthesis steps independently; there is no duplicate workflow debate loop.
- ✅ Member dependencies bind every prior peer contribution actually consumed, including teams larger than two members.
- ✅ Synthesis binds the complete member transcript.
- ✅ Prompts use only `Member 1..N`; peer output is untrusted evidence; synthesis targets the strongest supported answer.
- ✅ Research A/B and Review A/B are independent graph branches.
- ✅ Same-account capacity/session ordering remains account-scheduler responsibility.
- ✅ There is no degraded research/review quorum or hidden member substitution.

## Completed durable graph orchestration

[`WORKFLOW-GRAPH-ORCHESTRATION.md`](./WORKFLOW-GRAPH-ORCHESTRATION.md) is the as-built execution contract.

- ✅ Durable graph nodes with explicit dependencies are authoritative workflow execution state.
- ✅ READY work is derived from dependencies and exact input binding.
- ✅ Stable logical node IDs are separate from provider execution IDs.
- ✅ Completed results are exact-input/dependency-bound and stored outside the job snapshot.
- ✅ Recovery reconciles exact persisted node/provider/external receipts before resubmission.
- ✅ Later member/synthesis/Writer failures do not replay exact completed siblings.
- ✅ Execution ownership leases and execution IDs fence stale attempts and late results.
- ✅ Restart reconciles durable RUNNING ownership and recovers only orphaned work.
- ✅ Phase/lifecycle, node state, execution state, and provider activity are distinct projections.
- ✅ Provider hard deadline and semantic no-progress stall lease are distinct.
- ✅ Provider-result ambiguity fails closed; selector/parser defects become automation/code-fix failures.
- ✅ Scheduler/runtime failure is persisted through WorkflowEngine.
- ✅ Operator status/watch derives from graph state, not a parallel lane/trace state machine.
- ✅ Obsolete team trace/coarse retry/replay implementations were removed.
- ✅ Generated `dist` is rebuilt from authoritative source.

## Recovery acceptance coverage

- ✅ later-member retry preserves exact completed siblings and stable logical request identity;
- ✅ exact persisted node results reconcile without a provider rerun;
- ✅ orphaned synthesis retries synthesis only;
- ✅ a new engine instance reconciles expired ownership on a durable RUNNING execution;
- ✅ ambiguous provider completion is fail-closed;
- ✅ deterministic selector defects require a code fix instead of automatic provider retry;
- ✅ H1 remediation to H2 creates a fresh review cycle and rejects stale review evidence;
- ✅ both research teams remain required;
- ✅ graph-derived status exposes exact failure/action/blockers;
- ✅ scheduler failure, provider stall/hard deadline, Writer confirmation scope, and graph reducers have dedicated coverage;
- ✅ repository Verify remains formatter/typecheck/test/build/dist/package gate.

## Current operator surface

```text
/workflow <objective>
/workflow list
/workflow status [jobId]
/workflow watch [jobId]
/workflow stop [jobId]
/workflow continue [jobId]
/workflow delete <jobId>
```

## Current normal workflow

```text
/workflow <task>
-> resolve fresh upstream main HEAD
-> durable job + initial dependency graph
-> READY Research A/B member nodes
-> exact member outputs -> synthesis nodes
-> research handoff gate
-> Writer implementation/reconciliation -> one PR targeting main
-> exact-head Review A/B graphs
-> review decision / same-PR remediation if required
-> exact-head PR health
-> explicit exact-head merge authorization
-> revalidation + squash merge
-> DONE
```

Current backing route:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
Writer   -> chatgpt-writer
```

## Deferred — implement only for a concrete requirement

- live resumable browser `WAITING_USER`: preserve a live provider execution, suspend stall/retry policy, expose a reachable session, and resume that same execution safely; current unknown confirmations instead fail closed into a durable blocked/action-required state;
- multi-process/distributed graph mutation/lease coordination beyond the current revision-guarded local store;
- richer event metadata/retention tools beyond the current ordered diagnostic event journal;
- dynamic member/provider health scoring or automatic member substitution/failover;
- degraded one-team/reviewer quorum modes;
- automatic task detection instead of explicit `/workflow`;
- Website cross-conversation/project memory as workflow correctness state;
- arbitrary user-defined DAG language beyond the internal workflow graph;
- many writer accounts / automatic pooling;
- sophisticated artifact database;
- autonomous production deployment;
- broad non-coding generalization.

## Future-task rule

Prefer focused fixes with measurable ROI. Do not add legacy migrations, provider-to-account aliases, compatibility shims, duplicate execution paths, or a new numbered phase unless a concrete requirement first justifies it.
