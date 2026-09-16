# ADR-0019 — Make the Workflow Runtime Domain-Agnostic, Artifact-Based, and Recoverable

- **Status:** Proposed
- **Date:** 2026-09-16
- **Updated:** 2026-09-16 after core-SRS harmonization
- **Related:** ADR-0009..0018, ADR-0020, ADR-0021

## Context

The existing workflow grew from a software-engineering pipeline, so many current concepts are repository specific: PR, Git head, Writer/Worker, code review, CI, merge authority.

The target architecture must support long-running work beyond coding, including deep research, monitoring, document/report production, and other multi-stage tasks that may run for hours, days, or longer.

A production workflow kernel therefore cannot make software-engineering concepts mandatory control-plane primitives. It needs a small domain-neutral model for bounded runs, durable semantic artifacts, executable work, external waiting, time/events, recovery, authority, continuation, and convergence.

## Decision

The workflow core becomes a **domain-agnostic durable workflow kernel**.

Its north-star properties are:

```text
efficient
deterministic control plane
artifact-based communication
durable/recoverable execution
autonomous by default
interruptible by explicit external dependencies
capability/profile driven rather than software-topology hard-coded
natural-language accessible through the Local Agent
```

The kernel does not know that a run is "coding" or "research" except through profile/capability/schema configuration and typed state.

## Product architecture

```text
User natural language
        ^
        |
        v
Reasoning Local Agent
  - intake compiler
  - operator interface
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
  - validation / routing
  - scheduling / recovery
  - authority / budgets
  - convergence
        |
        | WorkItems / Awaitables
        v
Capability executors
  Planner / Research / Worker / Reviewer / other specialists
        |
        v
Typed Artifacts / Receipts / Assessments
```

The Local Agent may reason. Specialist executors may reason. The control plane does not use model reasoning to choose authoritative workflow transitions.

## Workstream versus WorkflowRun

The kernel distinguishes project continuity from one bounded execution lifecycle.

```text
Workstream
  = long-lived grouping/navigation/continuation context

WorkflowRun
  = one admitted objective with exact profile/policy/version/lifecycle state
```

A terminal WorkflowRun remains terminal. Later follow-up creates a continuation WorkflowRun under the same Workstream with explicit lineage rather than reopening historical state.

Workstream is not another scheduler/state machine.

## Domain-neutral object model

The kernel should understand concepts such as:

```text
Workstream
WorkflowAdmissionSpec
WorkflowRun
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

Domain profiles may add specialized Artifact/Need/Receipt types while preserving these control semantics.

## Need materialization and awaitables

A typed Need expresses semantic demand but is not execution authority.

The deterministic Orchestrator materializes it according to typed semantics/policy:

```text
Need
  +-> internal executable capability needed
  |     -> WorkItem
  |
  +-> external authority/input needed
        -> PendingAction
```

Long-running dependencies may additionally wait on:

```text
Timer
  durable time-based wakeup

ExternalEvent
  webhook/signal/observed external condition
```

The scheduler reasons mechanically over dependency satisfaction, not domain meaning.

Conceptually:

```text
dependent state
   waits on
      |
      +-> WorkItem completed
      +-> PendingAction resolved
      +-> Timer fired
      +-> ExternalEvent matched
```

This allows multi-day research, monitoring, delayed follow-up, and asynchronous callbacks without treating waiting as process failure.

## Capability-first architecture

Executable Needs route through versioned capabilities.

The kernel does not require fixed universal roles such as Worker or Reviewer for every workflow.

Examples:

```text
software profile:
  planning
  repository_research
  implementation
  git_mutation
  code_review
  ci_verification

research profile:
  planning
  web_research
  source_acquisition
  evidence_extraction
  research_synthesis
  citation_verification
  report_generation

monitoring profile:
  observation
  condition_evaluation
  periodic_refresh
  notification_artifact
