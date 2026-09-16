# Software Requirements Specification — vNext Assessment and Convergence

- **Status:** proposed requirements; not implemented production contract
- **Version:** 0.1
- **Started:** 2026-09-16
- **Parent:** [`SRS-VNEXT.md`](./SRS-VNEXT.md)
- **Decision:** [`ADR/0021-criterion-assessment-and-convergence.md`](./ADR/0021-criterion-assessment-and-convergence.md)

## 1. Purpose

This module defines how semantic criterion judgment becomes typed durable assessment state and how the deterministic Orchestrator decides whether a WorkflowRun has converged.

It separates reasoning judgment from lifecycle authority.

## 2. Core requirements

### CV-FR-001 — Distinct completion layers

The runtime shall distinguish at least:

```text
WorkItem completed
PlanTask execution completed
AcceptanceCriterion satisfied
WorkflowRun converged
```

No earlier layer shall imply a later layer automatically.

### CV-FR-002 — First-class CriterionAssessment

Criterion satisfaction shall be represented by a typed `CriterionAssessment` or equivalent Assessment artifact rather than inferred from free-form prose or WorkItem success alone.

### CV-FR-003 — Exact criterion binding

Every CriterionAssessment shall bind the exact criterion identity/version it evaluates.

### CV-FR-004 — Exact subject binding

Every correctness-bearing CriterionAssessment shall bind the exact subject/artifact/head/evidence context required by its assessment policy.

### CV-FR-005 — Assessment identity

Every assessment shall have stable identity, schema/version, producer/method, verdict, relevant evidence/input refs, and creation metadata sufficient for validation and staleness decisions.

### CV-FR-006 — Initial verdict vocabulary

The baseline verdict vocabulary shall support at least:

```text
SATISFIED
UNSATISFIED
INCONCLUSIVE
```

### CV-FR-007 — Assessment method policy

A criterion/profile shall be able to require one or more authorized assessment methods, including deterministic validation, Reviewer reasoning, and explicit User authority where applicable.

### CV-FR-008 — Orchestrator does not make semantic assessment

The deterministic Orchestrator shall not inspect implementation/report prose and independently decide whether a semantic criterion is satisfied.

It shall only validate typed assessment state and evaluate code-owned policy.

### CV-FR-009 — Deterministic checks preferred

Mechanically decidable criterion checks shall prefer deterministic validation over model invocation when equivalent correctness can be established by code/external receipts.

### CV-FR-010 — Assessment result may cause Finding/Need

An `UNSATISFIED` or `INCONCLUSIVE` assessment may cause or reference typed Findings/Needs, but the verdict alone shall not authorize arbitrary remediation topology.

## 3. Waiver and authority

### CV-FR-011 — Waiver distinct from satisfaction

A waiver/override shall be represented separately from a `SATISFIED` assessment.

### CV-FR-012 — Waiver exact binding

A waiver shall bind the relevant criterion and subject/version scope so it cannot silently authorize later changed state.

### CV-FR-013 — Waiver authority

Waiver acceptance shall follow explicit authority policy. A Local Agent reasoning conclusion shall not satisfy User-only waiver authority.

### CV-FR-014 — Non-waivable policy support

Profiles/policies shall be able to mark criteria or gates as non-waivable.

## 4. Staleness and invalidation

### CV-FR-015 — Criterion revision stales dependent assessments

If an assessed criterion is superseded or materially revised, dependent assessments shall become stale unless explicit compatibility policy preserves them.

### CV-FR-016 — Subject revision stales dependent assessments

If the assessed exact subject changes, dependent assessments shall become stale as required by profile policy.

For software this includes changed PR/head identity.

### CV-FR-017 — Evidence/InputBundle revision stales dependent assessments

If required correctness-bearing evidence/InputBundle dependencies change, dependent assessments shall become stale/re-evaluation-required.

### CV-FR-018 — Assessment-policy revision may stale assessments

A correctness-relevant assessment-policy/schema version change shall be able to invalidate prior assessments explicitly.

### CV-FR-019 — No prose-based staleness inference

Staleness shall follow explicit version/identity/lineage/policy rules rather than Local Agent or Orchestrator semantic comparison of prose.

## 5. Baseline convergence

### CV-FR-020 — Profile-defined convergence

Every profile capable of successful terminal completion shall define a deterministic convergence predicate over typed current state.

### CV-FR-021 — Required current assessments

