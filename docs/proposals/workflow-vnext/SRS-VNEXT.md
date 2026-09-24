# Software Requirements Specification — Workflow vNext

- **Status:** proposed umbrella requirements; not yet implemented production contract
- **Version:** 0.3
- **Started:** 2026-09-16
- **Rewritten:** 2026-09-16 after production-readiness/codebase review
- **Related:** [`SRS.md`](../../requirements/SRS.md), [`WORKFLOW-VNEXT.md`](./WORKFLOW-VNEXT.md), ADR-0009 through ADR-0021

## 1. Purpose and authority

This document defines the **core umbrella requirements** for Workflow vNext: a natural-language-accessible, domain-agnostic, deterministic-control, artifact-based, durable/recoverable workflow system.

It intentionally stays above domain-specific implementation detail. Specialized proposed SRS modules refine this core contract:

- [`SRS-VNEXT-ADMISSION.md`](./SRS-VNEXT-ADMISSION.md) — natural-language admission and confirmation;
- [`SRS-VNEXT-ORCHESTRATOR.md`](./SRS-VNEXT-ORCHESTRATOR.md) — Local Agent versus deterministic Orchestrator boundary;
- [`SRS-VNEXT-PLANNER.md`](./SRS-VNEXT-PLANNER.md) — Objective/Criteria/Plan/Need lifecycle;
- [`SRS-VNEXT-KERNEL.md`](./SRS-VNEXT-KERNEL.md) — domain-agnostic durable kernel;
- [`SRS-VNEXT-INTERACTION.md`](./SRS-VNEXT-INTERACTION.md) — PendingAction/Signal/Respond interaction;
- [`SRS-VNEXT-CONVERGENCE.md`](./SRS-VNEXT-CONVERGENCE.md) — CriterionAssessment and convergence;
- [`SRS-VNEXT-CONTINUATION.md`](./SRS-VNEXT-CONTINUATION.md) — Workstream, Delivery, feedback, continuation;
- [`SRS-VNEXT-PR-WORKSPACE.md`](./SRS-VNEXT-PR-WORKSPACE.md) — software-profile collaboration workspace;
- [`SRS-VNEXT-GIT-MUTATION.md`](./SRS-VNEXT-GIT-MUTATION.md) — software-profile Git mutation/reconciliation.

The current implemented contract remains [`SRS.md`](../../requirements/SRS.md) plus current code/as-built documentation until individual vNext behavior is implemented, tested, and explicitly promoted.

Production precedence is:

```text
current code + as-built contracts
  > proposed vNext documents
  > research notes
```

Within the proposed vNext design:

```text
narrow Proposed ADR
  > specialized SRS-VNEXT module
  > this core SRS
  > narrative/research docs
```

Nothing in this document alone authorizes unimplemented runtime behavior.

## 2. Target architecture and actors

```text
User
  <-> Local Agent
        reasoning-capable workflow client/operator
        - natural-language Intake Compiler
        - natural-language Operator Interface
        |
        | typed workflow protocol
        v
      WorkflowService / API boundary
        - caller authorization
        - request validation/dispatch
        |
        v
      Deterministic Orchestrator Runtime
        - durable state
        - routing / scheduling / fencing
        - authority / reconciliation / convergence
        |
        | WorkItems / InputBundles / Awaitables
        v
      Capability Executors
        Planner / Research / Worker / Reviewer / other specialists
        |
        v
      Typed Artifacts / Assessments / Receipts
```

### User

Owns explicit human authority reserved by workflow/profile policy, including any User-only requirements change, merge/release/deployment approval, paid access, or other protected decision.

### Local Agent

A reasoning-capable **workflow client/operator**, not the workflow state machine.

It may:

- understand conversational User intent;
- compile natural language into a typed admission proposal;
- query authoritative workflow state;
- explain status/results naturally;
- resolve conversational referents before submitting exact typed IDs;
- transport explicit User decisions;
- provide Local-Agent input where policy explicitly permits it.

Its hidden reasoning, conversational assumptions, or unsent interpretations are never authoritative workflow state.

### WorkflowService / API boundary

The authoritative client-facing application boundary. It validates caller authorization and maps typed Query/Update/Signal/Respond/admission requests onto the appropriate legacy or vNext runtime.

It is not a semantic reasoner.

### Orchestrator Runtime

The deterministic control plane. It owns authoritative workflow transitions and mechanically coordinates durable state, WorkItems, InputBundles, Awaitables, execution/recovery, authority, invalidation, and convergence.

If progress requires semantic judgment, it delegates that judgment through a typed reasoning capability rather than performing model inference internally.

### Capability Executors

Bounded executors for semantic or deterministic capabilities. Planner/Research/Worker/Reviewer are useful logical identities, but no fixed role is mandatory for every profile.

