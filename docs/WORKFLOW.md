# Coding Workflow — Current Operational Contract

- **Status:** implemented
- **Last synchronized:** 2026-09-09

This document describes the user-visible coding workflow that exists today. Deterministic runtime details live in [`WORKFLOW-ENGINE.md`](./WORKFLOW-ENGINE.md).

## Entry point

The user starts the workflow explicitly:

```text
/workflow <task>
```

The command resolves the current Git worktree, upstream repository and exact base revision, creates one durable workflow job, and enqueues the automatic driver. Automatic task detection is intentionally not required.

## Happy path

```text
USER
  |
  | /workflow <task>
  v
LOCAL
  resolve repo + exact base revision
  create durable job
  |
  v
WORKFLOW DRIVER
  |
  +---------------------------+
  |                           |
  v                           v
RESEARCH A                  RESEARCH B
ChatGPT + Gemini            ChatGPT + Gemini
  |                           |
  v                           v
ChatGPT final synthesis     ChatGPT final synthesis
  |                           |
  +------ exact handoffs -----+
                |
                v
          CHATGPT WRITER
                |
        START_IMPLEMENTATION
                |
                v
       inspect / edit / test
       commit / create or reuse
       exactly one PR
                |
                v
            GITHUB PR
                |
  +-------------+-------------+
  |                           |
  v                           v
REVIEW A                    REVIEW B
  |                           |
  +------ exact handoffs ------+
                |
                v
          CHATGPT WRITER
                |
        APPLY_REVIEWS if needed
                |
                v
       remediate same PR
                |
                +------> re-review exact new head
                |
                v
          PASS / PASS
                |
                v
        CHECK_PR_HEALTH
                |
                v
READY_FOR_MERGE_AUTHORIZATION
                |
                v
   ACTION_REQUIRED to Local/user
                |
                v
        USER APPROVES HEAD?
          /            \
        no              yes
        |                |
      PAUSE              v
                 re-check head + health
                        |
                        v
                 MERGE_AUTHORIZED
                        |
                        v
                 WRITER MERGES
                        |
                        v
                       DONE
```

## Team behavior

Research A/B are independent logical workflow lanes. Each runs directly over the lower-level browser team runtime and receives deterministic job facts rather than a free-form child-agent rewrite.

The default team synthesizer is `chatgpt-thinker`, independent of speaking order.

Stable Website sessions are job-scoped:

```text
<local>:workflow:<job>:research:A
<local>:workflow:<job>:research:B
<local>:workflow:<job>:review:A
<local>:workflow:<job>:review:B
<local>:workflow:<job>:writer
```

Review cycle and exact PR head are part of durable state and prompts, not new conversation identities.

## Exact handoffs

Research and review finals are data-plane payloads. They are stored and delivered verbatim to the writer. SHA-256 metadata and delivery receipts sit outside the payload.

The writer never starts implementation until all required research handoffs have durable acknowledgement. Review remediation never starts until all required review handoffs for that cycle have been acknowledged.

Website delivery is treated as at-least-once with idempotent durable acknowledgement; the runtime does not claim transactional exactly-once delivery from the provider UI.

## Writer behavior

The separate `chatgpt-writer` account is the terminal GitHub executor. During implementation it must:

- verify the exact repository and base revision;
- inspect current repository state;
- use the delivered research outputs;
- create/use the deterministic workflow branch;
- implement and validate the requested change;
- reconcile and reuse exactly one matching open PR on retry;
- return strict `PR_OPEN` state or `BLOCKED`;
- never merge before the merge phase.

The same writer conversation remains active for remediation and authorized merge controls.

## Website confirmation policy

Routine Website GitHub confirmations may be auto-allowed only when the confirmation is narrowly recognized and all durable/runtime scope checks match:

```text
writer account
writer session
repository
workflow state
action type
branch or PR identity
```

Unknown, ambiguous, malformed or scope-mismatched confirmations become `UNKNOWN_CONFIRMATION` and stop the driver. Generic visible `Allow` text alone is never enough.

Merge is excluded from ordinary implementation/remediation authority.

## PR review and remediation

Review A/B inspect the actual persisted PR and exact current head SHA. Each final reviewer result is strict JSON containing:

```text
verdict: PASS | CHANGES_REQUIRED
reviewedHeadSha: <exact head SHA>
```

Malformed output or a wrong/stale SHA fails the lane.

If either reviewer requests changes, the exact review payloads are delivered to the writer and a separate `APPLY_REVIEWS` control is sent. The writer must preserve the same PR identity and advance the head. The two review lanes then inspect the new head again.

The default maximum is three review cycles. Exhaustion becomes `REVIEW_LIMIT_REACHED` rather than looping indefinitely.

## PR/CI health gate

After both reviewers pass the same exact head, the workflow performs a live read-only PR-health inspection through `CHECK_PR_HEALTH`.

The resulting exact-head state is one of:

```text
PASS
FAIL
PENDING
NONE
UNKNOWN
```

`PASS` is merge-eligible. `NONE` is merge-eligible only when the absence of required checks/status policy is established. `PENDING` is retryable. `FAIL` blocks progress. `UNKNOWN` fails closed and requires attention.

A new PR head invalidates the prior health receipt.

## Merge authorization

Review completion and healthy CI do not themselves authorize merge.

The runtime emits a concrete `ACTION_REQUIRED` request containing the exact PR and expected head. User approval is persisted against that concrete repository + PR + head SHA.

Approval moves the job into `MERGING`. Immediately before merge, the writer re-reads the live PR and health state. Any changed head or unacceptable health invalidates stale authority instead of being guessed through.

Only then may `MERGE_AUTHORIZED` execute and, if Website shows an exact matching merge confirmation, the controller may press Allow for that authorized merge.

## Automatic driver and stop boundaries

`WorkflowDriver` automatically advances runnable deterministic states and resumes safe in-flight work after restart. It stops at explicit human/error boundaries:

```text
AWAITING_MERGE_AUTHORIZATION
BLOCKED
UNKNOWN_CONFIRMATION
FAILED_RETRYABLE
REVIEW_LIMIT_REACHED
CANCELLED
DONE
```

Unexpected orchestration failures become durable retry-required state with an explicit resume target; they do not reset the workflow to its beginning.

Rejecting merge authorization returns to a quiet ready state and does not immediately ask again.

## Local's role

Local is the user-facing authority broker, not the implementation state machine. In the normal path Local does not need to:

- absorb full research/reviewer payloads;
- summarize them for the writer;
- implement code;
- push an intermediate branch;
- decide the next deterministic phase.

Local receives compact `PROGRESS` / `ACTION_REQUIRED` context and may inspect raw handoffs, code, PR diff, runtime evidence or state when an exception, risk or explicit user request warrants it.

## Retention after completion

Retention is an operator action, not part of the automatic coding path.

```text
DONE      -> eligible after 30 days
CANCELLED -> eligible after 14 days
```

`internet_workflow_maintenance preview` lists eligible terminal jobs. Cleanup requires the exact `jobId + updatedAt` snapshot from preview and leaves a durable private cleanup audit. No background deletion exists.

## Core invariants

1. `/workflow <task>` starts one real durable job.
2. Deterministic code owns phase transitions and authority gates.
3. Team/reviewer finals reach the writer unchanged.
4. Control messages are separate from data payloads.
5. The PR is the canonical implementation artifact after writer creation.
6. Review and health state are bound to the exact PR head.
7. Scoped Website auto-Allow is fail-closed.
8. Merge always requires explicit user authorization bound to the exact head.
9. Restart recovery resumes only safe runnable states.
10. Cleanup is explicit operator-only maintenance, never automatic.
