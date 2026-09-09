# Architecture and Implementation Update — 2026-09-09

This document consolidates the major changes that moved `@tsuuanmi/internet` from browser-backed web tools plus a prompt prototype into the current durable multi-account coding-workflow runtime.

## Current architecture

```text
User
  = final authority

Local
  = user-facing authority broker

WorkflowEngine + WorkflowDriver
  = deterministic control plane

Website thinker teams
  = repository reading, reasoning, critique and review

chatgpt-writer
  = scoped GitHub implementation / PR / authorized merge executor

GitHub PR + CI
  = canonical external implementation evidence
```

The important boundary is deliberate: code decides what phase runs, who receives which payload, when a phase may advance, and when authority is required. Models decide the reasoning and implementation content within that scope.

## Clean-break account identity

The runtime now uses semantic account identity as the authentication/capability boundary:

```text
chatgpt-thinker
gemini-thinker
chatgpt-writer
```

Provider is Website implementation metadata, not an implicit account selector. Portable account state, login profiles, conversations, browser pools, schedulers, remote-login state and account commit queues are account-scoped.

There is intentionally no provider-to-account default alias, provider-keyed read-through, v1 migration, automatic state import, or compatibility shim.

## `/workflow` is real deterministic code

The explicit UX remains:

```text
/workflow <task>
```

It resolves the current Git repository and exact base revision, creates a durable job, and immediately enqueues the automatic driver. The old giant Local workflow prompt is gone.

## Direct independent thinking teams

Research A/B and Review A/B are workflow-owned lanes. They call the lower-level browser team runtime directly rather than asking a free-form child agent to mediate or summarize.

Each team uses deterministic job facts in its prompt and `chatgpt-thinker` is the default explicit final synthesizer.

Stable sessions are scoped by job and lane:

```text
<local>:workflow:<job>:research:A
<local>:workflow:<job>:research:B
<local>:workflow:<job>:review:A
<local>:workflow:<job>:review:B
<local>:workflow:<job>:writer
```

Review cycle and exact PR head are authoritative state/prompt inputs rather than being encoded as new conversation identities.

## Verbatim durable handoffs

Research/reviewer final outputs move directly to the writer as exact data-plane payloads. SHA-256 is computed over the exact UTF-8 bytes. Metadata and delivery receipts live outside the payload.

Delivery semantics are durable at-least-once plus idempotent acknowledgement; Website UI transport is not claimed to provide transactional exactly-once delivery.

Trusted controls are separate messages, including:

```text
START_IMPLEMENTATION
APPLY_REVIEWS
RETRY
CHECK_PR_HEALTH
MERGE_AUTHORIZED
```

No trusted control instruction is prepended or appended to a verbatim team/reviewer payload.

## Persistent writer and one-PR identity

Each job owns one stable `chatgpt-writer` Website conversation. The writer receives Research A then B exactly, followed by `START_IMPLEMENTATION` only after both delivery receipts exist.

The implementation branch is deterministic from job identity. On retry, the writer must reconcile that exact branch and reuse one matching open PR. Closed/merged/conflicting duplicate identity blocks rather than silently creating another PR.

The durable PR receipt binds repository, PR number/URL, base, head branch and exact head SHA.

## Scoped Website confirmations

Website GitHub confirmation handling is conservative and fail-closed. Auto-Allow requires a narrow recognized confirmation surface plus exact workflow scope:

```text
runtime account == chatgpt-writer
runtime session == job writer session
repository == authoritative job repository
workflow state permits the action
action is allowlisted for that phase
branch / PR identity matches durable state
```

Unknown or ambiguous prompts become `UNKNOWN_CONFIRMATION`. Premature merge is never covered by ordinary implementation authorization.

## Exact-head review/remediation

After PR creation, Review A/B inspect the actual PR and exact current head. Each reviewer must return strict JSON with:

```text
verdict: PASS | CHANGES_REQUIRED
reviewedHeadSha: <exact lowercase 40-char SHA>
```

Wrong-head/malformed output fails the lane. Reviewer finals are delivered verbatim to the writer.

If changes are required, the engine sends separate `APPLY_REVIEWS`; the writer must update the same PR and advance the head. The review loop then runs again. The default maximum is three cycles.

## Compact Local events

Durable engine events are classified as:

```text
INTERNAL
PROGRESS
ACTION_REQUIRED
```

Only compact control-plane metadata is eligible for Local injection through DSH `agent.inject()`. Research/reviewer payloads remain outside Local context by default. Event delivery is best-effort after durable state commit and is never part of correctness.

## Exact-head merge gate

A reviewed PR does not imply merge authority.

The merge path binds user approval to the concrete repository + PR + expected head SHA. Approval transitions into `MERGING`; the writer then re-reads the live PR and verifies the exact head before merge.

Website `merge_pull_request` confirmation may be auto-allowed only while the exact durable merge authorization is still valid. A changed head invalidates stale authority.

## Automatic durable driver

`WorkflowDriver` advances only deterministic runnable states. It deduplicates active work by job ID, resumes safe runnable jobs after plugin restart, and stops at explicit human/error boundaries.

Startup recovery does not wake jobs waiting on merge approval, unknown confirmations, blocked state, review-limit decisions, cancellation, or completion.

Unexpected orchestration errors become durable retry-required state with an explicit resume target rather than resetting the job to a generic beginning.

## Exact-head PR/CI health gate

PR health is now a durable exact-head receipt:

```text
PASS
FAIL
PENDING
NONE
UNKNOWN
```

The writer performs read-only live GitHub inspection through `CHECK_PR_HEALTH`. The engine validates the returned repository/PR/head binding.

- `PASS` is merge-eligible.
- `NONE` is merge-eligible only when absence of required checks/status policy is established.
- `PENDING` is retryable.
- `FAIL` blocks merge progress.
- `UNKNOWN` fails closed and becomes action-required.

A changed/remediated head invalidates the old health receipt. Health is checked before requesting merge authorization and again immediately before an already-authorized merge.

## Operations / retention

P13 adds explicit operator-only cleanup. There is no startup sweep, timer, scheduler or background deletion.

Retention windows:

```text
DONE      -> 30 days from authoritative updatedAt
CANCELLED -> 14 days from authoritative updatedAt
```

`internet_workflow_maintenance preview` lists eligible terminal candidates. Cleanup requires the exact `jobId` and unchanged `updatedAt` from preview, validates that job's complete handoff directory, deletes only that job plus its exact handoffs, and retains a private durable audit receipt. Repeating the same completed cleanup is audit-idempotent.

## Current end-to-end path

```text
/workflow <task>
-> durable job + automatic driver
-> Research A/B
-> exact handoffs to writer
-> START_IMPLEMENTATION
-> writer creates/reuses one PR
-> Review A/B against exact head
-> exact review handoffs
-> APPLY_REVIEWS and same-PR loop if required
-> PASS/PASS on exact head
-> CHECK_PR_HEALTH
-> exact-head merge authorization request
-> user approves exact head
-> pre-merge head + health re-check
-> MERGE_AUTHORIZED
-> writer merge
-> DONE
```

## Deliberately deferred

The completed coding path does not depend on Website cross-conversation/project memory. Also deferred until a concrete need exists: automatic task detection, generic DAG workflows, multi-writer pooling, a sophisticated artifact database, autonomous production deployment, broad non-coding generalization, and synchronous `wait(job_id)`.