### Workflow Profile

A versioned code/configuration-owned composition defining a task class's admission schema/defaults, capabilities, artifact/Need schemas, authority/side-effect rules, budgets, interaction policy, status projection, and convergence policy.

Software engineering and deep research are profiles above the common kernel, not definitions of the kernel itself.

## 3. Core object model

The target runtime shall distinguish at least:

```text
Workstream
  = long-lived User/project continuity and run grouping

WorkflowAdmissionSpec
  = accepted machine-readable request used to create a run

WorkflowRun
  = one bounded admitted execution lifecycle

Objective / Constraint / Criterion
  = semantic definition of desired outcome and success

Plan / PlanTask
  = semantic strategy/decomposition, not runtime execution records

Finding
  = observed defect, uncertainty, contradiction, or unmet concern

Need
  = typed semantic request for capability or external input/authority

WorkItem
  = deterministic runtime-owned authorization for bounded executable work

InputBundle
  = exact correctness-bearing input manifest for one WorkItem execution

Artifact
  = durable semantic product/result

Assessment
  = typed judgment/evidence about a criterion or subject

Receipt
  = execution/transport/side-effect evidence

PendingAction
  = durable external input/authority dependency

Timer
  = durable time-based dependency

ExternalEvent
  = durable correlated external-event dependency

Budget / AuthorityPolicy / ConvergencePolicy
  = explicit runtime/profile control policy
```

Execution graphs/nodes may be an implementation mechanism for WorkItems/dependencies, but graph vocabulary is not the semantic domain model and shall not force software-specific phases onto non-software profiles.

## 4. Functional requirements

### A. Natural-language client and admission

#### VN-FR-001 — Natural-language primary UX

Normal product use shall allow the User to start, inspect, guide, and continue work through natural language with the Local Agent without requiring workflow IDs, slash commands, graph concepts, or internal schemas in ordinary cases.

#### VN-FR-002 — Local Agent is a reasoning client

The Local Agent shall be treated as a reasoning-capable workflow client/operator and shall not own authoritative workflow state transitions, scheduling, WorkItem creation, invalidation, or convergence.

#### VN-FR-003 — Typed authority boundary

Only explicit validated workflow protocol inputs and accepted durable workflow records may change authoritative workflow state. Hidden Local reasoning or conversation context shall not do so implicitly.

#### VN-FR-004 — Preserve exact User source

Workflow admission shall preserve the User's source request separately from Local-Agent interpretation.

#### VN-FR-005 — Preserve interpretation provenance

Material admission fields shall distinguish provenance sufficient to identify at least `user_explicit`, `local_interpreted`, `policy_default`, `planner_derived`, and `system_observed` where applicable.

#### VN-FR-006 — Thin admission

Admission shall carry operational intent, target references, explicit constraints/authority, temporal/budget/deliverable hints, autonomy/interaction policy, and material uncertainty without replacing Planner-owned Objective, AcceptanceCriteria, Plan, or runtime topology.

#### VN-FR-007 — Deterministic preflight

Admission preflight shall perform deterministic schema/policy/availability/authority checks and shall not claim that a model's interpretation semantically matches User intent.

#### VN-FR-008 — Proportional confirmation

Admission policy shall support automatic, Local-permitted, and explicit User confirmation levels. Local Agent shall not downgrade a runtime-required User confirmation.

#### VN-FR-009 — Durable admission lifecycle

A confirmation-capable admission flow shall be durable enough to survive client/process interruption and reconstruct source, interpretation, preflight, confirmation requirement, confirmation provenance, accepted spec, and activation result.

#### VN-FR-010 — Exact accepted activation

Activation shall bind to the exact accepted/preflighted AdmissionSpec identity/hash/version. A materially changed request shall require a new preflight/acceptance identity.

#### VN-FR-011 — Query before ambiguous control mutation

For context-sensitive natural-language commands such as "continue", the Local Agent should query authoritative state before choosing a mutating operation.

#### VN-FR-012 — Slash commands are compatibility/operator surfaces

Slash commands may remain supported as explicit CLI/debug/operator shortcuts but shall not be required for the normal product mental model.

### B. Deterministic control and authorization

#### VN-FR-013 — One authoritative client/service path

Workflow client operations shall pass through one authoritative application/service boundary for caller authorization and dispatch rather than maintaining divergent command/tool control paths.

#### VN-FR-014 — Explicit authorization context

Protected workflow operations shall validate an explicit caller authorization context/principal. Legacy v3 session ownership may be adapted through this boundary, but creator session identity shall not be assumed to be the permanent vNext authorization model.

#### VN-FR-015 — Replaceable client

