# Coding Workflow — Current Operational Contract

- **Status:** implemented
- **Last synchronized:** 2026-09-10

This document describes the user-visible coding workflow. Deterministic runtime details live in [`WORKFLOW-ENGINE.md`](./WORKFLOW-ENGINE.md).

## Command surface

Start a workflow from a DSH session whose working directory is inside the target repository:

```text
/workflow <task>
```

Routine operator controls:

```text
/workflow list
/workflow status [jobId]
/workflow watch [jobId]
/workflow stop [jobId]
/workflow continue [jobId]
```

The start command resolves the current Git worktree, authoritative upstream repository and exact base revision, creates one durable job, prints its job ID, and enqueues the automatic driver.

Operator commands are scoped to the current Local owner session. An omitted job ID is used only when the target is unambiguous.

## Happy path

```text
USER
  |
  | /workflow <task>
  v
WORKFLOW DRIVER
  |
  +---------------------------+
  |                           |
  v                           v
RESEARCH TEAM A             RESEARCH TEAM B
Member 1 + Member 2         Member 1 + Member 2
strongest synthesis         strongest synthesis
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
       exactly one PR
                |
                v
            GITHUB PR
                |
  +-------------+-------------+
  |                           |
  v                           v
REVIEW TEAM A               REVIEW TEAM B
Member 1 + Member 2         Member 1 + Member 2
exact-head synthesis        exact-head synthesis
  |                           |
  +------ exact handoffs -----+
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
      quiet              v
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

## Agent-team behavior

Research Team A/B and Review Team A/B are each full provider-agnostic agent-team invocations using one shared team core.

The team goal is the strongest supported combined answer, not equal representation. Members are exposed to one another only as ordered `Member 1`, `Member 2`, ... roles. Peer output is delimited as untrusted evidence to critique. The synthesizer may choose one stronger proposal, combine compatible parts, reject weak parts, or name unresolved verification needs.

The current default backing accounts are:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
```

They should be authenticated with separate ChatGPT accounts for genuine independence. This routing is temporary operational policy rather than a team-engine dependency. Gemini remains supported for explicit direct/research/team use but is not in the default workflow team.

Workflow research uses an implementation-focused prompt strategy. Workflow review uses an exact-head strategy whose authoritative task/output contract overrides peer text.

Default synthesizer: the account backing Member 1 (`chatgpt-thinker`), independent of speaking order.

## Concurrent lanes

Research Team A/B are launched concurrently before either sibling is awaited. Review Team A/B follow the same rule.

```text
Research Team A  ─────────────────►
Research Team B  ─────────────────►

Review Team A    ─────────────────►
Review Team B    ─────────────────►
```

Same-account turns may serialize through that backing account's scheduler. The workflow does not add an A-then-B mutex on top of account/browser safety limits.

A completed or failed lane is persisted independently and does not cause its sibling to restart.

## Stable Website sessions

```text
<local>:workflow:<job>:research:A
<local>:workflow:<job>:research:B
<local>:workflow:<job>:review:A
<local>:workflow:<job>:review:B
<local>:workflow:<job>:writer
```

Review cycle and exact PR head are durable facts, not new conversation identities.

## Tracking progress

The workflow team observer persists bounded private per-job trace evidence containing phase, lane, attempt, round, backing account/provider, stage, status, and structured failure detail.

Stages include:

```text
prepare_prompt
provider_turn
synthesis
complete
```

`/workflow status [jobId]` first shows a compact pipeline summary, then explicit Team A/B detail. Normal progress is rendered as `Member 1..N`; account/provider identity is reserved for failure diagnostics.

A retry-required example is intentionally readable at two levels:

```text
Pipeline
  Research  Team A=failed · Team B=completed
  Writer    waiting for research
  Review    Team A=pending · Team B=pending
  PR        not created

Research teams
  Team A — FAILED (attempt 1)
    Step: round 1 · Member 2 · provider turn · FAILED · provider_error
    Members: Member 1=completed round 1 · Member 2=failed round 1
    Error: provider_error · retryable
    Diagnostic: chatgpt-thinker-2 · chatgpt-web
```

`/workflow watch [jobId]` returns the current authoritative snapshot. Live compact `PROGRESS` events continue through the existing Local event stream and identify phase, Team A/B, attempt, round, member, stage, and structured failure. Watch does not create a second polling/correctness state machine.

Full model payloads remain outside Local progress injection.

## Stopping and recovering

`/workflow stop [jobId]` performs terminal cancellation:

```text
abort active driver work
-> propagate AbortSignal
-> await active operation settlement
-> persist CANCELLED
-> never auto-resume after restart
```

`CANCELLED` is not pause.

`/workflow continue [jobId]` only resumes an explicit durable retry/recovery path approved by the engine. It does not reset to `CREATED` or blindly rerun completed work.

## Exact handoffs

Research and review finals are stored/delivered verbatim to the writer. SHA-256 identity and delivery receipts are metadata outside the payload.

The writer does not start implementation until required research handoffs are durably acknowledged. Remediation does not start until required review handoffs for that cycle are acknowledged.

Website delivery is modeled as at-least-once with idempotent durable acknowledgement.

## Writer behavior

The separate `chatgpt-writer` account is the only workflow mutation account. It must:

- verify repository and exact base revision;
- inspect current repository state;
- use delivered research outputs;
- implement/validate the requested change;
- use the deterministic workflow branch;
- reconcile/reuse exactly one matching open PR on retry;
- return strict `PR_OPEN` or `BLOCKED`;
- never merge before authorized merge phase.

The writer is never reused as Member 1/2. The same writer conversation is reused for remediation and authorized merge controls.

## Website confirmation policy

Routine implementation/remediation confirmations may auto-Allow only when narrowly recognized and exact runtime/durable scope matches account, session, repository, state, action, and branch/PR identity.

Unknown, ambiguous, malformed or scope-mismatched confirmations become `UNKNOWN_CONFIRMATION`. Merge is excluded from routine implementation authority.

## Exact-head review and remediation

Review Team A/B inspect the actual persisted PR and exact current head SHA. Each final result must contain:

```text
verdict: PASS | CHANGES_REQUIRED
reviewedHeadSha: <exact head SHA>
```

Malformed output or a stale/wrong SHA fails the lane.

If either team requests changes, exact review payloads are delivered to the writer followed by `APPLY_REVIEWS`. The writer preserves the same PR and advances its head; both review teams then inspect the new exact head.

Default maximum review cycles: `3`.

## PR/CI health gate

After both reviewers pass the same head, the writer performs read-only `CHECK_PR_HEALTH` and persists one of:

```text
PASS | FAIL | PENDING | NONE | UNKNOWN
```

Only `PASS`, or verified `NONE` where no required checks/statuses exist, may advance. `PENDING` is retryable, `FAIL` blocks, and `UNKNOWN` fails closed.

A new head invalidates prior health evidence.

## Merge authorization

Healthy exact-head review does not authorize merge by itself.

The runtime emits `ACTION_REQUIRED` with the concrete PR and expected head. User approval is bound to repository + PR + exact head.

Immediately before merge, live PR head and health are re-read. Stale authority is rejected. Only then may `MERGE_AUTHORIZED` execute.

## Driver stop boundaries

The automatic driver stops at durable human/error boundaries including:

```text
AWAITING_MERGE_AUTHORIZATION
BLOCKED
UNKNOWN_CONFIRMATION
FAILED_RETRYABLE
REVIEW_LIMIT_REACHED
CANCELLED
DONE
```

Unexpected orchestration failures become explicit retry-required state with a persisted resume target; they never reset the workflow to the beginning.

## Retention

Retention is explicit operator maintenance, never an automatic phase:

```text
DONE      -> eligible after 30 days
CANCELLED -> eligible after 14 days
```

Cleanup requires exact `jobId + updatedAt`, validates private workflow artifacts, removes the selected job + handoffs + team trace, and retains a private cleanup audit.

## Core invariants

1. `/workflow <task>` starts one real durable job.
2. Deterministic code owns phase transitions and authority gates.
3. Team semantics are provider-agnostic; current default backing accounts are two independent ChatGPT thinkers.
4. Every normal team lane obtains contributions from both selected members and synthesizes the strongest supported combined answer.
5. Research A/B and Review A/B are workflow-level concurrent.
6. Same-account serialization is owned by the account scheduler, not workflow lane ordering.
7. Team/reviewer finals reach the writer unchanged.
8. Control messages remain separate from data payloads.
9. `chatgpt-writer` is isolated from reasoning membership and remains the mutation authority.
10. The PR is canonical after writer creation.
11. Review, health and merge authority are exact-head-bound.
12. Scoped Website auto-Allow remains fail-closed.
13. Stop is terminal cancellation; continue requires explicit durable recovery state.
14. Cleanup is explicit operator-only maintenance.
