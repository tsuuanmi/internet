# Workflow vNext — Adaptive Artifact-Based Orchestration

- **Status:** evolving design proposal; not yet the as-built runtime contract
- **Started:** 2026-09-16
- **Scope:** logical roles, typed artifacts, shared state, WorkItems, exact InputBundles, capability routing, dynamic graph motifs, feedback loops, and convergence

This document describes the target vNext architecture. Existing as-built contracts remain authoritative until corresponding runtime changes are implemented, tested, and promoted.

## 1. Design goal

The workflow evolves from a mostly sequential multi-agent pipeline into a deterministic control system coordinating nondeterministic specialist work through durable typed artifacts.

Current shape, simplified:

```text
Research -> Writer -> Review -> Writer remediation -> Review
```

Target semantic loop:

```text
observe durable state
-> unresolved Finding / decision
-> Need
-> deterministic validation + routing
-> WorkItem
-> exact InputBundle
-> capability execution
-> Artifact
-> return to causal owner
-> resolve / emit next Need
-> convergence or bounded stop
```

Dynamic behavior means the graph may revisit capabilities as new evidence appears. It does **not** mean agents are allowed to create arbitrary execution topology.

## 2. Authority model

### User

Owns final human authority and explicit exception decisions.

### Local / Orchestrator

Acts as semantic and user-facing coordinator. It may interpret user intent, inspect workflow-visible artifacts, and participate in semantic decisions.

It is not the durable scheduler or graph mutation authority.

### WorkflowEngine

Is the deterministic control plane. It owns:

```text
schema validation
artifact persistence
WorkItem creation
capability resolution
InputBundle projection
graph motif materialization
exact-input binding
side-effect authority
retry/fencing/idempotency
invalidation
convergence and resource policy
```

### Agents

Planner, Research, Worker, and Reviewer reason over bounded inputs and emit typed domain artifacts. They do not directly invoke each other or authoritatively mutate workflow topology.

## 3. Logical roles

| Role | Responsibility |
| --- | --- |
| **Orchestrator** | semantic/user coordination and interpretation of workflow-visible state |
| **Planner** | decomposition, acceptance criteria, dependency planning, explicit replanning |
| **Research / Explorer** | bounded repository/external evidence gathering |
| **Worker** | implementation plus generated artifact production; initially combines Worker + Generator |
| **Reviewer** | evaluate exact current state, create Findings, approvals, and typed Needs |

The current account identifier `chatgpt-writer` may remain during migration. The target logical role is **Worker**.

A future Verifier is not required as a permanent role. Verification is initially modeled as one or more capabilities.

## 4. Core object separation

Production vNext distinguishes four semantic/control layers:

```text
Finding
  -> Need
  -> WorkItem
  -> Graph node(s) / execution(s)
  -> Artifact(s)
```

and every executable WorkItem is bound to:

```text
InputBundle
```

### Finding

An unresolved correctness concern, uncertainty, contradiction, or unmet criterion.

### Need

A semantic request describing what capability or information is required.

### WorkItem

A deterministic runtime-owned bounded authorization to perform work.

### Graph node / execution

The mechanical realization of that WorkItem. One WorkItem may map to one node or to a runtime-approved subgraph.

### Artifact

An immutable or explicitly superseded durable domain result.

### InputBundle

The exact persisted manifest of correctness-bearing artifacts and runtime facts consumed by the WorkItem.

This separation is fundamental. Model-produced semantic state never doubles as runtime execution authority.

## 5. Typed artifact communication

Markdown remains useful as explanation, but is not the control protocol.

Conceptual artifact envelope:

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
type: finding
payload:
  severity: major
  category: unsupported_claim
  need:
    type: external_evidence
markdown: |
  Human/model-readable explanation.
```

Structured fields are authoritative for workflow state. Explanatory prose is untrusted data unless a schema explicitly gives it correctness-bearing meaning.

Artifacts are:

- schema-versioned;
- durable outside transient chat context;
- immutable after commit or explicitly superseded;
- attributable to a producer;
- bound to exact relevant context;
- machine-validated before routing/state transition.

## 6. Shared artifact state is not a transcript

The artifact store forms a workflow blackboard, but agents do not consume the full blackboard automatically.

Conceptual shared state:

```text
objective / constraints / acceptance criteria
plan versions
claims / evidence / contradictions
implementation / PR / exact head
findings / resolutions / approvals
needs / WorkItems
artifact lineage
routing / termination / budget state
```

Visibility in shared state is not equivalent to delivery into another agent's context.

## 7. Exact InputBundle projection

Every executable WorkItem receives one deterministic InputBundle before execution.

Example:

```yaml
inputBundleId: IB-31
workItemId: W-31
objectiveRef: O-1
artifactRefs:
  - PLAN:P4
  - FINDING:F17
  - EVIDENCE:E12
