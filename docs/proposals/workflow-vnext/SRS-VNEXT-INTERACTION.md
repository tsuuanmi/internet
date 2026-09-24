# Software Requirements Specification — vNext External Interaction

- **Status:** proposed requirements; not implemented production contract
- **Version:** 0.1
- **Started:** 2026-09-16
- **Parent:** [`SRS-VNEXT.md`](./SRS-VNEXT.md)
- **Decision:** [`ADR/0017-autonomous-external-interaction.md`](./adr/0017-autonomous-external-interaction.md)

## 1. Purpose and authority

This module defines the target contract for autonomous workflow execution that can durably request and receive external input from the User and/or Local Agent through the workflow tool/API.

It extends the deterministic Orchestrator boundary in ADR-0015 and preserves current as-built production authority until implementation is promoted.

## 2. Autonomous-by-default requirements

### IX-FR-001 — Autonomous execution is default

After start, the Orchestrator shall continue scheduling all valid ready WorkItems without requiring a continuously connected Local Agent or User.

### IX-FR-002 — Client disconnection is not workflow failure

Loss/closure/restart of the Local Agent client shall not cancel, pause, or corrupt a durable workflow unless an explicit operator command does so.

### IX-FR-003 — External input only when required

The runtime shall create an external interaction only when deterministic policy or an authorized semantic artifact establishes that external authority/input is required.

### IX-FR-004 — Deterministic auto-resolution first

When code-owned policy can resolve a gate without external judgment, the Orchestrator shall continue autonomously rather than creating a PendingAction.

## 3. PendingAction object

### IX-FR-005 — First-class PendingAction

External authority/input shall be represented as a durable runtime-owned `PendingAction`.

### IX-FR-006 — PendingAction distinct from WorkItem

`PendingAction` shall not be represented as a reasoning-agent WorkItem.

### IX-FR-007 — Need may materialize as PendingAction

A validated Need requiring external authority/input may materialize into a PendingAction rather than a WorkItem.

### IX-FR-008 — PendingAction identity

Every PendingAction shall have stable workflow-scoped identity.

### IX-FR-009 — Causal binding

A PendingAction shall identify the Need/Finding/criterion/gate and request owner that caused it.

### IX-FR-010 — Response schema

Every PendingAction shall declare a versioned response schema or equivalent typed response contract.

### IX-FR-011 — Responder policy

Every PendingAction shall declare who may satisfy it.

Initial responder policies:

```text
USER_AUTHORITY
LOCAL_AGENT_INPUT
USER_OR_LOCAL
```

### IX-FR-012 — Exact-state binding

When decision correctness depends on exact workflow/repository/artifact state, the PendingAction shall bind the relevant identities/versions.

### IX-FR-013 — Lifecycle

The runtime shall distinguish at least:

```text
PENDING
RESOLVED
REJECTED
EXPIRED
CANCELLED
SUPERSEDED
```

## 4. Authority and provenance

### IX-FR-014 — Explicit user authority

A `USER_AUTHORITY` PendingAction shall require an explicit user-authority response under current product policy.

### IX-FR-015 — Local Agent cannot impersonate User

A response produced solely from Local Agent reasoning shall not satisfy a User-only authority gate.

### IX-FR-016 — Response provenance

Every accepted interaction response shall record its provenance.

At minimum:

```text
user_explicit
local_agent
operator/system_policy
```

### IX-FR-017 — Transport versus authority source

A response transmitted by Local Agent may be classified as `user_explicit` only when the system has an explicit user decision to transport.

### IX-FR-018 — Responder policy cannot be widened by client

The client shall not be able to change `USER_AUTHORITY` into `USER_OR_LOCAL` or otherwise weaken action authority in its response payload.

## 5. Dependency-scoped waiting

### IX-FR-019 — Interaction blocks only dependents

A PendingAction shall block only the paths whose prerequisites depend on its resolution.

### IX-FR-020 — Independent work continues

Independent READY/RUNNING WorkItems shall continue while unrelated PendingActions remain unresolved.

### IX-FR-021 — Pending action does not imply workflow WAITING

The workflow may remain `RUNNING` while PendingActions exist if useful autonomous work is still ready/running.

