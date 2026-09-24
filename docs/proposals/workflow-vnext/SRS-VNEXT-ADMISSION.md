# Software Requirements Specification — vNext Workflow Admission

- **Status:** proposed requirements; not implemented production contract
- **Version:** 0.1
- **Started:** 2026-09-16
- **Parent:** [`SRS-VNEXT.md`](./SRS-VNEXT.md)
- **Decision:** [`ADR/0018-workflow-admission-protocol.md`](./adr/0018-workflow-admission-protocol.md)

## 1. Purpose

This module defines how a reasoning-capable Local Agent converts natural-language User intent into a machine-readable request that a deterministic Orchestrator can safely validate and activate.

The admission layer transports intent into the workflow. It does not replace Planner-owned Objective, AcceptanceCriteria, Plan, or Need semantics.

## 2. Requirements

### WA-FR-001 — Natural-language primary interface

Normal product use shall allow the User to express workflow requests in natural language through the Local Agent without knowing workflow commands or schemas.

### WA-FR-002 — Local Agent is the intake compiler

The Local Agent shall compile conversational input into a versioned `WorkflowAdmissionDraft` or equivalent typed admission object.

### WA-FR-003 — Preserve raw User source

The exact User source request shall be preserved separately from Local-Agent interpretation.

### WA-FR-004 — Field provenance

Material interpreted/defaulted fields shall retain provenance sufficient to distinguish at least:

```text
user_explicit
local_interpreted
policy_default
planner_derived
system_observed
```

### WA-FR-005 — No provenance promotion by confidence

A Local-Agent inference shall not be recorded as `user_explicit` merely because the model is confident.

### WA-FR-006 — Thin admission

Admission shall carry operationally necessary intent, targets, constraints, authority, temporal/budget hints, deliverable hints, autonomy policy, and uncertainty markers without inventing detailed semantic plans or runtime topology.

### WA-FR-007 — Planner remains semantic owner

Objective interpretation, acceptance criteria, semantic decomposition, and detailed planning shall remain Planner/reasoning-capability responsibilities after admission.

### WA-FR-008 — Deterministic preflight

The Orchestrator shall preflight admission using deterministic schema/policy checks only.

### WA-FR-009 — Preflight scope

Preflight may validate at least:

```text
schema/version
target/resource resolution
profile/capability availability
side-effect compatibility
authority compatibility
budget/risk policy
temporal representation
required fields
unsupported features
confirmation policy
```

### WA-FR-010 — No semantic truth claim by preflight

Successful preflight shall mean structurally/policy valid, not proof that Local Agent correctly understood the User.

### WA-FR-011 — AdmissionPreview

Preflight shall return a machine-readable preview identifying resolved values, defaults, unresolved/material ambiguities, warnings, and required confirmation level.

### WA-FR-012 — Confirmation levels

Policy shall support at least:

```text
AUTO_SUBMIT
LOCAL_CONFIRM
USER_CONFIRM
```

### WA-FR-013 — Confirmation policy is runtime-owned

The Local Agent shall not downgrade a runtime-required `USER_CONFIRM` to Local-only or automatic confirmation.

### WA-FR-014 — Material assumptions surfaced

When a Local interpretation materially changes execution scope, authority, duration/deadline, cost/budget, irreversible effects, authentication, publication, or explicit User constraints, confirmation policy shall be able to surface that assumption before activation.

### WA-FR-015 — User-facing confirmation is natural language

The Local Agent may present only the material interpretations requiring confirmation rather than exposing raw protocol JSON to the User.

### WA-FR-016 — Exact accepted admission identity

A preflighted admission shall have immutable identity/hash/version sufficient to bind confirmation and activation.

### WA-FR-017 — Activate exactly accepted spec

The Orchestrator shall activate exactly the accepted/preflighted AdmissionSpec identity.

### WA-FR-018 — Changed request requires new preflight

A material change after preflight/confirmation shall create a new admission identity and require re-preflight according to policy.

### WA-FR-019 — Admission auditability

Durable records shall permit reconstruction of:

```text
User source
Local interpretation
policy defaults
confirmation response/provenance
accepted AdmissionSpec
Planner-derived semantic artifacts
```

### WA-FR-020 — Hidden reasoning not required

Admission audit/recovery shall not require Local Agent chain-of-thought.

### WA-FR-021 — Status/control natural-language UX

The Local Agent shall be able to translate natural-language operational requests into workflow Query/Update/Signal/Respond operations.

### WA-FR-022 — Query before ambiguous mutation

For context-sensitive commands such as "continue", the Local Agent should query authoritative state before selecting a mutating operation.

### WA-FR-023 — Running workflow no-op safety

If a User asks to continue an already-running workflow, the Local Agent shall be able to report current progress without issuing an unnecessary recovery command.

### WA-FR-024 — Waiting workflow interaction routing

If a User asks to continue while the workflow is waiting on a PendingAction, the Local Agent shall inspect/present/respond to that action rather than treating generic `continue` as the semantic answer.

### WA-FR-025 — Slash commands are optional UI

Slash commands may remain supported as CLI/debug/operator shortcuts but shall not be required for normal product interaction.

## 3. Conceptual admission flow

```text
User natural language
  -> Local Agent compile
  -> WorkflowAdmissionDraft
  -> deterministic preflight
  -> AdmissionPreview
  -> AUTO_SUBMIT / LOCAL_CONFIRM / USER_CONFIRM
  -> AcceptedAdmissionSpec(hash/version)
  -> activate
  -> Planner semantic interpretation
```

## 4. Example

User:

```text
Research durable agent frameworks for a few days and focus on human interaction.
```

Possible draft:

```yaml
source:
  rawText: ...
interpretation:
  profileHint:
    value: deep_research
    provenance: local_interpreted
constraints:
  - value: focus on human interaction
    provenance: user_explicit
temporal:
  duration:
    value: null
    uncertainty: "a few days"
autonomy:
  value: autonomous_until_external_dependency
  provenance: policy_default
```

The deterministic runtime may validate `deep_research` availability and mark duration as materially unresolved. Local Agent can then ask a narrow natural-language clarification rather than exposing the schema.

## 5. Non-goals

Admission is not:

- detailed planning;
- task graph authoring;
- acceptance-criteria synthesis by runtime;
- proof that a model interpretation is semantically correct;
- a replacement for later requirements-change interaction.

The intended boundary is:

> Local Agent converts language into a provenance-preserving machine request; Orchestrator validates/admits it deterministically; Planner derives workflow semantics afterward.
