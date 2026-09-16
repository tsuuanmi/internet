# Software Requirements Specification — vNext Continuation and User Feedback

- **Status:** proposed requirements; not implemented production contract
- **Version:** 0.1
- **Started:** 2026-09-16
- **Parent:** [`SRS-VNEXT.md`](./SRS-VNEXT.md)
- **Decision:** [`ADR/0020-workstream-run-continuation.md`](./ADR/0020-workstream-run-continuation.md)

## 1. Purpose

This module defines how a natural-language User experience can remain continuous across reviewed deliverables, local testing, feedback, completed research, and later implementation without weakening durable WorkflowRun lifecycle semantics.

## 2. Workstream and WorkflowRun

### CT-FR-001 — First-class Workstream identity

The runtime/client model shall support a durable `Workstream` identity for grouping related WorkflowRuns and artifacts under one User-level project/initiative.

### CT-FR-002 — WorkflowRun remains bounded

Each WorkflowRun shall retain its own admission identity, profile, policy/version bindings, lifecycle, artifacts, budgets, external interactions, and convergence state.

### CT-FR-003 — Workstream is not execution authority

A Workstream shall not replace or directly mutate a WorkflowRun state machine.

### CT-FR-004 — Terminal runs remain terminal

A terminal WorkflowRun shall not transition back to RUNNING solely because the User asks for later follow-up work.

### CT-FR-005 — Continuation run for post-terminal follow-up

Follow-up work after terminal completion shall create a new WorkflowRun with explicit continuation lineage.

### CT-FR-006 — Continuation lineage

A continuation admission shall be able to reference:

```text
source Workstream
continuesFrom WorkflowRun
selected input Artifact refs
new User source statement
new target/profile hints
```

## 3. Delivery checkpoint

### CT-FR-007 — Deliverable does not imply completion

Producing a User-usable artifact shall not automatically mark the WorkflowRun completed.

### CT-FR-008 — First-class DeliveryArtifact/checkpoint

The runtime shall support a durable delivery checkpoint/artifact for outputs requiring User evaluation or later authority before terminal convergence.

### CT-FR-009 — Delivery exact identity

A DeliveryArtifact shall bind exact deliverable identity sufficient for stale-feedback/approval checks.

For software this should include exact PR/head or equivalent immutable version identity.

### CT-FR-010 — Delivery may create PendingAction

A profile may create a PendingAction associated with a DeliveryArtifact for User validation, feedback, approval, merge, or another external decision.

### CT-FR-011 — New delivery supersedes old exact delivery

When the underlying deliverable changes materially, the previous exact DeliveryArtifact shall be superseded and stale authority/feedback rules shall apply.

## 4. Active-run feedback

### CT-FR-012 — Feedback can resume same non-terminal run

User feedback targeting a non-terminal active/waiting WorkflowRun may resume that same run.

### CT-FR-013 — Feedback uses typed external input

Local Agent shall submit feedback through the typed interaction protocol rather than editing internal workflow state directly.

### CT-FR-014 — Preserve raw User feedback

The feedback envelope shall preserve the User's raw statement/content separately from Local-Agent interpretations.

### CT-FR-015 — Feedback provenance

Feedback shall carry explicit provenance such as `user_explicit`, `local_agent`, or another allowed source class.

### CT-FR-016 — Feedback target binding

When known, feedback shall bind its intended WorkflowRun and relevant DeliveryArtifact/version/head.

### CT-FR-017 — Stale feedback handling

If feedback was explicitly tied to a superseded exact deliverable and cannot safely apply to the current deliverable, the runtime shall reject/fence it or route a semantic reassessment rather than silently treating it as current.

### CT-FR-018 — Orchestrator does not interpret prose

The deterministic Orchestrator shall not decide semantic meaning of free-form User feedback.

### CT-FR-019 — Semantic feedback evaluation

Planner/Reviewer/another registered reasoning capability shall convert feedback into typed consequences such as:

```text
new evidence
Finding
requirements_change
plan_change
implementation_change
informational/no-change
```

### CT-FR-020 — Typed consequence drives invalidation

Only typed accepted semantic consequences shall drive deterministic dependency invalidation or new WorkItem creation.

## 5. Software local-test loop

### CT-FR-021 — Reviewed PR can become User-test delivery

The software profile shall be able to expose a reviewed/validated PR as a DeliveryArtifact without terminally completing the run.

### CT-FR-022 — Local test instructions may accompany delivery

A software DeliveryArtifact may include User-facing local-test/run instructions or references generated from typed artifacts.

### CT-FR-023 — User test evidence is an artifact/input

User-provided local test observations, logs, measurements, screenshots, or data may be persisted as typed external artifacts/attachments with provenance.

### CT-FR-024 — Feedback-triggered PR revision

When accepted feedback requires implementation change, the same non-terminal software run may produce new Worker mutation WorkItems on the same workflow PR according to exact-head mutation policy.

### CT-FR-025 — Fresh exact-head review after revision

Any PR revision resulting from User feedback shall require fresh exact-head review/validation as specified by the software profile.

