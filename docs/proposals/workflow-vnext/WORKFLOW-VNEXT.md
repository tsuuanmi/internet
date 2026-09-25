# Workflow vNext — Domain-Agnostic Durable Artifact Orchestration

- **Status:** evolving design proposal; not yet the as-built runtime contract
- **Started:** 2026-09-16
- **Scope:** natural-language admission, deterministic orchestration, typed artifacts, capability routing, durable interaction/waits, recoverable long-running execution, workflow profiles, and convergence

This document is the high-level target architecture. Narrow Proposed ADRs and specialized `SRS-VNEXT-*` modules override this narrative where they are more specific. Current code and as-built contracts remain authoritative until corresponding vNext behavior is implemented, tested, and promoted.

## 1. North star

The target is not only a coding workflow. It is a **domain-agnostic durable workflow runtime** that can support software engineering, deep research, monitoring, document/report generation, and future long-running task classes.

North-star properties:

```text
efficient
deterministic control plane
artifact-based correctness state
capability/profile driven
autonomous by default
recoverable across process/client/provider failures
interruptible only by explicit external dependencies/authority
natural-language accessible through a reasoning Local Agent
```

The intended product interaction is:

```text
User natural language
        ^
        |
        v
Local Agent
  reasoning workflow client
  - Intake Compiler
  - Operator Interface
        |
        | typed workflow protocol
        v
+-------------------------------------------+
| Deterministic Orchestrator Runtime        |
| WorkflowEngine / driver / scheduler       |
|                                           |
| validate / persist / route / schedule     |
| reconcile / fence / invalidate / gate     |
+--------------------+----------------------+
                     |
         typed WorkItems / Awaitables
                     |
                     v
             Capability Executors
                     |
                     v
        typed Artifacts / Assessments
                  / Receipts
```

The Local Agent and specialist capabilities may reason. The Orchestrator does not use model reasoning to choose authoritative workflow transitions.

## 2. Natural-language workflow admission

User language is not treated as an already-executable workflow specification.

The startup path is:

```text
User source
  -> Local Agent compiles WorkflowAdmissionDraft
  -> Orchestrator deterministic preflight
  -> AdmissionPreview
  -> AUTO_SUBMIT / LOCAL_CONFIRM / USER_CONFIRM
  -> exact AcceptedAdmissionSpec identity/hash
  -> activate
  -> Planner / semantic execution
```

The admission layer preserves the distinction between:

```text
what the User explicitly said
what the Local Agent inferred
what policy defaulted
what the User confirmed
what Planner later derived
```

A schema-valid request is not automatically proof that the Local Agent understood the User correctly.

The Orchestrator validates structure, capability availability, authority, budget/risk policy, target resolution, and other mechanically decidable constraints. Material semantic alignment is handled by Local Agent/User interaction according to confirmation policy.

Admission is intentionally thin. It does not replace Planner-owned Objective, AcceptanceCriteria, Plan, or Need semantics.

## 3. Local Agent as reasoning workflow client

The Local Agent has two conceptual responsibilities.

### Intake Compiler

```text
natural-language request
  -> provenance-preserving typed workflow admission/input
```

### Operator Interface

```text
authoritative machine workflow state/actions
  -> natural-language explanation and interaction
```

The User should not need to know `/workflow status`, `/workflow continue`, or similar internal commands in normal use.

Examples:

```text
User: "How is yesterday's workflow doing?"
Local Agent -> Query(status) -> explain authoritative result

User: "Continue it."
Local Agent -> Query current state first
  -> recovery boundary: issue Continue/Update
  -> already RUNNING: explain no action needed
  -> WAITING_EXTERNAL: inspect/respond to PendingAction
```

Slash commands remain useful as CLI/debug/operator shortcuts.

The Local Agent may reason conversationally, but its hidden reasoning is never durable workflow authority.

## 4. Domain-neutral workflow protocol

The Local Agent and other clients interact with the runtime through typed operations conceptually equivalent to:

```text
Query
  read authoritative workflow state without mutation

Update
  validated tracked mutation with explicit success/failure

Signal
  asynchronous external/User input that may trigger later work

Respond
  resolve one persisted PendingAction
```

Only explicit validated protocol inputs may change authoritative workflow state.

## 5. Deterministic Orchestrator boundary

The Orchestrator owns code/policy operations such as:

```text
admission/schema validation
durable state persistence
Need -> capability resolution
WorkItem creation
InputBundle construction
approved graph/dependency motifs
readiness/scheduling
Timer/external-event registration and wakeup
PendingAction lifecycle
authority enforcement
retry/fencing/idempotency
resource budgets
lineage invalidation
side-effect reconciliation
convergence predicates
recovery
```

It does not:

```text
interpret ambiguous prose semantically
invent plans
summarize research
judge evidence quality through hidden reasoning
review semantic correctness
silently rewrite agent conclusions
```

Semantic judgment is delegated to bounded reasoning capabilities and returned as typed artifacts/assessments.

## 6. Domain-neutral object model

