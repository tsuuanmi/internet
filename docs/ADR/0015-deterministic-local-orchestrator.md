# ADR-0015 — Local Is the Deterministic Orchestrator, Not a Reasoning Agent

- **Status:** Proposed
- **Date:** 2026-09-16
- **Related:** ADR-0001, ADR-0005, ADR-0009, ADR-0010, ADR-0011, ADR-0012, ADR-0013, ADR-0014

## Context

Earlier vNext drafts described Local as a semantic/user-facing Orchestrator that could interpret workflow state and participate in semantic decisions. That boundary is too broad.

The architecture already depends on a deterministic control plane for durable recovery, exact-input binding, routing, graph transitions, mutation fencing, convergence, and authority. Allowing that same control-plane actor to perform model-like interpretation or synthesis creates an ambiguous correctness boundary:

- state transitions could depend on unrecorded reasoning;
- recovery might require reproducing a semantic judgment;
- Local could silently become a hidden Planner, Reviewer, or Research synthesizer;
- shared-context publication could depend on subjective Local summarization;
- testing the control plane would require model behavior rather than pure state-machine tests.

Production workflow systems provide a cleaner pattern: code-owned controllers reconcile typed desired/current state and delegate nondeterministic or semantic work to activities/specialists.

## Decision

**Local and Orchestrator are the same logical control-plane actor.**

Local/Orchestrator is deterministic and does not use an LLM/model to think, plan, summarize, interpret evidence, review implementation, or decide semantic consequences.

`WorkflowEngine` is the deterministic workflow/state-machine implementation component inside the Local/Orchestrator boundary, not a separate semantic actor.

```text
                    User
                      |
                      | raw objective / explicit authority
                      v
        +--------------------------------+
        |       Local / Orchestrator     |
        |                                |
        | deterministic control plane    |
        | validate / persist / route     |
        | schedule / reconcile / gate    |
        +---------------+----------------+
                        |
              typed WorkItems/InputBundles
                        |
          +-------------+-------------+
          |             |             |
          v             v             v
       Planner       Research       Reviewer
          |             |             |
          +-------------+-------------+
                        |
                     Worker
                        |
                        v
                  typed Artifacts
                        |
                        v
        +--------------------------------+
        |       Local / Orchestrator     |
        | deterministic validation       |
        | and next-state transition      |
        +--------------------------------+
```

## Local/Orchestrator responsibilities

Local may perform only code/policy operations whose result is determined by authoritative typed inputs and versioned policy.

This includes:

```text
command/API intake
workflow creation
raw user-objective persistence
schema validation
artifact identity/provenance validation
state persistence
Finding/Need/WorkItem lifecycle mechanics
capability lookup from typed Need
request-owner routing
InputBundle construction from explicit dependencies
graph motif instantiation
scheduling/readiness
provider/account allocation under policy
side-effect/authority checks
retry/fencing/idempotency
exact-head checks
Git desired-state reconciliation
artifact invalidation from explicit dependency rules
resource-budget enforcement
termination/convergence evaluation from explicit predicates
status projection
human-action gating
```

Local may also render deterministic files/messages from structured state, such as `STATUS.md`, when rendering requires no semantic synthesis.

## Local/Orchestrator non-responsibilities

Local shall not perform semantic reasoning such as:

```text
interpreting an ambiguous objective
inventing or refining acceptance criteria
planning implementation strategy
summarizing research
judging which evidence is convincing
resolving contradictions by reasoning
reviewing code quality/correctness
classifying a prose finding by intuition
rewriting an agent conclusion
choosing what an evidence result means for implementation
creating a repair strategy
curating shared context by subjective importance
```

If progress requires one of those operations, Local creates/routes a WorkItem to an appropriate reasoning capability or fails closed when no such capability exists.

## Initial user objective

A free-form user request enters the workflow as user-owned input, not as a Local interpretation.

Conceptually:

```text
UserObjectiveInput
  rawText
  explicit repository/branch/authority bindings
  explicit structured options, if supplied
```

For workflows that require semantic decomposition, deterministic workflow policy routes that input to Planner.

```text
UserObjectiveInput
  -> Planner WorkItem
  -> Objective/AcceptanceCriteria/Plan artifacts
```

Local validates the returned schemas and provenance but does not decide whether the Planner's interpretation is substantively good. That judgment belongs to later Reviewer/User gates according to policy.

## Policy decisions versus semantic decisions

The boundary is:

| Question | Owner |
| --- | --- |
| `Need.type == external_evidence`; which registered capability handles it? | Local deterministic policy |
| What external question should be asked? | Requesting reasoning agent |
| Did Research return a schema-valid artifact? | Local |
| Is the evidence persuasive enough to resolve a finding? | Reviewer / verification capability |
| Has PR head changed? | Local |
| How should code adapt to the newly observed head? | Worker or Planner, depending on typed Need |
| Is a WorkItem over budget? | Local |
| Is another research round semantically useful? | Request owner emits another Need; Local only checks policy/budget |
| Does a plan revision invalidate a dependent review by explicit lineage? | Local |
| What should the revised plan be? | Planner |
| Does a patch satisfy code-quality/behavior requirements? | Reviewer + deterministic tests |
| Which account currently has capacity? | Local scheduler |

The rule is:

> Local may choose among outcomes already encoded by deterministic policy; it may not invent semantic meaning to create a new outcome.

## No hidden model fallback