### CT-FR-026 — Old merge authorization cannot carry forward

Merge authority for an older PR head shall not authorize a later head.

## 6. Research-to-implementation continuation

### CT-FR-027 — Research completion may be terminal

A research WorkflowRun may become terminal when its research-specific convergence conditions and required ReportArtifact are satisfied.

### CT-FR-028 — Report does not mutate into implementation state

Starting software implementation from a completed research report shall not reopen or repurpose the completed research run.

### CT-FR-029 — New software continuation run

Implementation shall normally create a new software-profile WorkflowRun in the same Workstream.

### CT-FR-030 — Research artifacts remain source-owned

Report/Evidence artifacts remain owned by their producing research run and are consumed by explicit reference in the implementation continuation.

### CT-FR-031 — Cross-run compatibility validation

Imported artifacts shall pass compatibility/freshness/schema/policy checks required by the receiving profile.

### CT-FR-032 — Planner performs semantic translation

Research findings/report shall not automatically become a software implementation Plan.

Planner shall derive software-specific Objective/AcceptanceCriteria/Plan/Needs from the new User instruction plus selected imported research artifacts.

### CT-FR-033 — Orchestrator only validates/routes translation products

The Orchestrator shall not semantically transform research report prose into implementation requirements.

## 7. Natural-language continuation and target resolution

### CT-FR-034 — User need not supply IDs in normal use

The normal User experience shall allow natural-language references such as:

```text
"implement that report"
"continue the feature"
"the PR I tested"
"use the updated numbers"
```

without requiring explicit WorkflowRun/Artifact IDs.

### CT-FR-035 — Local Agent resolves conversational referents

Local Agent may use conversation/workstream context plus workflow Queries to propose typed target identities.

### CT-FR-036 — Deterministic runtime requires exact target

Before mutation, the Orchestrator shall receive explicit typed Workstream/WorkflowRun/Artifact references; it shall not resolve conversational prose itself.

### CT-FR-037 — Ambiguous material target requires confirmation

If multiple plausible targets exist and choosing incorrectly could materially affect workflow state, Local Agent shall ask User confirmation or use an equivalent explicit confirmation path.

## 8. Cross-run lineage and auditability

### CT-FR-038 — Cross-run lineage relations

The artifact model shall support explicit cross-run relationships such as:

```text
continues_from
derived_from
consumes
supersedes
validates
```

### CT-FR-039 — Completed history immutable

Continuation shall never silently rewrite the semantic history/artifacts of a completed source run.

### CT-FR-040 — Explainable project history

The system shall be able to explain a workstream path such as:

```text
User idea
 -> ResearchRun R1
 -> Report RP1
 -> SoftwareRun S1 consumes RP1
 -> PR Delivery D1
 -> UserFeedback U3
 -> revised Delivery D2
 -> merge receipt
```

without reconstructing hidden model reasoning.

## 9. Workstream status

### CT-FR-041 — Workstream status is projection

A Workstream may expose a User-facing status summary derived from its member WorkflowRuns and significant artifacts.

### CT-FR-042 — Workstream status does not override run state

The projected Workstream status shall not replace authoritative per-run lifecycle state.

### CT-FR-043 — Multiple active runs permitted by policy

A Workstream may contain multiple active WorkflowRuns when policy allows, provided their targets/side effects/dependencies are safely coordinated.

## 10. Acceptance scenarios

### Scenario A — feature to PR to local feedback

1. User requests feature in natural language.
2. Local Agent compiles/adopts software run.
3. Workflow autonomously researches/plans/implements/reviews.
4. PR head H7 becomes DeliveryArtifact D1.
5. User tests locally and reports incorrect rounding.
6. Local Agent submits UserFeedback targeting D1/H7.
7. Reviewer/Planner emits implementation change.
8. Worker produces H8.
9. H7 reviews/merge authority are stale.
10. H8 receives fresh review and new DeliveryArtifact D2.
11. User approves merge for H8.
12. Software run completes after merge policy succeeds.

### Scenario B — research then implementation

1. User requests deep research.
2. Research run converges with Report RP1 and completes.
3. Later User says `implement this in repository Y`.
4. Local Agent creates continuation admission under same Workstream referencing RP1.
5. New software run starts.
6. Planner derives software Objective/Criteria/Plan using RP1 and new User request.
7. Implementation/review produces PR delivery.
8. User tests locally and adds updated measurements.
9. Same active software run resumes, incorporating new typed evidence.

### Scenario C — ambiguous continuation target

1. Workstream contains two reports RP1/RP2 and two active software runs.
2. User says `update that one with these numbers`.
3. Local Agent cannot safely resolve one target.
4. It asks User to identify/confirm the intended deliverable.
5. Only after confirmation does it submit typed feedback to Orchestrator.

## 11. Non-goals

This module does not make Workstream a giant mutable workflow.

It does not require every delivered artifact to keep a run open indefinitely.

It does not permit terminal WorkflowRuns to be reopened for convenience.

It does not allow Local Agent to mutate durable state based only on conversational guesses when target identity is materially ambiguous.
