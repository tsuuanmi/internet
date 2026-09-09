# Internet Team Architecture

> **Status:** current as-built architecture  
> **Last synchronized:** 2026-09-09  
> **Implementation:** [`how-it-works.md`](./how-it-works.md)  
> **Operational flow:** [`WORKFLOW.md`](./WORKFLOW.md)  
> **Runtime state machine:** [`WORKFLOW-ENGINE.md`](./WORKFLOW-ENGINE.md)

## Goal

`@tsuuanmi/internet` is a browser-backed multi-account Website runtime that lets ChatGPT/Gemini reason and lets a separate ChatGPT writer perform scoped GitHub work while deterministic code preserves workflow state and user authority.

The defining principle is:

> **User owns authority, Local brokers authority, WorkflowEngine/Driver own deterministic orchestration, Website teams reason, the writer performs scoped GitHub actions, and exact PR/head/health state gates merge.**

## Planes

### Authority plane

```text
User
  -> approve/reject exact merge and explicit exceptions
Local
  -> present compact action-required state and carry user decision
```

Technical capability never equals workflow authority.

### Deterministic control plane

```text
WorkflowEngine
WorkflowDriver
Job/Handoff stores
Approval policy
Event sink
Retention manager
```

This plane decides what runs next, worker cardinality, handoff ordering, retries, state validity and authority gates.

### Cognition/data plane

```text
Research A/B -> exact finals -> Writer
PR -> Review A/B -> exact finals -> Writer
```

Full model payloads do not need to pass through Local.

### Action plane

```text
chatgpt-writer
  -> repo read
  -> branch/file/commit/PR mutation
  -> read-only PR health inspection
  -> exact authorized merge
```

## Account identities

```text
chatgpt-thinker
  provider: ChatGPT Web
  role: reasoning/review/synthesis

chatgpt-writer
  provider: ChatGPT Web
  role: terminal GitHub executor

gemini-thinker
  provider: Gemini Web
  role: reasoning/review
```

Provider is implementation metadata only. Authentication state, login profiles, browser pools, schedulers, remote login and durable conversations are account-scoped.

The architecture is a clean break: no provider-to-account fallback or legacy provider-keyed migration path is part of correctness.

## Standard workflow

```text
/workflow <task>
  -> resolve repo + exact base revision
  -> durable job + automatic driver
  -> Research A/B
  -> exact handoffs A then B
  -> START_IMPLEMENTATION
  -> persistent chatgpt-writer
  -> deterministic branch + one PR
  -> Review A/B against exact PR head
  -> exact review handoffs
  -> APPLY_REVIEWS if needed
  -> same PR, new head, re-review
  -> PASS/PASS
  -> CHECK_PR_HEALTH
  -> exact-head merge authorization request
  -> explicit user approval
  -> immediate head + health revalidation
  -> MERGE_AUTHORIZED
  -> writer merge
  -> DONE
```

## Stable Website conversations

```text
<local>:workflow:<job>:research:A
<local>:workflow:<job>:research:B
<local>:workflow:<job>:review:A
<local>:workflow:<job>:review:B
<local>:workflow:<job>:writer
```

Reviewer session identity remains stable across cycles. Exact cycle/head lives in durable state and prompts.

Website account/project memory is not a correctness dependency.

## Handoff invariant

For every research/review handoff:

```text
handoff.payload == source final output
```

Metadata such as source, sequence, hash and delivery state is outside the payload.

Delivery uses durable at-least-once semantics plus idempotent acknowledgement; the provider UI is not treated as transactional exactly-once transport.

## PR-centric verification

The PR is the canonical shared implementation artifact after writer execution. Reviewers inspect the actual PR rather than a Local summary or pasted code.

Review verdicts are exact-head-bound. A reviewer must explicitly assert the exact SHA it reviewed. Remediation preserves the same PR and must advance the head before another review cycle.

## PR health gate

After review PASS/PASS, live PR health is classified against the exact current head:

```text
PASS | FAIL | PENDING | NONE | UNKNOWN
```

Only `PASS`, or verified `NONE` where no required checks/statuses exist, may advance toward merge authorization. New head means old health receipt is stale.

## Approval policy

Routine recognized implementation/remediation Website confirmations may auto-Allow only when exact runtime and durable scope match:

```text
account
session
repository
state
action
branch / PR
```

Unknown UI fails closed.

Merge is separate: it requires explicit user authority bound to repository + PR + exact head. The writer re-checks both head and health immediately before merge.

## Local integration

Local normally sees compact control-plane events only:

```text
INTERNAL         engine-only
PROGRESS         compact observable progress
ACTION_REQUIRED  explicit human/operator boundary
```

`agent.inject()` delivery is best-effort after durable state commit. Event transport cannot roll back workflow correctness.

## Recovery and idempotency

Durable state allows restart recovery. Completed lanes/handoffs are reused. PR creation is reconciled by deterministic job/branch identity. Merge authorization is exact-head-bound. Unexpected driver failures persist an explicit resume state instead of resetting the job.

## Operations / retention

Retention is explicit operator maintenance, not an automatic workflow phase:

```text
DONE      -> eligible after 30 days
CANCELLED -> eligible after 14 days
```

Preview is read-only. Cleanup requires exact `jobId + updatedAt`, validates the exact handoff directory, removes only the selected job and handoffs, and retains a private audit receipt. No background deletion exists.

## Deferred boundary

No next phase is implied after P13. Automatic task detection, Website cross-conversation/project memory as correctness state, generic DAG workflows, multi-writer pooling, sophisticated artifact storage, autonomous production deployment and broad non-coding generalization remain deferred until a concrete use case justifies them.