runtimeBindings:
  repository: tsuuanmi/internet
  headSha: abc123
  capabilityVersion: 1
projectionPolicyVersion: 2
inputHash: sha256(...)
```

Excluded by default:

```text
unrelated research branches
unrelated reviewer conclusions
superseded artifacts
stale exact-head artifacts
full workflow transcript
provider/account detail not required by the WorkItem
```

The InputBundle is immutable for one execution attempt. New correctness-bearing input means new execution identity and, when semantics materially change, a new/replaced WorkItem.

Every produced Artifact references its producing WorkItem and InputBundle/input hash.

## 8. Finding and Need lifecycle

Reviewer output should prefer persistent Findings over only a coarse PASS/FAIL.

Example:

```yaml
type: finding
id: F17
severity: major
status: open
target:
  claimId: C42
need:
  type: external_evidence
  question: Does package X guarantee behavior Y?
```

A Need describes semantic demand only. It does not specify runtime mechanics.

Models may request:

```text
external_evidence
repository_evidence
implementation_change
plan_change
evidence_verification
review_current_state
artifact_generation
```

Models may not authoritatively specify:

```text
provider/account/session
retry/backoff
node IDs/edges
budget override
side-effect permission
human authorization
```

## 9. WorkItem and capability routing

A validated Need requiring execution becomes a WorkItem.

Conceptually:

```text
Need N22
-> capability resolution
-> WorkItem W31
-> InputBundle IB31
-> approved graph motif
-> execution
-> Artifact E44
```

Capability descriptors are code/configuration-owned and versioned.

Example:

```yaml
capabilityId: external_research
version: 1
accepts: [external_evidence]
produces: [evidence_packet]
sideEffectClass: read_only
allowedExecutors: [research]
supportsParallel: true
```

This separates semantic capability from provider/account topology.

A new provider account does not imply a new capability. A new capability requires an explicit contract change.

## 10. Request ownership and return routing

Every routed Need retains a causal owner.

Default rule:

> A WorkItem result returns first to the owner of the Need that caused it, unless a validated routing contract says otherwise.

Example:

```text
Reviewer/Finding F17
-> Need N22(external_evidence)
-> WorkItem W31(external_research)
-> Evidence E44
-> Reviewer/F17
```

The Reviewer then decides whether E44:

- resolves F17;
- requires more bounded evidence;
- causes `implementation_change`;
- causes `plan_change`;
- leaves the workflow blocked.

Research answers the question. It does not silently own downstream policy.

## 11. Dynamic graph through safe motifs

Agents do not directly create graph edges. The runtime instantiates approved graph motifs from validated WorkItems.

Initial motif family:

```text
research-return
  Owner -> Research -> Owner

parallel-research-join
  Owner -> Research[1..N] -> EvidenceJoin -> Owner

repair-review
  Reviewer -> Worker -> fresh exact-head Review

replan-execute-review
  Reviewer -> Planner -> Worker -> fresh Review

verify-return
  Owner -> Verification capability -> Owner
```

This yields dynamic/irregular topology while preserving deterministic graph authority.

Independent WorkItems may fan out concurrently when exact dependencies and resource policy allow it.

## 12. Artifact lineage and invalidation

Dynamic workflows require explicit provenance relations such as:

```text
derived_from
supports
contradicts
resolves
supersedes
invalidates
```

Example:

```text
AcceptanceCriterion AC4
-> Plan P3
-> WorkerResult I7
-> Review R9
```

If `AC4` is superseded by `AC4-v2`, runtime can identify dependent results requiring re-evaluation without globally replaying unrelated research.

Existing exact-head rules remain mandatory:

- H1 approval cannot approve H2;
- a plan-dependent result becomes stale when its relevant plan input changes;
- evidence is reusable only while question/context/freshness policy remains compatible.

Dynamic never means mutable-by-guessing.

## 13. Reviewer feedback loops

Representative paths:

```text
Research -> Worker -> Review -> converged
```

```text
Review/Finding
-> Need(external_evidence)
-> Research WorkItem
-> Evidence Artifact
-> Review/Finding
-> Need(implementation_change)
-> Worker WorkItem
-> fresh Review
```

```text
Review/Finding
-> Need(plan_change)
-> Planner WorkItem
-> PlanRevision
-> Worker WorkItem
-> fresh Review
```

The same architecture can support verification or specialist capabilities without changing upstream request semantics.

## 14. Verification capability

Verification should be decomposed into the smallest useful checks rather than creating a permanent extra team by default.

Potential capabilities:

```text
schema_validation
source_reachability
citation_entailment
source_freshness
claim_coverage
contradiction_check
```

Deterministic checks should be preferred where possible. Model-assisted verification is reserved for judgments that cannot be expressed reliably as code/rules.

## 15. Convergence, limits, and budget

Successful completion is defined by semantic convergence, not round count.

Conceptually:

```text
all blocking findings resolved
AND required approvals apply to current exact inputs/head
AND required tests/checks pass
AND unresolved critical contradictions = 0
AND acceptance criteria satisfied
```

Safety/resource limits are separate:

```yaml
limits:
  maxTotalWorkItems: 30
  maxResearchPerFinding: 3
  maxRepairPerFinding: 2
  maxFindingReopens: 2