### IX-FR-022 — Workflow-level wait condition

The workflow shall enter a workflow-level external-wait state only when:

```text
no autonomous ready/running work remains
AND one or more unresolved blocking PendingActions remain
```

Suggested state/summary: `WAITING_EXTERNAL`.

### IX-FR-023 — Multiple interactions allowed

Independent branches may create multiple simultaneous PendingActions.

### IX-FR-024 — Independent resolution

Resolving one PendingAction shall unblock only the dependency paths that consume that resolution.

## 6. Solicited responses

### IX-FR-025 — Generic respond operation

The workflow tool/API shall support a generic typed response operation for a persisted PendingAction.

Conceptual request:

```text
workflowId
actionId
response payload
expected action/state version where applicable
idempotency/request identity
```

### IX-FR-026 — Response validation

Before resolution, runtime shall validate at least:

```text
action exists
action is PENDING
workflow/caller authorization
responder provenance/policy
response schema/version
exact-state bindings
staleness/supersession
idempotency/replay constraints
```

### IX-FR-027 — Resolution automatically triggers scheduling

After a valid response is committed, Orchestrator shall re-evaluate graph/readiness automatically.

The client shall not need a second generic `continue` command.

### IX-FR-028 — Continue retains recovery meaning

`continue` shall remain an operator/recovery operation and shall not be overloaded as the generic semantic-response mechanism.

## 7. Unsolicited external input

### IX-FR-029 — Separate signal/input operation

A user/client update that was not requested by a PendingAction shall use a separate typed workflow input/signal path if supported.

### IX-FR-030 — User directives are persisted

An unsolicited explicit user directive shall be persisted with provenance and relevant workflow version/context.

### IX-FR-031 — Orchestrator does not interpret free-form directive semantics

If an unsolicited directive requires semantic interpretation, Orchestrator shall route it to Planner/Reviewer/another registered reasoning capability.

### IX-FR-032 — Unsolicited input may invalidate work

After semantic interpretation produces typed changes, deterministic lineage/exact-input rules may invalidate or supersede affected work.

## 8. Staleness and idempotency

### IX-FR-033 — Supersede stale actions

When the exact state underlying a PendingAction materially changes before resolution, runtime shall supersede/fence that action according to policy.

### IX-FR-034 — Late stale response rejected

A response to `SUPERSEDED`, `EXPIRED`, `CANCELLED`, or otherwise stale action context shall fail closed.

### IX-FR-035 — Response retry is idempotent

Clients shall be able to retry an uncertain response without creating duplicate semantic transitions.

### IX-FR-036 — Conflicting duplicate rejected

After an action is resolved, a conflicting later response shall be rejected rather than replacing the committed decision silently.

## 9. Timeout and escalation

### IX-FR-037 — Explicit timeout policy

Any PendingAction deadline/timeout behavior shall be explicit policy.

Supported policy families may include:

```text
WAIT_INDEFINITELY
FAIL_CLOSED
DEFAULT_REJECT
ESCALATE_TO_USER
CANCEL_DEPENDENT_BRANCH
```

### IX-FR-038 — No timeout auto-approval for user authority

A User-authority action shall never become approved solely due to timeout.

### IX-FR-039 — Durable timeout

Timeout handling shall be durable and shall not require a Local Agent process to remain connected.

## 10. Tool/API and observability

### IX-FR-040 — Existing lifecycle operations remain separate

Current lifecycle concepts remain distinct from external interaction:

```text
start
list
status
watch
stop/cancel
continue/recover
delete
```

### IX-FR-041 — Status exposes pending actions

Status shall expose enough structured information to identify current PendingActions and who may answer them.

### IX-FR-042 — Status distinguishes autonomous progress

Status shall indicate whether the workflow is still making autonomous progress despite pending external actions.

### IX-FR-043 — Action payload is presentation-safe

A PendingAction exposed to Local Agent/UI shall contain enough structured context to present the choice/question without exposing hidden chain-of-thought/private reasoning.

### IX-FR-044 — Semantic question wording comes from reasoning role when needed

When formulating a clarification/choice requires semantic judgment, a Planner/Reviewer/Clarification capability shall produce the question/options artifact; the Orchestrator only persists/projects it.