The generic kernel understands concepts such as:

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

Domain profiles may extend this vocabulary with specialized Need/Artifact/Receipt types while preserving the same control semantics.

## 7. Semantic planning boundary

The semantic planning chain remains separated from runtime execution:

```text
Admission/User source
  -> ObjectiveArtifact
  -> AcceptanceCriteriaArtifact
  -> PlanArtifact
       -> PlanTask(s)
       -> NeedArtifact(s)
  -> Orchestrator materializes WorkItem/PendingAction
```

Key distinctions:

```text
Objective       = desired outcome
Acceptance      = definition of success
Plan            = semantic strategy
PlanTask        = semantic unit of intended work
Need            = requested capability/input
WorkItem        = runtime-owned execution authorization
PendingAction   = external authority/input dependency
```

Ordinary replanning changes strategy/decomposition, not the definition of success. Requirements changes follow a separate provenance/authority path.

## 8. Capability-first execution

The kernel routes typed Needs to versioned capabilities rather than hard-coding one universal team topology.

Logical roles such as Planner, Research, Worker, and Reviewer remain useful executor identities but are not mandatory for every workflow.

Examples:

```text
software_change.v1
  repository_research
  implementation
  git_mutation
  code_review
  ci_verification

deep_research.v1
  web_research
  source_acquisition
  evidence_extraction
  research_synthesis
  citation_verification
  report_generation

monitoring.v1
  observation
  periodic_refresh
  condition_evaluation
  notification_artifact
```

Provider/model/account/session routing remains below semantic capability selection.

### 8.1 Internet remains a plugin and composes plugins

Internet is not intended to become the host platform for every execution capability. It is itself a plugin running inside a host such as DeepSeek Harness and should consume other host/plugin capabilities through stable contracts where practical.

The target dependency direction is:

```text
workflow/profile semantic Need
  -> versioned capability contract
  -> host/plugin capability resolution
  -> selected implementation
  -> typed Artifact / Assessment / Receipt
```

The orchestrator should own collaboration correctness semantics, not commodity implementations merely because a workflow needs them.

Examples of capabilities that should remain independently replaceable when a real substitution boundary exists include browser runtime, repository hosting, coding-agent execution, search/research, storage backends, and notification transport.

Authenticated ChatGPT/Gemini web participation remains strategically useful, but it is a provider implementation below the participant/capability boundary rather than a generic-kernel assumption.

Replaceability must preserve the semantics relied on by the workflow. An alternative implementation is valid only if it satisfies the required capability version, schemas, authority rules, side-effect/reconciliation behavior, cancellation semantics, and receipt/failure contracts.

See [Product thesis and adaptive plugin composition](PRODUCT-THESIS.md) for the broader build-vs-adapt rationale.

## 9. Artifact-based communication

Correctness-bearing semantic communication uses typed durable artifacts rather than transient chat transcripts.

Artifacts are:

```text
schema-versioned
persisted
producer-attributed
exact-context/input bound where required
immutable or explicitly superseded
lineage-addressable
```

Human/model-readable prose may accompany structured data, but structured fields carry authoritative control meaning.

Shared visibility is not equivalent to correctness-bearing delivery:

```text
artifact exists in shared state
  !=
artifact belongs in every InputBundle
```

Every executable WorkItem receives one persisted exact sparse InputBundle.

## 10. Need, WorkItem, and causal ownership

Core internal flow:

```text
Finding / unresolved decision
  -> Need
  -> deterministic validation/routing
  -> WorkItem OR PendingAction
  -> execution/external response
  -> Artifact / Assessment / Receipt / Resolution
  -> return to causal owner
  -> next typed Need or convergence
```

A Need describes semantic demand, not provider account, browser session, retries, graph IDs, budgets, or authority.

Result routing returns first to the persisted causal owner unless a validated routing contract says otherwise.

## 11. Long-running awaitables

Long-running workflows need first-class durable waiting beyond WorkItems.

A dependency may wait on:

```text
WorkItem
  internal capability execution

PendingAction
  User/Local input or authority

Timer
  durable time-based wakeup

ExternalEvent
  webhook/signal/observed external condition
```

Waiting is not failure.

The scheduler reasons mechanically over dependency satisfaction rather than domain meaning.

## 12. Autonomous by default

Once activated, the workflow continues as far as possible without requiring a connected Local Agent/User.

```text
ready autonomous work exists
  -> execute it

one dependency needs external input
  -> create durable PendingAction
  -> block only dependent paths
  -> continue unrelated work

no autonomous work remains + blocking external dependency exists
  -> WAITING_EXTERNAL
```

A Local Agent may disappear and a different authorized client may reconnect later using durable state.

## 13. External interaction and authority

`PendingAction` is distinct from WorkItem and may require responder policies such as:

```text
USER_AUTHORITY
LOCAL_AGENT_INPUT
USER_OR_LOCAL
```

Responses preserve provenance, such as:

```text
user_explicit
local_agent
operator/system_policy
```

Local Agent reasoning cannot impersonate User-only authority.

