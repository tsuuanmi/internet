# Software Requirements Specification — Internet Workflow Runtime

- **Status:** implemented normative requirements
- **Version:** 4.0
- **Last synchronized:** 2026-09-09

## 1. Purpose

This SRS defines the required behavior of the current `@tsuuanmi/internet` multi-account Website workflow runtime for coding tasks. The implementation description is in [`how-it-works.md`](./how-it-works.md).

## 2. Primary UX

The standard coding workflow is started explicitly:

```text
/workflow <task>
```

The command shall resolve repository authority and exact base revision, create one durable workflow job, and enqueue deterministic execution. Automatic task detection is not required.

The standard human authority boundary is exact-head merge authorization after independent review and acceptable PR/CI health.

## 3. Actors and authority

### User

Owns final merge authority and any explicit exception decisions surfaced by the workflow.

### Local Agent

Acts as the user-facing authority broker. It starts jobs, receives compact progress/action-required context, carries user decisions back to the workflow, and may inspect details on exception. It is not the deterministic phase state machine and need not summarize normal research/review payloads.

### WorkflowEngine

Owns durable authoritative state, transitions, handoff gates, exact-head review/health validation, merge authority and retry/idempotency semantics.

### WorkflowDriver

Advances safe code-owned states automatically, deduplicates active work by job ID, resumes safe runnable jobs after restart, and stops at human/action-required boundaries.

### Thinker accounts

`chatgpt-thinker` and `gemini-thinker` perform reasoning and review. `chatgpt-thinker` is the default explicit final synthesizer.

### Writer account

`chatgpt-writer` is a separate Website identity used for repository mutation, PR work, read-only PR health inspection, and merge only after exact user authorization.

### GitHub / CI

The PR, exact head SHA and check/status policy are canonical external implementation evidence.

## 4. Functional requirements

### FR-001 — Explicit durable workflow start

`/workflow <task>` shall start one durable job and shall not encode the complete protocol as a giant Local prompt.

### FR-002 — First-class account identity

Authenticated runtime boundaries shall use explicit semantic `accountId`, not provider as an implicit identity selector.

Required initial accounts:

```text
chatgpt-thinker
chatgpt-writer
gemini-thinker
```

### FR-003 — Account isolation

Portable auth state, login profiles, browser/runtime ownership, schedulers, conversations and remote-login state shall remain isolated per account.

### FR-004 — Clean-break identity model

The runtime shall not depend on provider-to-account default aliases, provider-keyed state read-through, legacy v1 migration or automatic compatibility import unless a future concrete compatibility requirement explicitly changes this contract.

### FR-005 — High ChatGPT default

Ordinary ChatGPT browser turns shall default to reasoning level `high` unless explicitly configured otherwise.

### FR-006 — Explicit synthesis identity

Team synthesis shall route to an explicit account identity. Default: `chatgpt-thinker`, independent of speaking order.

### FR-007 — Direct workflow-owned teams

Research and review lanes shall run directly through the lower-level browser team runtime without requiring a free-form DSH child agent as a reasoning intermediary.

### FR-008 — Independent logical lanes

The standard coding job shall run two research lanes and two post-PR review lanes. Same-account Website turns may serialize for safety while logical lanes remain independent.

### FR-009 — Deterministic prompts

Workflow prompts shall be constructed from authoritative job facts, including objective, repository/base or PR/head identity, lane role, constraints and output contract.

### FR-010 — Stable per-job Website sessions

Research A/B, Review A/B and writer shall use stable deterministic job-scoped session identities. Review cycle and exact PR head shall remain state/prompt facts rather than creating new reviewer session identities.

### FR-011 — Verbatim handoffs

Each research/reviewer final output shall be stored and delivered to the writer without summarization or rewriting. Metadata shall remain outside the payload.

### FR-012 — Payload integrity

Each handoff shall persist SHA-256 of the exact UTF-8 payload and deterministic logical identity. Corrupted/tampered persisted handoffs shall fail closed.

### FR-013 — Delivery semantics

