# Workflow vNext — Adaptive Artifact-Based Orchestration

- **Status:** evolving design proposal; not yet the as-built runtime contract
- **Started:** 2026-09-16
- **Scope:** typed artifacts, semantic planning, WorkItems, exact InputBundles, adaptive routing, durable external interaction, shared PR memory, Git mutation, and deterministic convergence

This document is the high-level target architecture. Narrow Proposed ADRs and specialized `SRS-VNEXT-*` modules override this narrative where they are more specific. Current code and as-built contracts remain authoritative until vNext behavior is implemented, tested, and promoted.

## 1. Core design

The workflow evolves from a mostly sequential pipeline into an autonomous deterministic runtime coordinating bounded reasoning agents through typed durable artifacts.

```text
User
  <-> Local Agent
        reasoning-capable workflow client/operator
        |
        | workflow tool/API
        v
+-------------------------------------------+
| Deterministic Orchestrator Runtime        |
| WorkflowEngine / driver / scheduler       |
|                                           |
| validate / persist / route / schedule     |
| reconcile / fence / invalidate / gate     |
+--------------------+----------------------+
                     |
         typed WorkItems/InputBundles
                     |
      +--------------+--------------+
      |              |              |
      v              v              v
   Planner        Research       Reviewer
      |              |              |
      +--------------+--------------+
                     |
                  Worker
                     |
                     v
                typed Artifacts
```

The runtime does not use an LLM to decide control transitions.

The Local Agent may reason conversationally, but its hidden reasoning is not workflow correctness state. Only explicit validated tool/API inputs may alter durable workflow authority.

## 2. Autonomous by default

Once started, the workflow continues as far as possible without requiring Local Agent/User presence.

```text
ready WorkItem exists
  -> execute

result creates more typed Needs
  -> route/materialize more work

external authority/input genuinely required
  -> durable PendingAction
  -> block only dependent paths
  -> continue independent ready work

no autonomous work remains + blocking PendingAction exists
  -> WAITING_EXTERNAL
```

A Local Agent may disconnect and reconnect later without stopping the workflow or requiring reconstruction of prior hidden reasoning.

## 3. External interaction

External interaction is modeled as a first-class durable dependency rather than an ad-hoc conversational pause.

```text
Need
  +-> executable semantic capability -> WorkItem
  +-> external authority/input       -> PendingAction
```

`PendingAction` responder classes include:

```text
USER_AUTHORITY
LOCAL_AGENT_INPUT
USER_OR_LOCAL
```

The workflow tool/API exposes pending actions through status/watch and accepts typed responses through a generic response boundary. Unsolicited user/client directives use a separate typed signal/input path.

Resolving an action re-evaluates readiness automatically; operator `continue` remains recovery semantics rather than a generic semantic resume command.

## 4. User and Local Agent boundary

### User

Owns reserved human authority such as explicit merge/release authorization and changes to user-owned constraints when policy requires consent.

### Local Agent

Acts as user-facing workflow client/operator. It may:

```text
understand conversation
start/query/watch/control workflows
explain status and choices
carry explicit user decisions
submit allowed Local-Agent input
submit unsolicited explicit user directives
```

It is not the durable state machine and cannot satisfy a User-only authority gate from its own judgment.

### Workflow tool/API

Is the authority boundary between client reasoning and workflow state.

Current lifecycle concepts remain:

```text
start
list
status
watch
stop/cancel
continue/recover
delete
```

vNext additionally targets:

```text
respond(actionId, typed response)
signal(typed external input)
```

## 5. Semantic roles

| Role | Responsibility |
| --- | --- |
| **Planner** | objective interpretation, acceptance criteria, decomposition, assumptions, semantic tasks, replanning |
| **Research / Explorer** | bounded repository/external evidence gathering and research synthesis when assigned |
| **Worker** | implementation/generation plus all authorized Git mutation; sole repository writer |
| **Reviewer** | semantic correctness/criterion judgment, Findings, approvals, follow-up Needs |
| **Verification capabilities** | narrow deterministic/model-assisted checks where useful |

