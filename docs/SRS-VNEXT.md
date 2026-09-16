# Software Requirements Specification — Workflow vNext

- **Status:** proposed requirements; not yet implemented normative contract
- **Version:** 0.2
- **Started:** 2026-09-16
- **Related:** [`SRS.md`](./SRS.md), [`WORKFLOW-VNEXT.md`](./WORKFLOW-VNEXT.md), ADR-0009, ADR-0010, ADR-0011, ADR-0012

## 1. Purpose and authority boundary

This document defines testable requirements for the proposed next workflow architecture: typed artifact communication, shared durable state, capability-based routing, bounded WorkItems, sparse exact InputBundles, adaptive graph feedback, and convergence-based completion.

The current implemented contract remains [`SRS.md`](./SRS.md) until individual vNext requirements are implemented, tested, and promoted. Nothing in this document authorizes runtime behavior that the current as-built contracts do not already permit.

If this document conflicts with a current as-built contract, the current as-built contract wins for production behavior. If this document conflicts with a Proposed ADR, the narrower Proposed ADR controls the vNext design intent until amended.

## 2. Target actors and authority

### User

Owns final human authority and exception decisions.

### Orchestrator

The Local agent acts as the semantic and user-facing orchestrator. It interprets user intent and workflow-visible typed needs, but does not become the durable state machine, execution scheduler, graph mutation authority, or silent transformer of reasoning artifacts.

### WorkflowEngine

Owns deterministic schema validation, durable artifact/state persistence, WorkItem creation, graph transitions, capability routing policy, exact-input binding, scheduling prerequisites, loop/convergence policy, and authority gates.

### Planner

Owns task decomposition, acceptance criteria, dependency planning, and explicit plan revisions when later evidence invalidates an assumption or reveals missing work.

### Research / Explorer

Answers bounded questions by producing evidence/claim artifacts. It does not decide downstream implementation or planning consequences unless explicitly assigned that decision.

### Worker

The logical implementation/generation role. For the initial vNext design, Worker combines the conceptual Worker and Generator roles to keep the runtime simpler.

The existing account name `chatgpt-writer` may remain as a transport/routing identifier during migration.

### Reviewer

Evaluates exact current artifacts and inputs, persists findings, approves satisfied conditions, and emits typed needs when further research, planning, implementation, or verification is required.

## 3. Core object model

The vNext runtime shall distinguish:

```text
Finding   = observed defect, uncertainty, contradiction, or unmet criterion
Need      = semantic capability/information request
WorkItem  = code-owned bounded unit of authorized runtime work
GraphNode = execution mechanics used to realize a WorkItem
Artifact  = durable domain result produced by WorkItem/runtime execution
InputBundle = exact correctness-bearing input manifest for one WorkItem
```

These objects shall not be collapsed into one untyped handoff record.

## 4. Functional requirements

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

### VN-FR-007 — Persistent finding lifecycle

Reviewer findings shall be first-class durable artifacts with stable identity and lifecycle state. At minimum the model shall distinguish open, resolved, and superseded findings.

### VN-FR-008 — Finding causality

A finding that creates follow-up work shall reference the Need it caused. Resolution shall reference the evidence, implementation, plan, or other artifact used to resolve it.

### VN-FR-009 — Needs describe semantic demand

A Need shall describe what capability or information is required, not how it is executed.

A model-produced Need shall not authoritatively choose provider account, Website session, retry policy, execution attempt, graph node IDs/edges, budget override, mutation authority, or human authorization.

### VN-FR-010 — No direct agent spawning

Planner, Research, Worker, and Reviewer shall not directly invoke one another. They emit artifacts. Orchestration validates the artifact and decides whether and how to schedule work.

### VN-FR-011 — First-class WorkItem

A validated Need that requires execution shall be materialized as a runtime-owned WorkItem before provider/tool execution begins.

### VN-FR-012 — WorkItem causal binding

Every WorkItem shall persist the Need that caused it and the causal request owner whose unresolved decision or finding required the work.

### VN-FR-013 — WorkItem execution authority

Only deterministic runtime code may create authoritative WorkItems, assign execution policy, or materialize graph nodes/edges.

### VN-FR-014 — WorkItem boundedness

A WorkItem shall bind at least capability identity/version, exact InputBundle identity, side-effect class, applicable budget/policy, idempotency/equivalence identity, lifecycle state, execution references, and result Artifact references.

### VN-FR-015 — WorkItem versus graph realization

One WorkItem may map to one graph node or a deterministic runtime-approved subgraph motif. The runtime shall not equate a Need with one hard-coded graph node.

