# Workflow vNext — Adaptive Artifact-Based Orchestration

- **Status:** evolving design proposal; not yet the as-built runtime contract
- **Started:** 2026-09-16
- **Scope:** logical agent roles, typed artifacts, shared workflow state, dynamic graph routing, feedback loops, and convergence

This document captures the target direction for the next workflow architecture. Existing as-built contracts remain authoritative until the corresponding runtime changes land.

## 1. Design goal

The workflow should evolve from a mostly sequential multi-agent pipeline into a dynamic graph coordinated through durable typed artifacts.

Current shape, simplified:

```text
Research -> Writer -> Review -> Writer remediation -> Review
```

Target shape:

```text
                         +---------+
                         | Planner |
                         +----+----+
                              |
                              v
Research / Explorer ----> shared durable state <---- Review
        ^                     |   ^                    |
        |                     v   |                    |
        +---- routed need --- Worker <---- routed need+
                              |
                              v
                           artifact
```

The graph is allowed to revisit prior capabilities when new needs are discovered. A review may request more research; research may expose a planning gap; a plan revision may create new worker tasks; a worker change may require fresh exact-head review.

## 2. Logical roles

The target logical vocabulary is:

| Role | Responsibility |
| --- | --- |
| **Orchestrator** | semantic coordination, user-facing authority brokerage, interpreting typed needs, and selecting the next workflow action |
| **Planner** | task decomposition, acceptance criteria, dependency planning, and replanning when assumptions change |
| **Research / Explorer** | gather external/repository evidence and answer bounded questions |
| **Worker** | execute implementation work and produce final/generated artifacts; temporarily combines the earlier Worker and Generator concepts |
| **Reviewer** | evaluate current artifacts against requirements and emit findings, approvals, or typed needs |

The existing Website route/account named `chatgpt-writer` may remain an implementation detail during migration. The logical workflow role is **Worker**.

The Orchestrator role and the deterministic runtime are related but distinct:

- the Local agent may act as the semantic/user-facing Orchestrator;
- `WorkflowEngine` remains the deterministic control plane that validates schemas, owns durable state, applies routing policy, schedules graph nodes, and enforces authority/invariants.

Agents do not directly spawn or invoke one another. They emit artifacts; the Orchestrator/runtime decides what to schedule.

## 3. Artifact-based communication

Markdown remains useful as a human-readable explanation layer, but it is not the workflow control protocol.

Every correctness-bearing inter-agent exchange should become a typed durable artifact with a deterministic schema.

Conceptual envelope:

```yaml
schemaVersion: "1"
artifactId: artifact_0192
workflowId: wf_123
producer:
  role: reviewer
  instance: review-a
context:
  planVersion: 4
  headSha: def456
type: action_request
payload:
  need: external_evidence
  subject:
    findingId: REV-A-009
    claimId: C-014
  question: Does package X guarantee behavior Y in the current version?
  priority: high
  blocking: true
markdown: |
  Current implementation relies on behavior Y, but existing evidence
  only establishes behavior Z.
```

The structured portion is authoritative for orchestration. `markdown` is optional explanatory content for humans or models.

Core properties:

- schema-versioned;
- immutable once committed;
- content-addressable/hashable where practical;
- producer and workflow provenance;
- exact repository/plan/head bindings where applicable;
- machine-validated before routing;
- persisted independently of transient chat context.

## 4. Shared state / blackboard

Agents should not need the complete transcript from every previous agent. The runtime should maintain durable workflow artifacts that together form shared state.

Conceptually:

```text
Workflow State
|
+-- objective / constraints / acceptance criteria
+-- plan
|   +-- tasks
|   +-- dependencies
|   +-- plan version
+-- research
|   +-- claims
|   +-- evidence
|   +-- contradictions
|   +-- open questions
+-- implementation
|   +-- PR / branch / exact head
|   +-- changed artifacts
|   +-- validation evidence
+-- review
|   +-- findings
|   +-- finding lifecycle
|   +-- approvals bound to exact inputs
+-- routing
    +-- outstanding needs
    +-- decisions
    +-- loop/convergence state
```

Each agent receives the smallest exact subset required for its task rather than an ever-growing concatenated Markdown handoff.

## 5. Findings and needs are first-class artifacts

A Reviewer should emit persistent findings rather than only a coarse `PASS` or `FAIL`.

Example:

```yaml
type: finding
id: REV-A-003
severity: major
category: unsupported_claim
status: open
introducedAt:
  headSha: abc123
target:
  claimId: C-042
description: Implementation assumes behavior not established by current evidence.
need:
  type: external_evidence
  blocking: true
```

A finding can later reference one or more resolution artifacts and become `resolved`, `superseded`, or remain `open`.

The Reviewer should express **what is needed**, not hard-code a destination agent:

