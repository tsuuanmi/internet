# ADR-0017 — Autonomous Workflow with Durable External Interaction

- **Status:** Proposed
- **Date:** 2026-09-16
- **Related:** ADR-0001, ADR-0005, ADR-0007, ADR-0010, ADR-0011, ADR-0015, ADR-0016

## Context

The target workflow should run autonomously under the deterministic Orchestrator for as long as policy, available evidence, and delegated agent capabilities permit.

At the same time, some steps legitimately require external input or authority from outside the workflow runtime:

```text
explicit user authorization
semantic clarification from the user
requirements-change approval
policy/authority exception
selection among bounded alternatives
operator intervention after a non-recoverable condition
```

The current as-built system already exposes workflow control to a Local Agent through `/workflow` / `internet_workflow`, but vNext needs a more general interaction contract because adaptive planning and review can discover new external-input needs mid-run.

The design must avoid two failure modes:

1. making every interaction a global workflow pause;
2. letting Local Agent conversation or hidden reasoning mutate workflow state implicitly.

Durable workflow systems commonly solve this with persisted interruption/callback objects, external events, or task tokens: execution state is saved, external input is correlated to the exact waiting operation, and the workflow resumes from durable state after validation.

## Decision

The workflow is **autonomous by default and externally interruptible by explicit durable contract**.

```text
User
  <-> Local Agent
        reasoning-capable workflow client
        |
        | workflow tool/API
        v
+-----------------------------------------+
| Deterministic Orchestrator Runtime      |
|                                         |
| schedule all ready autonomous work      |
| persist PendingAction when input needed |
| continue unrelated ready work           |
+--------------------+--------------------+
                     |
          +----------+----------+
          |                     |
          v                     v
       WorkItem             PendingAction
          |                     |
          v                     |
  Planner/Research/...          |
                                |
                 external response via tool/API
                                |
                                v
                       validated resolution
```

A workflow does not require a continuously connected Local Agent. The runtime continues independently until completion, a terminal failure, or an unresolved external dependency blocks all remaining progress.

## WorkItem versus PendingAction

A validated Need can materialize into different runtime control objects depending on what is required.

```text
Need
  +-> executable capability needed
  |     -> WorkItem
  |
  +-> external authority/input needed
        -> PendingAction
```

`PendingAction` is not a WorkItem and is not a reasoning-agent execution.

It is a durable runtime-owned request for information/authority that must enter through the workflow tool/API.

## PendingAction contract

A PendingAction should bind at least:

```text
actionId
workflowId
causedBy Need/Finding/criterion/gate
requestOwnerRef
actionType
responderPolicy
responseSchema/version
authorityRequirement
blockingScope
relevant exact state/head/artifact bindings
createdAt
optional deadline/timeout policy
status
resolution artifact/response ref
```

Initial lifecycle:

```text
PENDING
RESOLVED
REJECTED
EXPIRED
CANCELLED
SUPERSEDED
```

The runtime shall never infer a resolution from conversation text that has not crossed the tool/API boundary.

## Interaction classes

External interaction should distinguish who may legitimately resolve it.

### `USER_AUTHORITY`

Requires an explicit user decision.

Examples:

```text
merge/release authorization
weakening/removing a user-owned acceptance criterion
high-authority policy exception
explicit irreversible action reserved to user authority
```

A Local Agent cannot satisfy this class merely by making its own judgment. It may carry the user's explicit response through the tool/API.

### `LOCAL_AGENT_INPUT`

May be satisfied by the reasoning-capable Local Agent without additional user confirmation when policy allows.

Examples may include:

```text
non-authoritative semantic clarification available from current client context
format/interaction choice delegated to the client
advisory contextual input whose authority class permits Local response
```

The response provenance remains `local_agent`, not `user`.

### `USER_OR_LOCAL`

May be resolved either by explicit user input or by Local Agent reasoning, depending on available context and policy.