### VN-FR-016 — Capability-based routing

WorkflowEngine shall resolve validated Needs through a versioned code-owned capability registry. Provider/account selection remains a lower-level execution concern.

### VN-FR-017 — Capability contract

A capability descriptor shall define at minimum accepted Need types, produced Artifact types, side-effect class, required authority/gates, eligible logical executor classes, input schema, output schema, and relevant policy hooks.

### VN-FR-018 — Capability registry authority

Model output shall not add, redefine, or override capability descriptors. Adding a provider/account shall not implicitly create a new semantic capability.

### VN-FR-019 — Side-effect class enforcement

At minimum, runtime policy shall distinguish read-only work from repository/external mutation and human-authority-required work. Read-only semantic demand shall never silently become mutation authority.

### VN-FR-020 — Deterministic need routing

Need-to-capability resolution shall be deterministic for the same validated Need, workflow policy version, and relevant authoritative state.

### VN-FR-021 — Persisted request owner

Each routed Need shall persist the causal request owner: the node/role/finding whose unresolved decision required the work.

### VN-FR-022 — Default result return rule

A capability result shall return first to the request owner unless an explicit routing contract is validated.

Example:

```text
Reviewer/Finding -> Need(external_evidence)
-> WorkItem(external_research)
-> EvidenceArtifact
-> Reviewer/Finding
```

The runtime shall not automatically interpret the evidence as an instruction to Worker or Planner.

### VN-FR-023 — Research output does not own downstream policy

Research shall answer its bounded question and produce evidence/claim state. Unless the WorkItem explicitly grants decision authority, Research shall not determine whether Worker, Planner, or another Reviewer must run next.

### VN-FR-024 — Reviewer retains finding authority

When Reviewer creates a finding and asks for supporting capability work, Reviewer retains responsibility for resolving, superseding, or keeping that finding open after the requested result returns.

### VN-FR-025 — Exact InputBundle required

Every executable WorkItem shall be bound to one persisted, deterministic InputBundle before execution begins.

### VN-FR-026 — InputBundle identity

An InputBundle shall identify all correctness-bearing artifact references and runtime facts needed by the WorkItem, plus projection-policy identity and a deterministic input hash.

### VN-FR-027 — Sparse context projection

Shared-state visibility shall not imply prompt delivery. Runtime projection shall include only artifacts/facts required by explicit dependencies and the WorkItem contract.

Unrelated branches, superseded artifacts, stale exact-head results, and the full workflow transcript shall be excluded by default.

### VN-FR-028 — Projection authority

Input projection shall be runtime-owned and versioned. Models may make semantic requests for information but shall not authoritatively inject arbitrary shared artifacts into their own correctness-bearing context.

### VN-FR-029 — Immutable execution input

Once a WorkItem execution attempt starts, its canonical InputBundle identity shall not change. Materially changed input requires a new execution identity and, when correctness semantics changed, a new/replaced WorkItem according to policy.

### VN-FR-030 — Result-to-input provenance

Every correctness-bearing result Artifact from agent execution shall reference the producing WorkItem and InputBundle/input hash.

### VN-FR-031 — Independent review projection

When independent review is required, one reviewer's conclusions shall not be included in another reviewer's InputBundle before independent evaluation completes. A later synthesis/join may consume both explicitly.

### VN-FR-032 — Independent research projection

When independent research is required, peer conclusions shall not be injected into another research WorkItem unless the graph motif explicitly defines a critique/refinement dependency.

### VN-FR-033 — Untrusted-content boundary

Model-produced prose, external excerpts, and peer reasoning included in an InputBundle shall remain untrusted data and shall be delimited from runtime control instructions and authoritative workflow facts.

### VN-FR-034 — Shared-state visibility is not broadcast

Persisting a result in shared state shall not imply delivery to every role. Exact graph dependencies and InputBundle projection determine consumption.

### VN-FR-035 — Persistent artifact lineage

Correctness-bearing artifacts shall support explicit causal/dependency relationships sufficient for provenance and invalidation. Initial relation vocabulary should support at least `derived_from`, `supports`, `contradicts`, `resolves`, `supersedes`, and `invalidates` where semantically applicable.

### VN-FR-036 — Causal invalidation

When an authoritative artifact is superseded or invalidated, runtime policy shall identify dependent results whose correctness-bearing inputs changed and mark them stale/re-evaluation-required rather than globally restarting unrelated work.

### VN-FR-037 — Incremental graph expansion

The durable graph shall support adding deterministic nodes and dependencies in response to validated Needs after workflow start.

### VN-FR-038 — Runtime-approved graph motifs