```text
external_evidence       -> Research / Explorer
implementation_change   -> Worker
plan_change             -> Planner
evidence_verification   -> Reviewer / future Verifier
artifact_generation     -> Worker
```

This keeps semantic requests independent of the current graph topology or provider/account layout.

## 6. Request ownership and return routing

A routed request retains its causal owner.

Default rule:

> The result of a requested capability returns first to the role/node that raised the need, unless the routing contract explicitly names a different consumer.

Example review-driven research loop:

```text
Reviewer
  -> finding + need(external_evidence)
  -> Orchestrator validates/deduplicates/routes
  -> Research
  -> evidence artifact
  -> Orchestrator persists result
  -> Reviewer that owns the finding
  -> Reviewer resolves finding OR emits a new need
```

The evidence is also available in shared state, but the Orchestrator should not blindly broadcast it to Worker or Planner.

If the evidence proves that implementation must change:

```text
Reviewer -> need(implementation_change) -> Worker
```

If it proves the plan or acceptance criteria are incomplete:

```text
Reviewer -> need(plan_change) -> Planner
```

This preserves clear ownership: Research answers a question; the requester decides what that answer means for its unresolved finding or decision.

## 7. Dynamic graph and feedback loops

The graph should be expanded from typed needs rather than advanced through one fixed phase sequence.

Representative paths:

```text
Research -> Worker -> Review -> PASS
```

```text
Research -> Worker -> Review
                      |
                      +-> need(external_evidence)
                              |
                              v
                           Research
                              |
                              v
                            Review
                              |
                              +-> need(implementation_change)
                                      |
                                      v
                                    Worker
                                      |
                                      v
                                    Review
```

```text
Review -> need(plan_change) -> Planner -> Worker -> Review
```

Independent needs may fan out concurrently when they do not share a correctness dependency.

## 8. Exact-input invalidation still applies

Dynamic routing must preserve the current strong exact-input model.

Examples:

- a review approval of head `H1` cannot approve `H2`;
- a finding resolved using plan version `P3` may need reconsideration if `P4` changes the relevant acceptance criterion;
- a research artifact is reusable only while its bounded question, source/freshness policy, and relevant context remain valid;
- a Worker change that advances the PR head invalidates exact-head review and health evidence.

Dynamic does not mean mutable-by-guessing. Graph changes remain deterministic consequences of validated artifacts and policy.

## 9. Convergence and stop conditions

The normal workflow should stop because required conditions converge, not because a fixed number of rounds elapsed.

Conceptual successful convergence:

```text
all blocking findings resolved
AND required reviewers approve current exact inputs/head
AND required tests/checks pass
AND no unresolved critical evidence contradiction
AND acceptance criteria are satisfied
```

The runtime also needs non-convergence guards:

```yaml
maxTotalRepairs: 8
maxSameFindingReopens: 2
maxResearchRequestsPerFinding: 3
detectNoNewEvidence: true
detectRepeatedEquivalentPatch: true
```

When bounded progress is exhausted, fail closed to a durable human/action-required boundary rather than looping indefinitely.

## 10. Team size and rounds

The target system should not improve reliability primarily by mechanically adding more generic members or fixed rounds.

Preferred order of improvement:

1. typed artifacts and deterministic state;
2. persistent findings and causal routing;
3. adaptive feedback loops;
4. evidence verification and targeted retries;
5. specialist roles only when they provide orthogonal capability.

Role diversity and targeted work are expected to provide better marginal value than repeatedly increasing identical team size or round count.

## 11. Migration direction

A practical migration can be incremental:

### Stage A — vocabulary and schema

- adopt logical `Worker` terminology for the target design;
- define common artifact envelope;
- define finding, need/action-request, evidence, plan, implementation, and review-result schemas.

### Stage B — persistent artifacts

- persist structured findings/evidence/needs;
- keep current sequential path as a compatibility execution policy while the artifact model becomes authoritative.

### Stage C — adaptive routing

- add deterministic need-to-capability routing;
- allow Reviewer -> Research -> Reviewer and Reviewer -> Planner -> Worker loops;
- deduplicate equivalent outstanding requests.

### Stage D — convergence policy

- replace fixed review-round assumptions with explicit convergence and bounded stagnation rules where safe;
- preserve exact-head and authority gates.

## 12. Open design questions

The following should remain explicit until specified:

- exact JSON Schema definitions and version-evolution policy;
- which artifact classes are immutable versus replaceable through supersession;
- canonical claim/evidence identity and freshness policy;
- whether Planner is always present or instantiated only when needed;
- whether a future dedicated Verifier is a separate role or a Reviewer capability;
- how to calculate request equivalence for deduplication;
- exact loop budget and escalation policy by workflow risk/size;
- how much prior artifact context each agent receives by default.

These are design questions, not reasons to preserve the current sequential pipeline.
