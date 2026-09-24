# Software Requirements Specification — vNext Domain-Agnostic Durable Workflow Kernel

- **Status:** proposed requirements; not implemented production contract
- **Version:** 0.2
- **Started:** 2026-09-16
- **Updated:** 2026-09-16 after core-SRS harmonization
- **Parent:** [`SRS-VNEXT.md`](./SRS-VNEXT.md)
- **Decision:** [`ADR/0019-domain-agnostic-durable-workflow-kernel.md`](./adr/0019-domain-agnostic-durable-workflow-kernel.md)

## 1. Purpose

This module defines the generic durable workflow kernel beneath software, deep-research, monitoring, document/report, and future workflow profiles.

The kernel shall not require repository/PR/Git/code-review concepts for non-software workflows.

## 2. Core properties

### WK-FR-001 — Domain-agnostic core

The core runtime shall remain independent of any one application domain.

### WK-FR-002 — Deterministic control plane

Authoritative workflow transitions shall be code/policy owned and shall not depend on LLM reasoning inside the Orchestrator Runtime.

### WK-FR-003 — Artifact-based correctness state

Correctness-bearing semantic communication shall use durable typed Artifacts/Assessments rather than transient conversation transcripts.

### WK-FR-004 — Recoverable execution

Workflow correctness/recovery shall survive Local Agent, Orchestrator process, provider/session, transport, and partial execution failures according to explicit durable-state policy.

### WK-FR-005 — Autonomous by default

The runtime shall continue all valid autonomous work without requiring a continuously connected Local Agent/User.

### WK-FR-006 — Capability-driven execution

Executable typed Needs shall resolve through versioned capabilities rather than hard-coded universal agent roles.

### WK-FR-007 — Workflow profiles

Domain-specific behavior shall be composed through versioned code/configuration-owned workflow profiles and capability/Artifact/Need schemas.

## 3. Workstream, WorkflowRun, and generic object set

### WK-FR-008 — Workstream versus WorkflowRun

The kernel shall distinguish:

```text
Workstream
  long-lived project/continuity grouping

WorkflowRun
  one bounded admitted execution lifecycle
```

A Workstream shall not replace the WorkflowRun state machine.

### WK-FR-009 — Terminal WorkflowRun integrity

A terminal WorkflowRun shall remain terminal. Post-terminal follow-up shall create a continuation WorkflowRun with explicit lineage rather than reopening the completed run.

### WK-FR-010 — Generic object set

The kernel shall support domain-neutral concepts equivalent to:

```text
Workstream
WorkflowAdmissionSpec
WorkflowRun
Objective
Constraint
Criterion
Plan
Finding
Need
WorkItem
InputBundle
Artifact
Assessment
Receipt
PendingAction
Timer
ExternalEvent
Budget
AuthorityPolicy
ConvergencePolicy
```

### WK-FR-011 — Domain extensions

Profiles may introduce specialized Need/Artifact/Receipt/Assessment types without changing generic control semantics.

### WK-FR-012 — No mandatory Worker/Reviewer role

The kernel shall not require Worker, Reviewer, PR, Git, or CI concepts in every workflow.

## 4. Need materialization and awaitables

### WK-FR-013 — Need is semantic demand

A Need shall express required semantic capability/information/external input but shall not itself carry execution or response authority.

### WK-FR-014 — Need may materialize as WorkItem or PendingAction

The deterministic runtime shall materialize a validated Need according to typed semantics/policy:

```text
internal executable capability -> WorkItem
external input/authority       -> PendingAction
```

### WK-FR-015 — Multiple durable awaitable kinds

Workflow dependencies shall be able to wait on at least:

```text
WorkItem completion
PendingAction resolution
Timer firing
ExternalEvent matching
```

### WK-FR-016 — Awaiting is not failure

Durable waiting for time, external input, or external event shall not be classified as execution failure merely because no process is actively running.

### WK-FR-017 — Scoped dependency blocking

An unresolved awaitable shall block only dependent paths unless deterministic policy establishes a workflow-global gate.

### WK-FR-018 — Independent work continues

Independent ready work shall continue while unrelated Timer/PendingAction/ExternalEvent dependencies remain unresolved.

### WK-FR-019 — Durable timers

Timers shall survive Orchestrator/client restart and trigger readiness through persisted time/state rather than in-memory sleeps alone.

### WK-FR-020 — External-event correlation

External events shall bind to explicit WorkflowRun/event identities or matching contracts sufficient to prevent ambiguous cross-run delivery.

## 5. Capability and profile model

