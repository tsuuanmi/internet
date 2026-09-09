# Internet Team Runtime TODO

- **Status:** Working plan
- **Ordering:** ROI first, then dependency/risk
- **Date:** 2026-09-08

## P0 — Do next

### 1. ✅ Default ChatGPT browser reasoning to High

**Status:** implemented.

- Change `DEFAULT_CONFIG.chatgptThinkingLevel` from `medium` to `high`.
- Update comments/system guidance/tests/config examples.

**ROI:** very high  
**Risk:** low

### 2. ✅ Make the team synthesizer explicit and default to ChatGPT thinker

**Status:** implemented with explicit `accountId` routing; `chatgpt-thinker` is the default synthesizer.

- Add explicit synthesizer selection.
- Stop using `lastProvider` as synthesis destination.
- Preserve speaking order independently from synthesizer identity.
- Add tests where Gemini speaks last but ChatGPT synthesizes.

**ROI:** very high  
**Risk:** low-medium

### 3. ✅ Define first-class `accountId`

**Status:** implemented as the semantic account catalog and capability-routing contract. Browser/storage isolation follows in P1.

Minimal contract:

```text
accountId
provider
role
capabilities
```

Initial IDs:

```text
chatgpt-thinker
chatgpt-writer
gemini-thinker
```

**ROI:** critical  
**Risk:** medium

## P1 — Multi-account foundation

**Status:** implemented as one clean-break refactor. Authenticated runtime boundaries now require explicit `accountId`; provider remains website implementation metadata only. No legacy account migration or provider-to-account fallback is included.

### 4. ✅ Refactor account storage from provider-keyed to account-keyed

Affected areas include `src/browser/accounts.ts` and `src/browser/storage.ts`.

Requirements:

- separate portable state for two ChatGPT accounts;
- private permissions retained;
- account-scoped canonical paths only;
- no implicit provider-to-account fallback;
- no cross-account stale snapshot overwrite.

### 5. ✅ Refactor BrowserManager maps to account identity

Review provider-keyed:

- browsers;
- browser launches;
- schedulers;
- remote logins;
- pending closes;
- active contexts;
- account commit queues.

### 6. ✅ Make conversation stores account-aware

Target isolation:

```text
chatgpt-thinker/conversations
chatgpt-writer/conversations
gemini-thinker/conversations
```

### 7. ✅ Make scheduler serialization account-aware

Same-account dependent turns remain ordered. Different authenticated accounts should not share a provider lock unless intentionally configured.

## P2 — Replace prompt-only `/workflow`

**Status:** foundation implemented. Jobs are durable and `/workflow` now creates engine state rather than injecting the old giant multi-phase prompt. Execution controllers land in the following phases.

### 8. ✅ Add `internet_workflow` service/tool contract

Initial operations:

```text
start
status
approve
reject
cancel
continue
```

### 9. ✅ Introduce `WorkflowEngine` + `WorkflowJobStore`

Minimum durable job fields:

```text
job_id
objective
repository
base revision
state
team-run status
account routing
handoff receipts
writer conversation
PR receipt
review cycle
pending action
last event
```

The first implementation uses private atomic per-job JSON under the plugin data directory. A more sophisticated workflow database remains unnecessary until concurrency/retention requirements justify it.

### 10. ✅ Convert `/workflow` into a thin adapter

Keep UX:

```text
/workflow <task>
```

Implementation now does:

```text
resolve repo/revision
-> WorkflowEngine.start
-> return job_id
```

The giant multi-phase follow-up prompt has been removed.

## P3 — Direct team runtime

**Status:** implemented as workflow-owned primitives. Automatic end-to-end background driving remains a later orchestration/event concern; research execution itself no longer needs a free-form child agent.

### 11. ✅ Add workflow-owned TeamRunner

`BrowserWorkflowTeamRunner` calls the lower-level `runTeam` primitive directly with explicit thinker accounts and the configured synthesizer.

### 12. ✅ Add deterministic TeamPromptBuilder

`WorkflowTeamPromptBuilder` constructs research/review tasks from authoritative job state. Research A/B receive intentionally different review focuses without an intermediary model rewriting the objective.

### 13. ✅ Generate deterministic team session identities

Stable per-job lane identities:

```text
<local>:workflow:<job>:research:A
<local>:workflow:<job>:research:B
<local>:workflow:<job>:review:A
<local>:workflow:<job>:review:B
<local>:workflow:<job>:writer
```

