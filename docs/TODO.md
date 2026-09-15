# Internet Runtime TODO

- **Status:** current implementation complete through durable graph orchestration and recovery hardening
- **Last synchronized:** 2026-09-15

This file is a closure boundary, not an instruction to keep adding numbered phases. New work should be added only for a concrete observed problem.

## Completed workflow foundation

- ✅ First-class semantic accounts: `chatgpt-thinker`, `chatgpt-thinker-2`, `chatgpt-writer`, `gemini-thinker`.
- ✅ Clean-break account isolation for auth state, browser/runtime maps, schedulers and conversations.
- ✅ `chatgpt-writer` remains isolated as the only workflow mutation authority.
- ✅ `/workflow <task>` creates and automatically drives a durable coding job.
- ✅ New workflows pin a freshly queried upstream `main` HEAD; Local worktree `HEAD` is not workflow base authority.
- ✅ Writer PRs target `main` and use the deterministic workflow branch from the exact persisted base revision.
- ✅ Deterministic per-job research/review/writer Website session identities.
- ✅ Exact SHA-256-bound durable research/review handoffs.
- ✅ Deterministic branch / one-PR reconciliation and durable exact PR receipt.
- ✅ Exact-head PR review/remediation with a bounded review cycle.
- ✅ Exact-head PR/CI health gating and explicit user merge authorization.
- ✅ Authorized workflow merges are squash-only, so each workflow PR contributes exactly one commit to `main`.
- ✅ Fail-closed Website confirmation policy and pre-merge revalidation.
- ✅ Terminal cancellation, exact-ID deletion and explicit operator retention cleanup.

## Completed team runtime

- ✅ `internet_team` and workflow research/review use one shared provider-agnostic execution core.
- ✅ Team plans expose deterministic member/synthesis steps that workflow graph nodes can execute independently.
- ✅ Member dependencies bind every prior peer contribution actually consumed by the prepared prompt, including teams larger than two members; synthesis binds the complete member transcript.
- ✅ Team prompts identify participants only as `Member 1..N`, treat peer output as untrusted evidence, and optimize for the strongest supported combined answer.
- ✅ Current default workflow route uses `chatgpt-thinker` + `chatgpt-thinker-2`; Gemini remains available for explicit direct/research/team use.
- ✅ Same-session ordering and bounded account capacity remain provider-scheduler responsibilities; workflow adds no A-then-B mutex.
- ✅ Research A/B and Review A/B readiness remains independent at workflow level.
- ✅ Provider/account/stage failure details remain structured diagnostic data rather than member contributions.

## Completed durable graph orchestration

[`WORKFLOW-GRAPH-ORCHESTRATION.md`](./WORKFLOW-GRAPH-ORCHESTRATION.md) is now the as-built execution contract.

- ✅ Workflow work is represented as deterministic durable nodes with explicit dependencies.
- ✅ `READY` work is derived from dependency completion; the scheduler does not replay a team procedurally.
- ✅ Stable logical node IDs are separate from concrete execution-attempt IDs.
- ✅ Completed results are bound to exact correctness-bearing input hashes and dependency output hashes.
- ✅ Exact persisted results are reconciled without rerunning the provider.
- ✅ Provider turns persist job-scoped request receipts so timeout/restart recovery reconciles a submitted logical turn before any bounded resubmission.
- ✅ `COMPLETED` work is not replayed because a downstream member, synthesis, writer or health node fails.
- ✅ Recovery targets the smallest failed/orphaned node with bounded attempt policy.
- ✅ Execution ownership leases and execution IDs fence stale attempts and late results.
- ✅ Durable `RUNNING` executions are reconciled after ownership loss/restart; orphaned work returns to node-level recovery.
- ✅ The graph/job snapshot is authoritative correctness state; the ordered event journal is diagnostic history only.
- ✅ Workflow phase/lifecycle, node state, execution state and provider activity are distinct projections.
- ✅ Provider completion separates hard deadlines from semantic no-progress stall leases.
- ✅ A static thinking indicator or unrelated DOM churn cannot refresh provider progress indefinitely.
- ✅ Provider progress is persisted only against the current execution ID.
- ✅ `PROVIDER_STALLED`, hard timeout, browser failure, auth failure, provider-result ambiguity and deterministic automation defects have distinct classifications/recovery policy.
- ✅ `InvalidSelectorError`/selector parsing defects become `AUTOMATION` + `CODE_FIX`; unchanged code is not retried as a provider failure.
- ✅ CI `PENDING` is dependency polling/backoff and does not consume the normal provider retry budget.
- ✅ Scheduler/runtime failures transition durably through `WorkflowEngine`; `WorkflowDriver` only schedules, reconciles ownership and manages cancellation.
- ✅ Research/review handoffs, Writer controls, exact-head review/remediation/health and merge authorization remain bound to graph inputs.
- ✅ Operator status/watch is derived from graph state rather than stale parallel team/lane state.
- ✅ Obsolete team observer/trace stores and coarse procedural workflow retry/replay APIs were removed instead of preserved behind compatibility wrappers.
- ✅ Generated `dist` is rebuilt from the authoritative source tree.