An authorized replacement Local Agent, CLI, UI, or automation client shall be able to inspect/operate durable workflow state without changing workflow state-machine semantics or requiring the previous client's hidden memory.

#### VN-FR-016 — Deterministic transition rule

Given the same authoritative workflow state, accepted typed inputs/artifacts, observed external receipts/state, and bound policy/schema/profile versions, the Orchestrator Runtime shall choose the same valid control transition without model inference.

#### VN-FR-017 — No runtime semantic-model fallback

The Orchestrator Runtime shall not use an LLM/model internally to interpret evidence, create plans, review artifacts, resolve ambiguity, infer target meaning, or decide semantic criterion satisfaction.

#### VN-FR-018 — Semantic work is delegated

When workflow progress requires semantic judgment, the Orchestrator shall create/route a bounded typed reasoning WorkItem to an authorized capability.

#### VN-FR-019 — Deterministic validation first

Where a correctness check is mechanically decidable, runtime shall prefer deterministic validation over invoking a reasoning capability solely for that check.

#### VN-FR-020 — Fail closed on incompatible control input

Malformed, unknown-version, unauthorized, stale, context-incompatible, or policy-incompatible correctness-bearing inputs shall fail closed before they trigger authoritative transitions.

### C. Semantic objective, criteria, planning, and Need lifecycle

#### VN-FR-021 — Objective is distinct from Plan

The desired semantic outcome shall be represented independently from the strategy used to achieve it.

#### VN-FR-022 — Acceptance criteria are distinct from Plan

Acceptance criteria shall be versioned separately from Plan. Ordinary replanning shall not silently redefine success.

#### VN-FR-023 — Criteria provenance and authority

Criteria shall preserve provenance/authority sufficient to distinguish User-owned, policy-owned, and Planner-derived criteria. User/policy-owned criteria shall not be weakened or removed without the required authority transition.

#### VN-FR-024 — Plan binds exact objective/criteria versions

Every Plan shall reference the exact Objective and AcceptanceCriteria versions it is designed to satisfy.

#### VN-FR-025 — PlanTask is not WorkItem

A semantic PlanTask and an executable runtime WorkItem shall remain distinct objects with distinct lifecycle semantics.

#### VN-FR-026 — Explicit Need required for semantic execution demand

Reasoning roles shall express unresolved semantic work as typed Needs rather than expecting the runtime to infer capability from PlanTask prose.

#### VN-FR-027 — Need expresses demand, not execution authority

A Need may describe requested semantic capability/information, bounded question, subject/owner refs, and schema-allowed semantic metadata, but shall not authoritatively choose provider account/session, retry/fencing policy, graph IDs/edges, budget escalation, mutation authority, or User authorization.

#### VN-FR-028 — Plan change is distinct from requirements change

`plan_change` shall mean strategy/decomposition changes while the current Objective/AcceptanceCriteria remain active.

`requirements_change` shall mean a proposed Objective/AcceptanceCriteria change and shall follow applicable authority policy before activation.

#### VN-FR-029 — Clarification is distinct from requirements change

`clarification` shall represent missing/ambiguous external semantic input that must be resolved before Planner/another capability can safely determine or revise workflow semantics.

#### VN-FR-030 — Planner may re-enter

Planning shall be demand-driven and may occur at startup or later due to explicit planning/requirements/clarification Needs. It shall not be restricted to one fixed startup phase.

#### VN-FR-031 — Plan/requirements revisions are immutable/superseding

Semantic revisions shall create explicit new Objective/Criteria/Plan versions with reason, supersession, and affected references rather than silently mutating committed semantic history.

#### VN-FR-032 — Revision invalidation is explicit

Changed criteria/plan assumptions/tasks shall invalidate only declared dependent correctness-bearing results according to exact lineage/input policy; the Orchestrator shall not infer impact by reading prose.

### D. Need materialization, WorkItems, and capabilities

#### VN-FR-033 — Need may materialize as WorkItem or PendingAction

A validated Need shall materialize according to typed semantics/policy:

```text
internal executable capability needed -> WorkItem
external input/authority needed        -> PendingAction
```

A Need is not itself execution or external-response authority.

#### VN-FR-034 — WorkItems are runtime-owned

Only deterministic runtime code may create authoritative WorkItems, assign execution policy, materialize approved execution/dependency structures, or bind side-effect authority.

#### VN-FR-035 — WorkItem causal binding

Every WorkItem shall reference the Need/request owner that caused it and preserve enough causal identity for result return, tracing, deduplication, and invalidation.

#### VN-FR-036 — WorkItem boundedness

A WorkItem shall bind at least capability identity/version, exact InputBundle identity, side-effect class, applicable policy/budget/authority, idempotency/equivalence identity, lifecycle, execution references, and result Artifact/Receipt references.