The lower-level team primitive now accepts this exact session identity; `internet_team` keeps its own `<agent>:team:<name>` namespace construction at the tool boundary. Review cycle and exact PR head SHA belong in authoritative workflow state and each review prompt, not in the reviewer conversation identity.

### 14. ✅ Support two concurrent logical team runs

`WorkflowEngine.runResearch()` starts incomplete A/B lanes together. Underlying same-account browser turns remain safely serialized by account schedulers while independent account work can proceed normally.

### 15. ✅ Persist team completion and retry state

Each lane persists status, attempts, error, exact final result, completion timestamp, and later review-head binding. A failed lane is retryable without rerunning a completed sibling lane or asking Local to reconstruct state.

## P4 — Verbatim handoffs

**Status:** implemented for the research-to-writer data plane. The same primitive is reusable for reviewer-to-writer delivery when the review loop lands.

### 16. ✅ Add durable handoff primitive

Each exact payload is stored privately under the workflow data directory with:

```text
handoff_id
job_id
source
recipient
sequence
payload
payload_hash
delivery status
```

`payload_hash` is SHA-256 over the exact UTF-8 payload. Creation is deterministic/idempotent for the same job/source/recipient/sequence and rejects changed content for an existing logical handoff. Delivery is at-least-once with an idempotent exact-hash receipt; Website UI delivery is not claimed to be transactional exactly-once.

### 17. ✅ Separate data messages from control messages

Data handoffs carry exact model output only. Trusted control messages use a separate typed contract:

- `START_IMPLEMENTATION`;
- `APPLY_REVIEWS`;
- `RETRY`;
- `MERGE_AUTHORIZED`.

No control instruction is prepended/appended to a verbatim team/reviewer payload.

### 18. ✅ Add all-handoffs-delivered gates

`WorkflowEngine.prepareResearchHandoffs()` materializes research A then B deterministically. `markHandoffDelivered()` records hash-bound delivery receipts. `START_IMPLEMENTATION` cannot be produced and the job cannot enter `WRITER_RUNNING` until both research handoffs are delivered.

## P5 — Writer and PR path

**Status:** implemented for initial implementation and PR creation. P7 reuses the same writer conversation for review remediation.

### 19. ✅ Add persistent `chatgpt-writer` conversation routing

Research A and Research B are delivered verbatim, in deterministic order, to the job's single dedicated writer conversation:

```text
<local>:workflow:<job>:writer
```

Only after both exact handoffs have durable delivery receipts does the engine send a separate `START_IMPLEMENTATION` control. The same conversation identity is retained for later PR remediation so the executor keeps the tactical context it built while reading and modifying the repository.

Acknowledged research handoffs are not resent when a transient writer-control failure is retried from `WRITER_RUNNING`.

### 20. ✅ Define writer control contract

`BrowserWorkflowWriterRunner` routes exclusively through `chatgpt-writer`. The trusted implementation control requires the writer to:

- confirm target repo/base revision;
- inspect the current repository;
- implement without needless redesign;
- validate the change;
- create/update exactly one PR;
- never merge in this phase;
- return `BLOCKED` on authority conflict or unsafe completion;
- otherwise return exactly one strict JSON `PR_OPEN` result.

Research payloads remain data-plane messages and are never wrapped with control instructions.

### 21. ✅ Persist PR receipt

Successful writer output is parsed and persisted as:

```text
repository
PR number
URL
base/head
head SHA
```

The job transitions to `PR_OPEN` and emits a compact progress event. Malformed writer output is rejected; `BLOCKED` creates an action-required state without fabricating a PR receipt. The persisted receipt becomes the authority input for review, remediation, and later merge binding.

## P6 — Scoped approval controller

**Status:** implemented for the Website writer path with conservative fail-closed recognition and exact workflow-scope matching.

### 22. ✅ Detect and classify Website confirmation UI

`chatgpt-confirmation.ts` inspects only narrow confirmation/dialog roots and requires a GitHub-scoped surface with exactly one visible `Allow` action plus an explicit deny/cancel action. The controller parses a supported action, repository, branch/head, and PR number when applicable. Generic tool-call containers, unknown destructive actions, multiple visible confirmations, and ambiguous multi-action text are not guessed through.

Visible `Allow` text alone is never sufficient.

### 23. ✅ Auto-confirm recognized in-scope implementation/PR actions

`approval-policy.ts` requires exact match against runtime-derived account/session identity plus:

