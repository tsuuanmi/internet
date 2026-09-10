# Internet Runtime TODO

- **Status:** current implementation complete through the observed workflow-team hardening
- **Last synchronized:** 2026-09-09

This file is a closure boundary, not an instruction to keep adding numbered phases. New work should be added only for a concrete observed problem.

## Completed workflow foundation

- ✅ First-class semantic accounts: `chatgpt-thinker`, `chatgpt-writer`, `gemini-thinker`.
- ✅ Clean-break account isolation for auth state, browser/runtime maps, schedulers and conversations.
- ✅ `/workflow <task>` creates and automatically drives a durable coding job.
- ✅ Deterministic per-job research/review/writer session identities.
- ✅ Exact SHA-256-bound durable research/review handoffs.
- ✅ Persistent `chatgpt-writer` conversation with strict control messages.
- ✅ Deterministic branch / one-PR reconciliation and durable exact PR receipt.
- ✅ Exact-head PR review/remediation with a bounded review cycle.
- ✅ Exact-head PR/CI health gating and explicit user merge authorization.
- ✅ Fail-closed Website confirmation policy and pre-merge revalidation.
- ✅ Restart recovery, explicit retry-required boundaries and terminal cancellation.
- ✅ Operator-only terminal retention cleanup with durable audit receipts.

## Completed workflow-team hardening

- ✅ `internet_team` and workflow research/review use one shared team execution core.
- ✅ Every normal workflow lane remains a full ChatGPT + Gemini team.
- ✅ Team prompting targets the **best combined answer**, not averaging, neutral summarization, or concatenation.
- ✅ Peer model output is delimited as untrusted content/evidence rather than instruction authority.
- ✅ Purpose-specific prompt strategies exist for generic debate, workflow research and exact-head workflow review.
- ✅ Research A/B are launched concurrently at the workflow-lane level.
- ✅ Review A/B are launched concurrently at the workflow-lane level.
- ✅ Same-account serialization remains an account-scheduler responsibility; workflow adds no A-then-B mutex.
- ✅ Regression tests protect both research and review lane concurrency.
- ✅ Shared team execution emits structured round/account/stage progress and structured failure classification.
- ✅ Provider failures preserve exact account/provider/stage/round/kind/retryability without becoming model contributions.
- ✅ Completed-turn evidence is retained in a bounded private per-job team trace outside compact job state.
- ✅ Team trace progress is lane-tagged and can safely interleave across concurrent A/B execution.
- ✅ Compact Local `PROGRESS` events exclude full research/review payloads.
- ✅ `/workflow list` discovers jobs owned by the current Local session.
- ✅ `/workflow status [jobId]` renders job/lane/attempt/current-turn/PR/CI/action state.
- ✅ `/workflow watch [jobId]` returns the authoritative current snapshot and relies on the existing durable event stream for live follow-up rather than creating a second state machine.
- ✅ `/workflow stop [jobId]` uses `WorkflowDriver.cancel()` to abort active work, settle it, persist `CANCELLED`, and prevent restart resume.
- ✅ `/workflow continue [jobId]` resumes only an explicit durable recovery path.
- ✅ Omitted job IDs resolve only when unambiguous; commands fail rather than guess across multiple jobs.
- ✅ Team traces are removed with their terminal workflow during explicit retention cleanup.

## Current operator surface

```text
/workflow <objective>
/workflow list
/workflow status [jobId]
/workflow watch [jobId]
/workflow stop [jobId]
/workflow continue [jobId]
```

`internet_workflow` remains the lower-level deterministic control-plane tool, including acceptance testing and exact-head merge operations.

## Current normal workflow

```text
/workflow <task>
-> create durable job + enqueue driver
-> Research A/B concurrently
     each lane: ChatGPT <-> Gemini -> best-of-both synthesis
-> exact research handoffs to writer
-> START_IMPLEMENTATION
-> writer creates/reuses one PR
-> Review A/B concurrently against the exact PR head
     each lane: ChatGPT <-> Gemini -> exact-head synthesis
-> exact review handoffs
-> APPLY_REVIEWS + same-PR remediation when needed
-> PASS/PASS on exact head
-> CHECK_PR_HEALTH
-> explicit exact-head user merge authorization
-> immediate head + health revalidation
-> MERGE_AUTHORIZED
-> writer merge
-> DONE
```

## Deferred — no implementation without a concrete request

- automatic provider-turn retry policy beyond existing explicit workflow retry/recovery;
- automatic task detection instead of explicit `/workflow`;
- Website cross-conversation/project memory as workflow correctness state;
- generic arbitrary DAG workflow language;
- many writer accounts / automatic pooling;
- sophisticated artifact database;
- autonomous production deployment;
- broad non-coding generalization.

## Future-task rule

Prefer focused fixes with measurable ROI. Do not add legacy migrations, aliases, provider-to-account fallbacks, compatibility shims, duplicate execution paths, or a new numbered phase unless a concrete requirement first justifies it.