#### VN-FR-037 — WorkItem versus execution realization

One WorkItem may map to one execution unit or a deterministic runtime-approved execution motif/subgraph. Model output shall not author arbitrary executable topology.

#### VN-FR-038 — Capability-based routing

Validated Needs shall resolve through a versioned code/configuration-owned capability registry. Provider/model/account/session selection remains a lower-level executor concern.

#### VN-FR-039 — Capability descriptor

A capability descriptor shall define accepted Need types, produced Artifact/Receipt types, side-effect class, authority/gates, eligible executor classes, input/output schemas, version, and relevant policy hooks.

#### VN-FR-040 — Capability registry authority

Model output shall not add, redefine, or override capability descriptors. Adding a provider/account shall not implicitly create a new semantic capability.

#### VN-FR-041 — Provider topology below semantic capability

Capability identity shall remain independent from provider/account/session identity so profile semantics are not coupled to one transport topology.

#### VN-FR-042 — Side-effect class enforcement

Runtime policy shall distinguish at least read-only work, repository mutation, external mutation, and protected human-authority operations. Read-only semantic demand shall never silently gain mutation authority.

#### VN-FR-043 — Deterministic routing

Need-to-capability/PendingAction materialization shall be deterministic for the same validated Need, authoritative state, and bound policy/profile/capability versions.

#### VN-FR-044 — Default result return rule

A capability result shall return first to the causal request owner unless an explicit validated routing contract says otherwise. Runtime shall not infer a downstream consequence by interpreting result prose.

#### VN-FR-045 — No direct agent spawning

Planner, Research, Worker, Reviewer, and other reasoning executors shall not directly spawn/invoke one another as workflow authority; they emit typed results/Needs and the Orchestrator coordinates follow-up.

#### VN-FR-046 — Equivalent work deduplication

Before creating duplicate active work, runtime should reuse/join a compatible WorkItem only when deterministic equivalence policy establishes compatible capability, exact inputs, authority, freshness, and result requirements. Natural-language similarity alone is insufficient.

#### VN-FR-047 — Parallel independent work

Independent READY WorkItems may execute concurrently subject to resource/account/session/side-effect policy.

#### VN-FR-048 — Verification is capability-oriented

Verification should be modeled as one or more capabilities/assessments rather than requiring one permanent universal Verifier role.

### E. Artifact, InputBundle, lineage, and trust

#### VN-FR-049 — Typed artifact communication

Correctness-bearing semantic communication shall use schema-versioned typed Artifacts/Assessments rather than unstructured conversation text as control authority.

#### VN-FR-050 — Artifact identity and provenance

Every correctness-bearing Artifact shall have stable identity, schema version, producer identity, producing WorkItem/runtime operation where applicable, and sufficient exact context/input binding for validation/reuse decisions.

#### VN-FR-051 — Structured fields are control-authoritative

When an Artifact contains structured fields plus explanatory prose/Markdown, structured validated fields shall be authoritative for routing/control meaning. Prose may explain but shall not override control semantics.

#### VN-FR-052 — Artifact immutability/supersession

Committed correctness-bearing Artifacts shall be immutable or replaced only through explicit supersession/versioning with traceable provenance.

#### VN-FR-053 — Durable artifacts independent of transcripts

Artifact correctness/recovery shall not depend on transient provider conversation state, Local hidden reasoning, or full workflow transcript replay.

#### VN-FR-054 — Persistent Finding lifecycle

Findings shall be first-class durable semantic records with stable identity and lifecycle sufficient to distinguish unresolved, resolved, and superseded/invalidated state.

#### VN-FR-055 — Finding causality

A Finding that requests follow-up shall reference the Need(s) it caused; resolution shall reference the Artifact/Assessment/authority result that resolves or supersedes it.

#### VN-FR-056 — Exact InputBundle required

Every executable WorkItem shall bind one deterministic persisted InputBundle before execution begins.

#### VN-FR-057 — InputBundle identity

An InputBundle shall identify all correctness-bearing Artifact/runtime fact references required by the WorkItem, projection-policy identity, and deterministic input hash/version.

#### VN-FR-058 — Sparse projection

Shared-state visibility shall not imply prompt delivery. Runtime shall project only explicit required dependencies/context and exclude unrelated branches, superseded state, stale exact-subject results, and full transcripts by default.

#### VN-FR-059 — Projection authority is runtime-owned

Models may semantically request information, but they shall not authoritatively inject arbitrary hidden/shared state into their own correctness-bearing InputBundle.

#### VN-FR-060 — Immutable execution input