```text
active workflow job
chatgpt-writer account
current session == job writer session
repository == authoritative job repository
workflow state permits the action
action is on the implementation/remediation allowlist
branch == persisted PR head or internet-workflow/<job_id>
PR number == persisted workflow PR when updating it
```

Initial implementation may auto-confirm branch creation, file writes, commits, branch push, and PR creation. Remediation may auto-confirm file writes, commits, branch push, and update of the exact persisted PR.

### 24. ✅ Add fail-closed `UNKNOWN_CONFIRMATION`

Unknown, ambiguous, incomplete, or scope-mismatched confirmations are never clicked. The workflow caller supplies only expected authority; `BrowserManager` supplies the actual account/session identity. Malformed GitHub confirmation UI is treated as unknown rather than silently ignored. The writer reports `UNKNOWN_CONFIRMATION`; the engine persists the dedicated state plus an ACTION_REQUIRED event and records `resumeState: WRITER_RUNNING`. After the user/operator handles the exception, `continue(job_id)` resumes the writer phase instead of restarting research.

### 25. ✅ Explicitly exclude merge from auto-authorization

Repository authority is validated before merge classification. A correctly scoped premature merge confirmation becomes writer `BLOCKED` before any `Allow` action is pressed; a cross-repo or mismatched merge prompt is `UNKNOWN_CONFIRMATION`. Merge is not part of the phase-1 action allowlist and can only be executed by the later merge path after explicit user authorization bound to the concrete PR/head state.

## P7 — PR review/remediation

**Status:** implemented as an exact-head, same-PR remediation loop. Reviewer outputs remain data-plane payloads;
control-plane verdict/head metadata is parsed deterministically without Local summarization.

### 26. ✅ Run two independent PR review teams directly

`WorkflowEngine.runReview()` drives A/B through the workflow-owned TeamRunner against the actual persisted PR. Each
strict reviewer JSON result includes `PASS` or `CHANGES_REQUIRED` plus the exact reviewer-asserted `reviewedHeadSha`.
Wrong-head or malformed output fails that lane instead of being treated as a valid review. Stable review session IDs
are reused across cycles while the exact head SHA and cycle remain authoritative prompt/state inputs.

### 27. ✅ Deliver review finals verbatim to writer

Cycle-scoped `review:<cycle>:A/B` handoffs preserve each complete reviewer JSON payload exactly and deliver A then B
to the same persistent `chatgpt-writer` conversation. Delivery keeps the existing durable hash/receipt semantics and
never passes through Local summarization.

### 28. ✅ Add separate APPLY_REVIEWS control step

`APPLY_REVIEWS` is emitted only after both current-cycle review handoffs are delivered and at least one reviewer
requires changes. The writer must update exactly the persisted PR, preserve PR identity, validate remediation, return
a new head SHA, and never merge. Material conflict or authority/safety failure returns `BLOCKED`.

### 29. ✅ Re-review updated PR

A successful remediation returns to `PR_OPEN`, resets review run results/status without changing reviewer session
identities, then reviews the new exact head. Both reviewers passing the same head moves the job to
`READY_FOR_MERGE_AUTHORIZATION`. `maxReviewCycles` defaults to `3`; exhaustion becomes `REVIEW_LIMIT_REACHED`.

## P8 — Events and Local integration

**Status:** implemented with compact host-native Local context injection and a payload-free status/debug projection.
Notification delivery is explicitly best-effort and never part of workflow correctness.

### 30. ✅ Add INTERNAL / PROGRESS / ACTION_REQUIRED events

The existing durable `lastEvent` classification is now connected to a workflow event sink. `INTERNAL` records remain
inside the engine; `PROGRESS` and `ACTION_REQUIRED` are eligible for Local notification. Research/reviewer finals are
never projected into these events. Remediation now emits an explicit `REMEDIATION_STARTED` progress event.

### 31. ✅ Integrate with host-native DSH completion/event injection

Each job persists its exact Local `ownerSessionId`. `DshWorkflowEventSink` resolves that live Agent through
`ctx.agents` and uses `agent.inject()` with plugin source `internet`. Injection adds compact durable model-facing context
for Local's next admitted step without waking an idle agent. Missing/disposed Local agents and notification failures
do not affect committed workflow state.

### 32. ✅ Add workflow status/debug surface

`internet_workflow status` now projects payload-free summaries for:

