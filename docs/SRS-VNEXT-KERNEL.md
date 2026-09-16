# Software Requirements Specification — vNext Domain-Agnostic Durable Workflow Kernel

- **Status:** proposed requirements; not implemented production contract
- **Version:** 0.1
- **Started:** 2026-09-16
- **Parent:** [`SRS-VNEXT.md`](./SRS-VNEXT.md)
- **Decision:** [`ADR/0019-domain-agnostic-durable-workflow-kernel.md`](./ADR/0019-domain-agnostic-durable-workflow-kernel.md)

## 1. Purpose

This module defines the generic durable workflow kernel beneath software, deep-research, monitoring, document/report, and future workflow profiles.

The kernel shall not require repository/PR/Git/code-review concepts for non-software workflows.

## 2. Core properties

### WK-FR-001 — Domain-agnostic core

The core runtime shall remain independent of any one application domain.

### WK-FR-002 — Deterministic control plane

Authoritative workflow transitions shall be code/policy owned and shall not depend on LLM reasoning inside the Orchestrator.

### WK-FR-003 — Artifact-based correctness state

Correctness-bearing semantic communication shall use durable typed artifacts rather than transient conversation transcripts.

### WK-FR-004 — Recoverable execution

Workflow correctness/recovery shall survive Local Agent, Orchestrator process, provider/session, transport, and partial execution failures according to explicit durable-state policy.

### WK-FR-005 — Autonomous by default

The runtime shall continue all valid autonomous work without requiring a continuously connected Local Agent/User.

### WK-FR-006 — Capability-driven execution

Typed Needs shall resolve through versioned capabilities rather than hard-coded universal agent roles.

### WK-FR-007 — Workflow profiles

Domain-specific behavior shall be composed through code/configuration-owned workflow profiles and capability/artifact schemas.

## 3. Generic runtime objects

### WK-FR-008 — Generic object set

The kernel shall support domain-neutral concepts equivalent to:

```text
Workflow
WorkflowAdmissionSpec
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

### WK-FR-009 — Domain extensions

Profiles may introduce specialized Need/Artifact/Receipt types without changing generic control semantics.

### WK-FR-010 — No mandatory Worker/Reviewer role

The kernel shall not require Worker, Reviewer, PR, Git, or CI concepts in every workflow.

## 4. Awaitables and dependencies

### WK-FR-011 — Multiple durable awaitable kinds

Workflow dependencies shall be able to wait on at least:

```text
WorkItem completion
PendingAction resolution
Timer firing
ExternalEvent matching
```

### WK-FR-012 — Awaiting is not failure

Durable waiting for time, external input, or external event shall not be classified as execution failure merely because no process is actively running.

### WK-FR-013 — Scoped dependency blocking

An unresolved awaitable shall block only dependent paths unless deterministic policy establishes a workflow-global gate.

### WK-FR-014 — Independent work continues

Independent ready work shall continue while unrelated Timer/PendingAction/ExternalEvent dependencies remain unresolved.

### WK-FR-015 — Durable timers

Timers shall survive Orchestrator/client restart and trigger readiness through persisted time/state rather than in-memory sleeps alone.

### WK-FR-016 — External-event correlation

External events shall bind to explicit workflow/event identities or matching contracts sufficient to prevent ambiguous cross-workflow delivery.

## 5. Capability and profile model

### WK-FR-017 — Versioned capability registry

Capabilities shall declare accepted Need types, produced Artifact/Receipt types, side-effect class, required authority, input/output schema, executor compatibility, and version.

### WK-FR-018 — Provider topology below capability semantics

Provider/model/account/session routing shall remain below semantic capability selection.

### WK-FR-019 — Versioned profiles

Workflow profiles shall have explicit version identity and may define:

```text
admission defaults/schema
capability set
artifact/Need schemas
side-effect/authority policy
budget defaults
interaction policy
convergence policy
status projections
domain integrations
```

### WK-FR-020 — Software as profile

Software-specific concepts such as repository targets, Git mutation, PR state, exact head, CI health, and merge authority shall be profile extensions rather than core-kernel requirements.

### WK-FR-021 — Research as profile

A deep-research profile shall be representable using generic kernel objects plus research-specific capabilities/artifacts, without requiring Git or repository mutation.

## 6. Long-running workflow requirements

### WK-FR-022 — Multi-day lifetime

The runtime design shall support workflows lasting hours, days, or longer without relying on a continuously alive conversational client.

### WK-FR-023 — Long external waits

A workflow may remain durably waiting for User response, Timer, or external event for extended periods without losing causal state.

### WK-FR-024 — Reattachment

An authorized new Local Agent/CLI/UI instance shall be able to inspect and operate a workflow from durable state after prior clients disappear.

### WK-FR-025 — Definition version pinning

Long-lived workflow state shall bind relevant profile/policy/capability/schema/agent-definition versions needed for compatible recovery.

### WK-FR-026 — No silent incompatible upgrade

A workflow shall not silently resume using an incompatible newer definition simply because runtime code was deployed.

### WK-FR-027 — Explicit migration

Cross-version migration shall be explicit, versioned, and provenance-preserving.

## 7. Artifact and lineage requirements

### WK-FR-028 — Typed artifacts

Correctness-bearing artifacts shall be schema-versioned, producer-attributed, persisted, exact-context/input bound where required, and immutable or explicitly superseded.

### WK-FR-029 — Lineage

Artifacts shall support explicit causal/dependency relationships sufficient for provenance, reuse, and invalidation.

### WK-FR-030 — Sparse context

Capability executions shall receive only exact required InputBundle context rather than the entire workflow history by default.

### WK-FR-031 — Causal invalidation

Changed correctness-bearing inputs shall invalidate only explicit dependents according to lineage/exact-input policy rather than forcing whole-workflow replay.

### WK-FR-032 — Artifact reuse

Compatible completed artifacts may be reused when exact semantic/context/freshness/equivalence policy allows.

## 8. Recovery and execution safety

### WK-FR-033 — Durable execution identity

Executions shall have durable identity sufficient for attempt tracking, fencing, and stale-result rejection.

### WK-FR-034 — Fencing stale attempts

A superseded/retried execution shall not be able to commit authoritative output after losing ownership.

### WK-FR-035 — Structured failure classes

Failure/recovery selection shall use structured categories rather than free-form agent prose alone.

### WK-FR-036 — Minimal recovery scope

Recovery should target the smallest failed/orphaned dependency/work unit compatible with correctness rather than globally replaying completed independent work.

### WK-FR-037 — Side-effect reconciliation

When external mutation outcome is uncertain, runtime shall reconcile observed external state before blind retry where a deterministic observation contract exists.

## 9. Efficiency requirements

### WK-FR-038 — Deterministic checks before model calls

The runtime shall prefer deterministic validation/routing/equivalence checks before invoking reasoning capabilities solely for mechanically decidable work.

### WK-FR-039 — Parallel independent work

Independent WorkItems shall be schedulable concurrently subject to resource/capacity policy.

### WK-FR-040 — Deduplicate compatible work

Equivalent compatible outstanding work should be joined/reused under deterministic equivalence rules.

### WK-FR-041 — Event/timer waiting over busy polling

Where integrations permit, durable timers/events should be preferred over high-frequency model/tool polling for long waits.

### WK-FR-042 — Resource budgets

Profiles/policies shall be able to limit concurrency, work-item count, model/tool usage, token/cost, wall-clock duration, or other resource dimensions independently of semantic success.

### WK-FR-043 — Bounded loops

Repeated research/repair/review/refresh loops shall have explicit stagnation and resource guards.

## 10. Status and observability

### WK-FR-044 — Generic machine status

Core status shall expose domain-neutral machine-readable state including at least:

```text
lifecycle
autonomous progress availability
ready/running/recovering/completed work
pending actions
timers/event waits
blocking findings/dependencies
budget usage
latest significant artifacts
terminal/convergence state
```

### WK-FR-045 — Domain status extensions

Profiles may add projections such as PR/head/CI or research coverage/source freshness without changing core lifecycle semantics.

### WK-FR-046 — Local Agent presentation

The Local Agent may convert machine status into natural-language answers without making its explanation authoritative workflow state.

## 11. Convergence

### WK-FR-047 — Profile-defined convergence

Success shall be determined from explicit profile/policy predicates over typed state rather than one hard-coded phase sequence.

### WK-FR-048 — Generic convergence ingredients

Profiles may compose conditions including:

```text
required criteria satisfied
required deliverable artifacts exist
blocking Findings resolved
required assessments acceptable
required authority gates resolved
critical contradictions absent
required awaitables completed/resolved
```

### WK-FR-049 — Limits are not success

Timeout/budget/max-round exhaustion shall never by itself mean semantic success.

### WK-FR-050 — Durable blocked terminal/intermediate state

If progress cannot continue safely, unresolved causal artifacts and dependencies shall remain durable for later inspection/recovery/interaction.

## 12. Example profile mappings

### Software profile

```text
repository research
implementation
git mutation
code review
CI verification
exact-head authority
```

### Deep research profile

```text
web research
source acquisition
evidence extraction
research synthesis
citation verification
report generation
timers for multi-day rounds
PendingActions for paid/auth access
```

### Monitoring profile

```text
periodic Timer
observation
condition evaluation
ExternalEvent ingestion
notification/report artifact
```

## 13. Non-goals

This kernel does not imply:

- arbitrary user-authored executable DAGs;
- mandatory Git/PR usage;
- mandatory Worker/Reviewer agents;
- autonomous expansion of side-effect authority;
- replay of hidden chain-of-thought for recovery;
- one universal workflow profile for all domains.

The target is:

> one deterministic, artifact-based, capability-driven, durable/recoverable orchestration kernel with natural-language access through a reasoning Local Agent and profile-specific semantics above it.