Website handoff transport shall be treated as at-least-once with durable idempotent acknowledgement. The runtime shall not claim transactional exactly-once Website UI delivery.

### FR-014 — Separate control plane

Trusted controls such as `START_IMPLEMENTATION`, `APPLY_REVIEWS`, `CHECK_PR_HEALTH` and `MERGE_AUTHORIZED` shall be separate from model data payloads.

### FR-015 — Writer start gate

`START_IMPLEMENTATION` shall not be sent until all required research handoffs are durably acknowledged.

### FR-016 — Writer authority verification

Before mutation, the writer shall verify the exact target repository and base revision.

### FR-017 — One-PR idempotency

The deterministic workflow branch plus job identity shall act as the PR idempotency key. Retry shall reconcile and reuse exactly one matching open PR; closed/merged/conflicting duplicate identity shall block rather than create another PR.

### FR-018 — Durable PR receipt

Successful writer implementation shall persist repository, PR number/URL, base branch, head branch and exact head SHA.

### FR-019 — Scoped Website auto-approval

A recognized Website GitHub confirmation may be auto-approved only when actual runtime account/session, repository, workflow state, action type and branch/PR identity all match authoritative workflow scope.

### FR-020 — Unknown confirmation fail-closed

Unknown, malformed, ambiguous or scope-mismatched Website confirmations shall not be clicked and shall produce a durable action-required stop.

### FR-021 — Merge excluded from implementation authority

Starting `/workflow` shall not authorize merge. Ordinary implementation/remediation confirmation policy shall not include premature merge.

### FR-022 — PR-centric independent review

After PR creation, two independent review lanes shall inspect the actual PR and exact current head SHA.

### FR-023 — Strict reviewer head binding

Each review final shall include `PASS` or `CHANGES_REQUIRED` plus an exact reviewer-asserted `reviewedHeadSha`. Malformed or wrong-head results shall fail the lane.

### FR-024 — Verbatim reviewer delivery

Complete reviewer final payloads shall be delivered verbatim to the persistent writer conversation.

### FR-025 — Same-PR remediation

If changes are required, `APPLY_REVIEWS` shall be sent only after all required review handoffs are delivered. Writer remediation shall preserve exact PR identity and advance the head SHA.

### FR-026 — Review cycle limit

The default maximum review cycle count shall be three. Exhaustion shall stop as `REVIEW_LIMIT_REACHED`.

### FR-027 — Durable event classes

The runtime shall distinguish `INTERNAL`, `PROGRESS` and `ACTION_REQUIRED` events. Full research/review payloads shall not be projected into Local progress context by default.

### FR-028 — Best-effort Local injection

Progress/action-required injection failures shall not roll back committed workflow state or become part of correctness.

### FR-029 — Payload-free status

Workflow status shall expose control-plane summaries such as state, lane attempts/errors, handoff hashes/delivery, writer identity, PR/head, review cycle, pending action, health, event and last error without returning raw research/review payloads by default.

### FR-030 — Automatic driver

`WorkflowDriver` shall advance runnable deterministic states automatically and deduplicate concurrent runs by `jobId`.

### FR-031 — Restart recovery

Startup recovery shall resume only safe runnable states. Jobs waiting on user authority or known action-required failures shall remain stopped.

### FR-032 — Explicit retry state

Unexpected driver/orchestration failures shall persist an explicit retry-required state and resume target. There shall be no generic fallback to `CREATED`.

### FR-033 — Cancellation ordering

Cancellation shall abort/settle active driver work before persisting `CANCELLED`.

### FR-034 — Exact-head PR health receipt

PR health shall be persisted against repository + PR + exact head SHA with one state:

```text
PASS | FAIL | PENDING | NONE | UNKNOWN
```

### FR-035 — Read-only health inspection

`CHECK_PR_HEALTH` shall perform live read-only inspection and shall not mutate the repository or PR.

### FR-036 — Health merge gate

