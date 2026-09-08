# Internet Team Runtime TODO

- **Status:** Working plan
- **Ordering:** ROI first, then dependency/risk
- **Date:** 2026-09-08

## P0 — Do next

### 1. Default ChatGPT browser reasoning to High

- Change `DEFAULT_CONFIG.chatgptThinkingLevel` from `medium` to `high`.
- Update comments and system guidance that currently say Medium is the default.
- Update tests/config examples.

**ROI:** very high  
**Risk:** low  
**Dependency:** none

### 2. Make the team synthesizer explicit and default to ChatGPT thinker

- Add explicit synthesizer selection to team options/config.
- Stop using `lastProvider` as the synthesis destination.
- Preserve worker speaking order independently from synthesizer identity.
- Add tests where Gemini speaks last but ChatGPT synthesizes.

**ROI:** very high  
**Risk:** low-medium  
**Dependency:** none for provider-level version; later migrate to accountId

### 3. Design first-class `accountId`

Create the minimal type/config contract before touching storage:

```text
accountId
provider
role
capabilities
```

Recommended initial IDs:

```text
chatgpt-thinker
chatgpt-writer
gemini-thinker
```

**ROI:** critical  
**Risk:** medium  
**Dependency:** architecture docs

## P1 — Multi-account foundation

### 4. Refactor account storage from provider-keyed to account-keyed

Affected areas include:

- `src/browser/accounts.ts`
- `src/browser/storage.ts`

Requirements:

- separate portable state for two ChatGPT accounts;
- private permissions retained;
- migration/compatibility for existing `accounts/chatgpt-web.json`;
- no cross-account stale snapshot overwrite.

### 5. Refactor BrowserManager maps to account identity

Current provider-keyed resources that need review:

- browsers;
- browser launches;
- schedulers;
- remote logins;
- pending closes;
- active contexts;
- account commit queues.

### 6. Make conversation stores account-aware

Current ChatGPT store uses one `chatgpt-web/conversations` root.

Target should isolate by account alias.

Example:

```text
chatgpt-thinker/conversations
chatgpt-writer/conversations
gemini-thinker/conversations
```

### 7. Make scheduler serialization account-aware

Two ChatGPT accounts should not serialize against the same provider lock unless a higher-level policy intentionally requires it.

Same-account dependent turns must remain ordered.

## P2 — Routing and handoffs

### 8. Add account role/capability routing

Capabilities should include at least conceptual support for:

```text
website.chat
github.read
github.write
github.pull_request
github.merge
```

Do not infer merge authorization from `github.merge` capability.

### 9. Add a durable verbatim handoff primitive

Implement:

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

Tests must prove payload fidelity.

### 10. Separate data messages from control messages

Data:

- team final result;
- review result;
- evidence packet.

Control:

- START_IMPLEMENTATION;
- APPLY_REVIEWS;
- STOP;
- RETRY;
- MERGE_AUTHORIZED.

### 11. Add all-handoffs-delivered gate

Writer must not begin implementation/remediation until the configured required handoffs are delivered.

## P3 — Durable coding jobs

### 12. Introduce persistent coding job model

Minimum fields:

```text
job_id
objective
repository
base revision
teams
account routing
state
handoff receipts
writer conversation
PR receipt
review cycle
pending approval
```

### 13. Add workflow states/events

Start with the states from `WORKFLOW.md` / ADR-0005 rather than designing a generic BPM engine.

### 14. Integrate with DSH background-agent completion injection

Prefer host-native completion/event injection if available.

Avoid making long blocking waits the core architecture.

### 15. Add optional `wait(job_id)` convenience tool

This is a client convenience layer, not the underlying workflow mechanism.

## P4 — Writer path

### 16. Add persistent `chatgpt-writer` conversation routing

The writer must receive:

1. Team A exact final output;
2. Team B exact final output;
3. separate start control message.

### 17. Define writer control prompt contract

Writer must:

- confirm target repo/base;
- inspect current repository;
- implement without needless redesign;
- create/update PR;
- return BLOCKED on authority conflicts;
- return compact PR receipt.

### 18. Persist PR receipt

Store:

```text
repository
PR number
URL
base/head
head SHA
```

Use this for retries and post-review.

## P5 — Post-review loop

### 19. Spawn two independent PR review teams

Review the actual PR, not Local-pasted source.

### 20. Deliver review finals verbatim to writer

No Local summarization in the normal path.

### 21. Add separate APPLY_REVIEWS control step

Do not embed Local paraphrase into reviewer payloads.

### 22. Re-review updated PR

Support configured maximum remediation cycles and fresh auditor option.

## P6 — Permissions and merge

### 23. Validate GitHub `Allow all actions` behavior end-to-end

Test with the writer account:

- read;
- write/update file;
- create PR;
- update PR;
- merge.

Record which operations, if any, still show a mandatory approval checkpoint.

### 24. Add `AWAITING_EXTERNAL_APPROVAL`

If a platform confirmation appears, pause durably and resume rather than failing.

### 25. Add explicit merge authorization state

Merge must be impossible before workflow state reaches authorized status.

### 26. Verify expected head SHA before merge

Prevent merging an unreviewed head if the PR changed after review.

## P7 — Hardening

### 27. Account isolation test suite

Test cookie/storage/profile/conversation/scheduler isolation between `chatgpt-thinker` and `chatgpt-writer`.

### 28. Handoff idempotency tests

Retry must not duplicate payload delivery.

### 29. PR creation idempotency

A retry after PR creation should reuse the known PR rather than create another.

### 30. Durable job recovery

Recover useful state after process/plugin restart where feasible.

### 31. Workflow observability

Add compact status/debug output:

```text
job state
active team steps
handoffs
writer state
PR
review cycle
pending approval
last error
```

## Defer until needed

- generic arbitrary DAG workflow language;
- many writer accounts / automatic account pooling;
- sophisticated artifact database;
- autonomous production deployment;
- generic multi-service action executor;
- broad generalization before the coding path is reliable.
