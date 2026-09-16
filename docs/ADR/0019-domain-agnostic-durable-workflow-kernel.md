# ADR-0019 — Make the Workflow Runtime Domain-Agnostic, Artifact-Based, and Recoverable

- **Status:** Proposed
- **Date:** 2026-09-16
- **Related:** ADR-0009..0018

## Context

The existing workflow grew from a software-engineering pipeline, so many current concepts are repository specific: PR, Git head, Writer/Worker, code review, CI, merge authority.

The target architecture, however, must support long-running work beyond coding, including deep research, monitoring, document/report production, and other multi-stage tasks that may run for hours, days, or longer.

A production workflow kernel therefore cannot make software-engineering concepts mandatory control-plane primitives. It needs a small domain-neutral model for durable semantic artifacts, executable work, waiting, interaction, time, events, recovery, authority, and convergence.

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
capability/profile driven rather than code-workflow hard-coded
natural-language accessible through the Local Agent
```

The kernel does not know that a workflow is "coding" or "research" except through profile/capability/schema configuration and typed artifacts.

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

## Domain-neutral object model

The kernel should understand concepts such as:

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

Domain profiles may add specialized artifact/need/capability types while preserving these control semantics.

## Awaitable/dependency model

Long-running workflows need more than executable WorkItems.

A workflow dependency may be satisfied by different kinds of awaitable state:

```text
WorkItem
  internal capability execution

PendingAction
  external User/Local input or authority

Timer
  durable time-based wakeup

ExternalEvent
  webhook/signal/observed external condition
```

The scheduler reasons mechanically over dependency satisfaction, not domain meaning.

Conceptually:

```text
Node/decision
   depends on
      |
      +-> WorkItem completed
      +-> PendingAction resolved
      +-> Timer fired
      +-> ExternalEvent matched
```

This allows multi-day research, monitoring, delayed follow-up, and asynchronous callbacks without treating waiting as process failure.

## Capability-first architecture

The kernel routes typed Needs to versioned capabilities.

It does not require fixed universal roles such as Worker or Reviewer for every workflow.

Examples:

```text
software profile:
  repository_research
  implementation
  git_mutation
  code_review
  ci_verification

research profile:
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

A profile is code/configuration-owned composition for a class of workflows.

It may define:

```text
admission schema/defaults
available capabilities
artifact/Need schemas
side-effect policy
interaction policy
budget defaults
convergence policy
projection/status policy
optional domain-specific external integrations
```

Example:

```yaml
profileId: deep_research.v1
capabilities:
  - planning
  - web_research
  - research_synthesis
  - source_verification
  - report_generation
convergence:
  require:
    - acceptance_criteria_satisfied
    - required_deliverable_exists
    - blocking_findings_zero
```

Software engineering becomes one profile, not the definition of the kernel.

## Software-specific extension

Software workflows may additionally define:

```text
RepositoryTarget
PullRequestArtifact
GitMutationWorkItem
HeadBoundReview
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
  -> Evidence artifacts
  -> Timer / next scheduled observation
  -> Research round 2
  -> Evidence update/supersession
  -> Timer
  -> Final research round
  -> Synthesis
  -> Verification
  -> Report artifact
```

The workflow may be disconnected from the Local Agent throughout autonomous periods.

## Artifact-based semantics

Artifacts are the durable semantic interface between reasoning execution and control state.

The runtime shall not use transient chat transcripts or hidden chain-of-thought as workflow authority.

Artifacts are:

```text
schema-versioned
persisted
typed
producer-attributed
input/context-bound
immutable or explicitly superseded
lineage-addressable
```

Human/model-readable prose may be included, but authoritative control meaning lives in structured fields.

## Deterministic control plane

The Orchestrator owns only code/policy operations:

```text
schema/admission validation
state transitions
Need -> capability resolution
WorkItem creation
InputBundle projection
approved graph/dependency motifs
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

If a decision requires semantic judgment, it is delegated to a reasoning capability and returned as a typed artifact/assessment.

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

Recovery reconstructs state from durable records, artifacts, receipts, timers/events, execution fencing, and external observation. It never depends on replaying hidden reasoning.

## Version pinning for long-lived workflows

Long-running workflows may outlive runtime/profile/model deployments.

Correctness-bearing records should therefore bind relevant versions, including as applicable:

```text
workflow schema version
profile version
policy version
capability version
InputBundle projection version
artifact schema version
agent/prompt definition version when compatibility matters
```

A workflow must not silently resume under incompatible definitions merely because newer code exists.

Migration across versions must be explicit and provenance-preserving.

## Efficiency

A general workflow runtime should avoid unnecessary agent execution.

Efficiency principles include:

```text
deterministic validation before model calls
sparse exact InputBundles
parallel independent WorkItems
reuse compatible artifacts
causal invalidation rather than global replay
deduplicate equivalent outstanding work
continue independent work while external dependencies wait
timers/events instead of busy polling when possible
bounded feedback loops and budgets
```

Semantic success and resource limits remain separate concepts.

## Status and observation

Status is a machine-readable projection of durable workflow state and should be domain-neutral at the core.

Representative generic dimensions:

```text
workflow lifecycle
autonomous progress available?
ready/running/completed WorkItems
pending external actions
active timers/event waits
blocking Findings
budget usage
latest significant Artifacts
recovering executions
terminal/convergence condition
```

Profiles may add domain-specific views such as PR/head/CI or research coverage/source freshness.

The Local Agent converts this machine state into natural-language answers for the User.

## Convergence

The kernel does not define "success" as reaching a hard-coded code-review phase.

A profile supplies explicit convergence requirements using typed state.

Generic ingredients may include:

```text
required criteria assessed satisfied
required deliverable artifacts exist
blocking Findings resolved
required validation/assessment artifacts acceptable
required authority gates resolved
no critical contradictions
no required WorkItem/PendingAction/Timer/Event dependency outstanding
```

A coding profile may add exact-head CI/review requirements. A research profile may add source/citation/freshness/report requirements.

## Relationship to interaction/admission protocol

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

## Consequences

### Positive

- coding is no longer baked into the workflow kernel;
- the same durable runtime supports multi-day research, monitoring, reports, and future task classes;
- natural-language UX remains simple while internal control stays machine-readable;
- deterministic orchestration can be tested independently of model quality;
- artifacts provide durable cross-agent semantics and auditability;
- recovery does not require a continuously alive Local Agent or model conversation;
- capabilities/profiles let the system grow without proliferating bespoke workflow engines.

### Costs

- requires extracting software-specific assumptions from generic vNext docs/code over time;
- Timer/ExternalEvent and version-pin semantics become first-class runtime work;
- profile/schema governance becomes important;
- generic status/convergence contracts must be carefully separated from domain-specific extensions.

## Invariants

> User interacts naturally through a reasoning Local Agent; the durable workflow core communicates through typed machine-readable protocols.

> The workflow kernel is domain-agnostic. Software engineering, deep research, monitoring, and other task classes are profiles/capability compositions above the core.

> The Orchestrator control plane is deterministic; semantic reasoning is performed only by bounded reasoning capabilities or the Local Agent outside authoritative state transitions.

> Correctness-bearing communication is artifact-based rather than transcript-based.

> Workflow progress and recovery survive client/process/provider disconnection through durable state, exact inputs, fencing, timers/events, and receipts.

> A workflow is autonomous whenever deterministic policy and available capabilities can progress it; external interaction occurs only for genuine external dependencies or authority.

> Long-running workflows bind relevant schema/policy/capability/definition versions and never silently cross incompatible runtime generations.