Convergence shall require current acceptable assessment state for every required criterion according to profile policy.

### CV-FR-022 — Blocking Findings

Convergence shall require no unresolved blocking Finding unless an explicit authorized policy exception applies.

### CV-FR-023 — Required deliverables

Convergence shall require all profile-required current deliverable Artifacts.

### CV-FR-024 — Required authority gates

Convergence shall require all required User/system authority gates to be resolved for the exact current subject/state.

### CV-FR-025 — Required deterministic receipts

Convergence shall require required deterministic checks/receipts such as exact-head CI/validation when defined by the profile.

### CV-FR-026 — Required work/dependency completion

Convergence shall require no unresolved correctness-bearing required WorkItem/PendingAction/Timer/ExternalEvent dependency.

### CV-FR-027 — Side-effect reconciliation

If terminal success depends on an external/repository mutation, the mutation shall be reconciled against observed state before it can satisfy convergence.

### CV-FR-028 — Delivery does not imply convergence

A current DeliveryArtifact may exist while the WorkflowRun remains non-terminal and unconverged.

### CV-FR-029 — Convergence re-evaluates after invalidation

When a current assessment/artifact/authority gate becomes stale or superseded, the convergence predicate shall become false until required current state is restored.

## 6. Software profile requirements

### CV-FR-030 — Exact-head software assessment

Software review/approval assessments shall bind the exact PR/head identity they evaluated.

### CV-FR-031 — Changed head requires fresh current assessment

A changed software PR head shall not inherit semantic review satisfaction from the previous head unless an explicit deterministic compatibility rule exists for a non-semantic check.

### CV-FR-032 — Merge authority exact binding

Merge authorization shall bind the exact current merge subject/head or equivalent immutable identity.

### CV-FR-033 — Local-test feedback invalidates as required

Accepted User feedback that causes implementation/head/criteria changes shall invalidate affected assessments before terminal convergence can be restored.

## 7. Research profile requirements

### CV-FR-034 — Report/evidence assessment

A research profile may require current assessments for report completeness, source/citation quality, contradiction handling, freshness, and other explicit criteria.

### CV-FR-035 — Freshness can invalidate assessment

When a criterion depends on freshness and the bound freshness window expires, affected assessments shall become stale/re-evaluation-required.

## 8. Resource limits and non-convergence

### CV-FR-036 — Resource limit is not success

Timeout, budget, max-round, max-WorkItem, or stagnation exhaustion shall never by itself produce semantic success.

### CV-FR-037 — Durable non-success stop

When progress cannot continue under current resource/policy limits, the run shall stop in a durable blocked/action-required/non-success state with unresolved criteria/findings preserved.

### CV-FR-038 — Advanced hardening may extend baseline

Profiles may later add richer contradiction, waiver, budget, quorum, or assessment-policy rules without changing the basic separation between assessment and convergence.

## 9. Acceptance scenarios

### Scenario A — Worker completes but criterion remains unsatisfied

1. Implementation WorkItem completes successfully.
2. PlanTask records execution output.
3. Reviewer assesses criterion AC7 against exact head H7.
4. Assessment verdict is `UNSATISFIED`.
5. Workflow does not converge merely because implementation execution completed.
6. Finding/Need drives further work.

### Scenario B — delivery exists while waiting for User test

1. H8 receives required current review/validation.
2. DeliveryArtifact D2 is produced.
3. User-validation PendingAction remains unresolved.
4. Delivery is usable, but convergence is false.
5. User feedback later causes H9; H8-bound assessments become stale.

### Scenario C — explicit waiver

1. Criterion AC5 is `UNSATISFIED` on current subject.
2. Profile permits User waiver for AC5.
3. User explicitly authorizes a waiver bound to current criterion/subject.
4. The assessment remains `UNSATISFIED`.
5. Convergence policy may accept the separate current waiver.

### Scenario D — budget exhaustion

1. Required criterion remains `INCONCLUSIVE` after bounded research attempts.
2. Work budget is exhausted.
3. Workflow becomes blocked/action-required.
4. Criterion is not marked satisfied and workflow is not successful.

## 10. Non-goals

This module does not make Reviewer the workflow state machine.

It does not permit Orchestrator to semantically judge prose.

It does not encode every profile-specific success rule in the generic kernel.

The target boundary is:

> reasoning or deterministic validators produce exact typed assessment evidence; the deterministic Orchestrator evaluates profile policy over current typed state to decide whether the run has converged.