Agents do not directly invoke each other. They emit typed artifacts/Needs that the deterministic runtime validates and routes.

## 6. Objective, criteria, plan, task, execution

The planning chain remains explicitly separated:

```text
UserObjectiveInput
  -> ObjectiveArtifact
  -> AcceptanceCriteriaArtifact
  -> PlanArtifact
       -> PlanTask(s)
       -> NeedArtifact(s)
  -> Orchestrator materializes WorkItem(s)
```

Key distinctions:

```text
Objective       = desired outcome
Acceptance      = definition of success
Plan            = semantic strategy
PlanTask        = semantic unit of intended work
Need            = requested capability/input
WorkItem        = runtime-owned execution authorization
PendingAction   = external input/authority dependency
```

Ordinary replanning changes strategy/decomposition, not acceptance criteria. A true requirements change follows a separate authority path and may create a `USER_AUTHORITY` PendingAction.

## 7. Finding / Need / WorkItem / Artifact

Core execution flow:

```text
Finding / unresolved decision
  -> Need
  -> deterministic validation
  -> WorkItem OR PendingAction
  -> exact InputBundle / exact external-action contract
  -> execution or external response
  -> Artifact / resolution
  -> return to causal owner
  -> next typed Need or convergence
```

A Need specifies semantic demand, not provider account, browser session, retries, graph IDs, budgets, or mutation authority.

## 8. Capability routing and safe graph expansion

Need-to-capability mapping is code/configuration-owned and versioned.

Representative mappings:

```text
external_evidence       -> external_research
repository_evidence     -> repository_research
implementation_change   -> repository_implementation
plan_change             -> planning
requirements_change     -> planning + authority path
review_current_state    -> review
research_synthesis      -> research_synthesis
```

Dynamic workflow shape is created only through runtime-approved motifs such as:

```text
Owner -> Research -> Owner
Owner -> Research[1..N] -> Synthesis -> Owner
Reviewer -> Worker -> fresh Review
Reviewer -> Planner -> Worker -> fresh Review
```

PendingActions can appear as dependency nodes without globally pausing unrelated graph branches.

## 9. Exact InputBundles

Every executable WorkItem receives one persisted exact InputBundle before execution.

Visibility in durable shared state or PR collaboration files does not automatically make content a correctness-bearing input.

```text
shared visibility != InputBundle membership
```

Once an execution starts, its correctness-bearing bundle is immutable for that execution identity.

## 10. Causal ownership and return routing

Every Need preserves its causal owner.

Default rule:

> A WorkItem result or PendingAction resolution returns first to the owner whose unresolved decision caused it unless an explicit validated routing contract says otherwise.

Example:

```text
Reviewer/Finding F17
 -> Need(external_evidence)
 -> Research WorkItem
 -> Evidence E44
 -> Reviewer/F17
```

Research answers the question. Reviewer decides whether the evidence resolves the finding or creates implementation/plan/requirements work.

## 11. External interaction is scoped

Interaction is a dependency, not a workflow-wide stop.

```text
Reviewer branch A
  -> PendingAction A17
  -> waits

Research branch B
  -> W41
  -> continues
```

The workflow may be `RUNNING` with pending actions. `WAITING_EXTERNAL` is reserved for the state where no useful autonomous work remains and one or more unresolved external dependencies block progress.

Responses are schema-validated, authority-checked, version/head-fenced, idempotent, and reject stale/superseded actions.

## 12. Shared PR collaboration memory

After a PR exists, selected semantic shared views may be projected into:

```text
.internet/workspace/
  PLAN.md
  TODO.md
  RESEARCH.md
  STATUS.md
  # ROADMAP.md optional
```

This is task-local collaboration memory, not workflow state.

Semantic sources:

```text
PLAN.md       <- Planner shared view
RESEARCH.md   <- Research/Synthesis shared view
TODO.md       <- structured shared task/blocker items
STATUS.md     <- deterministic runtime projection
ROADMAP.md    <- optional Planner shared view
```