## Recovery acceptance coverage

Automated coverage includes the invariants that motivated this hardening:

- ✅ later member failure retries only that logical node with one stable exact request identity while completed siblings remain complete;
- ✅ exact persisted node results reconcile without a provider rerun;
- ✅ an orphaned synthesis retries only synthesis while exact completed member receipts remain unchanged;
- ✅ a new engine instance can load a durable `RUNNING` execution and reconcile its expired owner lease at the same node boundary;
- ✅ ambiguous provider completion is classified as output reconciliation ambiguity and fails closed instead of blind resubmission;
- ✅ deterministic selector defects block for a code fix rather than entering automatic provider retry;
- ✅ exact-head remediation creates a fresh review cycle bound to the new PR head; prior-cycle review evidence cannot satisfy it;
- ✅ both research lanes remain required; there is no degraded one-lane quorum;
- ✅ graph-derived operator status exposes the authoritative failed node, recovery/action reason and dependency blockers;
- ✅ scheduler failure is persisted through the engine event boundary;
- ✅ semantic provider stalls are distinct from hard provider deadlines;
- ✅ Writer requests receive workflow hard/stall deadlines and scoped confirmation authority;
- ✅ graph reducers/scheduler/input receipts/node-result storage/recovery classification have dedicated unit coverage;
- ✅ full repository formatter/typecheck/test/build/package verification remains the merge gate.

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

`internet_workflow` remains the lower-level deterministic control-plane tool, including acceptance testing and exact-head merge operations.

## Current normal workflow

```text
/workflow <task>
-> resolve fresh upstream main HEAD
-> create durable job + initial dependency graph
-> scheduler executes READY Research A/B member nodes
-> lane synthesis nodes become READY from exact member outputs
-> exact research handoff gate
-> Writer implementation node creates/reconciles one PR targeting main
-> exact-head Review A/B graphs become READY
-> review handoff gate
-> Writer remediation node when changes are required
-> exact-head PR health node
-> explicit exact-head user merge authorization gate
-> merge node revalidates and squash-merges
-> DONE
```

Current backing route for new jobs:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
Writer   -> chatgpt-writer
```

## Deferred — no implementation without a concrete request

- dynamic member/provider health scoring or automatic member substitution/failover beyond the current same-node recovery policy;
- automatic task detection instead of explicit `/workflow`;
- Website cross-conversation/project memory as workflow correctness state;
- generic user-defined arbitrary DAG workflow language beyond the internal workflow dependency graph;
- degraded one-team/reviewer quorum modes;
- many writer accounts / automatic pooling;
- sophisticated artifact database;
- autonomous production deployment;
- broad non-coding generalization.

## Future-task rule

Prefer focused fixes with measurable ROI. Do not add legacy migrations, provider-to-account aliases, compatibility shims, duplicate execution paths, or a new numbered phase unless a concrete requirement first justifies it.
