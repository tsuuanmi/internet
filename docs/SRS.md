# Software Requirements Specification — Internet Team Workflow Runtime

- **Status:** Target requirements
- **Version:** Draft v3
- **Date:** 2026-09-08

## 1. Purpose

This SRS defines the target requirements for evolving `@tsuuanmi/internet` into a multi-account, long-running Website Agent workflow runtime for coding and related knowledge-work tasks.

Current implemented behavior remains documented in `how-it-works.md`.

## 2. Primary user experience

The user submits one task to the Local Agent.

The Local Agent coordinates the workflow. The user should not need to manually manage individual thinking teams, writer conversations, handoffs, or review teams during the normal path.

## 3. Actors

### 3.1 Local Agent

The Local Agent is the user-facing control plane.

It owns:

- user interaction;
- task intent and constraints;
- authoritative Tasks and Decisions;
- workflow orchestration;
- job state awareness;
- approval/exception routing;
- targeted verification when needed;
- merge authorization policy.

It does not need to perform broad repository reading or routine code implementation.

### 3.2 ChatGPT thinker account

The ChatGPT thinker account participates in reasoning teams and acts as the final synthesizer for each team by default.

It should have repository read capability where available and should not require repository mutation capability.

### 3.3 Gemini thinker account

The Gemini thinker account participates in independent reasoning/review teams.

### 3.4 ChatGPT writer account

The writer account is a separate authenticated ChatGPT Website account with GitHub repository mutation capability.

Expected capabilities include:

- read accessible repositories, including private repositories;
- create branch;
- create/update files;
- commit;
- create/update pull request;
- inspect pull request/CI state;
- execute merge when technically permitted and workflow-authorized.

### 3.5 GitHub / CI

GitHub PR state, review discussion, commits, and CI/runtime evidence are shared external artifacts.

## 4. Functional requirements

### FR-001 — Multi-account ChatGPT support

The plugin shall support more than one authenticated ChatGPT account concurrently.

Each account shall have a stable semantic `accountId` independent of provider name.

### FR-002 — Account isolation

Authentication state, login profiles, scheduler state, browser contexts, and conversation bindings of one account shall not be reused by another account.

### FR-003 — Capability-aware routing

The runtime shall be able to route a job step to an account based on required capabilities and role.

At minimum the architecture shall distinguish:

- thinker/reviewer;
- terminal writer.

### FR-004 — High ChatGPT thinking default

Ordinary ChatGPT browser turns shall default to reasoning level `high` unless explicitly overridden.

### FR-005 — Explicit team synthesizer

Each thinking/review team shall have an explicit synthesizer identity.

The default synthesizer shall be the ChatGPT thinker account, independent of provider speaking order.

### FR-006 — Parallel team fan-out

For the standard coding workflow, Local shall be able to spawn two independent reasoning teams in parallel.

Each team shall produce one final output.

### FR-007 — Verbatim pre-implementation handoff

Each team's final output shall be delivered verbatim to the writer account.

The runtime may add an external envelope but shall not summarize, rewrite, or merge the payload as part of normal routing.

### FR-008 — Handoff completion gate

The writer shall not receive the start-implementation control message until all required team result handoffs are confirmed delivered.

### FR-009 — Separate control message

After all required team results are delivered, Local/runtime shall send a separate control instruction telling the writer to begin implementation and create/update the PR.

### FR-010 — Writer repository confirmation

Before mutation, the writer workflow shall confirm the authoritative target repository and base branch/revision.

### FR-011 — PR creation

The writer workflow shall create or update a branch and pull request for the implementation without requiring Local to perform an intermediate code push.

### FR-012 — PR-centric post-review

After PR creation, the runtime shall be able to spawn two independent review teams against the actual PR.

### FR-013 — Verbatim review handoff

Each review team's final output shall be delivered verbatim to the writer.

### FR-014 — Remediation loop

