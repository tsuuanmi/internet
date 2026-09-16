# ADR-0021 — Separate Criterion Assessment from Deterministic Workflow Convergence

- **Status:** Proposed
- **Date:** 2026-09-16
- **Related:** ADR-0009, ADR-0010, ADR-0011, ADR-0012, ADR-0015, ADR-0016, ADR-0019, ADR-0020

## Context

The vNext workflow must distinguish four different facts:

```text
WorkItem completed
PlanTask execution completed
AcceptanceCriterion satisfied
WorkflowRun converged
```

A deterministic Orchestrator cannot semantically decide whether a natural-language requirement is satisfied merely by reading implementation, research, or reviewer prose. At the same time, a reasoning Reviewer should not own the final workflow lifecycle transition or be able to waive User-owned requirements implicitly.

The software Delivery/feedback loop also requires a precise rule for when a reviewed PR is merely deliverable versus when the WorkflowRun may become terminal. Long-running research needs the same separation for report/evidence criteria.

Therefore semantic criterion judgment and deterministic convergence must be distinct first-class contracts.

## Decision

The architecture introduces a typed `CriterionAssessment` (or equivalent Assessment artifact) and a separate profile-defined deterministic convergence policy.

```text
Criterion + exact subject/evidence
        |
        v
authorized assessment method
  Reviewer / deterministic validator / User authority
        |
        v
CriterionAssessment
        |
        v
Orchestrator validates identity/currentness/policy
        |
        v
profile convergence predicate
        |
        +-> continue work
        +-> WAITING_EXTERNAL / BLOCKED
        +-> terminal success
```

The Orchestrator evaluates only structured current assessment state and policy. It never performs the semantic judgment itself.

## CriterionAssessment contract

A correctness-bearing assessment should bind at least:

```text
assessmentId
workflowRunId
criterionRef + criterionVersion
subject identity/version
input/evidence refs
method / assessor capability
verdict
finding refs where applicable
producer / authority provenance
schema/policy version
createdAt
supersedes when applicable
```

Initial verdict vocabulary:

```text
SATISFIED
UNSATISFIED
INCONCLUSIVE
```

A profile may add domain-specific structured evidence fields without changing these control semantics.

## Exact subject binding

Assessment validity depends on the exact thing assessed.

Software examples:

```text
criterion version
repository
PR/head SHA
implementation artifact/input bundle
required test/CI receipts
```

Research examples:

```text
criterion version
ReportArtifact version
EvidenceArtifact set
freshness/source-policy version
```

If the correctness-bearing subject changes, the old assessment becomes stale unless an explicit policy proves compatibility.

## Assessment methods

A criterion may declare one or more authorized assessment methods.

Examples:

```text
deterministic
  schema validation
  test exit/result
  exact hash/path/state checks

reviewer
  semantic correctness/completeness judgment

user
  explicit acceptance or preference where User authority defines satisfaction
```

The method is part of policy. A Reviewer cannot substitute itself for a required deterministic check or User-only decision.

## Deterministic validation before assessment reasoning

Mechanically decidable criteria should prefer deterministic validation.

Examples:

```text
file exists
required path unchanged
CI required check successful
exact artifact schema valid
expected head matches
```

A model should not be invoked solely to answer a fact the runtime can verify deterministically.

## Unsatisfied and inconclusive assessments

`UNSATISFIED` or `INCONCLUSIVE` does not automatically prescribe the next action.

An assessment may reference or cause a Finding/Need, after which normal typed routing decides whether to research, replan, implement, clarify, or request authority.

```text
Assessment UNSATISFIED
  -> Finding F17
  -> Need N22
  -> WorkItem/PendingAction
```

Semantic consequence belongs to authorized reasoning output; runtime routing remains deterministic.

## Waiver and override are separate authority objects

A waiver is not a positive assessment.

For example, if a User explicitly accepts an unmet non-critical criterion, the system should persist a separate typed waiver/authorization object rather than changing:

```text
UNSATISFIED -> SATISFIED
```

without evidence.

Conceptually:

```text
CriterionAssessment
  verdict = UNSATISFIED

CriterionWaiverAuthorization
  criterionRef
  exact subject/version
  authority = user_explicit
  scope / expiry
```

Profile convergence may allow an authorized current waiver where policy permits. User/policy-owned mandatory criteria may be non-waivable.

## Staleness and invalidation

An assessment becomes stale/re-evaluation-required when a correctness-bearing dependency changes, including as applicable:

```text
criterion version
objective/criteria authority state
subject artifact/version
PR/head SHA
required InputBundle/evidence set
required deterministic receipt
freshness policy
assessment policy version
```

Staleness follows explicit identity/lineage rules, not semantic prose comparison by Local Agent or Orchestrator.

## Baseline profile convergence

Every profile that can terminate successfully must define a deterministic predicate over current typed state.

The baseline predicate should be able to express at least:

```text
all required criteria have current acceptable assessments or permitted waivers
no unresolved blocking Findings
required deliverable Artifact(s) exist and are current
required external authority gates are resolved
required deterministic validation/receipts are acceptable
no correctness-bearing required WorkItem is unresolved
no required PendingAction/Timer/Event dependency remains outstanding
profile-specific terminal side effects are reconciled where required
```

The predicate consumes structured state. It does not ask a model whether the workflow is done.

## Delivery versus convergence

A current `DeliveryArtifact` may exist while convergence is false.

Software example:

```text
reviewed PR head H7
  -> DeliveryArtifact D1
  -> User local-test PendingAction
  -> WorkflowRun not converged yet
```

After User feedback causes H8, assessments bound to H7 are stale and H8 requires fresh current assessment before it can become the current delivery/convergence subject.

Research example:

```text
Report draft exists
  -> missing citation/freshness assessment
  -> report is inspectable but run is not converged
```

## Resource limits and convergence

Resource/budget/timeout/stagnation limits are stop conditions, not semantic success evidence.

Exhaustion produces an explicit durable non-success state such as BLOCKED/ACTION_REQUIRED according to policy, preserving unresolved criteria/findings.

It must never make an unassessed/unsatisfied criterion satisfied.

## Relationship to Planner and acceptance criteria

Planner owns semantic Objective/AcceptanceCriteria proposals and revisions according to authority rules.

Assessment evaluates one exact accepted criterion version against one exact subject/evidence context.

Ordinary `plan_change` changes strategy and must not silently change the criteria being assessed.

A change to Objective/AcceptanceCriteria is `requirements_change` and invalidates affected assessments according to lineage/version rules.

## Consequences

### Positive

- semantic judgment is clearly separated from lifecycle control;
- a successful WorkItem cannot accidentally imply criterion satisfaction;
- exact-head software reviews become explicit assessment evidence;
- research/report completion can use the same kernel semantics;
- User waivers remain auditable instead of rewriting evidence;
- feedback/revision naturally invalidates stale assessments;
- convergence can be deterministic and profile-specific.

### Costs

- profiles must define assessment and convergence policy explicitly;
- more artifact identities and stale-state handling are required;
- semantic Reviewer outputs need structured assessment schemas rather than only PASS/FAIL prose.

## Invariants

> WorkItem completion, PlanTask execution completion, criterion satisfaction, and WorkflowRun convergence are distinct states.

> The Orchestrator does not semantically judge whether a criterion is satisfied; it validates and evaluates typed current assessments according to code-owned policy.

> Every correctness-bearing assessment is bound to the exact criterion and subject/evidence context it evaluated.

> A waiver/override is separate authority from an assessment verdict.

> Changed correctness-bearing subject/criteria/evidence makes dependent assessment state stale unless explicit compatibility policy proves otherwise.

> Budget/timeout/stagnation exhaustion never constitutes semantic success.