### IX-FR-045 — Mechanical authority prompts may be runtime-rendered

The Orchestrator may render deterministic prompts for mechanical authority gates such as exact-head merge approval.

## 11. Reattachment and client substitution

### IX-FR-046 — Durable client reattachment

A newly connected authorized Local Agent/CLI/UI shall be able to discover workflow state and pending actions from durable state.

### IX-FR-047 — Previous Local hidden state not required

Resolving a PendingAction shall not require reconstructing the prior Local Agent's hidden reasoning or full conversation.

### IX-FR-048 — Client implementation is replaceable

The interaction contract shall permit future CLI/UI/automation clients to use the same authoritative workflow API without changing Orchestrator state-machine semantics.

## 12. Security

### IX-FR-049 — Scoped action identity

PendingAction IDs/tokens shall be scoped to the exact workflow/action and protected by caller authorization.

### IX-FR-050 — One-use/correlation semantics

Implementations should support one-use or equivalent fenced callback identity sufficient to prevent cross-action replay.

### IX-FR-051 — Minimal disclosure

Action payloads shall expose only decision-relevant context and shall not contain secrets, auth/browser state, or hidden chain-of-thought.

## 13. Acceptance scenarios

### Scenario A — fully autonomous workflow

1. Local Agent starts workflow and disconnects.
2. Planner/Research/Worker/Reviewer WorkItems execute under Orchestrator policy.
3. All required gates are policy-resolvable and no external action is created.
4. Workflow reaches its existing final user-authority boundary or terminal state without Local Agent keep-alive.

### Scenario B — one branch needs clarification

1. Reviewer branch A creates a clarification Need.
2. Orchestrator creates PendingAction A17 for `USER_OR_LOCAL`.
3. Research branch B remains independent and continues.
4. Workflow status remains RUNNING while B executes.
5. Local Agent later submits A17 response.
6. Orchestrator validates it and unblocks branch A automatically.

### Scenario C — explicit user authority

1. Planner proposes weakening a user-owned criterion.
2. Orchestrator creates `USER_AUTHORITY` PendingAction A22.
3. Local Agent thinks the change is sensible but cannot authorize it itself.
4. User explicitly approves.
5. Local Agent transports the explicit decision as `user_explicit`.
6. Orchestrator validates A22 and applies the authorized requirements transition.

### Scenario D — Local Agent resolves allowed input

1. Planner creates a non-authoritative contextual question with `LOCAL_AGENT_INPUT` responder policy.
2. Local Agent has sufficient current conversation context and submits the answer.
3. Response provenance is `local_agent`.
4. Orchestrator accepts it because policy allows Local Agent response and resumes dependent work.

### Scenario E — client disappears during wait

1. Workflow reaches PendingAction A30 and no autonomous work remains.
2. Runtime persists `WAITING_EXTERNAL`.
3. Original Local Agent session disappears.
4. Later, another authorized Local Agent loads status and A30.
5. It obtains/forwards a valid response.
6. Workflow continues from durable state.

### Scenario F — stale response

1. PendingAction A40 asks approval for PR head H10.
2. An authorized remediation changes head to H11 before response.
3. Runtime supersedes A40 and, if needed, creates A41 bound to H11.
4. A late approval of A40 is rejected and cannot authorize H11.

### Scenario G — unsolicited user change

1. Workflow is running.
2. User says to Local Agent: `Also preserve Node 20 compatibility.`
3. Local Agent submits a `user_directive` through the signal/input API.
4. Orchestrator persists it and routes semantic interpretation/replanning to Planner.
5. Typed plan/criteria changes trigger deterministic invalidation as appropriate.

## 14. Non-goals

This module does not require a human approval step in every workflow.

It does not make Local Agent:

- the workflow state machine;
- a mandatory keep-alive process;
- a substitute for User-only authority;
- a direct editor of durable workflow state.

It does not make PendingAction:

- a generic error state;
- a reasoning-agent WorkItem;
- an automatic global pause.

The target is:

> autonomous durable orchestration that asks outside the workflow only when outside authority or information is genuinely required, while preserving deterministic state, scoped waiting, and safe resume.
