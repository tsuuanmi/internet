# Internet Runtime TODO

- **Status:** current implementation complete through provider-agnostic team routing and workflow observability hardening; graph-orchestration hardening accepted next
- **Last synchronized:** 2026-09-10

This file is a closure boundary, not an instruction to keep adding numbered phases. New work should be added only for a concrete observed problem.

## Completed workflow foundation

- ✅ First-class semantic accounts: `chatgpt-thinker`, `chatgpt-thinker-2`, `chatgpt-writer`, `gemini-thinker`.
- ✅ Clean-break account isolation for auth state, browser/runtime maps, schedulers and conversations.
- ✅ `chatgpt-writer` remains isolated as the only workflow mutation authority.
- ✅ `/workflow <task>` creates and automatically drives a durable coding job.
- ✅ New workflows pin a freshly queried upstream `main` HEAD; Local worktree `HEAD` is not workflow base authority.
- ✅ Writer PRs must target `main` and use the deterministic workflow branch from the exact persisted base revision.
- ✅ Deterministic per-job research/review/writer session identities.
- ✅ Exact SHA-256-bound durable research/review handoffs.
- ✅ Deterministic branch / one-PR reconciliation and durable exact PR receipt.
- ✅ Exact-head PR review/remediation with a bounded review cycle.
- ✅ Exact-head PR/CI health gating and explicit user merge authorization.
- ✅ Authorized workflow merges are squash-only, so each workflow PR contributes exactly one commit to `main`.
- ✅ Fail-closed Website confirmation policy and pre-merge revalidation.
- ✅ Restart recovery, explicit retry-required boundaries and terminal cancellation.
- ✅ Exact-ID `/workflow delete <jobId>` removes one selected workflow's local durable job/handoffs/trace, cancelling active work first.
- ✅ Operator-only terminal retention cleanup with durable audit receipts.

## Completed agent-team and workflow hardening

- ✅ `internet_team` and workflow research/review use one shared team execution core.
- ✅ Team prompts are provider-agnostic and identify participants only as `Member 1..N`.
- ✅ Current default team routing uses two independent ChatGPT thinker accounts: `chatgpt-thinker` + `chatgpt-thinker-2`.
- ✅ Gemini remains supported for direct chat/research and explicit team composition but is not required by the default workflow.
- ✅ Every normal workflow lane remains a full two-member team.
- ✅ Team prompting targets the **best combined answer**, not averaging, neutral summarization, or concatenation.
- ✅ Peer member output is delimited as untrusted content/evidence rather than instruction authority.
- ✅ Purpose-specific prompt strategies exist for generic debate, workflow research and exact-head workflow review.
- ✅ Research A/B are launched concurrently at the workflow-lane level.
- ✅ Review A/B are launched concurrently at the workflow-lane level.
- ✅ Same-session ordering and bounded per-account capacity remain account-scheduler responsibilities; the default capacity is 2 and workflow adds no A-then-B mutex.
- ✅ Regression tests protect both research and review lane concurrency.
- ✅ Shared team execution emits structured round/account/stage progress and structured failure classification.
- ✅ Provider failures preserve exact account/provider/stage/round/kind/retryability without becoming member contributions.
- ✅ Completed-turn evidence is retained in a bounded private per-job team trace outside compact job state.
- ✅ Team trace progress is lane-tagged and can safely interleave across concurrent A/B execution.
- ✅ Compact Local `PROGRESS` events exclude full research/review payloads.
- ✅ `/workflow list` discovers jobs owned by the current Local session.
- ✅ `/workflow status [jobId]` renders a pipeline summary plus Team A/B, attempt, round, Member N, stage, structured failure, writer, PR/CI and action state.
- ✅ `/workflow watch [jobId]` returns the authoritative current snapshot and relies on the existing durable event stream for live follow-up rather than creating a second state machine.
- ✅ Normal status/watch uses member identities; raw account/provider identity appears only for explicit diagnostics.
- ✅ `/workflow stop [jobId]` uses `WorkflowDriver.cancel()` to abort active work, settle it, persist `CANCELLED`, and prevent restart resume.
- ✅ `/workflow continue [jobId]` resumes only an explicit durable recovery path.
- ✅ `/workflow delete <jobId>` requires an explicit ID and never guesses across jobs.
- ✅ Omitted job IDs resolve only when unambiguous for commands that permit omission.
- ✅ Team traces are removed with their terminal workflow during explicit retention cleanup or exact-ID deletion.
- ✅ Existing durable jobs keep their persisted account routing; new jobs use the current default route.

## Accepted next hardening — durable graph orchestration

The concrete failure cases observed in real workflows justify implementing [`WORKFLOW-GRAPH-ORCHESTRATION.md`](./WORKFLOW-GRAPH-ORCHESTRATION.md). This is accepted work, not yet current runtime behavior.