```text
job state
research/review lane status + attempts/errors
handoff source/recipient/hash/delivery state
writer account/session
PR URL/head SHA
review cycle
pending action
last event
last error
```

Exact team/reviewer payloads remain in their dedicated stores and are not returned by status.

### 33. Optional wait convenience — deferred

`wait(job_id)` is intentionally not added. Host-native event injection plus explicit `status(job_id)` provides the
needed UX without turning polling/waiting into the orchestration model. Add it only if a concrete caller needs a
synchronous convenience later.

## P9 — Merge gate

**Status:** implemented with an exact-head durable authorization record and a separate merge execution phase.

### 34. ✅ Add READY/AWAITING merge authorization states

A fully reviewed exact head reaches `READY_FOR_MERGE_AUTHORIZATION`. `request_merge` moves it to `AWAITING_MERGE_AUTHORIZATION` and installs one explicit pending action. Approval moves the job to `MERGING`; it never loops back to READY.

### 35. ✅ Present concrete merge request to Local/user

The ACTION_REQUIRED event includes the exact PR URL, `PASS/PASS` review state, `ci=unknown` when no CI receipt is available, and the exact expected head SHA. No team/reviewer payload is copied into Local.

### 36. ✅ Bind user authorization to exact PR head

`approve(job_id, expectedHeadSha)` requires the exact pending head and persists a `mergeAuthorization` bound to repository, PR number/URL, head branch, head SHA, review cycle, authorization time, and owner session. Rejecting the request simply returns the job to `READY_FOR_MERGE_AUTHORIZATION` with no authorization; it does not mark the workflow broken. Persisted merge authorization/receipt structures are validated on load rather than shallow-cast.

### 37. ✅ Revalidate head immediately before merge

`MERGE_AUTHORIZED` instructs the writer to fetch the actual PR immediately before merge and refuse if its current head differs. The writer must report that verified pre-merge head; the engine accepts a merge result only when it equals the durable authorization. Any changed head invalidates the authorization.

### 38. ✅ Execute writer merge and Website Allow only after authorization

The scoped Website controller auto-allows `merge_pull_request` only while the job is `MERGING` and the durable authorization still exactly matches the authoritative PR. On success the engine records `mergedSha`, exact merged head, executor `chatgpt-writer`, timestamp, and transitions to `DONE`.

## P10 — Hardening

**Ordering:** ROI first, then residual risk. The correctness-critical restart/idempotency work is completed before retention/cleanup policy.

### 44. ✅ Durable restart recovery — ROI: critical

Restart tests reconstruct `WorkflowEngine`, `WorkflowJobStore`, and `WorkflowHandoffStore` from the same durable directory. Acknowledged exact handoffs are not resent, an exact persisted merge authorization survives process reconstruction, and corrupted account/session authority fails closed on load. Durable nested job state is now validated rather than shallow-cast.

### 43. ✅ PR creation idempotency — ROI: critical

`START_IMPLEMENTATION` now treats workflow job ID + deterministic workflow branch as the PR idempotency key. On every retry the writer must reconcile GitHub by exact head branch, reuse exactly one existing open PR, and BLOCK on closed/merged or conflicting duplicate PR identity instead of creating another PR.

### 40. ✅ Workflow transition tests — ROI: very high

Exception continuation no longer has a generic fallback to `CREATED`. `FAILED_RETRYABLE` resumes the research phase explicitly; BLOCKED/UNKNOWN confirmation paths require a persisted `resumeState`. Merge-block paths clear stale merge authorization before returning to the authorization gate. Existing phase tests plus the P10 recovery/transition suite cover the state guards.

### 41. ✅ Handoff fidelity/idempotency tests — ROI: very high

Handoff parsing now validates semantic recipient account IDs, recomputes deterministic handoff identity, enforces delivered/deliveredAt consistency, and still verifies exact payload SHA-256. Re-preparing identical handoffs and re-recording an acknowledged delivery are revision-idempotent at the engine layer. Tamper tests cover identity, recipient, and delivery metadata.

### 42. ✅ Approval classification tests — ROI: high

The existing scoped approval suite plus P9 merge-gate tests cover exact writer account/session/repository/branch/PR matching, malformed/ambiguous confirmations, cross-repo fail-closed behavior, premature merge rejection, and authorized MERGING-only approval. P10 durable-state validation now prevents corrupted persisted authority from reaching that classifier.

### 39. ✅ Account isolation tests — ROI: high

