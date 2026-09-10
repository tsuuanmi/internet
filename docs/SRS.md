# Software Requirements Specification — Internet Workflow Runtime

- **Status:** implemented normative requirements
- **Version:** 4.1
- **Last synchronized:** 2026-09-10

## 1. Purpose

This SRS defines required behavior of the current `@tsuuanmi/internet` multi-account Website workflow runtime for coding tasks. Implementation detail lives in [`how-it-works.md`](./how-it-works.md).

## 2. Primary UX

The standard coding workflow is started explicitly:

```text
/workflow <task>
```

Routine operator controls are:

```text
/workflow list
/workflow status [jobId]
/workflow watch [jobId]
/workflow stop [jobId]
/workflow continue [jobId]
```

The start command shall resolve repository authority and exact base revision, create one durable workflow job, print its job ID, and enqueue deterministic execution. Automatic task detection is not required.

The standard human authority boundary is exact-head merge authorization after independent review and acceptable PR/CI health.

## 3. Actors and authority

### User

Owns final merge authority and explicit exception decisions surfaced by the workflow.

### Local Agent

Acts as the user-facing authority broker. It starts jobs, receives compact progress/action-required context, carries user decisions back to the workflow, and may inspect diagnostic details. It is not the deterministic phase state machine and need not summarize normal research/review payloads.

### WorkflowEngine

Owns durable authoritative state, per-job account routing, transitions, handoff gates, exact-head review/health validation, merge authority, and retry/idempotency semantics.

### WorkflowDriver

Advances safe code-owned states automatically, deduplicates active work by job ID, resumes safe runnable jobs after restart, and stops at human/action-required boundaries.

### Agent-team members

Reasoning/review participants are logical `Member 1..N` roles backed by explicit authenticated thinker accounts. Provider identity is not a reasoning role.