Once an execution attempt starts, its canonical InputBundle identity shall not change. Materially changed correctness-bearing input requires fencing/cancellation/replacement or another explicit policy path.

#### VN-FR-061 — Result-to-input provenance

Correctness-bearing results shall reference the producing WorkItem and InputBundle/input identity.

#### VN-FR-062 — Independent evaluation projection

When independent review/research is required, peer conclusions shall not be injected into another independent WorkItem before independent evaluation completes. Later synthesis may consume both explicitly.

#### VN-FR-063 — Untrusted-content boundary

Model-produced prose, external excerpts, peer reasoning, and PR workspace text shall remain untrusted data and shall be delimited from runtime instructions and authoritative workflow facts.

#### VN-FR-064 — Artifact visibility is not broadcast

Persisting an Artifact shall not imply delivery to every executor. Explicit dependencies, causal ownership, and InputBundle projection determine consumption.

#### VN-FR-065 — Persistent lineage

Artifacts shall support explicit causal/dependency lineage sufficient for provenance, reuse, supersession, contradiction, resolution, validation, and invalidation.

#### VN-FR-066 — Causal invalidation

When correctness-bearing input is superseded/invalidated, runtime shall mark only explicit dependent results stale/re-evaluation-required instead of globally replaying unrelated work.

#### VN-FR-067 — Evidence-sensitive reuse

Evidence/research artifacts may be reused only while their bounded question, required context, source/freshness policy, schema/version, and other correctness-relevant conditions remain compatible.

#### VN-FR-068 — Provenance-preserving transformation

Any correctness-bearing schema/artifact transformation shall be explicit, deterministic or capability-produced under a typed contract, versioned, and provenance-preserving. An unrecorded LLM summary shall not silently become authoritative schema conversion.

### F. Durable interaction and awaitables

#### VN-FR-069 — First-class PendingAction

External input/authority dependencies shall be represented as durable runtime-owned PendingActions distinct from WorkItems.

#### VN-FR-070 — PendingAction contract

Each PendingAction shall have stable identity, causal owner/subject refs, lifecycle, versioned response schema, responder/authority policy, response provenance, and exact subject/head/state binding where required.

#### VN-FR-071 — Responder policy

PendingAction policy shall support User-only authority, Local-Agent-permitted input, and User-or-Local input classes. Local Agent shall not impersonate User-only authority.

#### VN-FR-072 — Multiple scoped PendingActions

Independent branches may have multiple simultaneous PendingActions. One unresolved action shall block only dependent paths unless explicit policy defines a global gate.

#### VN-FR-073 — WAITING_EXTERNAL is derived

A WorkflowRun shall project a workflow-level external-wait state only when no useful autonomous ready/running work remains and unresolved blocking external actions remain.

#### VN-FR-074 — Generic Respond operation

The client/runtime protocol shall support a typed response to one persisted PendingAction, with caller authorization, response schema/version, provenance, expected state/subject identity, and idempotency checks.

#### VN-FR-075 — Response idempotency/staleness

Same-response retries shall be safely idempotent where possible; conflicting duplicate, expired, cancelled, superseded, unauthorized, or stale responses shall fail closed.

#### VN-FR-076 — Continue is recovery, not semantic response

Legacy/operator `continue` shall retain recovery meaning and shall not be overloaded as the generic answer to PendingActions.

#### VN-FR-077 — Unsolicited input uses Signal/Update semantics

Unsolicited User/client directives shall enter through an explicit durable Signal/Update path with provenance and exact workflow context; semantic interpretation shall be delegated to reasoning capabilities when needed.

#### VN-FR-078 — First-class Timer

Long-running workflows shall support durable semantic Timers that survive process/client restart and are not represented as fake execution failure/recovery state.

#### VN-FR-079 — First-class ExternalEvent

External asynchronous events shall be durably correlated/deduplicated against explicit run/event identities or matching contracts.

#### VN-FR-080 — Awaiting is not failure

Waiting on PendingAction, Timer, or ExternalEvent shall not be classified as execution failure merely because no process is actively running.

### G. Assessment, convergence, budgets, and bounded execution

#### VN-FR-081 — CriterionAssessment is first-class

Semantic criterion satisfaction shall be represented by typed CriterionAssessment/Assessment artifacts, not by Orchestrator interpretation of prose.

#### VN-FR-082 — Assessment exact-subject binding

An Assessment shall bind the criterion/version and exact correctness-bearing subject/input/evidence identity it evaluated.

#### VN-FR-083 — Assessment verdict vocabulary

The baseline semantic assessment vocabulary shall distinguish at least `SATISFIED`, `UNSATISFIED`, and `INCONCLUSIVE`.

#### VN-FR-084 — Assessment method/authority