Local shall not contain an implicit or emergency LLM fallback such as:

```text
if routing unclear -> ask model what to do
if artifact conflict -> ask model which is right
if plan missing -> synthesize one locally
if research too long -> summarize locally
```

When deterministic policy has no valid transition, Local must instead:

- create a typed WorkItem for a registered reasoning capability when policy defines one;
- produce a durable `BLOCKED` / `HUMAN_ACTION_REQUIRED` state;
- reject the incompatible artifact/request.

This makes unsupported cases visible rather than silently shifting reasoning into the control plane.

## Semantic artifact ownership

Semantic conclusions remain owned by reasoning roles/capabilities.

Examples:

```text
Planner
  -> PlanArtifact
  -> PlanRevisionArtifact
  -> PlanSharedView

Research / Research Synthesis
  -> EvidenceArtifact
  -> ContradictionArtifact
  -> ResearchSharedView

Reviewer
  -> FindingArtifact
  -> ReviewArtifact
  -> ApprovalArtifact
  -> SharedTodoItem / review-context candidate

Worker
  -> ImplementationArtifact
  -> ValidationArtifact
  -> mutation receipts
```

Local validates and routes these artifacts but does not rewrite their substantive meaning.

## Shared PR workspace consequence

ADR-0013's shared notebook must obey the same boundary.

Local does not read twelve research artifacts and subjectively decide which three insights are important.

Instead, reasoning agents explicitly produce bounded shared-context artifacts/fields under schema, for example:

```yaml
type: ResearchSharedView
producerRole: research
channel: research
audience: [worker, reviewer]
sourceRefs: [E44, E45]
content: |
  Package X guarantees behavior Y only in v4.x; the repository uses v3.x.
```

Local then applies deterministic publication policy:

```text
schema valid?
producer authorized for channel?
artifact active/not superseded?
publication class allowed?
size/count limits satisfied?
retention/sensitivity policy allowed?
synchronization trigger reached?
```

If yes, Local deterministically includes the view in `DesiredWorkspaceState` and creates a Worker workspace-mutation WorkItem.

If multiple semantic artifacts require synthesis or prioritization beyond deterministic ordering/filtering, Local schedules a synthesis WorkItem to the appropriate reasoning capability. Local does not perform the synthesis itself.

## Deterministic workspace rendering

The default target is:

```text
PLAN.md
  <- latest active Planner-produced PlanSharedView

RESEARCH.md
  <- active ResearchSharedView artifacts,
     deterministically grouped/ordered,
     or one explicit ResearchSynthesis output

TODO.md
  <- structured SharedTodoItems from authorized roles,
     deterministically filtered/sorted

STATUS.md
  <- Local deterministic runtime projection

ROADMAP.md
  <- latest active Planner-produced RoadmapSharedView, when enabled
```

This keeps semantic authorship outside Local while retaining deterministic publication.

## Human interaction

Local may communicate with the user as a control-plane surface, but it does not invent semantic advice.

Examples Local may surface directly:

```text
workflow status
current phase
blocking WorkItem/failure category
request for an already-defined authorization
structured HumanActionNeed produced by policy/agent
exact PR/head/check state
```

If the workflow requires a semantic clarification question, a Planner/Reviewer or dedicated clarification capability should produce the question artifact. Local presents it and records the user's response.

## Determinism definition

For Local/Orchestrator, determinism means:

> Given the same authoritative workflow state, accepted artifacts, observed external receipts/state, and policy/schema versions, Local chooses the same valid control transition without model inference.

External observations can change over time, but once captured as typed observations/receipts, transition logic is code-defined.

## Relationship to nondeterministic execution

Nondeterminism is explicitly pushed to bounded activities:

```text
Planner reasoning
Research/web exploration
Research synthesis
Worker implementation generation
Reviewer evaluation
model-assisted verification
```

Their outputs cross back into Local only as typed artifacts subject to schema, provenance, authority, and exact-input validation.

Local never needs to replay hidden chain-of-thought to recover workflow state.

## Consequences

### Positive

- one unambiguous control-plane boundary;
- Local can be tested as a state machine without model/eval variance;
- recovery/reconciliation does not depend on reproducing semantic reasoning;
- role ownership becomes clearer: Planner plans, Research researches, Reviewer judges, Worker mutates/implements, Local coordinates;
- hidden semantic coupling and prompt-injection authority inside orchestration are reduced;
- changing models/providers does not change orchestration semantics.

### Costs

- some cases that a smart local LLM could improvise around must instead create explicit reasoning WorkItems;
- shared-context synthesis requires schemas and possibly dedicated synthesis WorkItems;
- initial user ambiguity may require an extra Planner/clarification turn;
- capability contracts must be rich enough that Local can route without reading prose semantically.

## Invariants

> Local and Orchestrator are the same logical deterministic control-plane actor.

> Local/Orchestrator does not use model reasoning to choose workflow transitions, interpret evidence, plan, review, summarize, or synthesize semantic content.

> WorkflowEngine is an implementation component of the Local/Orchestrator control plane, not a separate reasoning role.

> When a transition requires semantic judgment, Local routes a typed WorkItem to a reasoning capability or fails closed; it never silently performs the judgment itself.

> Local validates semantic artifacts structurally and by authority/context, not by replacing the producing role's semantic judgment with its own.

> Shared-context publication is selected and rendered by deterministic policy over agent-produced shared-view artifacts; Local does not subjectively curate prose.