stagnation:
  rejectEquivalentNeedWithoutNewInput: true
  rejectEquivalentPatchWithoutStateChange: true
```

Resource budgets may additionally constrain:

```text
concurrent WorkItems
specialist fan-out
model turns/tool calls
tokens/cost
wall-clock time
```

Hitting a limit is not success. Exhaustion fails closed into durable blocked/action-required state.

Agents cannot silently expand budgets.

## 16. Deterministic versus nondeterministic boundary

The runtime must remain replayable/recoverable without replaying model reasoning as control logic.

Deterministic control plane:

```text
validation
routing
WorkItem creation
InputBundle construction
graph motif selection
state transition
invalidation
authority gates
retry/fencing policy
termination/budget policy
```

Nondeterministic activities:

```text
model/browser execution
web/repository exploration
implementation generation
review reasoning
model-assisted verification
```

Committed artifacts and receipts bridge the two sides.

## 17. Event/trace versus correctness state

Artifact/job state remains correctness authority.

Event/trace history explains what happened but is not required to reconstruct correctness by replaying model output.

Desired semantic trace:

```text
Finding F17
-> caused Need N22
-> materialized WorkItem W31
-> consumed InputBundle IB31
-> execution X5
-> produced Evidence E44
-> returned_to Reviewer/F17
-> resolved_by Resolution R8
```

## 18. Evaluation model

Dynamic workflow evaluation should judge:

```text
final repository/PR state
acceptance criteria
critical finding resolution
evidence/citation relationships
exact-head correctness
side-effect/authority invariants
absence of stale approvals
resource efficiency
```

It should not require one canonical trajectory when several valid paths reach the same correct end state.

## 19. Migration direction

### Stage A — vocabulary and artifact schema

- logical `Worker` terminology;
- common artifact envelope;
- Finding and Need schemas.

### Stage B — control-plane objects

- first-class WorkItem;
- capability registry;
- side-effect classification;
- exact InputBundle projection.

### Stage C — provenance and ownership

- request ownership/result return;
- Artifact lineage;
- exact invalidation.

### Stage D — adaptive routing

- Reviewer -> Research -> Reviewer;
- Reviewer -> Planner -> Worker -> Reviewer;
- runtime-approved graph motifs;
- deterministic deduplication.

### Stage E — convergence and assurance

- explicit termination/resource policy;
- verification capabilities;
- semantic coordination tracing;
- outcome-oriented eval harness.

## 20. Production boundary

The vNext design is intentionally strict about what remains code-owned.

### Model-owned semantic output

```text
reasoning
Findings
Needs
bounded evidence/plan/review/implementation artifacts
uncertainty/explanations
```

### Runtime-owned authority

```text
schema acceptance
capability registry
WorkItem creation
InputBundle projection
graph topology/motifs
provider/account scheduling
side-effect permissions
retry/fencing/idempotency
resource budgets
authorization gates
invalidation
termination
```

No model statement overrides an incompatible runtime invariant.

## 21. Open design questions

Still intentionally open:

- exact JSON Schema definitions and migration policy;
- exact WorkItem lifecycle representation relative to graph-node state;
- equivalence-key algorithm for deterministic deduplication;
- canonical lineage storage model;
- default complexity/risk classification and budget values;
- exact verification capability set;
- whether Planner is always instantiated or only demand-driven;
- which vNext requirements should be implemented before adaptive routing is enabled in production.

These are implementation/design questions, not reasons to weaken the boundaries above.
