# Software Requirements Specification — vNext Deterministic Orchestrator Boundary

- **Status:** proposed requirements; not implemented production contract
- **Version:** 0.2
- **Started:** 2026-09-16
- **Parent:** [`SRS-VNEXT.md`](./SRS-VNEXT.md)
- **Decision:** [`ADR/0015-deterministic-local-orchestrator.md`](./ADR/0015-deterministic-local-orchestrator.md)

## 1. Purpose

This module defines the boundary between the reasoning-capable Local Agent client and the deterministic workflow Orchestrator/WorkflowEngine.

The Local Agent uses the workflow tool/API. It may reason conversationally for the user, but workflow correctness must depend only on explicit validated tool inputs and durable typed workflow state.

For current production behavior, current code and as-built contracts remain authoritative.

## 2. Core requirements

### LO-FR-001 — Local Agent is workflow client

The Local Agent shall be treated as the user-facing workflow client/operator, not as the authoritative workflow state machine.

### LO-FR-002 — Orchestrator Runtime is deterministic

The workflow Orchestrator Runtime, including `WorkflowEngine` workflow-domain transitions, shall be deterministic and code/policy owned.

### LO-FR-003 — Tool/API is the authority boundary

Only explicit validated workflow-tool/API inputs may alter authoritative workflow state.

Conversational context, hidden chain-of-thought, implicit Local conclusions, or unsent user intent shall not affect workflow state.

### LO-FR-004 — Local may reason outside correctness state

The Local Agent may interpret user conversation, explain status, compare choices, decide when to call tools, and perform advisory reasoning.

Such reasoning shall remain non-authoritative until represented by a validated tool input or typed workflow artifact/decision.

### LO-FR-005 — Deterministic transition rule

Given the same authoritative workflow state, accepted typed artifacts, explicit tool inputs, observed external receipts/state, and policy/schema versions, the Orchestrator Runtime shall choose the same workflow transition without model inference.

### LO-FR-006 — No runtime model fallback

The Orchestrator Runtime shall not use an LLM/model to choose transitions, interpret evidence, summarize research, create plans, review implementation, or resolve semantic ambiguity.

### LO-FR-007 — Semantic work is delegated

Operations requiring semantic judgment shall execute through registered reasoning capabilities such as Planner, Research, Reviewer, Worker, or Verification/Synthesis capabilities.

### LO-FR-008 — Local status/control interaction

The workflow tool/API shall allow the Local Agent to inspect and control workflow lifecycle through explicit operations.

Current examples include:

```text
start
list
status
watch
stop/cancel
continue/recover when engine-approved
delete
```

### LO-FR-009 — Pending actions are durable

User-facing workflow decisions shall be represented as durable pending actions rather than depending on the Local Agent retaining conversational state.

### LO-FR-010 — Generic typed response boundary

The target vNext workflow tool/API shall support a generic typed response to a persisted pending action.

Conceptually:

```text
workflowId
actionId
responseType
payload
expected state/head/version when applicable
```

### LO-FR-011 — Pending response validation

Before accepting a Local-agent/user response, runtime shall verify at least:

```text
action exists
action remains pending
response type matches action schema
caller/session authority is valid
expected state/head/version is current where required
response satisfies policy
response is not an incompatible duplicate
```

### LO-FR-012 — User authority is explicit

A conversational statement that appears to authorize an action shall not itself grant workflow authority.

Authority is committed only after the Local Agent submits the corresponding validated tool response to the matching persisted action/gate.

### LO-FR-013 — Clarification is explicit

If Planner/Reviewer produces a semantic clarification request, runtime shall persist it as a typed pending action and expose it to the Local Agent.

The Local Agent may present/explain the question, but the user's answer affects workflow only after explicit submission to that action.

### LO-FR-014 — Local may not mutate durable workflow state directly

The Local Agent shall not edit workflow files/state stores, graph objects, WorkItems, or artifacts outside supported tool/API operations.

### LO-FR-015 — Workflow ownership scope

Workflow selection/control shall preserve Local owner/session scoping or another explicit authorization model; ambiguous workflow targets shall not be guessed.

### LO-FR-016 — Runtime schema validation is not semantic judgment

Runtime may validate schemas, identities, producer authority, exact-input bindings, hashes, state versions, and lifecycle compatibility without judging substantive semantic correctness.

### LO-FR-017 — Need routing is deterministic

Mapping validated `Need.type` values to registered capabilities shall be code/configuration owned.

### LO-FR-018 — Result return is mechanical

WorkItem results shall return according to persisted causal ownership/routing fields, not because the runtime interprets their prose.

### LO-FR-019 — InputBundle projection is deterministic

InputBundles shall be built from explicit dependency/projection rules and authoritative runtime bindings.

### LO-FR-020 — Graph materialization is deterministic

Only approved graph motifs/subgraphs may be instantiated from validated capability/policy state.

### LO-FR-021 — Scheduling/retry/fencing are deterministic

Readiness, dependency checks, resource constraints, provider/account capacity policy, retries, execution fencing, and idempotency shall be runtime-owned.

### LO-FR-022 — Invalidation is deterministic

