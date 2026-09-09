# Internet Runtime Roadmap

- **Status:** P0-P13 complete
- **Last synchronized:** 2026-09-09

The original coding-workflow roadmap is complete. This file now records what landed, in dependency order, and defines the boundary between implemented behavior and intentionally deferred ideas.

## Completed roadmap

### P0 — behavior and identity contract

Completed:

- ChatGPT ordinary turns default to `high` reasoning;
- team synthesis has an explicit account identity and defaults to `chatgpt-thinker`;
- semantic `accountId` is separate from provider implementation metadata.

### P1 — clean-break multi-account foundation

Completed:

- `chatgpt-thinker`, `chatgpt-writer`, and `gemini-thinker` are first-class identities;
- portable auth state, login profiles, browser pools, schedulers, conversation bindings, remote-login state, and commit queues are account-scoped;
- authenticated runtime APIs require explicit account identity;
- no provider-to-account fallback, v1 read-through, migration shim, or implicit legacy import is part of the architecture.

### P2 — real durable `/workflow`

Completed:

```text
/workflow <task>
-> resolve repository + exact base revision
-> WorkflowEngine.start(...)
-> durable job_id
```

The old monolithic Local workflow prompt is gone.

### P3 — direct workflow-owned team runtime

Completed:

- deterministic research/review prompt builders;
- two independent logical lanes;
- direct lower-level browser team execution;
- stable per-job Website sessions;
- explicit `chatgpt-thinker` final synthesis;
- lane-level retry/completion state.

### P4 — exact durable handoffs

Completed:

- SHA-256-bound exact UTF-8 payload storage;
- deterministic logical handoff identity;
- at-least-once Website delivery with durable idempotent acknowledgement;
- exact A/B delivery ordering;
- data payloads separated from trusted control messages.

### P5 — persistent writer and PR receipt

Completed:

- one stable `chatgpt-writer` Website conversation per job;
- exact research handoffs before `START_IMPLEMENTATION`;
- deterministic implementation branch identity;
- writer repository/base verification;
- strict `PR_OPEN` or `BLOCKED` result parsing;
- durable repository/PR/base/head/head-SHA receipt;
- PR creation retry reconciliation instead of duplicate PR creation.

### P6 — scoped Website confirmation policy

Completed:

- narrow GitHub confirmation recognition;
- exact account/session/repository/state/branch-or-PR matching;
- scoped auto-Allow for implementation/remediation actions only;
- `UNKNOWN_CONFIRMATION` fail-closed state;
- merge excluded from ordinary implementation authorization.

### P7 — exact-head PR review/remediation

Completed:

- two independent review lanes inspect the actual PR;
- strict reviewer JSON includes verdict plus exact `reviewedHeadSha`;
- reviewer finals reach writer verbatim;
- `APPLY_REVIEWS` is a separate control step;
- remediation preserves the same PR and must advance the head;
- review cycle limit defaults to three.

### P8 — compact Local events

Completed:

- durable event classes `INTERNAL`, `PROGRESS`, `ACTION_REQUIRED`;
- Local owner session persisted explicitly;
- compact best-effort `agent.inject()` integration;
- full research/review payloads stay out of Local progress context;
- payload-free workflow status/debug projection.

### P9 — exact-head merge authorization

Completed:

- `READY_FOR_MERGE_AUTHORIZATION` and `AWAITING_MERGE_AUTHORIZATION` boundaries;
- explicit user approval bound to repository + PR + exact head SHA;
- authorization invalidation when head changes;
- `MERGE_AUTHORIZED` control separate from reviewer data;
- Website merge Allow only in authorized `MERGING` state;
- durable merge receipt and `DONE` transition.

### P10 — restart/idempotency hardening

Completed:

- strict persisted-state validation;
- durable restart recovery;
- explicit retry/resume states rather than generic fallback;
- handoff identity/tamper checks;
- PR creation idempotency and exact branch reconciliation;
- account/approval/transition recovery coverage.

### P11 — automatic durable workflow driver

Completed:

- `WorkflowDriver` advances code-owned runnable states automatically;
- `/workflow` and `internet_workflow start` enqueue immediately;
- duplicate active runs deduplicate by `jobId`;
- startup discovery resumes only safe runnable states;
- human/action-required states remain stopped;
- `approve` resumes authorized merge; rejection remains quiet;
- cancellation settles in-flight work before persisting `CANCELLED`.

### P12 — exact-head PR/CI health gate

Completed:

- durable health receipt bound to repository + PR + exact head SHA;
- classifications: `PASS`, `FAIL`, `PENDING`, `NONE`, `UNKNOWN`;
- read-only `CHECK_PR_HEALTH` writer control;
- merge authorization requires acceptable current-head health;
- changed/remediated head invalidates the old health receipt;
- authorized merge re-checks health immediately before merge.

### P13 — operations / retention

Completed:

- `DONE` jobs become cleanup-eligible after 30 days;
- `CANCELLED` jobs after 14 days;
- `internet_workflow_maintenance preview` exposes aged terminal candidates only;
- cleanup requires exact `jobId` plus unchanged `updatedAt` from preview;
- cleanup validates the exact handoff directory before deletion;
- only the selected job and its handoffs are deleted;
- a private durable cleanup audit receipt is retained;
- repeated exact cleanup is audit-idempotent;
- there is no background/scheduled deletion.

## Current system milestone

The standard coding path is now:

```text
/workflow task
-> durable automatic research
-> exact handoffs
-> writer implementation + one PR
-> exact-head independent review
-> same-PR remediation loop if needed
-> exact-head PR/CI health gate
-> explicit user merge authorization
-> pre-merge head + health revalidation
-> writer merge
-> DONE
-> optional operator retention cleanup after policy age
```

## Deferred until a concrete need exists

These are not the next automatic phase and should not be implemented merely to continue numbering:

- automatic task detection instead of explicit `/workflow`;
- Website account/project memory as a correctness or data-plane dependency;
- generic arbitrary DAG workflow language;
- multiple writer accounts / automatic writer pooling;
- sophisticated artifact database;
- autonomous production deployment;
- broad generalization to non-coding workflows before a specific use case is defined;
- synchronous `wait(job_id)` convenience unless a caller actually needs it.

## Rule for future roadmap work

A new phase should be added only when there is a concrete user problem, measurable ROI, and a clear authority/safety boundary. Preserve the existing clean-break architecture: deterministic code owns workflow transitions and authority gates; Website models own reasoning/implementation content; Local remains the user-facing authority broker.