Adaptive graph expansion shall use code-owned node/subgraph templates. Model output shall not directly author arbitrary DAG topology.

Initial motifs may include:

```text
research-return
parallel-research-join
repair-review
replan-execute-review
verify-return
```

### VN-FR-039 — Parallel independent needs

When two validated WorkItems are independent by exact dependency analysis, the scheduler may execute them concurrently subject to account/session/resource policy.

### VN-FR-040 — Deduplicate equivalent outstanding work

Before creating a new WorkItem, runtime should detect an already-active compatible equivalent request and join/reuse that work when deterministic equivalence policy allows.

Natural-language similarity alone shall not be sufficient correctness authority for deduplication.

### VN-FR-041 — Reviewer-driven research loop

A Reviewer shall be able to emit a Need for additional Research without forcing immediate Worker remediation. The resulting evidence shall be re-evaluated by the owning Reviewer/finding before further action is selected.

### VN-FR-042 — Reviewer-driven plan revision

A Reviewer shall be able to emit `plan_change` when the implementation satisfies the current plan but the plan or acceptance criteria are incomplete or invalid.

### VN-FR-043 — Plan versioning

Planner changes shall create an explicit plan revision with version identity, superseded version, reason, and affected tasks/criteria/assumptions sufficient for downstream invalidation decisions.

### VN-FR-044 — Worker-driven artifact production

Worker shall consume validated plan/evidence/review artifacts and produce implementation or generated-output artifacts. A separate Generator role is not required for the initial vNext architecture.

### VN-FR-045 — Exact-input preservation

Adaptive graph expansion shall preserve exact-input binding. Dynamic routing shall never make stale artifacts valid for changed correctness-bearing inputs.

### VN-FR-046 — Exact-head review remains mandatory

Review approval and implementation findings concerning repository code shall remain bound to the exact PR head SHA they inspected.

### VN-FR-047 — Plan-sensitive invalidation

If a plan revision changes an acceptance criterion, assumption, or task dependency that a prior finding/approval consumed, runtime shall invalidate or explicitly re-evaluate that dependent result rather than silently reuse it.

### VN-FR-048 — Evidence-sensitive reuse

A research/evidence artifact may be reused only when its bounded question and required context/freshness/source policy remain compatible with the new WorkItem.

### VN-FR-049 — Verification as capability

Verification shall initially be modeled as one or more capabilities rather than requiring a permanent dedicated Verifier role/team.

Potential capabilities include schema validation, source reachability, citation entailment, freshness/quality checks, claim coverage, and contradiction checks.

### VN-FR-050 — Deterministic validation first

Where a correctness check can be expressed deterministically, runtime shall prefer deterministic validation over invoking another model solely to perform that check.

### VN-FR-051 — Convergence-based success

The target workflow shall determine successful completion from explicit satisfied conditions rather than merely reaching a fixed semantic round count.

At minimum, successful convergence for coding work shall require:

```text
no unresolved blocking findings
required approvals bound to current exact inputs/head
required tests/checks acceptable
no unresolved critical evidence contradiction
acceptance criteria satisfied
```

### VN-FR-052 — Termination policy is first-class

Success conditions, resource limits, and stagnation rules shall be represented as explicit workflow policy rather than implicit prompt convention.

### VN-FR-053 — Safety limits do not define success

Max-round, max-WorkItem, timeout, token/cost, or reopen limits are safety/resource guards and shall not by themselves constitute successful completion.

### VN-FR-054 — Bounded non-convergence

Runtime shall enforce bounded feedback-loop policy so equivalent research/repair/review cycles cannot continue indefinitely.

### VN-FR-055 — Stagnation detection

Termination policy should detect repeated reopening of the same finding, equivalent Needs without new correctness-bearing inputs, and repeated repair attempts that produce no materially new implementation state.

### VN-FR-056 — Fail-closed loop exhaustion

When loop/resource/stagnation policy is exhausted, workflow shall stop at a durable blocked/action-required state with unresolved causal artifacts preserved.

### VN-FR-057 — Explicit workflow effort budget

Workflow policy shall be able to bind resource budgets independently of semantic success criteria. Budget dimensions may include concurrent WorkItems, specialist fan-out, model turns, tool calls, token/cost budget, and wall-clock time.

### VN-FR-058 — No silent budget escalation

Agents shall not override or silently increase runtime resource budgets. Budget changes requiring user/policy authority must be explicit and durable.

### VN-FR-059 — Retry remains exact-input bounded

Retries belong to runtime policy. A retry shall preserve causal ownership, exact InputBundle identity, side-effect/idempotency constraints, and fencing. Materially changed inputs require an explicit replacement/new WorkItem path.

