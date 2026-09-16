# Software Requirements Specification — Workflow vNext

- **Status:** proposed requirements; not yet implemented normative contract
- **Version:** 0.1
- **Started:** 2026-09-16
- **Related:** [`SRS.md`](./SRS.md), [`WORKFLOW-VNEXT.md`](./WORKFLOW-VNEXT.md), ADR-0009, ADR-0010

## 1. Purpose

This document defines testable requirements for the proposed next workflow architecture: typed artifact communication, shared durable state, capability-based routing, adaptive graph feedback, and convergence-based completion.

The current implemented contract remains [`SRS.md`](./SRS.md) until individual vNext requirements are implemented and promoted.

## 2. Target actors

### User

Owns final human authority and exception decisions.

### Orchestrator

The Local agent acts as the semantic and user-facing orchestrator. It interprets user intent and workflow-visible typed needs, but does not become the durable state machine or silently rewrite reasoning artifacts.

### WorkflowEngine

Owns deterministic schema validation, durable artifact/state persistence, graph transitions, need-to-capability routing policy, exact-input binding, scheduling prerequisites, loop/convergence policy, and authority gates.

### Planner

Owns task decomposition, acceptance criteria, dependency planning, and explicit plan revisions when later evidence invalidates an assumption or reveals missing work.

### Research / Explorer

Answers bounded questions by producing evidence/claim artifacts. It does not decide downstream implementation or planning consequences unless explicitly assigned that decision.

### Worker

The logical implementation/generation role. For the initial vNext design, Worker combines the conceptual Worker and Generator roles to keep the runtime simpler.

The existing account name `chatgpt-writer` may remain as a transport/routing identifier during migration.

### Reviewer

Evaluates exact current artifacts and inputs, persists findings, approves satisfied conditions, and emits typed needs when further research, planning, implementation, or verification is required.

## 3. Functional requirements

### VN-FR-001 — Logical Worker terminology

The target workflow model shall use **Worker** as the logical role name for implementation and artifact generation. Existing account/session identifiers containing `writer` may remain until separately migrated.

### VN-FR-002 — Typed artifact communication

Correctness-bearing inter-agent communication shall use schema-versioned typed artifacts. Free-form Markdown alone shall not determine workflow control transitions.

### VN-FR-003 — Common artifact identity

Every correctness-bearing artifact shall have stable workflow-scoped identity, schema version, producer identity, artifact type, and enough exact context binding for deterministic validation and reuse decisions.

### VN-FR-004 — Structured control authority

When an artifact contains both structured fields and explanatory Markdown, structured fields shall be authoritative for routing and state transitions. Markdown may explain but shall not override structured control meaning.

### VN-FR-005 — Artifact immutability or supersession

Committed correctness-bearing artifacts shall not be silently mutated. Changes shall create a new artifact or explicit superseding version with traceable provenance.

### VN-FR-006 — Shared durable artifact state

The runtime shall persist workflow artifacts independently of transient Website conversation context. The set of active artifacts shall form the workflow's shared information state/blackboard.

### VN-FR-007 — Minimal relevant agent context

An executable agent node should receive only the exact artifact subset required for its task, plus explicitly allowed explanatory context. The runtime shall not require concatenating the full workflow transcript into every downstream prompt.

### VN-FR-008 — Persistent finding lifecycle

Reviewer findings shall be first-class durable artifacts with stable identity and lifecycle state. At minimum the model shall distinguish unresolved/open findings from resolved or superseded findings.

### VN-FR-009 — Finding causality

A finding that creates follow-up work shall reference the need/request artifact it caused. Resolution shall reference the evidence, implementation, plan, or other artifact used to resolve it.

### VN-FR-010 — Needs describe capability, not provider

A model-generated request shall express the semantic capability required, such as `external_evidence`, `implementation_change`, or `plan_change`. It shall not select a concrete provider account as workflow authority.

### VN-FR-011 — No direct agent spawning

Planner, Research, Worker, and Reviewer shall not directly invoke one another. They emit artifacts. Orchestration validates the artifact and schedules the appropriate capability.

### VN-FR-012 — Deterministic need routing

`WorkflowEngine` shall map a validated semantic need to a capability/node type through deterministic policy. Provider/account routing remains a lower-level scheduling concern.

### VN-FR-013 — Persisted request owner

Each routed need shall persist the causal request owner: the node/role/finding whose unresolved decision required the work.

### VN-FR-014 — Default result return rule

A capability result shall return first to the request owner unless the request contains an explicit routing contract that the runtime validates.

Example:

```text
Reviewer/Finding -> external_evidence -> Research -> Evidence -> Reviewer/Finding
```

The runtime shall not automatically interpret the evidence as an instruction to Worker or Planner.

### VN-FR-015 — Shared-state visibility is not broadcast

Persisting a result in shared state shall not imply delivery to every role. Exact graph dependencies and routing decisions shall determine which nodes consume which artifacts.

### VN-FR-016 — Reviewer-driven research loop

A Reviewer shall be able to emit a need for additional Research without forcing immediate Worker remediation. The resulting evidence shall be re-evaluated by the owning Reviewer/finding before further action is selected.

### VN-FR-017 — Reviewer-driven plan revision

A Reviewer shall be able to emit `plan_change` when the implementation satisfies the current plan but the plan or acceptance criteria are incomplete or invalid.

### VN-FR-018 — Plan versioning

Planner changes shall create an explicit plan revision with version identity, superseded version, reason, and affected tasks/criteria/assumptions sufficient for downstream invalidation decisions.

### VN-FR-019 — Worker-driven artifact production

