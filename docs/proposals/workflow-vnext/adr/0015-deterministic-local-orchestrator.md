# ADR-0015 — Separate the Local Agent Client from the Deterministic Orchestrator

- **Status:** Proposed
- **Date:** 2026-09-16
- **Related:** ADR-0001, ADR-0005, ADR-0009, ADR-0010, ADR-0011, ADR-0012, ADR-0013, ADR-0014

## Context

The current as-built architecture already has an important boundary that vNext must preserve:

- a **Local agent** is the user-facing workflow client/operator and calls the workflow tool;
- `internet_workflow` / `/workflow` expose the deterministic workflow surface;
- `WorkflowEngine` owns durable workflow-domain state and transitions.

Earlier vNext wording collapsed `Local` and `Orchestrator` into one deterministic actor. That is inaccurate and unnecessarily constrains the client agent.

The Local agent may reason, converse with the user, decide when to invoke a tool, explain status, and carry explicit user choices. Workflow correctness must not depend on the Local agent's hidden reasoning, however. Only explicit validated tool inputs may change authoritative workflow state.

## Decision

The architecture shall distinguish three boundaries:

```text
User
  <-> Local Agent
        user-facing reasoning client/operator
        |
        | workflow tool/API
        v
      Orchestrator Runtime / WorkflowEngine
        deterministic control plane
        |
        | typed WorkItems / InputBundles
        v
      Planner / Research / Reviewer / Worker
```

### Local Agent

The Local agent is a reasoning-capable **workflow client**, not the workflow state machine.

It may:

```text
understand conversational user intent
choose when to start/inspect/control a workflow
call workflow tool operations
present status/progress/results
explain workflow state to the user
carry explicit user authorization/clarification/choices
perform advisory reasoning outside workflow correctness state
```

Its chain-of-thought, implicit conclusions, or conversational assumptions are never authoritative workflow state.

### Orchestrator Runtime / WorkflowEngine

The Orchestrator is the deterministic runtime behind the tool surface.

`WorkflowEngine` is the implementation component that owns workflow-domain transitions. The surrounding driver/tool/runtime may own scheduling, provider transport, event delivery, and external-state reconciliation, but the overall orchestration boundary is deterministic.

It owns:

```text
workflow creation from explicit tool input
schema validation
artifact/state persistence
Finding/Need/WorkItem lifecycle mechanics
capability routing from typed fields
InputBundle construction
graph motif materialization
readiness/scheduling policy
side-effect authority
retry/fencing/idempotency
exact-head checks
Git reconciliation
lineage invalidation
resource budgets
termination/convergence predicates
pending-action state
```

It does not use model reasoning to invent semantic transitions.

## Tool/API is the authority boundary

The workflow tool/API is the explicit protocol between the Local agent and deterministic Orchestrator.

Current as-built examples include:

```text
/workflow <objective>
/workflow list
/workflow status [jobId]
/workflow watch [jobId]
/workflow stop [jobId]
/workflow continue [jobId]
/workflow delete <jobId>
```

The Local agent can therefore interact with a running workflow, but only through supported operations and explicit arguments.

The architecture must never treat arbitrary Local-agent conversation context as implicit workflow input.

## Correctness-bearing interaction rule

If Local-agent reasoning should affect workflow behavior, it must cross the tool boundary as an explicit typed input.

Examples:

```text
Local thinks: "the user approved merge"
  -> not authoritative

Local tool call:
  actionId=<pending merge authorization>
  decision=approve
  expectedHead=<exact SHA>
  -> authoritative only after runtime validation
```

Likewise:

```text
Local infers a clarification answer from conversation
  -> not authoritative

Local submits explicit user response to the matching pending action
  -> runtime persists response with causal action identity
```

This preserves user-facing intelligence without moving hidden reasoning into the control plane.

## Current interaction model

The Local agent may currently:

```text
start a workflow
list jobs
inspect authoritative status
watch progress/action-required events
stop/cancel a workflow
continue an engine-approved recovery boundary
delete an exact selected workflow
```

The current operator contract already scopes jobs to the current Local owner session and treats `internet_workflow` as the lower-level deterministic tool surface.

Thus the relationship is:

```text
Local Agent
  = workflow client/operator

Workflow tool
  = command/query boundary

WorkflowEngine
  = authoritative deterministic state machine
```

## vNext interaction requirement

