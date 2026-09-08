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

**Status:** implemented at provider level; migrate the synthesizer identity to `accountId` during the multi-account phase.

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

### 4. Refactor account storage from provider-keyed to account-keyed

Affected areas include `src/browser/accounts.ts` and `src/browser/storage.ts`.

Requirements:

- separate portable state for two ChatGPT accounts;
- private permissions retained;
- migration/compatibility for existing account files;
- no cross-account stale snapshot overwrite.

### 5. Refactor BrowserManager maps to account identity

Review provider-keyed:

- browsers;
- browser launches;
- schedulers;
- remote logins;
- pending closes;
- active contexts;
- account commit queues.

### 6. Make conversation stores account-aware

Target isolation:

```text
chatgpt-thinker/conversations
chatgpt-writer/conversations
gemini-thinker/conversations
```

### 7. Make scheduler serialization account-aware

Same-account dependent turns remain ordered. Different authenticated accounts should not share a provider lock unless intentionally configured.

## P2 — Replace prompt-only `/workflow`

### 8. Add `internet_workflow` service/tool contract

Initial operations:

```text
start
status
approve
reject
cancel
continue
```

### 9. Introduce `WorkflowEngine` + `WorkflowJobStore`

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

### 10. Convert `/workflow` into a thin adapter

Keep UX:

```text
/workflow <task>
```

But change implementation to:

```text
resolve repo/revision
-> internet_workflow.start
-> return job_id
```

Remove the giant multi-phase follow-up prompt once engine behavior is available.

## P3 — Direct team runtime

### 11. Add workflow-owned TeamRunner

Call the lower-level team runtime directly instead of spawning a free-form DSH child agent merely to call `internet_team`.

### 12. Add deterministic TeamPromptBuilder

Automatically construct research/review tasks from authoritative workflow state.

### 13. Generate deterministic team session identities

Example:

```text
<local>:workflow:<job>:research:A
<local>:workflow:<job>:research:B
<local>:workflow:<job>:review:<cycle>:A
<local>:workflow:<job>:review:<cycle>:B
```

### 14. Support two concurrent logical team runs

Team A and B may be active simultaneously even if underlying same-account browser turns are serialized by the scheduler.

### 15. Persist team completion and retry state

A failed B should be retryable without restarting completed A or asking Local to reconstruct state.

## P4 — Verbatim handoffs

### 16. Add durable handoff primitive

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

### 17. Separate data messages from control messages

Data:

- team final result;
- review final result;
- evidence packet.

Control:

- START_IMPLEMENTATION;
- APPLY_REVIEWS;
- RETRY;
- MERGE_AUTHORIZED.

### 18. Add all-handoffs-delivered gates

Writer cannot begin implementation/remediation before required handoffs are delivered.

## P5 — Writer and PR path

### 19. Add persistent `chatgpt-writer` conversation routing

Writer receives Team A final, Team B final, then separate `START_IMPLEMENTATION`.

### 20. Define writer control contract

Writer must:

- confirm target repo/base;
- inspect current repository;
- implement without needless redesign;
- create/update one PR;
- return `BLOCKED` on authority conflict;
- expose compact PR receipt.

### 21. Persist PR receipt

```text
repository
PR number
URL
base/head
head SHA
```

Use it for retries, review, remediation, and merge binding.

## P6 — Scoped approval controller

### 22. Detect and classify Website confirmation UI

Do not auto-click based only on visible `Allow` text.

### 23. Auto-confirm recognized in-scope implementation/PR actions

Require exact match against:

```text
active job
writer session
repository
workflow state
action allowlist
branch/PR identity when applicable
```

### 24. Add fail-closed `UNKNOWN_CONFIRMATION`

Ambiguous/unrecognized confirmation pauses and notifies Local.

### 25. Explicitly exclude merge from auto-authorization

Merge confirmation can only be executed after user merge authorization.

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
- generic arbitrary DAG workflow language;
- many writer accounts / automatic account pooling;
- sophisticated artifact database;
- autonomous production deployment;
- broad generalization before coding path is reliable.