The Orchestrator applies deterministic publication/render policy. Worker alone creates commits.

## 13. Single-writer Git mutation

Worker remains the only workflow actor authorized to mutate the repository.

Mutation modes include:

```text
WORKSPACE_EXACT
IMPLEMENTATION_AGENTIC
WORKSPACE_CLEANUP
```

Every mutation binds an exact expected head and authorized path/effect scope. Worker does not silently merge/rebase/force-push stale work. The Orchestrator independently reconciles the resulting remote state against mutation receipts and postconditions.

## 14. Artifact lineage and invalidation

The runtime tracks explicit relations such as:

```text
derived_from
supports
contradicts
resolves
supersedes
invalidates
```

A changed criterion, plan input, exact PR head, or external decision invalidates only dependent artifacts according to explicit lineage/exact-input policy.

No invalidation decision is inferred from prose similarity.

## 15. Convergence

Workflow success is semantic convergence, not completion of a fixed phase count.

Conceptually:

```text
all required acceptance assessments satisfied
AND no blocking Findings
AND required exact-head review/approvals current
AND required validations/CI current
AND no unresolved critical contradictions
AND no unresolved required external authority
```

Resource limits/stagnation guards are separate from success. Exhausting a budget yields durable blocked/action-required state, never silent success.

## 16. Deterministic versus nondeterministic boundary

Deterministic runtime:

```text
schema validation
state persistence
Need routing
WorkItem/PendingAction creation
InputBundle construction
graph motif materialization
readiness/scheduling
retry/fencing/idempotency
side-effect authority
Git reconciliation
lineage invalidation
resource policy
external-response validation
termination/convergence predicates
```

Nondeterministic bounded work:

```text
Planner reasoning
Research/web/repository exploration
Research synthesis
Worker implementation generation
Reviewer evaluation
model-assisted verification
Local Agent conversational/advisory reasoning
```

Only typed artifacts/tool inputs bridge nondeterministic reasoning into authoritative workflow state.

## 17. Event/trace versus correctness state

Durable artifact/job/PendingAction state is correctness authority.

Event history explains what happened but is not replayed as model reasoning to reconstruct correctness.

Representative semantic trace:

```text
Finding F17
 -> Need N22
 -> WorkItem W31
 -> InputBundle IB31
 -> Evidence E44
 -> PendingAction A9 (if external authority required)
 -> Response R3
 -> returned_to Reviewer/F17
 -> Resolution R8
```

## 18. Final-review boundary

PR workspace collaboration is provisional and may move physical PR HEAD.

Target finalization:

```text
COLLABORATION
 -> autonomous/adaptive work + scoped interactions
 -> provisional convergence
 -> stop temporary publication
 -> Worker removes .internet/workspace/
 -> Orchestrator verifies clean implementation tree
 -> FINAL_REVIEW on cleaned exact head
 -> exact-head CI/health
 -> existing User merge-authority boundary
```

A final-review defect reopens collaboration and requires fresh cleanup/review afterward.

## 19. Evaluation model

Evaluate:

```text
final repository/PR state
acceptance criteria
Finding resolution
artifact/evidence lineage
exact-head correctness
authority invariants
PendingAction/response correctness
absence of stale approvals/responses
resource efficiency
```

Do not require one canonical execution trajectory when several valid dynamic paths converge correctly.

## 20. Migration direction

A practical sequence remains:

```text
A. typed artifact/Need schemas
B. first-class WorkItem + capability registry + InputBundle
C. Local-Agent/tool/runtime boundary hardening
D. Planner objective/criteria/task separation
E. durable PendingAction + respond/signal API
F. adaptive Reviewer/Planner/Research feedback motifs
G. PR shared collaboration projection
H. reconciled single-writer Git mutation
I. convergence/verification/evaluation hardening
```

## 21. Production boundary

Nothing in this document claims current implementation.

Current as-built code/docs win for production behavior. Proposed ADRs and specialized SRS modules define the target contract until corresponding runtime implementation/tests are promoted.