### WK-FR-021 — Versioned capability registry

Capabilities shall declare accepted Need types, produced Artifact/Receipt types, side-effect class, required authority, input/output schema, executor compatibility, and version.

### WK-FR-022 — Provider topology below capability semantics

Provider/model/account/session routing shall remain below semantic capability selection.

### WK-FR-023 — Versioned profiles

Workflow profiles shall have explicit version identity and may define:

```text
admission defaults/schema
capability set
Artifact/Need schemas
side-effect/authority policy
budget defaults
interaction policy
convergence policy
status projections
domain integrations
```

### WK-FR-024 — Software as profile

Software-specific concepts such as repository targets, Git mutation, PR state, exact head, CI health, code review, and merge authority shall be profile extensions rather than core-kernel requirements.

### WK-FR-025 — Research as profile

A deep-research profile shall be representable using generic kernel objects plus research-specific capabilities/Artifacts/Assessments, without requiring Git, PR, or repository mutation.

### WK-FR-026 — Planning capability availability

Profiles that require semantic Objective/Criteria/Plan derivation shall expose an authorized planning capability or equivalent reasoning contract rather than assuming Planner behavior exists implicitly in the kernel.

## 6. Long-running workflow requirements

### WK-FR-027 — Multi-day lifetime

The runtime design shall support WorkflowRuns lasting hours, days, or longer without relying on a continuously alive conversational client.

### WK-FR-028 — Long external waits

A WorkflowRun may remain durably waiting for User response, Timer, or ExternalEvent for extended periods without losing causal state.

### WK-FR-029 — Reattachment

An authorized new Local Agent/CLI/UI instance shall be able to inspect and operate a WorkflowRun from durable state after prior clients disappear.

### WK-FR-030 — Definition version pinning

Long-lived WorkflowRun state shall bind relevant profile/policy/capability/schema/projection/agent-definition versions needed for compatible recovery.

### WK-FR-031 — No silent incompatible upgrade

A WorkflowRun shall not silently resume using an incompatible newer definition simply because runtime code was deployed.

### WK-FR-032 — Explicit migration

Cross-version migration shall be explicit, versioned, and provenance-preserving.

## 7. Artifact and lineage requirements

### WK-FR-033 — Typed artifacts

Correctness-bearing Artifacts shall be schema-versioned, producer-attributed, persisted, exact-context/input bound where required, and immutable or explicitly superseded.

### WK-FR-034 — Lineage

Artifacts shall support explicit causal/dependency relationships sufficient for provenance, reuse, continuation, and invalidation.

### WK-FR-035 — Sparse context

Capability executions shall receive only exact required InputBundle context rather than the entire WorkflowRun history by default.

### WK-FR-036 — Causal invalidation

Changed correctness-bearing inputs shall invalidate only explicit dependents according to lineage/exact-input policy rather than forcing whole-run replay.

### WK-FR-037 — Artifact reuse

Compatible completed Artifacts may be reused when exact semantic/context/freshness/equivalence/schema/profile policy allows.

### WK-FR-038 — Retention-safe continuation import

When a continuation child run depends on selected correctness-bearing Artifacts from a source run, the child shall persist an exact imported snapshot/representation sufficient to remain reproducible after source payload retention cleanup, while preserving source run/artifact/hash lineage.

The original Artifact remains historically owned by the source run.

## 8. Recovery and execution safety

### WK-FR-039 — Durable execution identity

Executions shall have durable identity sufficient for attempt tracking, ownership/lease, fencing, and stale-result rejection.

### WK-FR-040 — Fencing stale attempts

A superseded/retried execution shall not be able to commit authoritative output after losing ownership.

### WK-FR-041 — Structured failure classes

Failure/recovery selection shall use structured categories rather than free-form executor prose alone.

### WK-FR-042 — Minimal recovery scope

Recovery should target the smallest failed/orphaned dependency/work unit compatible with correctness rather than globally replaying completed independent work.

### WK-FR-043 — Side-effect reconciliation

When external mutation outcome is uncertain, runtime shall reconcile observed external state before blind retry where a deterministic observation contract exists.

### WK-FR-044 — Exact-input retry

Retry shall preserve exact correctness-bearing InputBundle identity, causal ownership, authority, side-effect/idempotency policy, and fencing unless explicit replacement/new WorkItem policy applies.

## 9. Efficiency requirements

### WK-FR-045 — Deterministic checks before model calls

The runtime shall prefer deterministic validation/routing/equivalence checks before invoking reasoning capabilities solely for mechanically decidable work.