Current default backing route for new jobs:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
```

`gemini-thinker` remains an optional thinker account for explicit direct/research/team use but is not required by the default workflow.

### Writer account

`chatgpt-writer` is a separate Website identity used for repository mutation, PR work, read-only PR health inspection, and merge only after exact user authorization. It shall not be reused as a reasoning member.

### GitHub / CI

The PR, exact head SHA, and check/status policy are canonical external implementation evidence.

## 4. Functional requirements

### FR-001 — Explicit durable workflow start

`/workflow <task>` shall start one durable job and shall not encode the complete protocol as one giant Local prompt.

### FR-002 — First-class semantic account identity

Authenticated runtime boundaries shall use explicit semantic `accountId`, not provider as an implicit identity selector.

Current accounts:

```text
chatgpt-thinker
chatgpt-thinker-2
chatgpt-writer
gemini-thinker
```

### FR-003 — Account isolation

Portable auth state, login profiles, browser/runtime ownership, schedulers, conversations, and remote-login state shall remain isolated per semantic account.

### FR-004 — Clean-break identity model

The runtime shall not depend on provider-to-account aliases, provider-keyed state read-through, legacy schema migration, or compatibility import unless a future explicit requirement changes this contract.

### FR-005 — High ChatGPT default

Ordinary ChatGPT browser turns shall default to reasoning level `high` unless explicitly configured otherwise.

### FR-006 — Explicit synthesis identity

Team synthesis shall route to an explicit backing account that belongs to the selected team and has synthesis capability. Current default: `chatgpt-thinker`.

### FR-007 — Shared direct team core

Research and review lanes shall use the same lower-level team execution core as `internet_team`, without invoking the public tool wrapper as an internal RPC and without duplicating the round loop.

### FR-008 — Two independent workflow lanes per phase

The standard coding job shall run two research lanes and two post-PR review lanes.

### FR-009 — Concurrent lane launch

Research A/B and Review A/B shall be launched before either sibling is awaited. Same-account Website turns may serialize for account safety, but workflow shall not introduce an A-then-B lane mutex.

### FR-010 — Stable per-job Website sessions

Research A/B, Review A/B, and writer shall use stable deterministic job-scoped session identities. Review cycle, exact PR head, and account routing shall remain durable facts rather than creating new session identities.

### FR-011 — Provider-agnostic member prompts

Team prompt semantics shall identify reasoning participants only as ordered `Member 1`, `Member 2`, ... roles. Normal prompts shall not reveal or depend on ChatGPT/Gemini/provider/account identity.

### FR-012 — Untrusted peer-content boundary

Peer model output supplied to another member or synthesizer shall be clearly delimited as untrusted content/evidence rather than instruction authority.

### FR-013 — Strongest-supported synthesis

Synthesis shall target one strongest supported combined answer. It shall not require equal weighting, concatenation, neutral summarization, or preservation of every member proposal.

### FR-014 — Deterministic workflow prompt strategy

Workflow prompts shall be constructed from authoritative job facts including objective, repository/base or PR/head identity, lane focus, constraints, and output contract. Research and review may use purpose-specific strategies while sharing the same execution core.

### FR-015 — Durable account routing

Each workflow job shall persist exact ordered thinker accounts, writer account, and synthesizer account. Routing validation shall use semantic account capabilities rather than hard-coding one provider pair.

### FR-016 — No silent routing mutation

Retry/restart of an existing durable job shall retain that job's persisted member routing. A change to global/default routing shall affect only newly created jobs unless an explicit migration operation is specified.

### FR-017 — Current default two-ChatGPT route

New workflow jobs shall currently route Member 1 to `chatgpt-thinker` and Member 2 to `chatgpt-thinker-2`. `chatgpt-writer` remains separate. Gemini shall not be required for default workflow registration.

### FR-018 — Verbatim handoffs

Each research/reviewer final output shall be stored and delivered to the writer without summarization or rewriting. Metadata shall remain outside the payload.

### FR-019 — Payload integrity

Each handoff shall persist SHA-256 of exact UTF-8 payload and deterministic logical identity. Corrupted/tampered persisted handoffs shall fail closed.

### FR-020 — Delivery semantics

Website handoff transport shall be treated as at-least-once with durable idempotent acknowledgement. The runtime shall not claim transactional exactly-once Website UI delivery.

### FR-021 — Separate trusted controls

Trusted controls such as `START_IMPLEMENTATION`, `APPLY_REVIEWS`, `CHECK_PR_HEALTH`, and `MERGE_AUTHORIZED` shall remain separate from model data payloads.

### FR-022 — Writer start gate

`START_IMPLEMENTATION` shall not be sent until all required research handoffs are durably acknowledged.

### FR-023 — Writer authority verification

Before mutation, the writer shall verify exact target repository and base revision.

### FR-024 — One-PR idempotency

The deterministic workflow branch plus job identity shall act as the PR idempotency key. Retry shall reconcile/reuse exactly one matching open PR; closed/merged/conflicting duplicate identity shall block rather than create another PR.

### FR-025 — Durable PR receipt

Successful writer implementation shall persist repository, PR number/URL, base branch, head branch, and exact head SHA.

### FR-026 — Scoped Website auto-approval

A recognized Website GitHub confirmation may be auto-approved only when actual runtime account/session, repository, workflow state, action type, and branch/PR identity match authoritative workflow scope.

### FR-027 — Unknown confirmation fail-closed

Unknown, malformed, ambiguous, or scope-mismatched Website confirmations shall not be clicked and shall produce a durable action-required stop.

### FR-028 — Merge excluded from implementation authority

Starting `/workflow` shall not authorize merge. Ordinary implementation/remediation confirmation policy shall not include premature merge.

### FR-029 — PR-centric independent review

After PR creation, two independent review team lanes shall inspect the actual PR and exact current head SHA.

### FR-030 — Strict reviewer head binding

Each review final shall include `PASS` or `CHANGES_REQUIRED` plus exact reviewer-asserted `reviewedHeadSha`. Malformed or wrong-head results shall fail the lane.

### FR-031 — Verbatim reviewer delivery

Complete reviewer final payloads shall be delivered verbatim to the persistent writer conversation.

### FR-032 — Same-PR remediation

If changes are required, `APPLY_REVIEWS` shall be sent only after required review handoffs are delivered. Writer remediation shall preserve exact PR identity and advance head SHA.

### FR-033 — Review cycle limit

The default maximum review cycle count shall be three. Exhaustion shall stop at the defined review-limit boundary.

### FR-034 — Structured team progress

The shared team runtime shall expose structured progress including stage, status, backing account/provider, and round where applicable. Workflow shall persist bounded per-job trace evidence including phase/lane/attempt context.

### FR-035 — Provider failure classification

Provider/browser execution failures shall be classified as orchestration failures with exact account/provider/stage/round/kind/retryability when available. A provider error shall never become a valid member contribution or synthesis input.

### FR-036 — Provider-agnostic operator projection

Routine status/watch shall present reasoning execution as Team A/B and `Member 1..N`. Raw backing account/provider identity shall be reserved for explicit diagnostic attribution, especially failure reporting.

### FR-037 — Payload-free Local progress

Full research/review payloads shall not be projected into Local progress context by default. Compact progress shall contain control-plane execution metadata only.

### FR-038 — Workflow status clarity

`/workflow status [jobId]` shall show at minimum overall state/current phase, pipeline summary, Research/Review Team A/B status, attempt, latest round/member/stage when available, structured failure kind/retryability, writer state, PR/head/CI/review state, pending action, and durable update time.

### FR-039 — Workflow watch semantics

`/workflow watch [jobId]` shall read the same authoritative durable state and use the existing compact event stream for live progress. It shall not create a second correctness state machine.

### FR-040 — Owner-scoped operator target selection

Operator commands shall scope jobs to the current owner session and fail rather than guess when an omitted job ID is ambiguous.

### FR-041 — Automatic driver

`WorkflowDriver` shall advance runnable deterministic states automatically and deduplicate concurrent runs by `jobId`.

### FR-042 — Restart recovery

Startup recovery shall resume only safe runnable states. Jobs waiting on user authority or known action-required failures shall remain stopped.

### FR-043 — Explicit retry state

Unexpected driver/orchestration failures shall persist explicit retry-required state and resume target. There shall be no generic fallback to `CREATED`.

### FR-044 — Cancellation ordering

Cancellation shall abort and settle active driver work before persisting terminal `CANCELLED`. Cancelled jobs shall not auto-resume after restart.

### FR-045 — Explicit continue semantics

`/workflow continue [jobId]` shall resume only an engine-approved durable recovery target. It shall not reset a job, rerun completed work blindly, or change persisted account routing.

### FR-046 — Exact-head PR health receipt

PR health shall be persisted against repository + PR + exact head SHA with one state:

```text
PASS | FAIL | PENDING | NONE | UNKNOWN
```

### FR-047 — Read-only health inspection

`CHECK_PR_HEALTH` shall perform live read-only inspection and shall not mutate repository or PR.

### FR-048 — Health merge gate

`PASS` shall be merge-eligible. `NONE` shall be merge-eligible only when absence of required checks/statuses is established. `PENDING` shall be retryable. `FAIL` shall not advance. `UNKNOWN` shall fail closed.

### FR-049 — Health invalidation

Any new/remediated PR head shall invalidate prior health evidence.

### FR-050 — Explicit exact-head merge authorization

Merge approval shall be bound to concrete job, repository, PR, and expected head SHA. Approval shall move the job to the merge path, not imply reusable generic permission.

### FR-051 — Pre-merge revalidation

Immediately before merge, workflow shall re-read live PR head and current PR health. Changed head or unacceptable health shall invalidate stale authority.

### FR-052 — Authorized Website merge confirmation

Website merge confirmation may be auto-approved only in exact authorized merge state with matching durable authority.

### FR-053 — Durable merge receipt

Successful merge shall persist executor, authorized/verified head, resulting merged SHA, and timestamp before `DONE`.

### FR-054 — Operator-only retention preview

Retention preview shall list only aged terminal jobs: `DONE` after 30 days and `CANCELLED` after 14 days, measured from authoritative `updatedAt`.

### FR-055 — Exact cleanup guard

Cleanup shall require exact `jobId` plus unchanged `updatedAt` from preview. Changed job state shall fail closed.

### FR-056 — Scoped cleanup

Cleanup shall validate the selected job's expected private artifacts and remove only that exact job record, exact handoffs, and team trace.

### FR-057 — Cleanup audit

Cleanup shall persist a private durable audit receipt. Repeating the same exact completed cleanup shall be audit-idempotent.

### FR-058 — No implicit retention deletion

There shall be no automatic background cleanup, startup sweep, or scheduled deletion.

### FR-059 — Stable remote-login identity

Adding a new semantic account shall not silently remap existing stable login ports. The current mapping is:

```text
39000 chatgpt-thinker
39001 chatgpt-writer
39002 gemini-thinker
39003 chatgpt-thinker-2
```

### FR-060 — No hidden automatic provider failover

The runtime shall not silently replace a failed member/provider inside an existing durable workflow. Any future health-aware retry/failover policy requires an explicit durable routing/retry specification.

## 5. Core persisted authority

### Job

```text
job_id
ownerSessionId
objective
repository
base revision
state
ordered thinker account routing
writer/synthesizer routing
research/review lane state
writer account/session
PR receipt
review cycle
PR health receipt
pending action / resume state
merge authorization / merge receipt
last event
createdAt / updatedAt
```

### Team trace

```text
job id
phase
lane
attempt
round
backing account/provider
stage/status
failure kind/message/retryability
bounded completed-turn text
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
deleted artifact counts
status
```

Secrets shall not be persisted in shared workflow artifacts.

## 6. Non-functional requirements

- **Determinism:** code owns state transitions, lane cardinality, ordering, durable routing, and authority gates.
- **Provider agnosticism:** team intellectual semantics depend on ordered members, not provider brands.
- **Intent fidelity:** normal data routing shall not introduce avoidable LLM transformations.
- **Isolation:** same-provider accounts remain isolated at auth/runtime/conversation/scheduler boundaries.
- **Fail-closed safety:** ambiguous authority, stale exact-head state, malformed routing, or corrupted durable data shall stop rather than guess.
- **Recoverability:** Local turn completion or plugin restart shall not discard durable jobs.
- **Idempotency:** retry prefers exact resume/reconcile over duplicate handoff, PR, or merge actions.
- **Context efficiency:** Local receives compact control-plane context rather than full team/review payloads by default.
- **Least workflow authority:** technical GitHub capability never substitutes for job/repository/head/user authority.
- **Diagnosability:** provider/account details remain available for failure attribution without leaking into normal member reasoning prompts.

## 7. End-to-end acceptance flow

```text
/workflow <task>
-> durable job + automatic driver
-> Research Team A/B concurrently
     each: Member 1 + Member 2 -> strongest synthesis
-> exact handoffs to writer
-> START_IMPLEMENTATION
-> one reconciled PR
-> Review Team A/B concurrently on exact head
     each: Member 1 + Member 2 -> exact-head result
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

The normal path shall not require Local to summarize team results, implement code, manually inspect private job JSON, manually select the next workflow phase, or infer merge authority.
