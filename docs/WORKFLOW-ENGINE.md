# Workflow Engine Design

- **Status:** Target design
- **Date:** 2026-09-08

This document defines the deterministic runtime behind `/workflow <task>`. It complements [`WORKFLOW.md`](./WORKFLOW.md), which describes the user-visible coding flow.

## 1. Entry point

The user explicitly starts the coding workflow with:

```text
/workflow <task>
```

The command resolves the current Git repository and revision, then calls the workflow service.

```text
/workflow
   |
   v
internet_workflow.start(...)
   |
   v
WorkflowEngine
```

No automatic intent detection is required.

## 2. Core components

```text
WorkflowEngine
  |
  +-- WorkflowJobStore
  +-- TeamRunner
  +-- TeamPromptBuilder
  +-- HandoffStore
  +-- WriterController
  +-- ReviewController
  +-- ApprovalController
  +-- EventSink
```

### WorkflowJobStore

Persists durable job state and idempotency receipts.

### TeamRunner

Runs workflow-owned research/review teams directly against the lower-level team runtime.

### TeamPromptBuilder

Builds deterministic team tasks from authoritative workflow state.

### HandoffStore

Stores and delivers exact team/review outputs with metadata outside the payload.

### WriterController

Owns the persistent `chatgpt-writer` conversation and implementation/remediation control messages.

### ReviewController

Starts and tracks independent review teams against the real PR.

### ApprovalController

Recognizes Website confirmations, applies scoped auto-approval policy, and pauses on user-owned merge authorization or unknown confirmation.

### EventSink

Injects compact progress/action-required events into Local/parent DSH context using host-native mechanisms where available.

## 3. Job model

A minimal job record should contain:

```text
job_id
objective
repository
base_branch
base_revision
state
thinking_team_runs
writer_account
writer_conversation
handoff_receipts
pull_request
review_cycle
pending_action
last_event
created_at
updated_at
```

No browser cookies, tokens, or other credentials belong in job state.

## 4. State model

Recommended initial states:

```text
CREATED
RESEARCH_RUNNING
RESEARCH_HANDOFFS_DELIVERING
WRITER_RUNNING
PR_OPEN
REVIEW_RUNNING
REVIEW_HANDOFFS_DELIVERING
WRITER_REMEDIATING
READY_FOR_MERGE_AUTHORIZATION
AWAITING_MERGE_AUTHORIZATION
MERGING
DONE

BLOCKED
UNKNOWN_CONFIRMATION
FAILED_RETRYABLE
FAILED_TERMINAL
CANCELLED
```

Implementation can represent parallel team status separately rather than multiplying top-level states for every A/B combination.

## 5. Research fan-out

The standard coding workflow creates two independent logical team runs:

```text
research:A
research:B
```

Each receives a deterministic task containing:

- exact user objective;
- authoritative repository;
- base revision;
- role/independence instruction;
- output contract;
- requirement to inspect the upstream repository directly;
- no implementation instruction.

The teams may execute logically in parallel. Same-account browser operations remain subject to scheduler serialization.

## 6. Team completion and handoff

Each team emits exactly one final synthesis result.

The default synthesizer is `chatgpt-thinker`.

The engine creates a handoff whose payload is exactly that final result:

```text
handoff metadata
  id
  job_id
  source
  recipient
  sequence
  payload_hash

payload
  <exact team final output>
```

The engine does not send the full payload through Local.

After every required research handoff is delivered, the writer receives a separate `START_IMPLEMENTATION` control message.

## 7. Writer execution

Writer executes within the authoritative job scope:

```text
repository
base revision
workflow branch / PR
```

The expected normal path is:

```text
inspect repo
implement
validate
commit
create/update PR
```

If a Website confirmation is shown for a recognized implementation action, `ApprovalController` may confirm it automatically according to ADR-0007.

Writer returns or exposes a durable PR receipt:

```text
repository
PR number
base
head
head SHA
URL
```

## 8. Review fan-out

Once a PR receipt exists, the engine starts:

```text
review:<cycle>:A
review:<cycle>:B
```

Review prompt inputs include:

- objective;
- repository;
- PR number;
- expected base/head where available;
- independent review role;
- severity/output contract.

Reviewers inspect the actual PR directly.

Each final review result is delivered verbatim to the writer.

## 9. Remediation loop

If review output requires changes:

```text
review handoffs
  -> APPLY_REVIEWS control message
  -> writer remediates same PR
  -> new head SHA
  -> next review cycle
```

Recommended initial policy:

```text
max_review_cycles = 3
```

If the cycle limit is exceeded, reviewers conflict materially, or writer returns `BLOCKED`, escalate to Local.

## 10. Merge phase

When review gates pass:

```text
READY_FOR_MERGE_AUTHORIZATION
```

The engine emits an `ACTION_REQUIRED` event to Local with at least:

```text
job_id
repository
PR number
PR URL
head SHA
review status
CI status if known
```

User approval is required.

After approval:

1. record authorization bound to the expected head SHA;
2. re-check current PR head;
3. request writer/Website merge;
4. confirm the Website `Allow` prompt if present;
5. record merged SHA;
6. transition to `DONE`.

## 11. Event classes

### INTERNAL

Used only by engine state transitions.

Examples:

```text
TEAM_COMPLETED
HANDOFF_DELIVERED
WRITER_RECEIPT_UPDATED
```

### PROGRESS

Compact optional messages to Local.

Examples:

```text
PR_OPENED
REVIEW_CYCLE_STARTED
REMEDIATION_STARTED
```

### ACTION_REQUIRED

Must notify Local.

Examples:

```text
MERGE_AUTHORIZATION_REQUIRED
WRITER_BLOCKED
UNKNOWN_CONFIRMATION
REVIEW_LIMIT_REACHED
ACCOUNT_REAUTH_REQUIRED
```

The full team/reviewer payload is not a Local event.

## 12. Recovery and idempotency

External actions need durable receipts.

At minimum:

- team-run identity;
- handoff payload hash + delivery receipt;
- writer conversation identity;
- PR number/head SHA;
- current review cycle;
- merge authorization head SHA;
- merged SHA.

Retries must prefer resume/reuse over duplicate creation.

## 13. Relationship with DSH subagents

The deterministic coding workflow should not depend on a free-form DSH subagent merely to call `internet_team`.

However, the engine should retain useful host behavior where possible:

- background execution;
- multiple concurrent logical jobs;
- completion/event injection into the parent/Local context.

DSH subagents remain available for open-ended tasks outside the deterministic workflow.

## 14. API surface

Conceptual Local-facing service/tool:

```text
internet_workflow.start(...)
internet_workflow.status(job_id)
internet_workflow.approve(job_id, action_id)
internet_workflow.reject(job_id, action_id)
internet_workflow.cancel(job_id)
internet_workflow.continue(job_id)
```

The normal user path remains `/workflow <task>`.