Responses are schema-validated, authority-checked, version/state-fenced, idempotent, and reject stale/superseded actions.

Resolving an action automatically re-evaluates readiness; `continue` remains an operator recovery concept rather than generic semantic resume.

Unsolicited User changes use Signal/Update and are routed to semantic capabilities when interpretation/replanning is required.

## 14. Recovery and durable execution

The target runtime must survive:

```text
Local Agent disconnect/restart
Orchestrator process restart
provider/browser/session failure
partial execution failure
transport loss
long User waits
multi-day timers
uncertain external side-effect responses
runtime/profile/model upgrades during long workflows
```

Recovery uses durable workflow state, typed artifacts, exact InputBundles, execution identity/fencing, receipts, timers/events, and external observation.

Hidden chain-of-thought and transient conversation state are never replay requirements.

Recovery should target the smallest failed/orphaned work unit compatible with correctness and preserve completed independent work.

## 15. Versioning for long-lived workflows

Long-running workflows may outlive profile/runtime/model deployments.

Correctness-bearing records therefore bind relevant versions, including as applicable:

```text
workflow schema version
profile version
policy version
capability version
artifact schema version
InputBundle projection version
agent/prompt definition version when compatibility matters
```

A workflow must not silently resume under incompatible definitions. Cross-version migration is explicit and provenance-preserving.

## 16. Efficiency

Efficiency is a first-class architectural goal.

Principles include:

```text
deterministic checks before model calls
sparse exact InputBundles
parallel independent WorkItems
reuse compatible artifacts
causal invalidation instead of global replay
deduplicate compatible outstanding work
continue independent work while external dependencies wait
Timer/Event waits instead of busy polling when possible
bounded feedback loops and explicit budgets
```

Resource limits are safety/efficiency controls and never imply semantic success.

## 17. Workflow profiles

A profile is code/configuration-owned composition for one class of workflows.

It may define:

```text
admission schema/defaults
capability set
Need/Artifact schemas
side-effect policy
authority/interaction policy
budget defaults
convergence policy
status projections
domain integrations
```

Software-specific concepts such as repository, PR, Git head, CI, merge authority, Worker-only commits, and PR shared workspace belong to the software profile rather than the generic kernel.

Research workflows may instead use Source/Evidence/Synthesis/Citation/Report artifacts plus Timers and external-access PendingActions.

## 18. Software profile extension

A software workflow may additionally define:

```text
RepositoryTarget
PullRequestArtifact
GitMutationWorkItem
HeadBoundReview
CIHealthReceipt
MergeAuthorization
PR shared collaboration workspace
```

Worker may remain the sole repository writer for this profile.

Exact-head Git/review/CI semantics remain mandatory where software-profile policy requires them.

## 19. Deep research example

A multi-day research workflow may look like:

```text
Admission
 -> Planning
 -> Research round 1
 -> EvidenceArtifacts
 -> Timer
 -> Research round 2
 -> Evidence update/supersession
 -> Timer
 -> Final research round
 -> Synthesis
 -> Citation/source verification
 -> ReportArtifact
```

If a paid/authenticated source is encountered:

```text
Need(external access)
 -> PendingAction(USER_AUTHORITY)
```

Independent research continues while that branch waits.

No PR, Git, Worker, or CI primitive is required.

## 20. Status and observability

Core status is machine-readable and domain-neutral.

Representative dimensions:

```text
workflow lifecycle
autonomous progress available?
ready/running/recovering/completed WorkItems
pending external actions
active Timers/Event waits
blocking Findings/dependencies
budget usage
latest significant Artifacts
terminal/convergence state
```

Profiles may add views such as PR/head/CI or research coverage/source freshness.

The Local Agent converts this machine state into natural-language answers for the User.

## 21. Convergence

The kernel does not define success as reaching one hard-coded coding phase.

Profiles compose explicit convergence predicates over typed state, such as:

```text
required criteria assessed satisfied
required deliverable artifacts exist
blocking Findings resolved
required assessments acceptable
required authority gates resolved
critical contradictions absent
required awaitables completed/resolved
```

A software profile may add exact-head CI/review conditions. A research profile may add coverage/source/citation/report conditions.

## 22. Horizontal contracts

The architecture is organized around three domain-neutral contracts:

```text
1. Workflow Admission Protocol
   Local Agent -> Orchestrator
   natural language compiled/preflighted/confirmed as typed admission

2. Workflow Runtime Protocol
   Orchestrator <-> capabilities
   Needs / WorkItems / InputBundles / Artifacts / Assessments / Receipts / Awaitables

3. Workflow Interaction Protocol
   Orchestrator <-> Local Agent/User
   Query / Update / Signal / Respond / PendingAction
```

Coding, research, monitoring, and future domains specialize above these contracts rather than creating separate workflow engines.

## 23. Production boundary

Nothing in this document claims current implementation.

Current as-built code/docs win for production behavior. Proposed ADRs and specialized SRS modules define the target contract until corresponding runtime implementation/tests are promoted.