### WK-FR-046 — Parallel independent work

Independent WorkItems shall be schedulable concurrently subject to resource/capacity/side-effect policy.

### WK-FR-047 — Deduplicate compatible work

Equivalent compatible outstanding work should be joined/reused under deterministic equivalence rules; natural-language similarity alone is insufficient.

### WK-FR-048 — Event/timer waiting over busy polling

Where integrations permit, durable Timers/ExternalEvents should be preferred over high-frequency model/tool polling for long waits.

### WK-FR-049 — Resource budgets

Profiles/policies shall be able to limit concurrency, WorkItem count, model/tool usage, token/cost, wall-clock duration, or other resource dimensions independently of semantic success.

### WK-FR-050 — Bounded loops

Repeated research/repair/review/refresh loops shall have explicit stagnation and resource guards.

## 10. Status and observability

### WK-FR-051 — Generic machine status

Core status shall expose domain-neutral machine-readable state including at least:

```text
WorkflowRun lifecycle
autonomous progress availability
ready/running/recovering/completed work
pending actions
Timers/Event waits
blocking Findings/dependencies
budget usage
latest significant Artifacts
terminal/convergence state
```

### WK-FR-052 — Domain status extensions

Profiles may add projections such as PR/head/CI or research coverage/source freshness without changing core lifecycle semantics.

### WK-FR-053 — Local Agent presentation

The Local Agent may convert machine status into natural-language answers without making its explanation authoritative workflow state.

### WK-FR-054 — Causal traceability

The runtime shall expose enough structured lineage/status to explain causal paths from User/admission source through semantic Need, WorkItem/PendingAction, execution/input, result, assessment, and convergence decision.

## 11. Assessment and convergence

### WK-FR-055 — CriterionAssessment is first-class

Semantic criterion satisfaction shall be represented by typed current Assessments rather than Orchestrator interpretation of prose.

### WK-FR-056 — Exact assessment subject

An Assessment used for convergence shall bind the exact criterion/version and correctness-bearing subject/input/evidence identity it evaluated.

### WK-FR-057 — Profile-defined convergence

Success shall be determined from explicit profile/policy predicates over typed current state rather than one hard-coded phase sequence.

### WK-FR-058 — Generic convergence ingredients

Profiles may compose conditions including:

```text
required criteria have current acceptable Assessments
required deliverable Artifacts exist
blocking Findings resolved
required deterministic validations/Receipts acceptable
required authority gates resolved
critical contradictions absent
required awaitables completed/resolved
```

### WK-FR-059 — Limits are not success

Timeout/budget/max-round/stagnation exhaustion shall never by itself mean semantic success.

### WK-FR-060 — Durable blocked/action-required state

If progress cannot continue safely, unresolved causal Artifacts/dependencies shall remain durable for later inspection/recovery/interaction rather than being reported successful.

## 12. Migration compatibility

### WK-FR-061 — v3 remains supported during migration

Existing `WorkflowJob` v3 persisted state and current production behavior shall remain supported until an explicit tested/versioned migration or retirement decision.

### WK-FR-062 — Parallel vNext state

vNext WorkflowRun/admission/artifact/work-item/action/workstream state shall initially coexist with v3 storage rather than replacing the v3 persisted schema in place.

### WK-FR-063 — Adapt existing executors before duplicating

Where suitable, vNext capability adapters should reuse current Team/Writer/provider-native research executors and current recovery/fencing mechanics before introducing parallel duplicate implementations.

## 13. Example profile mappings

### Software profile

```text
planning
repository research
implementation
git mutation
code review/assessment
CI verification
exact-head authority
```

### Deep research profile

```text
planning
web research
source acquisition
evidence extraction
research synthesis
citation verification/assessment
report generation
Timers for multi-day rounds
PendingActions for paid/auth access
```

### Monitoring profile

```text
periodic Timer
observation
condition evaluation
ExternalEvent ingestion
notification/report Artifact
```

## 14. Non-goals

This kernel does not imply:

- arbitrary user-authored executable DAGs;
- mandatory Git/PR usage;
- mandatory Worker/Reviewer agents;
- one universal graph vocabulary;
- autonomous expansion of side-effect authority;
- replay of hidden chain-of-thought for recovery;
- one universal workflow profile for all domains;
- in-place replacement of `WorkflowJob` v3 before migration policy exists.

The target is:

> one deterministic, Artifact/Assessment-based, capability-driven, durable/recoverable orchestration kernel with natural-language access through a reasoning Local Agent and profile-specific semantics above it.
