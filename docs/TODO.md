# Internet Runtime TODO

- **Status:** coding-workflow roadmap complete through P13
- **Last synchronized:** 2026-09-09

This file is now a closure checklist, not an instruction to keep adding phases. All planned correctness-critical coding-workflow work through P13 has landed.

## Completed

- ✅ ChatGPT ordinary turns default to `high` reasoning.
- ✅ Team synthesis uses an explicit account identity and defaults to `chatgpt-thinker`.
- ✅ First-class semantic accounts: `chatgpt-thinker`, `chatgpt-writer`, `gemini-thinker`.
- ✅ Clean-break account isolation for auth state, login profiles, browser/runtime maps, schedulers and conversations.
- ✅ `/workflow <task>` starts a real durable `WorkflowEngine` job.
- ✅ Workflow-owned research/review teams run directly over the lower-level team runtime.
- ✅ Deterministic per-job research/review/writer session identities.
- ✅ Two independent logical research lanes and two exact-head review lanes.
- ✅ Exact SHA-256-bound durable handoffs with deterministic ordering and idempotent acknowledgement.
- ✅ Trusted control messages are separate from verbatim team/reviewer payloads.
- ✅ Persistent `chatgpt-writer` conversation and strict writer control contract.
- ✅ Deterministic implementation branch and idempotent one-PR reconciliation.
- ✅ Durable exact PR receipt.
- ✅ Conservative scoped Website GitHub confirmation controller.
- ✅ `UNKNOWN_CONFIRMATION` fail-closed behavior.
- ✅ Exact-head PR review/remediation loop with `maxReviewCycles = 3` default.
- ✅ Compact `INTERNAL` / `PROGRESS` / `ACTION_REQUIRED` events and Local `agent.inject()` integration.
- ✅ Payload-free workflow status projection.
- ✅ Exact-head user merge authorization and pre-merge head revalidation.
- ✅ Durable merge receipt.
- ✅ Strict restart recovery and persisted-authority validation.
- ✅ Transition, handoff, account-isolation and approval hardening.
- ✅ Automatic durable `WorkflowDriver` with safe restart resume and explicit stop boundaries.
- ✅ Exact-head PR/CI health receipt: `PASS | FAIL | PENDING | NONE | UNKNOWN`.
- ✅ Health gating before authorization and immediately before merge.
- ✅ Operator-only retention cleanup: `DONE` 30 days, `CANCELLED` 14 days.
- ✅ Exact `jobId + updatedAt` cleanup guard, handoff-directory validation and retained private cleanup audit.
- ✅ No implicit/background/scheduled deletion.

## Current normal workflow

```text
/workflow <task>
-> create durable job and enqueue driver
-> Research A/B
-> exact research handoffs to writer
-> START_IMPLEMENTATION
-> writer creates/reuses one PR
-> Review A/B against exact PR head
-> exact review handoffs
-> APPLY_REVIEWS + same-PR remediation when needed
-> review PASS/PASS on exact head
-> CHECK_PR_HEALTH
-> READY_FOR_MERGE_AUTHORIZATION
-> explicit exact-head user approval
-> pre-merge head + health re-check
-> MERGE_AUTHORIZED
-> writer merge
-> DONE
```

## Explicit stop boundaries

The automatic driver stops instead of guessing through:

```text
AWAITING_MERGE_AUTHORIZATION
BLOCKED
UNKNOWN_CONFIRMATION
FAILED_RETRYABLE
REVIEW_LIMIT_REACHED
CANCELLED
DONE
```

`PENDING` health remains retryable; `FAIL` and `UNKNOWN` health do not silently pass.

## Deferred — do not implement without a concrete request

- automatic task detection instead of explicit `/workflow`;
- Website cross-conversation/project memory as workflow correctness state;
- generic arbitrary DAG workflow language;
- many writer accounts / automatic pooling;
- sophisticated artifact database;
- autonomous production deployment;
- broad non-coding generalization;
- synchronous `wait(job_id)` convenience.

## Future-task rule

New work should be added here only when it solves a concrete observed problem. Prefer focused fixes with measurable ROI over continuing phase numbering for its own sake. Do not add legacy migrations, aliases, provider-to-account fallbacks, or compatibility shims unless a real compatibility requirement is first demonstrated and documented.
