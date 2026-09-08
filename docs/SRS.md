# Software Requirements Specification — Internet Team Workflow Runtime

- **Status:** Target requirements
- **Version:** Draft v3.1
- **Date:** 2026-09-08

## 1. Purpose

This SRS defines the target requirements for evolving `@tsuuanmi/internet` into a multi-account, durable Website Agent workflow runtime for coding and related knowledge-work tasks.

Current implemented behavior remains documented in `how-it-works.md`.

## 2. Primary user experience

The standard coding workflow is started explicitly with:

```text
/workflow <task>
```

Automatic task detection is not required.

The command shall start a real durable workflow job rather than inject a giant workflow prompt into Local.

The user should not need to manually manage thinking teams, writer conversations, handoffs, or review teams during the normal path. The standard human decision point is merge authorization after the PR has passed the configured review gates.

## 3. Actors

### 3.1 User

The user owns final authority for merge and other workflow escalations that explicitly require human authorization.

### 3.2 Local Agent

The Local Agent is the user-facing authority broker and workflow client.

It owns:

- user interaction;
- authoritative intent, constraints, Tasks, and Decisions;
- starting `/workflow` jobs;
- receiving compact progress/action-required events;
- carrying user approval/rejection/cancel decisions back to the workflow;
- targeted verification when needed.

It does not need to perform broad repository reading, routine implementation, normal team/review summarization, or deterministic phase tracking.

### 3.3 WorkflowEngine

WorkflowEngine is the deterministic orchestration control plane.

It owns:

- durable job state;
- team fan-out and completion tracking;
- deterministic prompt construction;
- handoff delivery and receipts;
- writer/reviewer sequencing;
- PR/review lifecycle;
- scoped approval behavior;
- retries/idempotency/recovery;
- compact event generation.

### 3.4 ChatGPT thinker account

The ChatGPT thinker account participates in reasoning/review teams and acts as the explicit final synthesizer for each team by default.

### 3.5 Gemini thinker account

The Gemini thinker account participates in independent reasoning/review teams.

### 3.6 ChatGPT writer account

The writer account is a separate authenticated ChatGPT Website account with GitHub repository mutation capability.

Expected capabilities include:

- read accessible repositories, including private repositories;
- create branch;
- create/update files;
- commit;
- create/update pull request;
- inspect pull request/CI state;
- execute merge when technically permitted and workflow-authorized.

### 3.7 GitHub / CI

GitHub PR state, commits, review discussion, and CI/runtime evidence are shared external artifacts.

## 4. Functional requirements

### FR-001 — Explicit workflow entry point

The plugin shall keep `/workflow <task>` as the explicit standard user entry point.

### FR-002 — Real workflow start

`/workflow` shall resolve repository/revision context and start a durable workflow job through the workflow runtime. It shall not encode the complete workflow as a single Local follow-up prompt.

### FR-003 — Multi-account ChatGPT support

The plugin shall support more than one authenticated ChatGPT account concurrently.

Each account shall have a stable semantic `accountId` independent of provider name.

### FR-004 — Account isolation

Authentication state, login profiles, scheduler state, browser contexts, and conversation bindings of one account shall not be reused by another account.

### FR-005 — Capability-aware routing

The runtime shall route a workflow step based on required capabilities and role.

At minimum the architecture shall distinguish thinker/reviewer and terminal writer.

### FR-006 — High ChatGPT thinking default

Ordinary ChatGPT browser turns shall default to reasoning level `high` unless explicitly overridden.

### FR-007 — Explicit team synthesizer

Each thinking/review team shall have an explicit synthesizer identity. The default synthesizer shall be `chatgpt-thinker`, independent of provider speaking order.

### FR-008 — Direct workflow-owned team execution

The deterministic coding workflow shall be able to execute team runs directly through the lower-level team runtime rather than requiring a free-form DSH subagent intermediary.

### FR-009 — Deterministic team prompt construction

WorkflowEngine shall prepare team/review tasks automatically from authoritative workflow state, including objective, repository, revision/PR identity, team role, constraints, and output contract.

### FR-010 — Parallel logical team fan-out

The standard coding workflow shall create two independent reasoning teams as concurrent logical workflow steps.

Provider/account schedulers may serialize underlying browser turns when required for account safety.

### FR-011 — Verbatim pre-implementation handoff

Each team's final output shall be delivered verbatim to the writer account. Metadata may be attached outside the payload, but the payload shall not be summarized, rewritten, or merged during normal routing.

### FR-012 — Handoff completion gate

The writer shall not receive `START_IMPLEMENTATION` until all required research handoffs are confirmed delivered.

### FR-013 — Writer repository confirmation

Before mutation, the writer workflow shall confirm the authoritative target repository and base branch/revision.

### FR-014 — PR creation without Local push

The writer workflow shall create/update a branch and pull request without requiring Local to implement or push an intermediate code commit.

### FR-015 — Scoped implementation auto-approval

When the Website presents a reliably recognized confirmation for a workflow-authorized implementation/PR action, the controller may auto-confirm it if repository, job, branch/PR identity, action type, and workflow state all match the active job.

### FR-016 — Unknown confirmation fail-closed

Unknown or ambiguous Website confirmation prompts shall not be auto-confirmed. The job shall pause and notify Local.

### FR-017 — PR-centric post-review