Artifact/review/plan invalidation shall follow explicit exact-input, version, lineage, and dependency rules.

### LO-FR-023 — Convergence is deterministic

Workflow completion shall be evaluated from explicit typed predicates and current exact external state; runtime shall not ask a model whether the workflow is "done".

### LO-FR-024 — Local conversation is not replay state

Workflow restart/recovery shall not require restoration of Local Agent hidden reasoning or full conversation history.

### LO-FR-025 — Runtime may emit deterministic projections

Runtime may render status, machine summaries, and workspace control files from structured state when no semantic synthesis is required.

### LO-FR-026 — Semantic shared views come from reasoning roles

`PLAN.md`, `RESEARCH.md`, semantic TODO content, and ROADMAP meaning shall originate from typed shared-view artifacts produced by authorized reasoning roles/capabilities.

Runtime may filter/order/render those views deterministically but shall not synthesize their semantic meaning.

### LO-FR-027 — Worker remains sole repository writer

Repository commits shall execute only through Worker under an authorized mutation WorkItem.

### LO-FR-028 — Git reconciliation is runtime-owned

The deterministic Orchestrator shall verify Worker mutation receipts against expected head, allowed scope, actual remote state, and required postconditions.

### LO-FR-029 — Local may inspect workflow outputs

The Local Agent may inspect status, pending actions, results, PR state, and other exposed workflow information to help the user understand or decide what to do.

Inspection itself shall not mutate workflow state.

### LO-FR-030 — Local advisory reasoning cannot impersonate specialist output

If Local Agent reasoning produces a useful suggestion, the workflow shall not treat that suggestion as Planner/Research/Reviewer evidence unless it is explicitly submitted through a schema/policy path that grants such semantic authority.

### LO-FR-031 — Client substitution shall be safe

A different Local Agent, CLI, UI, or automation client shall be able to operate the same durable workflow through the tool/API without changing workflow state-machine semantics.

### LO-FR-032 — Reconnect from durable state

A newly connected Local Agent shall be able to recover useful workflow context through status/pending-action/query operations rather than relying on the previous Local Agent's memory.

## 3. Interaction architecture

```text
User
  <-> Local Agent
        reasoning-capable client
        |
        | workflow tool/API
        v
      Deterministic Orchestrator Runtime
        |
        +-> WorkflowEngine state transitions
        +-> scheduling / transport / reconciliation
        |
        v
      Planner / Research / Reviewer / Worker
```

## 4. Acceptance scenarios

### Scenario A — Local starts and monitors workflow

1. User asks Local Agent to perform a coding task.
2. Local Agent calls workflow start with explicit objective/repository inputs.
3. Runtime creates durable workflow state.
4. Local Agent later calls status/watch.
5. Runtime returns authoritative state projection.
6. Local may explain it conversationally without modifying the workflow.

### Scenario B — semantic clarification

1. Planner returns `ClarificationNeed`.
2. Runtime persists PendingAction A17.
3. Tool/event exposes A17 to Local Agent.
4. Local presents/explains question to user.
5. User answers.
6. Local submits response to A17.
7. Runtime validates action identity/state and persists answer.
8. Planner work resumes/re-runs under policy.

### Scenario C — Local infers approval but does not submit

1. User language appears favorable to merge.
2. Local internally believes approval exists.
3. No typed merge-authorization response is submitted.
4. Runtime remains `WAITING_USER`.
5. Hidden Local reasoning cannot advance merge state.

### Scenario D — reconnect with a new Local Agent

1. Original client disappears while workflow continues.
2. New Local Agent identifies workflow through supported discovery/selection.
3. `status` returns durable phase, graph, external state, and pending action.
4. New Local Agent can continue user interaction without replaying previous hidden reasoning.

### Scenario E — Local offers semantic advice

1. Local inspects a Reviewer finding and explains likely implications to user.
2. That advice is conversational only.
3. Formal workflow consequences still come from typed Reviewer/Planner/Research artifacts or explicit user action through the tool boundary.

## 5. Decision ownership matrix

| Decision/action | Owner |
| --- | --- |
| converse with user / explain workflow | Local Agent |
| choose when to call status/watch/start | Local Agent |
| durable workflow transition | Orchestrator Runtime / WorkflowEngine |
| Need -> capability mapping | Orchestrator Runtime |
| retry/fencing/idempotency | Orchestrator Runtime |
| graph/readiness/resource policy | Orchestrator Runtime |
| semantic objective/plan | Planner |
| research conclusion | Research |
| implementation | Worker |
| semantic review judgment | Reviewer |
| Git commit execution | Worker |
| Git postcondition reconciliation | Orchestrator Runtime |
| human authority decision | User |
| carry explicit user response into workflow | Local Agent via tool/API |
| validate/apply user response | Orchestrator Runtime |

## 6. Non-goals

The Local Agent is not required to be deterministic.

The Orchestrator Runtime is not:

```text
a conversational agent
a Planner
a Research agent
a Reviewer
an implementation generator
a semantic summarizer
a hidden general-purpose LLM
```

The target boundary is:

> Local Agent may think and interact; the workflow runtime deterministically coordinates and only trusts explicit typed inputs.