```

Logical roles are useful executor identities, but capabilities are the stable runtime contract.

## Workflow profiles

A profile is a versioned code/configuration-owned composition for a class of workflows.

It may define:

```text
admission schema/defaults
available capabilities
Artifact/Need schemas
side-effect policy
authority policy
interaction policy
budget defaults
convergence policy
projection/status policy
optional domain-specific integrations
```

Software engineering becomes one profile, not the definition of the kernel.

## Software-specific extension

Software workflows may additionally define:

```text
RepositoryTarget
PullRequestArtifact
GitMutationWorkItem
HeadBoundReview/Assessment
CIHealthReceipt
MergeAuthorization
PR shared workspace
```

These remain important but live above the generic kernel.

A research workflow must not require any of them.

## Research/long-running extension

A deep-research workflow may instead use:

```text
ResearchQuestion
SourceArtifact
EvidenceArtifact
ResearchSynthesis
CitationAssessment
ReportArtifact
Timer
PendingAction for paid/authenticated sources
```

Representative multi-day flow:

```text
Planning
  -> Research round 1
  -> Evidence Artifacts
  -> Timer / next scheduled observation
  -> Research round 2
  -> Evidence update/supersession
  -> Timer
  -> Final research round
  -> Synthesis
  -> Verification/Assessment
  -> ReportArtifact
```

The run may be disconnected from the Local Agent throughout autonomous periods.

## Artifact-based semantics

Artifacts are the durable semantic interface between reasoning execution and control state.

The runtime shall not use transient chat transcripts or hidden chain-of-thought as workflow authority.

Artifacts are:

```text
schema-versioned
persisted
typed
producer-attributed
input/context-bound where required
immutable or explicitly superseded
lineage-addressable
```

Human/model-readable prose may be included, but authoritative control meaning lives in validated structured fields.

## Deterministic control plane

The Orchestrator owns code/policy operations such as:

```text
schema/admission validation
state transitions
Need -> WorkItem/PendingAction materialization
capability resolution
InputBundle projection
approved execution/dependency motifs
readiness/scheduling
Timer/event registration and wakeup
PendingAction lifecycle
authority enforcement
retries/fencing/idempotency
resource budgets
lineage invalidation
side-effect reconciliation
convergence predicates
recovery
```

If a decision requires semantic judgment, it is delegated to a reasoning capability and returned as a typed Artifact/Assessment.

## Recoverability

Durable correctness must survive:

```text
Local Agent disconnect/restart
Orchestrator process restart
provider/browser/session failure
partial execution failure
transport loss
long waits for User response
long timers
uncertain side-effect responses
software deployment between workflow steps
```

Recovery reconstructs state from durable records, Artifacts, Receipts, Timers/Events, execution fencing, and external observation. It never depends on replaying hidden reasoning.

## Version pinning for long-lived runs

Long-running WorkflowRuns may outlive runtime/profile/model deployments.

Correctness-bearing records should bind relevant versions, including as applicable:

```text
workflow schema version
profile version
policy version
capability version
InputBundle projection version
Artifact schema version
agent/prompt definition version when compatibility matters
```

A WorkflowRun must not silently resume under incompatible definitions merely because newer code exists.

Migration across versions must be explicit and provenance-preserving.

## Efficiency

A general workflow runtime should avoid unnecessary agent execution.

Efficiency principles include:

```text
deterministic validation before model calls
sparse exact InputBundles
parallel independent WorkItems
reuse compatible Artifacts
causal invalidation rather than global replay
deduplicate equivalent outstanding work
continue independent work while external dependencies wait
Timers/Events instead of busy polling when possible
bounded feedback loops and budgets
```

Semantic success and resource limits remain separate concepts.

## Status and observation

Status is a machine-readable projection of durable WorkflowRun state and should be domain-neutral at the core.

Representative generic dimensions:

```text
run lifecycle
autonomous progress available?
ready/running/recovering/completed WorkItems
pending external actions
active Timers/Event waits
blocking Findings/dependencies
budget usage
latest significant Artifacts
terminal/convergence condition
```

Profiles may add domain-specific views such as PR/head/CI or research coverage/source freshness.

The Local Agent converts machine state into natural-language answers for the User without making its explanation authoritative state.

## Assessment and convergence

The kernel does not define "success" as reaching a hard-coded code-review phase.

Semantic criterion satisfaction is represented by current typed Assessments. The Orchestrator does not infer semantic truth by reading prose.

A profile supplies explicit convergence requirements over typed current state.

Generic ingredients may include:

```text
required criteria have current acceptable Assessments
required deliverable Artifacts exist
blocking Findings resolved
required deterministic validation/Receipt state acceptable
required authority gates resolved
no critical contradictions
no required WorkItem/PendingAction/Timer/Event dependency outstanding
```

A software profile may add exact-head CI/review requirements. A research profile may add source/citation/freshness/report requirements.

Resource/budget/stagnation exhaustion is never semantic success; it yields durable blocked/action-required state when progress cannot continue safely.

## Continuation and retention

A continuation WorkflowRun may consume selected correctness-bearing Artifacts from completed source runs.

Historical ownership remains with the source run, but the child run must persist a retention-safe imported snapshot/representation before depending on source payloads that may later be cleaned up.

The child preserves lineage such as:

```text
sourceRunId
sourceArtifactId
sourceHash
```

This keeps completed history immutable while preserving child reproducibility.

## Relationship to admission/runtime/interaction protocols

The architecture has three horizontal contracts:

```text
1. Workflow Admission Protocol
   Local Agent -> Orchestrator
   natural language compiled to typed admitted request