`PASS` shall be merge-eligible. `NONE` shall be merge-eligible only when absence of required checks/statuses is established. `PENDING` shall be retryable. `FAIL` shall not advance. `UNKNOWN` shall fail closed.

### FR-037 — Health invalidation

Any new/remediated PR head shall invalidate a prior health receipt.

### FR-038 — Explicit exact-head merge authorization

Merge approval shall be bound to the concrete job, repository, PR and expected head SHA. Approval shall move the job to `MERGING`, not imply a generic reusable permission.

### FR-039 — Pre-merge revalidation

Immediately before merge, the workflow shall re-read the live PR head and current PR health. Changed head or unacceptable health shall invalidate stale authority.

### FR-040 — Authorized Website merge confirmation

Website `merge_pull_request` confirmation may be auto-approved only in the exact authorized `MERGING` state with matching durable authority.

### FR-041 — Durable merge receipt

Successful merge shall persist executor, authorized/verified head, resulting merged SHA and timestamp before `DONE`.

### FR-042 — Operator-only retention preview

Retention preview shall list only aged terminal jobs: `DONE` after 30 days and `CANCELLED` after 14 days, measured from authoritative `updatedAt`.

### FR-043 — Exact cleanup guard

Cleanup shall require the exact `jobId` plus unchanged `updatedAt` from preview. A changed job shall fail closed.

### FR-044 — Scoped cleanup

Cleanup shall validate the selected job's expected handoff directory and delete only that exact job record and its exact handoffs.

### FR-045 — Cleanup audit

Cleanup shall persist a private durable audit receipt. Repeating the same exact completed cleanup shall be audit-idempotent.

### FR-046 — No implicit retention deletion

There shall be no automatic background cleanup, startup sweep or scheduled deletion.

## 5. Core persisted authority

### Job

```text
job_id
ownerSessionId
objective
repository
base branch/revision
state
research/review lane state
writer account/session
PR receipt
review cycle
PR health receipt
pending action / resume state
merge authorization / merge receipt
last event / last error
createdAt / updatedAt
```

### Handoff

```text
handoff_id
job_id
source
recipient
sequence
payload
payload_hash
delivery state/timestamps
```

### Merge authorization

```text
job_id
repository
PR number/URL
head branch
expected head SHA
review cycle
owner session
authorizedAt
```

### Cleanup audit

```text
audit id
job id
repository
terminal state
retention rule
preview/eligibility identity
operator session
requested/completed timestamps
deleted handoff count
status
```

Secrets shall not be persisted in shared workflow artifacts.

## 6. Non-functional requirements

- **Determinism:** code owns state transitions, cardinality, ordering and authority gates.
- **Intent fidelity:** normal data routing shall not introduce avoidable LLM transformations.
- **Isolation:** same-provider accounts remain isolated at auth/runtime/conversation/scheduler boundaries.
- **Fail-closed safety:** ambiguous authority, stale exact-head state or corrupted durable data shall stop rather than guess.
- **Recoverability:** Local turn completion or plugin restart shall not discard durable jobs.
- **Idempotency:** retry prefers exact resume/reconcile over duplicate handoff, PR or merge actions.
- **Context efficiency:** Local receives compact control-plane context rather than full team/review payloads by default.
- **Least workflow authority:** technical GitHub capability never substitutes for job/repository/head/user authority.

## 7. End-to-end acceptance flow

```text
/workflow <task>
-> durable job + automatic driver
-> Research A/B direct team runtime
-> exact handoffs to writer
-> START_IMPLEMENTATION
-> one reconciled PR
-> Review A/B exact-head
-> exact reviewer handoffs
-> same-PR remediation loop if required
-> PASS/PASS exact head
-> acceptable CHECK_PR_HEALTH receipt
-> exact-head merge authorization request
-> explicit user approval
-> immediate head + health revalidation
-> MERGE_AUTHORIZED
-> writer merge
-> durable merge receipt
-> DONE
```

The normal path shall not require Local to summarize team results, implement code, push an intermediate branch merely for review, manually select the next workflow phase, or infer merge authority.