Assessment policy shall distinguish deterministic checks, Reviewer/verification judgments, and explicit User authority where applicable. Waiver/override shall be a separate authority object rather than a disguised `SATISFIED` verdict.

#### VN-FR-085 — Work completion is not criterion satisfaction

The runtime shall distinguish:

```text
WorkItem completed
PlanTask execution complete
Criterion assessed satisfied
WorkflowRun converged
```

One shall not imply the next without explicit policy/evidence.

#### VN-FR-086 — Stale assessments do not satisfy convergence

An Assessment whose criterion, exact subject/head/InputBundle, required evidence, or relevant policy changed shall not satisfy convergence until explicitly revalidated/reassessed.

#### VN-FR-087 — Profile-defined convergence

Successful WorkflowRun completion shall be a deterministic predicate over current typed state according to a versioned profile convergence policy, not arrival at one hard-coded phase or fixed semantic round count.

#### VN-FR-088 — Generic convergence ingredients

Profile convergence may require current acceptable criterion assessments, required deliverables, resolved blocking Findings, required authority gates, acceptable verification/receipts, absence of critical contradictions, and no required unresolved dependencies.

#### VN-FR-089 — Safety/resource limits are not success

Timeout, max-round, max-WorkItem, token/cost, wall-clock, or reopen limits shall not by themselves constitute semantic success.

#### VN-FR-090 — Explicit budgets

Workflow/profile policy shall be able to bind resource budgets such as concurrency, WorkItem count, model/tool usage, cost/token, fan-out, and wall-clock independently from success criteria.

#### VN-FR-091 — No silent budget escalation

Agents/clients shall not silently increase authoritative resource budgets. Budget changes requiring policy/User authority shall use explicit durable control/interaction paths.

#### VN-FR-092 — Bounded non-convergence

Runtime shall detect/limit repeated equivalent Needs, finding reopen loops, no-new-evidence cycles, repeated equivalent repairs, or other stagnation according to explicit policy.

#### VN-FR-093 — Exhaustion fails closed

When budget/stagnation/loop policy prevents further safe progress, the WorkflowRun shall remain durably blocked/action-required with unresolved causal state preserved; it shall not be reported successful.

### H. Delivery, Workstream, feedback, and continuation

#### VN-FR-094 — Delivery does not imply completion

Producing a User-usable deliverable shall not automatically imply WorkflowRun completion. Profiles may expose durable DeliveryArtifacts/checkpoints before terminal convergence.

#### VN-FR-095 — Delivery exact identity

A DeliveryArtifact shall bind exact deliverable identity sufficient for stale feedback/approval detection; software deliveries shall bind exact repository/PR/head or equivalent immutable version identity.

#### VN-FR-096 — Active-run feedback may resume same run

Typed User feedback targeting a non-terminal active/waiting run may resume that same run after semantic interpretation produces accepted typed consequences.

#### VN-FR-097 — Free-form feedback is not direct mutation authority

The Orchestrator shall not interpret free-form feedback into mutations. Planner/Reviewer/another reasoning capability shall produce typed consequences such as evidence, Finding, requirements change, plan change, implementation change, or informational/no-change.

#### VN-FR-098 — Workstream is continuity, not execution authority

A Workstream shall group related WorkflowRuns/artifacts for User/project continuity but shall not replace or directly mutate per-run state machines.

#### VN-FR-099 — Terminal runs remain terminal

Post-terminal follow-up shall create a new continuation WorkflowRun rather than reopening a completed run merely for convenience.

#### VN-FR-100 — Continuation uses explicit lineage

A continuation admission shall explicitly identify source Workstream/run/artifact lineage and the new User request/target/profile context.

#### VN-FR-101 — Retention-safe imported continuation inputs

Source Artifacts remain historically owned by their producing run. Before a child run depends on selected correctness-bearing parent artifacts, it shall persist an exact child-owned imported snapshot/reference representation sufficient to remain reproducible after parent payload retention cleanup, with source run/artifact/hash lineage preserved.

#### VN-FR-102 — Natural-language target resolution stays client-side

Local Agent may resolve phrases such as "implement that report" or "the PR I tested" using conversation/workstream queries, but mutation shall reach the Orchestrator only with explicit typed target identities. Material ambiguity requires explicit confirmation rather than runtime prose interpretation.

### I. Recovery, execution safety, versioning, and observability

#### VN-FR-103 — Durable execution identity and fencing

Executions shall have durable attempt identity, ownership/lease/fencing semantics, and stale-result rejection sufficient to prevent superseded attempts from committing authoritative results.

#### VN-FR-104 — Retry remains exact-input bounded

Retry policy shall preserve causal ownership, exact InputBundle identity, side-effect/idempotency constraints, and fencing. Materially changed correctness-bearing inputs require explicit replacement/new WorkItem policy.