2. Workflow Runtime Protocol
   Orchestrator <-> capabilities
   Needs / WorkItems / InputBundles / Artifacts / Assessments / Receipts

3. Workflow Interaction Protocol
   Orchestrator <-> Local Agent/User
   Query / Update / Signal / Respond / PendingAction
```

These contracts are domain-neutral.

## Migration relationship to current v3 runtime

The existing `WorkflowJob` v3 software runtime remains supported during migration.

vNext should initially coexist in parallel durable state rather than mutating the v3 persisted schema in place.

Existing production executors and recovery mechanics should be adapted/reused where suitable before introducing duplicate execution implementations.

## Consequences

### Positive

- coding is no longer baked into the workflow kernel;
- project continuity and per-run lifecycle remain cleanly separated;
- the same durable runtime supports multi-day research, monitoring, reports, and future task classes;
- natural-language UX remains simple while internal control stays machine-readable;
- deterministic orchestration can be tested independently of model quality;
- Artifacts provide durable cross-agent semantics and auditability;
- recovery does not require a continuously alive Local Agent or model conversation;
- capabilities/profiles let the system grow without proliferating bespoke workflow engines.

### Costs

- requires extracting software-specific assumptions from generic vNext docs/code over time;
- Timer/ExternalEvent and version-pin semantics become first-class runtime work;
- profile/schema governance becomes important;
- continuation retention/import semantics must be explicit;
- generic status/convergence contracts must be carefully separated from domain-specific extensions.

## Invariants

> User interacts naturally through a reasoning Local Agent; the durable workflow core communicates through typed machine-readable protocols.

> Workstream is long-lived continuity; WorkflowRun is one bounded admitted lifecycle.

> The workflow kernel is domain-agnostic. Software engineering, deep research, monitoring, and other task classes are profiles/capability compositions above the core.

> The Orchestrator control plane is deterministic; semantic reasoning is performed only by bounded reasoning capabilities or the Local Agent outside authoritative state transitions.

> A Need expresses semantic demand and is materialized by deterministic policy as WorkItem or PendingAction.

> Correctness-bearing communication is Artifact/Assessment-based rather than transcript-based.

> Workflow progress and recovery survive client/process/provider disconnection through durable state, exact inputs, fencing, Timers/Events, and Receipts.

> A run is autonomous whenever deterministic policy and available capabilities can progress it; external interaction occurs only for genuine external dependencies or authority.

> Long-running WorkflowRuns bind relevant schema/policy/capability/definition versions and never silently cross incompatible runtime generations.

> vNext evolves alongside the current v3 runtime until an explicit migration/retirement decision.
