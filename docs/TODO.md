# Internet Runtime TODO

- **Status:** coding-workflow roadmap complete through P13; concrete post-roadmap hardening proposed from observed failures
- **Last synchronized:** 2026-09-09

This file remains a closure checklist, not an instruction to keep adding phases. All planned correctness-critical coding-workflow work through P13 has landed. New work is added only when a concrete observed problem justifies it.

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

## Concrete follow-up — workflow team observability/control hardening

A real research lane exposed a provider execution failure on `gemini-thinker`. Detection worked, but the durable workflow view only retained a flattened lane-level error, making it difficult to see the exact failed round/account/stage without opening the provider UI or reading internal files.

The detailed proposal and acceptance criteria live in [`WORKFLOW-HARDENING.md`](./WORKFLOW-HARDENING.md).

### P0 operator UX

- [ ] Add `/workflow status [jobId]`.
- [ ] Add `/workflow list`.
- [ ] Add `/workflow stop [jobId]` backed by the existing driver cancellation path.
- [ ] Resolve an omitted `jobId` safely from the current owner session; fail on ambiguity instead of guessing.
- [ ] Render phase/lane/attempt/PR/CI/pending-action state without dumping full model payloads.

### P1 structured team evidence

- [ ] Extend the shared team core with per-turn progress callbacks/events.
- [ ] Preserve `phase/lane/attempt/round/accountId/provider/stage/status` for workflow team execution.
- [ ] Replace flattened provider failures with structured failure metadata while keeping a compact user-facing message.
- [ ] Retain bounded completed-turn evidence on team failure.
- [ ] Persist detailed trace data outside the compact main job record.
- [ ] Make workflow status show the current or last exact team turn.

### P1 prompt strategy

- [ ] Keep one shared team engine for `internet_team` and workflow research/review.
- [ ] Do **not** make workflow call the public `internet_team` tool as an internal dependency.
- [ ] Add explicit prompt strategies for generic debate, workflow research and workflow review.
- [ ] Delimit peer model output as untrusted content/evidence rather than instruction authority.
- [ ] Preserve the exact-head strict JSON review contract.

### P2 convenience monitoring

- [ ] Consider `/workflow watch [jobId]` after one-shot status is stable.
- [ ] `watch` must consume durable state/events and must not become a second correctness source.

### Retry follow-up

- [ ] Classify provider execution failures as retryable/non-retryable in structured state.
- [ ] Measure failure frequency before adding automatic provider-turn retry.
- [ ] If automatic retry is added, make it bounded, durable, cancellation-aware and incapable of duplicating acknowledged handoffs or GitHub mutations.

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