After PR creation, the runtime shall start two independent review teams against the actual PR.

### FR-018 — Verbatim review handoff

Each review team's final output shall be delivered verbatim to the writer.

### FR-019 — Remediation loop

After all required review outputs are delivered, the writer shall receive a separate `APPLY_REVIEWS` control instruction. Review/remediation may repeat until configured gates pass or the job escalates.

### FR-020 — Review-cycle limit

The initial workflow shall support a configurable maximum review/remediation cycle count. Exceeding the limit shall escalate to Local instead of looping indefinitely.

### FR-021 — Durable workflow jobs

Long-running workflows shall have a durable `job_id` and explicit state independent of one Local tool invocation.

### FR-022 — Event classes

The runtime shall distinguish at least internal state events, compact progress events, and action-required events.

Full reasoning payloads shall not be injected into Local as progress events by default.

### FR-023 — Merge authorization

The standard workflow shall require explicit user authorization before merge.

Starting `/workflow` or auto-approving implementation actions shall not imply merge authorization.

### FR-024 — Merge authorization binding

Merge authorization should be bound to concrete state including job, repository, PR number, and expected reviewed head SHA where available.

### FR-025 — Merge head revalidation

Before executing merge, the workflow shall verify that the current PR head matches the authorized/reviewed expected head. A mismatch shall invalidate authorization and return the job to review/authorization.

### FR-026 — Merge confirmation execution

After explicit user authorization, Local/controller may confirm the Website merge `Allow` prompt on the user's behalf for that authorized merge.

### FR-027 — Local exception inspection

Local shall be able to inspect raw handoffs, code, PR diff, review outputs, and runtime evidence when an exception or high-risk condition requires it.

### FR-028 — Job recovery

Durable job state shall support recovery after ordinary Local turn completion and temporary pauses. Restart recovery should be supported where technically feasible.

### FR-029 — Idempotent external actions

The runtime shall avoid duplicate handoffs, duplicate PR creation, and duplicate merge on retry by using durable receipts/idempotency metadata.

### FR-030 — Workflow API

The plugin should expose a Local-facing service/tool named `internet_workflow` with operations conceptually including:

```text
start
status
approve
reject
cancel
continue
```

`/workflow` remains the normal user-facing entry point.

### FR-031 — Current-vs-target documentation separation

Target workflow documents shall not represent unimplemented behavior as current behavior. `how-it-works.md` remains the current-state source until implementation lands.

## 5. Data requirements

### 5.1 Account identity

```text
accountId
provider
role
capabilities
account storage location
conversation namespace
```

### 5.2 Handoff record

```text
handoff_id
job_id
source
recipient account/conversation
sequence
payload
payload hash
created_at
delivered_at
```

### 5.3 Job record

```text
job_id
objective
authoritative constraints
repository
base branch/revision
team definitions
account routing
required handoffs
writer identity
state
PR identity when available
review cycle
pending action
last event
```

### 5.4 Merge authorization record

```text
authorization_id
job_id
repository
PR number
expected head SHA
approved_at
status
```

No secrets shall be persisted in shared job/handoff artifacts.

## 6. Non-functional requirements

### NFR-001 — Context efficiency

The normal workflow shall minimize raw team/review reasoning entering Local context.

### NFR-002 — Intent fidelity

The system shall avoid unnecessary LLM transformations between team/review final outputs and writer input.

### NFR-003 — Deterministic orchestration

Workflow phase transitions, worker cardinality, handoff gates, and approval gates shall be enforced by code rather than model compliance with a monolithic prompt.

### NFR-004 — Isolation

Two authenticated accounts from the same provider shall remain isolated at storage, scheduler, conversation, and browser-context layers.

### NFR-005 — Observability

The runtime should expose state transitions, team status, handoff receipts, PR identity, review cycles, pending actions, and failure reasons.

### NFR-006 — Recoverability

A long-running job should not be lost merely because the Local turn ends.

### NFR-007 — Least authority in the workflow

Even when technical permissions are broad, job-level policy shall constrain repository, revision, action scope, PR identity, and merge state.

### NFR-008 — Deterministic routing

Parallel completion order shall not make writer input order nondeterministic unless explicitly configured.

### NFR-009 — Fail-closed confirmation handling

Ambiguous confirmation UI shall stop rather than auto-authorize an unknown action.

### NFR-010 — Backward compatibility

Existing single-account configurations should continue to function through compatibility aliases/migration where practical.

## 7. Default coding workflow acceptance criteria

A target implementation is functionally complete when this flow works end-to-end:

```text
User runs /workflow <task>
  -> command starts durable workflow job
  -> Team A and Team B run directly under WorkflowEngine
  -> ChatGPT thinker synthesizes each team
  -> outputs delivered verbatim to writer
  -> runtime sends START_IMPLEMENTATION
  -> writer creates PR with scoped confirmations handled automatically
  -> Review A and Review B run against PR
  -> outputs delivered verbatim to writer
  -> writer remediates if needed
  -> review gates pass
  -> Local presents merge request
  -> user authorizes exact merge
  -> writer merges, with Website merge confirmation executed on user's behalf
  -> job reaches DONE
```

During the normal path, Local must not need to summarize team results, rewrite reviewer findings, implement code, push an intermediate branch solely for reviewers, or manually track workflow phase progression.
