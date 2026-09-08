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

`approval-policy.ts` requires exact match against:

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

Unknown, ambiguous, incomplete, or scope-mismatched confirmations are never clicked. The writer reports `UNKNOWN_CONFIRMATION`; the engine persists the dedicated state plus an ACTION_REQUIRED event and records `resumeState: WRITER_RUNNING`. After the user/operator handles the exception, `continue(job_id)` resumes the writer phase instead of restarting research.

### 25. ✅ Explicitly exclude merge from auto-authorization

A recognized merge confirmation produces a dedicated blocked result before any `Allow` action is pressed. Merge is not part of the phase-1 action allowlist and can only be executed by the later merge path after explicit user authorization bound to the concrete PR/head state.

## P7 — PR review/remediation

### 26. Run two independent PR review teams directly

Review the actual PR through workflow-owned TeamRunner.

### 27. Deliver review finals verbatim to writer

No Local summarization.

### 28. Add separate APPLY_REVIEWS control step

### 29. Re-review updated PR

Initial recommended default:

```text
max_review_cycles = 3
```

Escalate material conflict, writer `BLOCKED`, or exhausted review limit.

## P8 — Events and Local integration

### 30. Add INTERNAL / PROGRESS / ACTION_REQUIRED events

Do not inject raw team/reviewer outputs into Local by default.

### 31. Integrate with host-native DSH completion/event injection

Preserve the useful current behavior where background work can notify the parent when finished, but inject compact workflow events rather than transformed reasoning payloads.

### 32. Add workflow status/debug surface

Show:

```text
job state
team runs
handoffs
writer state
PR
review cycle
pending action
last error
```

### 33. Optional wait convenience

`wait(job_id)` may exist, but never as the core orchestration model.

## P9 — Merge gate

### 34. Add READY/AWAITING merge authorization states

### 35. Present concrete merge request to Local/user

Include PR URL, review state, CI state if known, and expected head SHA.

### 36. Bind user authorization to exact PR head

### 37. Revalidate head immediately before merge

Changed head invalidates stale authorization.

### 38. Execute writer merge and Website Allow only after authorization

Record merged SHA and executor.

## P10 — Hardening

### 39. Account isolation tests

### 40. Workflow transition tests

### 41. Handoff fidelity/idempotency tests

### 42. Approval classification tests

### 43. PR creation idempotency

### 44. Durable restart recovery

### 45. Audit/retention/cleanup policy

## Defer until needed

- automatic task detection instead of explicit `/workflow`;
- website-level cross-conversation/project memory optimization; deterministic workflow correctness must not depend on implicit Website memory;
- generic arbitrary DAG workflow language;
- many writer accounts / automatic account pooling;
- sophisticated artifact database;
- autonomous production deployment;
- broad generalization before coding path is reliable.
