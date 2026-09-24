# ADR-0018 — Compile Natural-Language Intent Through a Typed Workflow Admission Protocol

- **Status:** Proposed
- **Date:** 2026-09-16
- **Related:** ADR-0015, ADR-0016, ADR-0017

## Context

The primary product interaction is natural language:

```text
User <-> Local Agent
```

The Local Agent is a reasoning-capable model and can understand ambiguous conversational requests. The workflow runtime, however, is intentionally deterministic and cannot safely depend on implicit conversational meaning or hidden model reasoning.

Passing the user's prose directly to the workflow as if it were already an executable specification creates several production problems:

- the Local Agent may silently invent scope, duration, budget, authority, or deliverables;
- a schema-valid JSON object can still misrepresent what the User meant;
- recovery/audit cannot distinguish User statements from model inference;
- confirmation may apply to one interpretation while another request is actually activated;
- domain-specific startup logic can leak into the generic Orchestrator.

The architecture therefore needs an explicit protocol between the reasoning client and deterministic runtime.

## Decision

The Local Agent acts as a **Reasoning Workflow Client** with two conceptual functions:

```text
Intake Compiler
  natural language -> typed admission proposal

Operator Interface
  typed workflow state/actions -> natural-language interaction
```

The workflow start path becomes:

```text
User natural language
        |
        v
Local Agent / Intake Compiler
        |
        v
WorkflowAdmissionDraft
        |
        v
Orchestrator deterministic preflight
        |
        v
AdmissionPreview
        |
   confirmation policy
      /    |    \
 auto   local   user
      \    |    /
        v
AcceptedAdmissionSpec + identity/hash
        |
        v
activate exact accepted spec
        |
        v
semantic planning / workflow execution
```

The admission layer is intentionally **before** Planner semantics. It transports intent, constraints, authority, context, and operational policy into the durable workflow without pretending to be the final Objective/AcceptanceCriteria/Plan.

## Preserve source and interpretation separately

The system shall preserve the User's source input independently from Local-Agent interpretation.

Conceptually:

```yaml
schemaVersion: "1"
requestId: req_123
source:
  kind: user
  rawText: >
    Research durable agent workflow systems for a few days,
    focusing on human interaction.
interpretation:
  profileHint:
    value: deep_research
    provenance: local_interpreted
constraints:
  - value: prioritize human-interaction capability
    provenance: user_explicit
temporal:
  duration:
    value: null
    uncertainty: user said "a few days"
autonomy:
  value: autonomous_until_external_dependency
  provenance: policy_default
```

Core provenance vocabulary should distinguish at least:

```text
user_explicit
local_interpreted
policy_default
planner_derived
system_observed
```

A Local-Agent inference never becomes `user_explicit` merely because the model is confident.

## Thin admission, not duplicate planning

The Local Agent should compile only information needed to safely admit and route a workflow, such as:

```text
raw user source
candidate workflow/profile hint
target/resource references
explicit constraints
explicit authority
operational autonomy policy
time/deadline hints
budget hints
deliverable hints
interaction preferences
material uncertainty markers
```

It should not invent a detailed Plan, acceptance criteria, source strategy, execution topology, or WorkItems.

After admission, Planner/reasoning capabilities produce the semantic workflow artifacts defined by ADR-0016.

## Deterministic preflight

The Orchestrator performs only structural/policy validation, such as:

```text
schema/version validity
profile/capability availability
target/resource resolution
authority compatibility
budget/risk policy
recognized temporal representation
allowed side effects
required fields
unsupported feature detection
confirmation policy
```

The Orchestrator does not decide whether the Local Agent semantically understood the User correctly.

## Structural validation versus semantic alignment

Two different questions exist:

```text
Structural validity:
  Can the deterministic runtime safely accept this request?

Semantic alignment:
  Does this request faithfully represent what the User intended?
```

The Orchestrator owns structural validity.

The Local Agent owns advisory semantic comparison against the conversation, and the User owns confirmation when policy determines that a material interpretation requires explicit confirmation.

## Confirmation policy

Admission confirmation should be proportional rather than mandatory for every workflow.

Initial levels:

```text
AUTO_SUBMIT
LOCAL_CONFIRM
USER_CONFIRM
```

Typical `AUTO_SUBMIT` cases:

```text
read-only query/status
explicit unambiguous target
no side effect
no material inferred constraint
```

