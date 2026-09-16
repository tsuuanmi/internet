# ADR-0010 — Route Typed Needs Through the Orchestrator and Return Results to the Request Owner

- **Status:** Proposed
- **Date:** 2026-09-16

## Context

The existing coding workflow is graph-backed, but the semantic flow remains largely phase-oriented:

```text
Research -> Writer -> Review -> Writer remediation -> Review
```

This works for expected implementation defects but is too rigid when a later agent discovers a different class of need. For example, a Reviewer may discover that the current evidence is insufficient to determine whether a behavior is correct. Sending that finding directly to the Worker asks the Worker to solve a research problem, while restarting all Research loses causal precision and repeats unnecessary work.

A more general workflow must support feedback loops without allowing agents to invoke one another directly or making routing depend on prose interpretation.

## Decision

Agents shall express unresolved work as typed **needs**. The Orchestrator/runtime shall validate those artifacts and route them to a capability according to deterministic policy.

Agents do not directly call or spawn other agents.

Representative need-to-capability mapping:

```text
external_evidence       -> Research / Explorer
implementation_change   -> Worker
plan_change             -> Planner
evidence_verification   -> Reviewer or future Verifier
artifact_generation     -> Worker
```

The need describes the required capability, not a concrete destination account or provider.

## Causal ownership

Every routed request has a request owner: the node/role whose unresolved decision or finding caused the request.

Default return rule:

> A routed capability result returns first to the request owner, unless the request artifact explicitly declares another consumer under a validated routing contract.

Example:

```text
Reviewer
  -> finding F1
  -> need(external_evidence, owner=Reviewer/F1)
  -> Orchestrator
  -> Research
  -> evidence E1
  -> Orchestrator persists E1
  -> Reviewer/F1
```

The Reviewer then decides whether E1:

- resolves F1;
- requires additional research;
- proves that implementation must change;
- proves that the plan/acceptance criteria must change;
- leaves the workflow blocked.

Research answers the bounded question. It does not silently decide the downstream workflow consequence on behalf of the requester.

## Shared-state visibility versus routing

Returned artifacts become available in durable shared state according to access policy, but availability is not the same as broadcast delivery.

The runtime should avoid automatically injecting every new artifact into Worker, Planner, Reviewer, and Research contexts. Instead, graph dependencies and routing decisions determine which exact artifacts each node consumes.

This preserves smaller contexts, causal traceability, and deterministic input receipts.

## Dynamic graph expansion

Validated need artifacts may expand the workflow graph.

Representative loops:

```text
Review -> Research -> Review
```

```text
Review -> Worker -> Review
```

```text
Review -> Planner -> Worker -> Review
```

Independent needs may fan out concurrently when they do not depend on one another.

The runtime remains responsible for deduplication, dependency binding, scheduling, recovery, and bounded execution.

## Planner participation

Planner is not restricted to workflow startup. A later finding may reveal that the implementation conforms to the current plan but the plan itself omitted a requirement or encoded a wrong assumption.

Such a finding should emit `need(plan_change)` rather than being forced into Worker remediation.

A plan revision shall be a new durable artifact/version that explicitly supersedes its predecessor and identifies affected tasks, criteria, assumptions, or dependent artifacts.

## Exact-input invalidation

Dynamic feedback must preserve current exact-input safety.

Examples:

- approval of PR head `H1` cannot satisfy `H2`;
- a finding resolved against plan `P3` may require re-evaluation if `P4` changes its relevant criterion;
- a research result may be reusable only while its question/context/freshness policy remains valid;
- a Worker mutation that advances the PR head creates fresh review dependencies.

Graph flexibility shall not weaken exact-input binding.

## Convergence

Success is based on converged conditions rather than a fixed number of semantic rounds.

Conceptually:

```text
all blocking findings resolved
AND required current-input approvals exist
AND required tests/checks pass
AND no unresolved critical evidence contradiction
AND acceptance criteria are satisfied
```

The runtime shall also have bounded non-convergence guards so repeated equivalent requests or repairs cannot loop forever.

Examples of future policy knobs:

```text
max total repair actions
max reopen count per finding
max research requests per finding
no-new-evidence detection
repeated-equivalent-patch detection
```

Exhaustion shall fail closed to a durable action-required or blocked boundary.

## Consequences

### Positive

- Reviewer can request the capability actually needed instead of overloading Worker remediation;
- research becomes targeted and demand-driven;
- Planner can re-enter when assumptions change;
- independent work can fan out concurrently;
- the same architecture can support new specialist capabilities later;
- control remains centralized even as semantic flow becomes dynamic.

### Costs

- graph construction becomes incremental rather than fully known at workflow start;
- request ownership and result routing must be persisted;
- equivalence/deduplication and convergence policy need explicit definitions;
- more artifact types participate in exact-input invalidation.

## Invariants

> Agents request capabilities; they do not directly invoke other agents.

> Orchestration routes validated typed needs through one deterministic control plane.

> A capability result returns first to the owner of the need that caused it, unless an explicit validated routing contract says otherwise.

> Dynamic graph expansion never weakens exact-input binding, authority boundaries, or fail-closed behavior.