### VN-FR-060 — Deterministic schema rejection

Malformed, unknown-version, or context-incompatible correctness-bearing artifacts shall fail closed before they trigger graph transitions.

### VN-FR-061 — Provenance-preserving transformation

Any runtime transformation from one artifact schema/version to another shall be explicit, deterministic, versioned, and provenance-preserving. An unrecorded LLM summary shall not serve as a correctness-bearing schema conversion.

### VN-FR-062 — Semantic coordination trace

Runtime observability shall be able to explain at least:

```text
Finding -> Need -> WorkItem -> InputBundle -> execution -> Artifact -> return owner -> resolution
```

Trace/history shall remain diagnostic and shall not replace authoritative workflow/artifact state.

### VN-FR-063 — Outcome-oriented evaluation

Evaluation of dynamic workflows shall judge final state, required checkpoints, authority invariants, correctness relationships, and resource use rather than requiring one canonical execution trajectory.

### VN-FR-064 — Current pipeline remains migration-compatible

The vNext artifact/WorkItem/InputBundle model may initially execute through the existing mostly sequential workflow policy. Artifact/state correctness shall be separable from when adaptive graph routing is enabled.

## 5. Initial capability vocabulary

The initial design should support at least:

| Need | Capability | Default side-effect class |
| --- | --- | --- |
| `external_evidence` | `external_research` | read-only |
| `repository_evidence` | `repository_research` | read-only |
| `implementation_change` | `repository_implementation` | repository mutation |
| `artifact_generation` | `artifact_generation` | context-dependent |
| `plan_change` | `planning` | read-only workflow state change |
| `evidence_verification` | `evidence_verification` | read-only |
| `review_current_state` | `review` | read-only |

This table is semantic policy, not provider/account routing.

## 6. Core target artifacts and runtime records

Initial domain artifact families should include:

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
ImplementationArtifact
ValidationArtifact
ReviewArtifact
ApprovalArtifact
ExternalReceiptArtifact
```

Initial runtime/control records should include:

```text
CapabilityDescriptor
WorkItem
InputBundle
RoutingDecision
TerminationPolicy
ResourceBudget
ExecutionReceipt
```

Runtime/control records are not interchangeable with model-produced domain artifacts.

## 7. Production boundary summary

### Models may

```text
reason over supplied inputs
produce schema-valid domain artifacts
raise Findings
request semantic Needs
answer bounded WorkItems
explain uncertainty
```

### Models may not authoritatively

```text
create graph nodes/edges
select privileged provider/account/session identity
change retry/fencing policy
expand resource budget
promote read-only work into mutation authority
invent user authorization
merge stale or incompatible artifact state
mutate committed artifact history
```

### Runtime must

```text
validate schemas/context
create WorkItems
resolve capabilities
construct exact InputBundles
materialize approved graph motifs
bind side-effect authority
schedule/fence/retry executions
commit artifacts/receipts
perform invalidation
apply convergence/resource policy
fail closed on ambiguity
```

## 8. Target end-to-end behavior

A simple task may still follow the shortest path:

```text
Research -> Worker -> Review -> converged
```

Internally this is represented as bounded WorkItems and Artifacts rather than one implicit conversational pipeline.

A task with missing evidence may evolve as:

```text
Review Finding
-> Need(external_evidence)
-> WorkItem(external_research)
-> EvidenceArtifact
-> owning Reviewer
-> Need(implementation_change)
-> WorkItem(repository_implementation)
-> Worker
-> fresh exact-head Review
-> converged
```

A planning defect may evolve as:

```text
Review Finding
-> Need(plan_change)
-> Planning WorkItem
-> PlanRevisionArtifact
-> Worker WorkItem
-> fresh Review
```

All semantic edges are consequences of validated artifacts and code-owned routing policy rather than direct agent-to-agent invocation.

## 9. Migration acceptance order

Recommended implementation order:

1. logical Worker terminology in new schema/runtime APIs;
2. common artifact envelope and schema validation;
3. first-class Finding and Need artifacts;
4. first-class WorkItem + capability registry;
5. exact InputBundle projection and result provenance;
6. request ownership and return routing;
7. Reviewer -> Research -> Reviewer feedback loop;
8. Planner re-entry and plan-version invalidation;
9. runtime-approved dynamic graph motifs;
10. convergence, stagnation, and resource-budget policy;
11. verification capabilities;
12. semantic tracing and outcome-oriented eval harness;
13. specialist roles only when measured quality data justifies them.

The design intentionally prioritizes stronger coordination semantics over increasing generic team size or fixed round count.