If the Local Agent is uncertain or lacks sufficient authority/context, it should ask the user rather than guess.

The responder policy is runtime-owned and cannot be widened by a client response.

## Response provenance

Every accepted external response records who supplied the authoritative value.

At minimum:

```text
user_explicit
local_agent
operator/system_policy
```

A response transported by Local Agent can still be classified as `user_explicit` only when it represents an explicit user choice under the product's authority policy.

The Orchestrator shall not treat `local_agent` provenance as satisfying a `USER_AUTHORITY` action.

## Interaction is a dependency, not a global pause

A PendingAction blocks only the graph/task/decision paths that depend on it.

Independent ready WorkItems continue to run.

Example:

```text
Reviewer branch A
  -> PendingAction A17(requirements clarification)
  -> waits

Research branch B
  -> independent WorkItem W41
  -> continues running
```

The overall workflow may therefore have pending actions while remaining `RUNNING`.

A workflow enters a workflow-level waiting state only when:

```text
no runnable/running autonomous work remains
AND at least one unresolved blocking PendingAction exists
```

Suggested projection:

```text
Status: WAITING_EXTERNAL
Pending actions: 2
```

This preserves maximum autonomous progress.

## Solicited versus unsolicited external input

The interaction surface should distinguish two flows.

### Solicited response

The runtime has already created a PendingAction.

```text
respond(workflowId, actionId, payload, expectedActionVersion/...)
```

The action provides response schema, authority, causal owner, and stale-input bindings.

### Unsolicited signal/directive

A user may change constraints or provide new relevant information while a workflow is already running.

This should use a separate typed `signal` / `submit_input` style operation rather than pretending an unrelated PendingAction existed.

Conceptually:

```yaml
workflowId: wf_123
source: user_explicit
inputType: user_directive
payload: |
  Also preserve compatibility with Node 20.
expectedWorkflowVersion: 42
```

The Orchestrator persists the input and routes semantic interpretation to Planner/Reviewer according to deterministic policy.

The Orchestrator does not semantically interpret arbitrary new prose itself.

## Response validation and stale fencing

Before resolving a PendingAction, the runtime validates at least:

```text
action exists
action status == PENDING
caller/workflow ownership authorized
responder provenance satisfies responderPolicy/authorityRequirement
response matches schema/version
exact head/state/artifact bindings still current where required
response is not stale/superseded
idempotency/replay policy accepts the request
```

If the underlying decision context changes while waiting, the action should become `SUPERSEDED` or otherwise fenced.

A late response to a superseded action must not affect current workflow state.

## Idempotent response semantics

External responses may be retried after network/client uncertainty.

The runtime should therefore support idempotent response identity.

For a resolved action:

- an identical replay may return the existing resolution;
- a conflicting second response is rejected;
- a response to a superseded/expired action is rejected as stale.

This follows the same general principle as exact-head mutation reconciliation: uncertain transport must not create duplicate semantic transitions.

## Timeout policy

PendingAction timeout behavior is explicit policy, not implicit success.

Possible policies include:

```text
WAIT_INDEFINITELY
FAIL_CLOSED
DEFAULT_REJECT
ESCALATE_TO_USER
CANCEL_DEPENDENT_BRANCH
```

`USER_AUTHORITY` actions must never become approved merely because time elapsed.

Durable timers may trigger timeout transitions without keeping a Local Agent connected.

## Automatic policy resolution

Not every gate should produce a human/client interruption.

If deterministic policy can already decide an action safely, the Orchestrator should resolve it programmatically and continue without surfacing a PendingAction.

Examples include currently supported narrowly scoped auto-approval rules for recognized low-risk confirmations.

The principle is:

```text
policy can decide deterministically
  -> continue autonomously

external authority/input genuinely required
  -> create PendingAction
```

This keeps interaction exceptional rather than turning the workflow into an approval pipeline.

## Multiple simultaneous PendingActions