After all required review outputs are delivered, the writer shall receive a separate control instruction to remediate material findings on the existing PR.

The review/remediation loop may repeat until configured gates pass or the job becomes blocked.

### FR-015 — Durable workflow jobs

Long-running workflows shall have a durable `job_id` and explicit state independent of one Local tool invocation.

### FR-016 — Event-driven continuation

The runtime shall emit or inject compact events when major workflow milestones or user/Local actions are required.

### FR-017 — External approval state

If ChatGPT/GitHub presents a manual approval gate, the workflow shall enter `AWAITING_EXTERNAL_APPROVAL` rather than failing or losing job state.

### FR-018 — Permission-optimized writer account

The writer account may be configured with GitHub `Allow all actions` / equivalent persistent approval when available and explicitly accepted by the user.

The runtime shall still enforce its own workflow state and repository target restrictions.

### FR-019 — Merge authorization

Technical merge capability shall not by itself imply merge authorization.

The default workflow shall require an explicit Local/user authorization state before executing merge.

### FR-020 — Merge execution

After authorization, merge may be executed by Local or by the writer account.

### FR-021 — Local exception inspection

Local shall be able to inspect raw handoffs, code, PR diff, review outputs, and runtime evidence when an exception or high-risk condition requires it.

### FR-022 — Job recovery

Durable job state shall support recovery after ordinary Local turn completion and temporary pauses. Restart recovery should be supported where technically feasible.

### FR-023 — Idempotent external actions

The runtime shall avoid duplicate handoffs, duplicate PR creation, and duplicate merge on retry by using durable receipts/idempotency metadata.

### FR-024 — Current-vs-target documentation separation

Target workflow documents shall not represent unimplemented behavior as currently implemented behavior.

`how-it-works.md` remains the current-state document until code lands.

## 5. Data requirements

### 5.1 Account identity

A logical account record should include at least:

```text
accountId
provider
role
capabilities
account storage location
conversation namespace
```

### 5.2 Handoff record

A handoff should include at least:

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

A coding job should include at least:

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
pending approval kind
last event
```

No secrets shall be persisted in shared job/handoff artifacts.

## 6. Non-functional requirements

### NFR-001 — Context efficiency

The normal workflow shall minimize raw team/review reasoning entering Local context.

### NFR-002 — Intent fidelity

The system shall avoid unnecessary LLM transformations between a team final output and writer input.

### NFR-003 — Isolation

Two authenticated accounts from the same provider shall remain isolated at storage, scheduler, conversation, and browser-context layers.

### NFR-004 — Observability

The runtime should expose state transitions, handoff receipts, PR identity, review cycles, approval waits, and terminal failure reasons.

### NFR-005 — Recoverability

A long-running job should not be lost merely because the Local turn ends.

### NFR-006 — Least authority in the workflow

Even when technical permissions are broad, job-level policy shall constrain the repository, revision, action scope, and merge state.

### NFR-007 — Deterministic routing

Parallel completion order shall not make writer input order nondeterministic unless a workflow explicitly requests completion-order delivery.

### NFR-008 — Backward compatibility

Existing single-account configurations should continue to function through compatibility aliases/migration where practical.

## 7. Default coding workflow acceptance criteria

A target implementation is considered functionally complete when this flow works end-to-end:

```text
User submits task
  -> Local creates coding job
  -> Team A and Team B run
  -> ChatGPT thinker synthesizes each team
  -> outputs delivered verbatim to writer
  -> Local/runtime sends START_IMPLEMENTATION
  -> writer creates PR
  -> Review A and Review B run against PR
  -> outputs delivered verbatim to writer
  -> writer remediates if needed
  -> review gates pass
  -> Local/user authorizes merge
  -> writer or Local merges
  -> job reaches DONE
```

During the normal path, Local must not need to summarize team results, rewrite reviewer findings, implement code, or push an intermediate branch solely to make code visible to Website reviewers.