#### VN-FR-105 — Structured failure classes

Recovery decisions shall use structured failure categories plus authoritative state rather than free-form executor prose alone.

#### VN-FR-106 — Minimal recovery scope

Recovery should target the smallest failed/orphaned dependency/work unit compatible with correctness rather than replaying unrelated completed work.

#### VN-FR-107 — Side-effect reconciliation before blind retry

When external mutation outcome is uncertain and an observation contract exists, runtime shall reconcile observed external state before issuing a blind duplicate mutation.

#### VN-FR-108 — Long-running definition pinning

WorkflowRun correctness-bearing state shall bind relevant profile, policy, capability, artifact schema, projection, and agent/prompt definition versions needed for compatible recovery.

#### VN-FR-109 — No silent incompatible upgrade

A long-lived run shall not silently resume under incompatible newer definitions solely because runtime code was deployed. Cross-version migration shall be explicit and provenance-preserving.

#### VN-FR-110 — Machine-readable status

Core status shall expose domain-neutral authoritative state sufficient to report lifecycle, autonomous progress, ready/running/recovering/completed work, pending actions, timer/event waits, blockers, budgets, significant artifacts, and convergence/terminal state.

#### VN-FR-111 — Semantic coordination trace

Observability shall be able to explain causal paths such as:

```text
User source
 -> AdmissionSpec
 -> Objective/Criteria/Plan
 -> Finding/Need
 -> WorkItem or PendingAction
 -> InputBundle/execution
 -> Artifact/Assessment/Receipt
 -> owner/resolution
 -> convergence decision
```

Diagnostic history shall not replace authoritative workflow/artifact state.

#### VN-FR-112 — Outcome-oriented evaluation

Dynamic workflow evaluation shall judge final typed state, required checkpoints, authority invariants, correctness relationships, freshness/exact-subject bindings, and resource use rather than requiring one canonical execution trajectory.

### J. Domain specialization and compatibility

#### VN-FR-113 — Domain-agnostic kernel

The generic kernel shall not require PR, Git, CI, repository, Writer/Worker, or Reviewer concepts for non-software workflows.

#### VN-FR-114 — Software-specific exact-head rules live in software profile

Repository mutation, PR/head/CI/review/merge authority, single-writer Git policy, and PR collaboration workspace remain important requirements but shall be defined by software-profile contracts rather than universal kernel semantics.

#### VN-FR-115 — Research profile must not require software topology

A deep-research workflow shall be able to use generic kernel objects plus research capabilities/artifacts/timers/interactions without requiring `chatgpt-writer`, Git, or a PR.

#### VN-FR-116 — v3 remains migration-compatible

Existing `WorkflowJob` v3 persisted state, current command behavior, exact-head semantics, recovery, retention, and public exports shall remain supported during migration until an explicit tested/versioned retirement or migration decision.

#### VN-FR-117 — vNext state is additive during migration

vNext WorkflowRun/admission/artifact/work-item/action/workstream state shall initially coexist with v3 storage rather than mutating the v3 schema in place and making existing persisted jobs unreadable.

#### VN-FR-118 — Existing executors should be adapted before replaced

Where suitable, vNext capability adapters should reuse current Team/Writer/provider-native research executors behind explicit contracts before introducing a parallel duplicate execution implementation.

## 5. Initial Need and capability vocabulary

The initial vocabulary should support at least the following semantics. Exact names may evolve under narrower ADR/SRS authority.

| Need type | Default materialization | Capability / external dependency | Default side-effect class |
| --- | --- | --- | --- |
| `external_evidence` | WorkItem | external/deep research | read-only |
| `repository_evidence` | WorkItem | repository research | read-only |
| `implementation_change` | WorkItem | repository implementation | repository mutation |
| `artifact_generation` | WorkItem | artifact generation | profile-dependent |
| `plan_change` | WorkItem | planning | read-only workflow semantic state |
| `requirements_change` | WorkItem, then authority gate if required | planning + possible PendingAction | profile/authority dependent |
| `clarification` | reasoning WorkItem and/or PendingAction | clarification formulation + external input | external input |
| `evidence_verification` | WorkItem | evidence verification | read-only |
| `review_current_state` | WorkItem | review/assessment | read-only |
| protected User decision | PendingAction | User authority | human-authority-required |

The table is semantic policy, not provider/account routing.

## 6. Initial Artifact/Assessment and runtime record families

Initial semantic families should include:

```text
UserSource / imported source input
ObjectiveArtifact
AcceptanceCriteriaArtifact
PlanArtifact / PlanRevisionArtifact
FindingArtifact
EvidenceArtifact / Claim / Contradiction
Implementation/GeneratedOutput Artifact
Validation/Verification Artifact
CriterionAssessment / ReviewAssessment
ReportArtifact
DeliveryArtifact
UserFeedbackArtifact
ProposedRequirementsRevision
```

Initial runtime/control records should include:

```text
WorkflowAdmission record / AcceptedAdmissionSpec
WorkflowRun
CapabilityDescriptor
WorkItem
InputBundle
ExecutionAttempt / ExecutionReceipt
PendingAction / InteractionResponse
Timer
ExternalEvent
ResourceBudget
AuthorityPolicy
ConvergencePolicy
Workstream
Continuation/import lineage record
```

Runtime/control records are not interchangeable with model-produced semantic artifacts.

## 7. Representative product behavior

### Software journey

```text
User natural-language feature request
 -> Local Agent admission compilation
 -> deterministic preflight/confirmation
 -> software WorkflowRun
 -> Planner Objective/Criteria/Plan/Needs
 -> research / implementation / assessment loops
 -> exact-head reviewed DeliveryArtifact
 -> User local test / feedback
 -> typed semantic consequence
 -> targeted revision + fresh exact-head assessment
 -> User-only merge authority when required
 -> software-profile convergence
```

The reviewed PR may be delivered before the run is terminal.

### Research-to-implementation journey

```text
User research request
 -> research WorkflowRun
 -> evidence / synthesis / verification / ReportArtifact
 -> research convergence and terminal completion

User: "implement this"
 -> continuation admission in same Workstream
 -> selected report/evidence imported with source lineage
 -> new software WorkflowRun
 -> Planner translates research into software Objective/Criteria/Plan
 -> implementation / review / Delivery / feedback
```

The completed research run remains terminal.

### Targeted feedback loop

```text
Reviewer Finding F1
 -> Need(external_evidence)
 -> WorkItem(external_research)
 -> Evidence E1
 -> owning Reviewer/F1
 -> Assessment / typed consequence
 -> possible implementation_change / plan_change / requirements_change
```

Research answers the bounded question; the Orchestrator does not infer downstream action from prose.

## 8. Migration acceptance order

Implementation should follow dependency order rather than the older clean-slate requirement numbering:

1. harmonize proposed contracts and actor terminology;
2. introduce one authoritative WorkflowService/authorization boundary while preserving v3;
3. implement durable admission/preflight/confirmation with exact activation identity;
4. introduce parallel vNext WorkflowRun/artifact/work-item/InputBundle/capability substrate;
5. implement semantic Objective/Criteria/Plan/Need/Assessment schemas plus baseline convergence;
6. implement deterministic vNext RunEngine/Driver/Scheduler and recovery path;
7. adapt existing Planner/Research/Worker/Reviewer executors behind capability contracts;
8. implement durable PendingAction/Signal/Respond interaction;
9. deliver the vNext software PR/local-feedback journey;
10. add Workstream continuation with retention-safe imported artifacts;
11. add durable Timer/ExternalEvent and long-running research profile;
12. harden convergence, authority, budgets, stagnation, version migration, and evaluation;
13. retire/migrate v3 only after explicit production parity and compatibility evidence.

## 9. Core invariants

> User interacts naturally through a reasoning Local Agent; authoritative workflow state changes only through explicit validated machine-readable protocol/state.

> Local Agent may reason, but the Orchestrator Runtime owns deterministic control transitions.

> Objective, AcceptanceCriteria, Plan, PlanTask, Need, WorkItem, Artifact, Assessment, and PendingAction are distinct objects with distinct authority/lifecycle semantics.

> A Need expresses semantic demand; deterministic policy materializes it as internal WorkItem execution or external PendingAction dependency.

> Capabilities are the stable semantic execution contract; provider/account/session routing is lower-level transport policy.

> Every executable WorkItem is bound to one exact immutable InputBundle identity for that attempt.

> Correctness-bearing communication is typed/artifact-based and provenance-preserving rather than transcript/hidden-reasoning based.

> Semantic criterion satisfaction comes from current typed Assessments; the Orchestrator does not judge semantic truth by reading prose.

> WorkflowRun convergence is a deterministic profile predicate over current typed state; resource exhaustion is never success.

> A pending external action blocks only its dependents; unrelated autonomous work continues when possible.

> Workstream provides project continuity while each WorkflowRun preserves a bounded immutable historical lifecycle.

> Delivery may precede terminal completion; post-terminal follow-up creates continuation rather than reopening history.

> Recovery is based on durable exact state, execution fencing, receipts, observations, timers/events, and version bindings, not replay of hidden model reasoning.

> vNext evolves current production assets incrementally and preserves v3 compatibility until a deliberate migration/retirement decision.