The runtime may persist multiple PendingActions from independent branches.

Each action has independent identity and causal ownership.

Clients may resolve them individually or, where a future API allows it, submit a batch keyed by action IDs.

Resolving one action immediately unblocks only its dependent path; unresolved actions remain pending.

## Local Agent attachment and reattachment

The Local Agent is a client, not a keep-alive process.

The workflow may outlive one Local Agent session.

A new authorized Local Agent/CLI/UI client should be able to:

```text
list/discover owned workflows
read status
read pending actions
inspect response schemas/options
submit valid responses
continue observing the same durable workflow
```

No hidden reasoning state from the previous Local Agent is required for workflow recovery.

## Tool/API surface

The existing lifecycle surface remains useful:

```text
start
list
status
watch
stop/cancel
continue/recover
delete
```

vNext should add a generic external-interaction boundary conceptually like:

```text
pending actions returned in status/watch
respond(actionId, response)
signal(input)       # unsolicited user/client input, if supported
```

`continue` remains an operator recovery command. It should not be overloaded as the generic way to answer a semantic PendingAction.

Resolving an action should automatically re-evaluate readiness; the client should not need a second generic "resume" command.

## Action presentation

The PendingAction contains enough structured information for Local Agent/UI to present it without reconstructing private workflow reasoning.

Example:

```yaml
actionId: A17
actionType: clarification
responderPolicy: USER_OR_LOCAL
questionArtifactRef: Q12
responseSchema:
  type: object
  required: [choice]
  properties:
    choice:
      enum: [preserve_compatibility, allow_breaking_change]
contextRefs:
  - AC-7
  - F-22
```

Semantic wording/options that require reasoning should originate from Planner/Reviewer/another reasoning capability. The Orchestrator may render deterministic authority/status prompts directly when no semantic synthesis is needed.

## Relationship to workflow status

A compact status model should expose at least:

```text
running/ready WorkItems
blocking dependencies
pending-action count
action IDs/types/responder policies when user-facing
whether workflow is still making autonomous progress
```

This allows Local Agent to distinguish:

```text
RUNNING with pending interaction
```

from:

```text
WAITING_EXTERNAL because all useful autonomous work is exhausted
```

## Security and authority

PendingAction identifiers/callback tokens are capabilities and must be scoped to the exact workflow/action.

Implementations should use authenticated caller/session checks and stale/version fencing; opaque one-use callback tokens may be added where useful.

A PendingAction may expose only the context necessary to make the decision. Hidden chain-of-thought/private reasoning must not be included.

## Consequences

### Positive

- workflows can complete fully autonomously when no external authority/input is needed;
- user/client interaction becomes durable and auditable rather than conversationally implicit;
- independent work continues while one branch waits;
- Local Agent can disconnect/reconnect without breaking workflow execution;
- multiple pending interactions can coexist safely;
- external-response retries are idempotent/fenced;
- the same protocol can support future CLI/UI clients, not only one Local Agent harness.

### Costs

- first-class PendingAction state and schemas are required;
- status/watch must surface external-dependency information;
- authority/provenance rules become explicit protocol surface;
- unsolicited user directives need their own safe ingestion/replanning path;
- concurrent action resolution adds version/idempotency concerns.

## Invariants

> The workflow runs autonomously whenever deterministic policy and available capabilities permit; interaction is exceptional, not the default execution mode.

> PendingAction is a durable external dependency, not a reasoning WorkItem and not necessarily a global workflow pause.

> Independent ready work continues while another branch waits for external input.

> Local Agent conversation affects workflow correctness only through explicit validated tool/API input.

> A Local Agent response cannot satisfy a User-only authority gate unless it carries valid explicit-user provenance under policy.

> Resolving a PendingAction automatically re-evaluates workflow readiness; generic operator `continue` is not the semantic response protocol.

> Stale, superseded, expired, duplicated, or authority-mismatched external responses fail closed.