The account catalog, storage, stale-write, reauthentication, scheduler, browser-runtime, and workflow routing tests collectively cover thinker/writer isolation even when both ChatGPT accounts share the same provider implementation. P10 strict job parsing additionally rejects altered writer/lane session identities during restart.

## P11 — Automatic workflow driver

**Status:** implemented on `impl/p11-workflow-driver`; pending review/merge after P10.

**ROI:** critical  
**Risk:** medium-high  
**Goal:** make `/workflow <task>` a real hand-off: create one durable job, drive it automatically to the next human/action-required boundary, and resume safe in-flight work after plugin restart.

### 46. Add deterministic `WorkflowDriver`

Drive only code-owned state transitions; do not add another LLM orchestration layer. The driver should advance runnable states through existing `WorkflowEngine` primitives, deduplicate concurrent runs by `jobId`, and stop at explicit human/error boundaries.

Target automatic path:

```text
CREATED
-> research
-> exact research handoffs
-> writer implementation
-> PR_OPEN
-> review
-> exact review handoffs
-> remediation/re-review as needed
-> READY_FOR_MERGE_AUTHORIZATION
-> request exact-head merge authorization
-> AWAITING_MERGE_AUTHORIZATION
```

After exact-head approval, the driver resumes `MERGING -> DONE`. It must never bypass `BLOCKED`, `UNKNOWN_CONFIRMATION`, retry-required, review-limit, or merge-authorization boundaries.

### 47. Make `/workflow` and `internet_workflow` enqueue execution

`/workflow <task>` and tool `start` should create the durable job and immediately enqueue it. `continue` should resume the exact persisted `resumeState`; `approve` should enqueue the authorized merge; `cancel` should abort/settle any active driver turn before persisting `CANCELLED`. `reject` must not immediately re-request merge authorization.

### 48. Add durable active-job discovery and restart resume

Add strict job-store enumeration and resume only states that can safely continue. Restart recovery must not wake jobs waiting on user authority or known action-required failures. A rejected merge authorization in `READY_FOR_MERGE_AUTHORIZATION` must remain quiet after restart until explicitly requested again.

### 49. Add driver failure boundary and tests

Unexpected driver/orchestration errors must become a durable retry-required action with an explicit resume state rather than leaving a job looking active forever. Add tests for state driving, duplicate enqueue, restart during research/review/writer work, review retry stop, merge rejection quietness, approval-to-merge continuation, cancellation ordering, and driver disposal.

## P12 — Exact-head CI / PR health gate

**Status:** implemented on `impl/p12-ci-health-gate`; pending review/merge.

**ROI:** very high  
**Risk:** medium  
**Dependency:** P11 automatic driver.

### 50. Persist exact-head CI/check receipt

Bind PR health to repository + PR + exact head SHA. Distinguish `PASS`, `FAIL`, `PENDING`, `NONE`, and `UNKNOWN`; do not collapse repositories with no configured checks into failure.

### 51. Gate merge authorization on current PR health

Required checks failing or pending must block/wait. `NONE` may be merge-eligible when no checks are configured. `UNKNOWN` must be surfaced explicitly to the user rather than silently treated as pass. A changed head invalidates the old CI receipt exactly like review and merge authorization.

### 52. Re-check health immediately before merge

The authorized merge path should verify that the exact authorized head still has acceptable PR/check health immediately before merge.

## P13 — Operations / retention

**Status:** implemented with explicit operator-only cleanup; no background deletion exists.

### 45. ✅ Audit/retention/cleanup policy — ROI: medium

DONE jobs become eligible after 30 days and CANCELLED jobs after 14 days, measured from authoritative `updatedAt`. `internet_workflow_maintenance preview` exposes only aged terminal candidates. `cleanup` requires the exact `jobId` + unchanged `updatedAt` returned by preview, fails closed on unexpected handoff files/permissions, removes only that job and its exact durable handoffs, and leaves a private durable cleanup audit receipt containing repository/state/retention/operator/timestamps/deletion count. Repeating the same exact cleanup is audit-idempotent. There is deliberately no implicit or scheduled deletion.

## Defer until needed

- automatic task detection instead of explicit `/workflow`;
- website-level cross-conversation/project memory optimization; deterministic workflow correctness must not depend on implicit Website memory;
- generic arbitrary DAG workflow language;
- many writer accounts / automatic account pooling;
- sophisticated artifact database;
- autonomous production deployment;
- broad generalization before coding path is reliable.