`LOCAL_CONFIRM` allows the Reasoning Workflow Client to inspect a preflight result and submit when policy permits and no User authority is required.

`USER_CONFIRM` is required when material Local interpretation affects, for example:

```text
high-impact or irreversible side effects
money/paid access
authentication or privileged access
material deadline/duration interpretation
large resource/cost budget
weakening/changing explicit User constraints
external publication/deployment/merge authority
other policy-defined User-only authority
```

The confirmation policy is code/policy owned. The Local Agent cannot downgrade it.

## AdmissionPreview

Preflight returns a machine-readable preview suitable for the Local Agent to explain naturally.

Conceptually:

```yaml
admissionId: adm_72
draftHash: sha256:...
status: CONFIRMATION_REQUIRED
resolved:
  profile: deep_research
defaults:
  autonomy: autonomous_until_external_dependency
unresolved:
  - temporal.duration
confirmation:
  level: USER_CONFIRM
  reasons:
    - field: temporal.duration
      proposedValue: P3D
      provenance: local_interpreted
      reason: exact duration affects scheduling
```

The User need not see raw JSON. The Local Agent can present only the material interpretation requiring attention.

## Exact activation binding

The runtime must activate the same accepted machine-readable request that was preflighted/confirmed.

Activation therefore binds an immutable admission identity/hash.

```text
preflight Draft H1
-> confirm H1
-> activate H1
```

This must fail closed:

```text
preflight H1
-> confirm H1
-> Local silently changes request to H2
-> activate H2
```

If the request changes materially after preflight, it is re-preflighted under a new identity/version.

## Querying and operating existing workflows

The same natural-language UX applies after startup.

A User should not need to remember slash commands.

Examples:

```text
User: "Workflow yesterday is at what stage?"
Local Agent -> workflow Query(status) -> explain result

User: "Continue it."
Local Agent -> Query state first
  -> if valid recovery boundary, submit Continue/Update
  -> if RUNNING, explain that no continue is needed
  -> if WAITING_EXTERNAL, inspect the PendingAction instead
```

Slash commands remain useful as explicit CLI/debug/operator shortcuts, not as the required product mental model.

## Message classes

The target interaction protocol should support domain-neutral message classes similar to:

```text
Query
  read authoritative workflow state, no mutation

Update
  validated tracked mutation with success/failure result

Signal
  asynchronous external input/event that may trigger later work

Respond
  resolve one persisted PendingAction
```

Exact API/tool names are implementation-specific.

## Unsolicited User changes

If the User changes requirements while a workflow is running, the Local Agent submits the explicit source through a typed Signal/Update rather than directly modifying Plan/graph state.

```text
User directive
  -> durable source input with provenance
  -> deterministic routing
  -> Planner/Reviewer semantic interpretation if needed
  -> typed revised artifacts
  -> deterministic invalidation/reconciliation
```

## Auditability

The system should be able to reconstruct:

```text
what the User actually said
what Local Agent inferred
what policy defaulted
what the User confirmed
what Planner later derived
which exact admission spec created the workflow
```

This is essential for debugging semantic distortion without preserving hidden chain-of-thought.

## Consequences

### Positive

- natural-language UX remains first class;
- deterministic runtime never depends on hidden Local reasoning;
- model inference and User authority remain distinguishable;
- confirmation is targeted to material ambiguity/risk instead of becoming constant friction;
- exact activation prevents confirm-one-request/run-another races;
- the same protocol works for software, research, monitoring, document, and other workflow profiles;
- status/control can be handled conversationally through the same Local Agent.

### Costs

- requires admission schemas, preflight and confirmation policy;
- Local Agent must preserve provenance instead of emitting an opaque final JSON request;
- some ambiguous requests require one extra interaction before activation;
- long-running workflow changes need explicit Signal/Update semantics.

## Invariants

> User natural language is the primary product interface; machine-readable workflow requests are an internal protocol compiled by the Local Agent.

> The exact User source and Local-Agent interpretation remain distinguishable and durable enough for audit/recovery.

> Schema validity does not prove semantic alignment.

> The Orchestrator validates structure/policy deterministically and never claims to know whether a model interpretation matches User intent.

> Material User authority/ambiguity is confirmed according to code-owned policy; the Local Agent cannot downgrade that requirement.

> Workflow activation binds exactly the preflighted/accepted AdmissionSpec identity.

> Admission carries intent into the workflow; Planner still owns Objective, AcceptanceCriteria, Plan, and semantic decomposition.
