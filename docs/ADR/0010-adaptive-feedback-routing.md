# ADR-0010 — Route Typed Needs Through the Orchestrator and Return Results to the Request Owner

- **Status:** Proposed
- **Date:** 2026-09-16
- **Updated:** 2026-09-16 after core-SRS harmonization
- **Related:** ADR-0009, ADR-0011, ADR-0015, ADR-0016, ADR-0017, ADR-0021

## Context

The existing coding workflow is graph-backed, but the semantic flow remains largely phase-oriented:

```text
Research -> Writer -> Review -> Writer remediation -> Review
```

This works for expected implementation defects but is too rigid when a later reasoning role discovers a different class of need. For example, a Reviewer may discover that the current evidence is insufficient to determine whether behavior is correct. Sending that finding directly to Worker asks Worker to solve a research problem, while restarting all Research loses causal precision and repeats unnecessary work.

A more general workflow must support feedback loops without allowing agents to invoke one another directly or making routing depend on prose interpretation.

It must also distinguish internal semantic work from external authority/input. Not every Need should become an executable agent task.

## Decision

Reasoning capabilities shall express unresolved semantic demand as typed **Needs**. The deterministic Orchestrator validates each Need and materializes the appropriate runtime dependency according to typed semantics and policy.

```text
Need
  +-> internal executable semantic work
  |     -> WorkItem
  |     -> capability routing
  |
  +-> external input / authority
        -> PendingAction
```

Agents do not directly call or spawn other agents, and a Need itself is never execution or external-response authority.

Representative semantic routing:

```text
external_evidence       -> WorkItem(external/deep research)
repository_evidence     -> WorkItem(repository research)
implementation_change   -> WorkItem(repository implementation)
plan_change             -> WorkItem(planning)
requirements_change     -> WorkItem(planning proposal) + authority gate when required
clarification           -> clarification/formulation WorkItem and/or PendingAction
review_current_state    -> WorkItem(review/assessment)
protected user decision -> PendingAction(USER_AUTHORITY)
```

The Need describes required semantic demand, not a concrete destination provider/account/session.

## Causal ownership

Every materialized dependency has a causal request owner: the Finding, PlanTask, criterion, gate, reasoning decision, or other durable owner whose unresolved state caused the Need.

Default result rule:

> A capability result or external response returns first to the persisted request owner, unless an explicit validated routing contract declares another consumer.

Example:

```text
Reviewer / Finding F1
  -> Need(external_evidence, owner=F1)
  -> Orchestrator
  -> WorkItem(external research)
  -> Evidence E1
  -> Orchestrator persists E1
  -> F1 / Reviewer reassessment
```

The owning reasoning role then decides semantically whether E1:

- resolves F1;
- requires additional research;
- implies an implementation change;
- implies a strategy/plan change;
- shows that the Objective/AcceptanceCriteria themselves need a requirements-change proposal;
- remains inconclusive.

Research answers the bounded question. It does not silently decide the downstream workflow consequence on behalf of the requester.

## Shared-state visibility versus routing

Returned Artifacts become available in durable shared state according to access policy, but availability is not broadcast delivery.

The runtime shall avoid automatically injecting every new Artifact into Worker, Planner, Reviewer, Research, or other contexts. Exact dependencies, causal routing, and InputBundle projection determine which exact Artifacts each WorkItem consumes.

This preserves sparse context, causal traceability, independent evaluation, and deterministic exact-input receipts.

## Adaptive dependency expansion

Validated Needs may expand the durable dependency/execution structure after WorkflowRun start.

Representative semantic loops:

```text
Review -> Research -> Review
```

```text
Review -> Worker -> Review
```

```text
Review -> Planner -> Worker -> Review
```

```text
Planner/Reviewer -> PendingAction -> Planner/Reviewer
```

Independent Needs may fan out concurrently when they do not depend on one another.

The deterministic runtime remains responsible for validation, materialization, deduplication, dependency binding, scheduling, recovery, authority, and bounded execution.

A graph may be one execution mechanism, but semantic correctness shall not depend on every profile exposing one universal graph vocabulary.

## Planner participation and change classes

Planner is not restricted to workflow startup.

A later Finding may show that:

```text
current Objective/AcceptanceCriteria remain correct
but strategy/decomposition is incomplete or based on a bad assumption
  -> Need(plan_change)
```

A different Finding may show that:

```text
the success definition itself is missing, ambiguous, inconsistent,
or must be changed
  -> Need(requirements_change) or Need(clarification)
```

These paths are intentionally distinct.

A normal Plan revision creates a new durable Plan version and identifies affected tasks, assumptions, dependencies, and other refs. It does **not** silently change AcceptanceCriteria.

A requirements change creates a proposed Objective/AcceptanceCriteria revision and follows the authority rules of ADR-0016/SRS-VNEXT-PLANNER before activation.

## Exact-input invalidation

Adaptive feedback must preserve exact-input safety.

Examples:

- approval/review of PR head `H1` cannot satisfy `H2`;
- an Assessment against criterion version `AC1` cannot automatically satisfy `AC2`;
- a Finding resolved against Plan `P3` may require re-evaluation if `P4` changes a correctness-bearing assumption it consumed;
- a research result may be reused only while its bounded question/context/freshness policy remains valid;
- a Worker mutation that advances a software PR head creates fresh exact-subject review/assessment dependencies.

Adaptive routing shall not weaken exact-input binding.

## Convergence

Success is based on current typed state and profile convergence policy rather than a fixed number of semantic rounds.

Semantic criterion truth is represented by current typed Assessments, not inferred by the Orchestrator from prose.

Conceptually, profile convergence may require:

```text
required current CriterionAssessments are acceptable
AND required Deliveries/Artifacts exist
AND blocking Findings are resolved
AND required authority gates are resolved
AND required deterministic checks/receipts are acceptable
AND no critical contradiction remains
AND no required dependency is unresolved
```

The runtime shall also have bounded non-convergence guards so repeated equivalent requests or repairs cannot loop forever.

Example policy knobs include:

```text
max total repair actions
max reopen count per Finding
max research requests per Finding
no-new-evidence detection
repeated-equivalent-patch detection
resource budget
```

Exhaustion shall fail closed to a durable blocked/action-required boundary. It shall never constitute semantic success by itself.

## Consequences

### Positive

- Reviewer can request the semantic capability actually needed instead of overloading Worker remediation;
- external authority/input is modeled directly instead of being disguised as agent execution;
- research becomes targeted and demand-driven;
- Planner can re-enter while plan-change and requirements-change authority remain distinct;
- independent work can fan out concurrently;
- the same architecture can support new capabilities/profiles later;
- control remains centralized even as semantic flow becomes dynamic.

### Costs

- durable request ownership and result routing must be persisted;
- Need materialization policy must distinguish executable capability work from external interaction;
- equivalence/deduplication and convergence policy need explicit definitions;
- more typed Artifacts/Assessments participate in exact-input invalidation.

## Invariants

> Agents request semantic demand through typed Needs; they do not directly invoke other agents.

> The deterministic Orchestrator materializes validated Needs as WorkItems or PendingActions according to typed semantics and policy.

> A capability result or external response returns first to the persisted causal owner unless an explicit validated routing contract says otherwise.

> `plan_change` changes strategy; `requirements_change` changes the proposed definition of success and follows its own authority path.

> Adaptive dependency expansion never weakens exact-input binding, assessment freshness, authority boundaries, or fail-closed behavior.