Adaptive workflows introduce more user-facing pending actions than the current mostly fixed pipeline, especially:

```text
semantic clarification
requirements-change approval
policy exception
mutation/authority confirmation
merge/release authority
blocked-choice resolution
```

These should not require direct filesystem/state mutation or ad-hoc conversational coupling.

The target tool surface should therefore support one generic typed pending-action response operation conceptually equivalent to:

```yaml
respond:
  workflowId: wf_123
  actionId: action_17
  responseType: authorization | clarification | choice | acknowledgement
  payload: ...
  expectedStateVersion: ...
```

Exact command/API naming remains implementation-specific.

The runtime validates that:

```text
action exists and is still pending
response type matches action schema
Local owner/session is authorized
expected state/head/version is current where required
response satisfies policy
response has not already been consumed incompatibly
```

Only then does it commit the corresponding state transition.

## Local-agent reasoning versus specialist reasoning

The Local agent may reason for the user's benefit, but it should not silently replace workflow specialist roles.

For example, Local may say conversationally that a research result appears important, but if that judgment must alter workflow correctness it must be represented by an appropriate Planner/Reviewer/Research artifact or explicit user decision.

Similarly, Local may help the user understand a pending requirements change, but the workflow's formal proposal and affected criteria must come from typed Planner/Reviewer artifacts rather than from Local's hidden analysis.

This distinction allows a capable Local agent without making workflow recovery depend on reproducing that agent's private reasoning.

## Semantic work inside workflow

When the deterministic Orchestrator needs semantic work to progress, it delegates through typed WorkItems:

```text
objective interpretation/decomposition -> Planner
research question/evidence -> Research
research synthesis -> Research/Synthesis
implementation -> Worker
review/criterion judgment -> Reviewer
evidence contradiction resolution -> Reviewer/Verification
semantic clarification wording/proposal -> Planner/Reviewer/Clarification capability
```

The Orchestrator does not perform that semantic work itself.

## Shared PR workspace consequence

The same boundary applies to temporary PR collaboration memory.

Reasoning roles produce typed shared views such as:

```text
PlanSharedView
ResearchSharedView
SharedTodoItem
RoadmapSharedView
```

The deterministic Orchestrator applies schema/policy/filter/order/render rules and creates an authorized Worker mutation WorkItem.

The Local agent may inspect or discuss these files, but its conversational edits do not become workflow state unless submitted through a supported typed operation.

## Human interaction

The preferred human interaction path is:

```text
specialist/policy produces PendingAction
  -> Orchestrator persists it
  -> workflow tool/event exposes it
  -> Local Agent presents it to User
  -> User responds
  -> Local Agent submits typed response
  -> Orchestrator validates and commits transition
```

This keeps Local useful as the user-facing agent while preserving deterministic authority.

## Determinism definition

For the Orchestrator Runtime:

> Given the same authoritative workflow state, accepted artifacts, explicit tool inputs, observed external receipts/state, and policy/schema versions, the same valid control transition is chosen without model inference.

The Local agent itself is not required to be deterministic.

## Consequences

### Positive

- preserves the current tool/client architecture;
- Local can remain a capable conversational reasoning agent;
- deterministic workflow correctness does not depend on Local hidden reasoning;
- user authority enters through explicit auditable commands/responses;
- the workflow can be driven by different Local agents/harnesses without changing state-machine semantics;
- reconnect/recovery works from durable state rather than conversational memory;
- adaptive clarification/authorization can be modeled cleanly as pending actions.

### Costs

- the tool/API needs a richer typed pending-action response contract for vNext;
- Local may know useful information conversationally that must be explicitly submitted before the workflow can use it;
- status/action schemas must contain enough information for a client agent to present useful choices without reading private runtime state.

## Invariants

> Local Agent is a reasoning-capable workflow client/operator; it is not the authoritative workflow state machine.

> The Orchestrator Runtime / WorkflowEngine is deterministic and does not use model reasoning to choose control transitions.

> Only explicit validated workflow-tool inputs may change authoritative workflow state; Local-agent conversation context and hidden reasoning never do so implicitly.

> User decisions are carried through Local Agent but become authority only after matching a persisted pending action/policy gate and passing runtime validation.

> When workflow progress requires semantic judgment, the deterministic Orchestrator routes a typed reasoning WorkItem rather than performing that judgment itself.