- ☐ Represent workflow work as durable executable nodes with explicit dependency edges and deterministic graph expansion.
- ☐ Derive `READY` work from graph dependencies instead of replaying a team/round procedurally.
- ☐ Persist stable logical node IDs separately from concrete execution-attempt IDs.
- ☐ Bind completed node results to exact correctness-bearing inputs so stale research/review/PR-head evidence cannot be reused.
- ☐ Preserve `COMPLETED` nodes only while their exact input receipt still matches.
- ☐ Retry/recover only the smallest failed or orphaned node, including individual member turns and synthesis.
- ☐ Refactor the existing shared team core into reusable deterministic plan/step primitives rather than creating a workflow-only duplicate debate loop.
- ☐ Add execution ownership leases and fencing so stale late provider results cannot commit after a retry/recovery begins.
- ☐ Reconcile durable `RUNNING`/`WAITING_USER`/`RECOVERING` nodes with valid execution ownership on restart and `/workflow continue`.
- ☐ Reconcile uncertain provider responses and Writer external effects before resubmitting work; retain existing deterministic branch/one-PR idempotency.
- ☐ Keep the durable graph/job snapshot authoritative and use an append-only ordered event journal for diagnostics/observability, not as a competing replay-only source of truth.
- ☐ Separate workflow phase/lifecycle, logical node state, execution state, and provider/browser state.
- ☐ Replace one fixed 300-second completion timeout with meaningful-progress leases plus mode-aware stall/hard limits, separate from execution ownership leases.
- ☐ Do not let a static thinking indicator or unrelated DOM churn refresh progress indefinitely.
- ☐ Preserve the existing scoped Website approval policy: recognized scope-valid eligible Writer confirmations remain auto-approved; only ambiguous/out-of-scope/user-owned or genuinely resumable interactions become action-required/`WAITING_USER` boundaries.
- ☐ Support resumable user interaction for OTP/2FA/CAPTCHA/selected consent or confirmation cases without consuming normal provider retry budget while the live execution remains valid.
- ☐ Prevent `/workflow continue` from duplicating a valid live `WAITING_USER` execution.
- ☐ Classify deterministic browser-automation defects such as `InvalidSelectorError`/`AUTOMATION_BUG` separately from provider failures and do not loop them through automatic provider retries.
- ☐ Preserve exact-head review/remediation/health/merge authority through review-cycle/head-specific graph inputs and nodes.
- ☐ Rebuild `/workflow status|watch` as explainable graph projections: phase/lifecycle, active execution, provider activity, blocked dependencies, recovery/action reason, recent meaningful events, and next transition.
- ☐ Remove stale projection states such as `Writer: waiting for research` after research is complete and Writer has already started/failed/recovered.
- ☐ Supplement coarse `driver active` output with actual scheduler/execution health and orphan detection.
- ☐ Preserve Research A/B and Review A/B workflow-level concurrency; account scheduling remains the only same-account capacity gate.
- ☐ Do not introduce degraded one-team/quorum completion without a separate explicit product contract.
- ☐ Add acceptance tests for later-member failure, orphaned synthesis, valid long thinking, stalled provider, eligible auto-approval, ambiguous confirmation/user wait, deterministic selector errors, uncertain provider completion, Writer external-action reconciliation, review-head invalidation, lane concurrency, restart recovery, and status consistency.
- ☐ Remove obsolete coarse team/lane replay/retry paths once the graph scheduler is authoritative; do not preserve parallel legacy execution engines.

### Observed cases this work must solve

```text
1. Team B fails at a later member/round
   -> current retry may replay more of Team B than necessary
   -> desired: recover only that member node

2. Team B synthesis is durable STARTED but no valid execution remains
   -> desired: mark execution orphaned/fenced and recover synthesis only

3. Writer legitimately runs longer than 300000ms
   -> current runtime reports a generic provider timeout
   -> desired: distinguish meaningful progress from an actual stall

4. Writer presents a GitHub confirmation
   -> recognized scope-valid eligible implementation actions should continue through existing auto-approval
   -> ambiguous/out-of-scope/user-owned interactions should become explicit action-required state rather than generic timeout

5. Browser confirmation detection throws InvalidSelectorError
   -> retrying the Writer unchanged cannot repair deterministic selector syntax
   -> desired: AUTOMATION_BUG/INVALID_SELECTOR surfaced directly, without repeated provider retries

6. FAILED_RETRYABLE status can still render Writer as "waiting for research"
   even though both research lanes are complete
   -> desired: graph-derived state with no stale child projection

7. A timed-out provider/Writer execution may have completed or caused an external side effect after Local lost the result
   -> desired: reconcile provider conversation and deterministic branch/PR receipts before resubmitting
```

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
-> create durable job + enqueue driver
-> Research Team A/B concurrently
     each lane: Member 1 <-> Member 2 -> strongest synthesis
-> exact research handoffs to writer
-> START_IMPLEMENTATION
-> writer creates/reuses one PR targeting main
-> Review Team A/B concurrently against the exact PR head
     each lane: Member 1 <-> Member 2 -> exact-head synthesis
-> exact review handoffs
-> APPLY_REVIEWS + same-PR remediation when needed
-> PASS/PASS on exact head
-> CHECK_PR_HEALTH
-> explicit exact-head user merge authorization
-> immediate head + health revalidation
-> MERGE_AUTHORIZED
-> writer squash merge
-> DONE
```

Current backing route for new jobs:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
Writer   -> chatgpt-writer
```

## Deferred — no implementation without a concrete request

- dynamic member/provider health scoring or automatic member substitution/failover beyond the accepted same-node recovery policy;
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