Worker shall be able to consume validated plan/evidence/review artifacts and produce implementation or generated-output artifacts. A separate Generator role is not required for the initial vNext architecture.

### VN-FR-020 — Incremental graph expansion

The durable graph shall support adding deterministic nodes and dependencies in response to validated need artifacts after workflow start.

### VN-FR-021 — Parallel independent needs

When two validated needs are independent by exact dependency analysis, the scheduler may execute them concurrently subject to account/session capacity limits.

### VN-FR-022 — Exact-input preservation

Adaptive graph expansion shall preserve exact-input binding. Dynamic routing shall never make stale artifacts valid for changed correctness-bearing inputs.

### VN-FR-023 — Exact-head review remains mandatory

Review approval and implementation findings concerning repository code shall remain bound to the exact PR head SHA they inspected.

### VN-FR-024 — Plan-sensitive invalidation

If a plan revision changes an acceptance criterion, assumption, or task dependency that a prior finding/approval consumed, the runtime shall invalidate or explicitly re-evaluate that dependent result rather than silently reuse it.

### VN-FR-025 — Evidence-sensitive reuse

A research/evidence artifact may be reused only when its bounded question and required context/freshness/source policy remain compatible with the new request.

### VN-FR-026 — Convergence-based success

The target workflow shall determine successful completion from explicit satisfied conditions rather than merely reaching a fixed semantic round count.

At minimum, successful convergence for coding work shall require:

```text
no unresolved blocking findings
required approvals bound to current exact inputs/head
required tests/checks acceptable
no unresolved critical evidence contradiction
acceptance criteria satisfied
```

### VN-FR-027 — Bounded non-convergence

The runtime shall enforce bounded feedback-loop policy so equivalent research/repair/review cycles cannot continue indefinitely.

### VN-FR-028 — Stagnation detection

The convergence policy should detect at least repeated reopening of the same finding and repeated work that produces no materially new evidence or implementation change.

### VN-FR-029 — Fail-closed loop exhaustion

When a loop budget or stagnation boundary is reached, the workflow shall stop at a durable blocked/action-required state with the unresolved causal artifacts preserved.

### VN-FR-030 — Deduplicate equivalent outstanding needs

Before scheduling new work, the runtime should detect when an equivalent unresolved request already exists and reuse/join that work rather than creating redundant parallel requests.

### VN-FR-031 — Research output does not own downstream policy

Research shall answer its bounded question and produce evidence/claim state. Unless the research task explicitly grants decision authority, Research shall not determine whether Worker, Planner, or another Reviewer must run next.

### VN-FR-032 — Reviewer retains finding authority

When Reviewer creates a finding and asks for supporting capability work, Reviewer retains responsibility for resolving, superseding, or keeping that finding open after the requested result returns.

### VN-FR-033 — Deterministic schema rejection

Malformed, unknown-version, or context-incompatible correctness-bearing artifacts shall fail closed before they trigger graph transitions.

### VN-FR-034 — Provenance-preserving transformation

Any runtime transformation from one artifact schema/version to another shall be explicit, deterministic, versioned, and provenance-preserving. An unrecorded LLM summary shall not serve as a correctness-bearing schema conversion.

### VN-FR-035 — Current pipeline remains migration-compatible

The vNext artifact model may initially execute through the existing mostly sequential workflow policy. Artifact/state correctness shall be separable from when adaptive graph routing is enabled.

## 4. Initial capability routing vocabulary

The initial design should support at least:

| Need | Capability |
| --- | --- |
| `external_evidence` | Research / Explorer |
| `repository_evidence` | Research / Explorer |
| `implementation_change` | Worker |
| `artifact_generation` | Worker |
| `plan_change` | Planner |
| `evidence_verification` | Reviewer or future Verifier |
| `review_current_state` | Reviewer |

This table is semantic policy, not provider/account routing.

## 5. Core target artifacts

Initial artifact families should include:

```text
ObjectiveArtifact
AcceptanceCriteriaArtifact
PlanArtifact
PlanRevisionArtifact
ClaimArtifact
EvidenceArtifact
ContradictionArtifact
FindingArtifact
NeedArtifact
RoutingDecisionArtifact
ImplementationArtifact
ValidationArtifact
ReviewArtifact
ApprovalArtifact
ExternalReceiptArtifact
```

Exact JSON Schema definitions are intentionally deferred to the implementation design step.

## 6. Target end-to-end behavior

A simple task may still follow the shortest path:

```text
Research -> Worker -> Review -> converged
```

A task with missing evidence may evolve as:

```text
Research -> Worker -> Review
                      |
                      v
                external_evidence
                      |
                      v
                  Research
                      |
                      v
                    Review
                      |
                      v
          implementation_change
                      |
                      v
                    Worker
                      |
                      v
                    Review
                      |
                      v
                  converged
```

A planning defect may evolve as:

```text
Review -> plan_change -> Planner -> Worker -> Review
```

All semantic edges are consequences of validated artifacts and routing policy rather than direct agent-to-agent invocation.

## 7. Migration acceptance order

Recommended implementation order:

1. logical Worker terminology in new schema/runtime APIs;
2. common artifact envelope and validation;
3. persistent findings/needs/evidence with exact provenance;
4. request ownership and return routing;
5. Reviewer -> Research -> Reviewer feedback loop;
6. Planner re-entry and plan-version invalidation;
7. generalized adaptive graph expansion;
8. convergence/stagnation policy;
9. specialist roles only when concrete quality data justifies them.

The design intentionally prioritizes stronger coordination semantics over increasing generic team size or fixed round count.
