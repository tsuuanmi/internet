# Workflow vNext Production-Readiness Plan

## Objective

Turn the current vNext design into a production-ready implementation path without destabilizing the existing durable coding workflow.

This plan is based on review of the current `main` codebase and cross-review of the proposed ADR/SRS set. The existing workflow remains a supported v3 compatibility runtime during migration.

No runtime implementation belongs in this design PR. This file records the dependency-aware implementation plan that should govern follow-up implementation PRs.

## Current as-built baseline

The current workflow is a coding-specific durable graph runtime, not yet a domain-neutral kernel.

Important reusable primitives already exist and should be evolved rather than reimplemented:

- exact node input hashes and dependency output hashes;
- persisted node results and exact-input reuse;
- execution IDs, leases, heartbeats, fencing, and orphan reconciliation;
- retry/recovery receipts including durable `notBefore` recovery delays;
- optimistic job revision updates;
- event journal and operator projections;
- a job-level `WorkflowPendingAction`;
- scoped Writer/Git confirmation policy;
- exact-head review semantics;
- durable handoff and retention infrastructure.

Important coding-specific coupling also exists:

- `WorkflowEngine.start()` creates Research A/B directly;
- graph node kinds and phases encode Research/Writer/Review topology;
- `WorkflowJob` version 3 stores repository, PR, Writer conversation, and review cycle directly;
- `WorkflowWriterRunner` hard-codes `chatgpt-writer` and software mutation contracts;
- plugin workflow registration requires the software workflow account topology;
- review PASS currently transitions the workflow directly to terminal `COMPLETED`;
- post-review User testing and feedback are outside the workflow;
- slash-command and low-level tool paths duplicate workflow application behavior.

## Review findings that change the original implementation order

### A. Actor terminology must be normalized before implementation

Some older proposed ADR/SRS text still uses `Local`, `Local/Orchestrator`, or `Local state` to mean the deterministic control plane. That conflicts with ADR-0015 and the newer admission/kernel design.

The canonical boundary is:

```text
User
  <-> Local Agent
        reasoning-capable workflow client/operator
        |
        | typed workflow protocol
        v
      Orchestrator Runtime
        deterministic authoritative control plane
```

Before implementation agents rely on these documents, the older wording must be updated so that:

- Local Agent may reason, compile natural language, explain state, and transport explicit User decisions;
- Orchestrator Runtime owns deterministic validation, routing, WorkItem materialization, invalidation, scheduling, reconciliation, and convergence;
- hidden Local reasoning is never workflow authority.

### B. Current session ownership must not become the permanent vNext identity model

Phase 0 must fix the current cross-session authorization inconsistency, but vNext also requires safe client substitution and reattachment.

Therefore the service boundary should accept an explicit authorization context/principal abstraction rather than baking `ownerSessionId` into all future APIs.

Initial behavior may map the current DSH session to the v3 owner rule, while vNext leaves room for an authorized replacement Local Agent/CLI/UI to operate the same durable run.

### C. Admission requires durable state before WorkflowRun activation

A production `USER_CONFIRM` may outlive one Local Agent call or process. Admission therefore cannot be only types/hash/preflight functions.

Phase 1 must include a durable admission record/store and confirmation receipt lifecycle sufficient to reconstruct:

```text
User source
Local interpretation
policy defaults
preflight result
confirmation requirement
confirmation provenance
accepted AdmissionSpec
activation identity/result
```

Admission confirmation is pre-run state and does not need to wait for the later in-run `PendingAction` subsystem.

### D. Stores alone are not a runtime

The previous plan introduced vNext stores and then capability adapters without explicitly adding the deterministic vNext execution engine/driver/scheduler that consumes them.

The revised plan adds a dedicated runtime-control milestone between the durable kernel substrate and real profile execution.

### E. Baseline assessment/convergence is a prerequisite for the first complete software journey

The software Delivery/feedback lifecycle cannot claim final convergence before criterion assessment/convergence semantics exist.

A baseline `CriterionAssessment` + profile convergence contract must therefore be implemented before the software journey reaches its terminal path.

Later convergence work may harden budgets, waivers, stagnation, and advanced policy, but the basic success predicate cannot be deferred until after Delivery/feedback.

### F. Cross-run artifact ownership and retention must be distinguished

Source artifacts remain historically owned by their producing run. A continuation child run should not depend on the parent artifact file remaining physically retained forever.

For the first continuation implementation:

```text
parent Artifact
  remains source-owned by parent run

child import Artifact
  exact copied/imported content or durable snapshot
  child-owned persistence
  lineage -> sourceRunId/sourceArtifactId/sourceHash
```

This preserves source ownership and retention-safe reproducibility without global reference-counted GC.

### G. Planner execution needs an explicit reasoning capability path

The current production team runner supports generic/research/review prompt strategies, but there is no existing first-class Planner workflow executor contract.

The vNext capability plan must explicitly provide a `planning` reasoning adapter/strategy rather than silently assuming Planner exists because the semantic docs name it.

## Production-readiness corrections to the proposed design

### 1. Preserve v3 during migration

Do not mutate `WorkflowJob` v3 in place or make existing persisted jobs unreadable.

Introduce vNext runtime state alongside v3 state. Existing v3 jobs, tests, CLI behavior, exact-head behavior, recovery, and retention remain supported until an explicit migration/deprecation milestone.

Preferred storage boundary:

```text
workflows/
  jobs/          # existing WorkflowJob v3
  admissions/    # vNext pre-run admission records
  runs/          # vNext WorkflowRun
  artifacts/     # vNext semantic artifacts, run-scoped by ownership
  work-items/    # vNext executable work
  actions/       # vNext in-run external interactions
  workstreams/   # long-lived continuation metadata
```

### 2. Add an authoritative application/service boundary first

Both the slash command and Local Agent tool currently reach workflow runtime behavior through separate paths. The low-level tool can bypass the owner filtering performed by `WorkflowOperator`.

Before adding vNext semantics, introduce one authoritative workflow application service responsible for:

- caller authorization context validation;
- legacy owner/session enforcement;
- workflow selection;
- start/status/cancel/recover/delete authorization;
- admission entry points;
- mapping protocol requests onto the correct legacy or vNext runtime.

Target boundary:

```text
Slash command ----\
                  > WorkflowService -> legacy v3 adapter / vNext runtime
Local Agent tool -/
```

The service must not become a semantic reasoner. The Engine/runtime must not own UI syntax, Local Agent semantics, or caller authorization.

### 3. Keep current execution primitives; separate semantic artifacts

Do not equate existing `WorkflowNodeResult` or handoff records with vNext semantic artifacts.

Use distinct concepts:

```text
ExecutionResult / NodeResult
  = exact execution/reconciliation output

Handoff / Receipt
  = delivery/transport/side-effect evidence

Artifact
  = durable semantic workflow product
```

A capability execution may produce an exact execution result which is schema-validated/promoted into one or more typed Artifacts.

### 4. Capability registry wraps existing executors first

Do not rewrite Team/Writer/Research runners into one generic executor.

Initial adapters should reuse production-specific implementations where appropriate:

```text
planning
  -> planning reasoning adapter
  -> team/generic reasoning execution with a planning-specific typed output contract

repository_evidence
  -> software repository-research adapter
  -> WorkflowTeamRunner

implementation_change
  -> software implementation adapter
  -> WorkflowWriterRunner

review_current_state
  -> software review adapter
  -> WorkflowTeamRunner

external_deep_research
  -> research adapter
  -> BrowserManager.research
```

Provider/account/session selection stays below the capability contract.

### 5. Evolve PendingAction instead of introducing it from zero

The current job-level `WorkflowPendingAction` is a useful predecessor but is insufficient for autonomous multi-branch workflows.

The vNext in-run model should use durable action objects with:

- stable `actionId`;
- owner/subject references;
- state/lifecycle;
- responder/authority policy;
- response schema/version;
- exact subject version or head binding when required;
- response provenance;
- idempotent retry handling.

A pending external action blocks only its dependent paths. The whole run becomes `WAITING_EXTERNAL` only when no unrelated autonomous runnable/running work remains.

### 6. Keep Workstream outside execution graphs

A Workstream is continuity metadata across bounded WorkflowRuns, not another scheduler/state machine.

A terminal run remains terminal. Follow-up work creates another run in the same Workstream with explicit artifact lineage.

For the first continuation implementation, import/copy correctness-bearing source artifacts into child-owned durable storage while retaining the source owner and source hash in lineage metadata.

### 7. Delivery is not terminal completion in vNext software runs

Preserve the current v3 rule where exact-head review PASS means completion.

For the vNext software profile only:

```text
review PASS
  -> DeliveryArtifact(PR + exact head)
  -> User validation checkpoint
  -> feedback may resume the same non-terminal run
  -> fresh implementation/review if needed
  -> current assessments/convergence re-evaluated
  -> merge/user-authority policy
  -> terminal completion
```

Feedback must target an exact Delivery/head identity. Stale feedback must not silently mutate a newer head.

### 8. Timer is not recovery

The current durable `recovery.notBefore` mechanism is a useful scheduling seam but must not become the public Timer model.

Future generic awaitables should distinguish:

```text
WorkItem
PendingAction
Timer
ExternalEvent
```

Recovery delays may later share wake-up infrastructure without sharing semantic identity.

## Dependency-aware implementation sequence

## Design Gate D0 — Harmonize proposed contracts before runtime implementation

This design-only gate must complete before the first vNext runtime PR depends on the affected contracts.

Required updates:

- normalize Local Agent vs Orchestrator Runtime terminology in core SRS, Planner SRS/ADR, PR-workspace SRS/ADR, and Git-mutation SRS/ADR;
- standardize `WAITING_EXTERNAL` terminology for in-run external waits;
- update core Need routing so a Need may materialize as `WorkItem` **or** `PendingAction` according to typed semantics/policy;
- add `requirements_change` and `clarification` to the core Need vocabulary;
- correct `plan_change` wording so acceptance-criteria changes use `requirements_change`;
- define source-owned artifact vs child-owned imported continuation copy;
- add baseline CriterionAssessment/convergence ADR/SRS;
- add explicit v3 compatibility/migration wording where overview/core text still implies clean-slate vNext;
- distinguish current v3 `WorkflowPendingAction` from vNext durable action collection.

No runtime code should be implemented against contradictory contracts.

## Phase 0 — WorkflowService and authorization consistency

Add candidate implementation surfaces:

- `src/workflow/service.ts`
- optional `src/workflow/authorization.ts`
- `test/workflow-service.test.ts`

Modify:

- `src/tools/internet-workflow.ts`
- `src/commands/workflow.ts`
- `src/workflow/operator.ts`
- `src/index.ts`
- relevant tool/operator/index tests

Requirements:

- command and tool use one authoritative service path;
- all protected operations validate an explicit caller authorization context;
- v3 adapter preserves current owner-session rules;
- cross-session unauthorized status/cancel/continue/delete attempts fail closed;
- the service contract does not make creator session identity the permanent vNext principal model;
- preserve current v3 behavior and outputs where compatible.

This is the first runtime implementation milestone.

## Phase 1 — Durable admission protocol, software profile first

Add candidate surfaces:

- `src/workflow/admission/types.ts`
- `src/workflow/admission/store.ts`
- `src/workflow/admission/validation.ts`
- `src/workflow/admission/preflight.ts`
- `src/workflow/admission/hash.ts`
- `src/workflow/profiles/types.ts`
- `src/workflow/profiles/software-profile.ts`

Admission lifecycle should support states equivalent to:

```text
DRAFT
PREFLIGHTED
AWAITING_CONFIRMATION
ACCEPTED
ACTIVATED
EXPIRED
SUPERSEDED
```

Core invariant:

```text
compile
 -> persist draft
 -> deterministic preflight
 -> durable preview/confirmation receipt when needed
 -> accepted immutable AdmissionSpec
 -> activate(expectedAdmissionHash/version)
```

The exact accepted admission identity must be activated.

Keep `/workflow <objective>` and existing tool start behavior as compatibility adapters initially.

## Phase 2 — Parallel vNext durable kernel substrate

Add candidate surfaces:

- `src/workflow/kernel/types.ts`
- `src/workflow/run-store.ts`
- `src/workflow/artifact-store.ts`
- `src/workflow/work-item-store.ts`
- `src/workflow/input-bundle.ts`
- `src/workflow/capability-registry.ts`
- optional vNext run event journal/projection types

This phase defines durable state and generic envelopes, not full semantic domain behavior.

Required contracts:

- `WorkflowRun` schema/version/lifecycle;
- generic immutable/superseding Artifact envelope;
- WorkItem lifecycle and Need causal binding;
- exact InputBundle identity;
- capability descriptors and deterministic routing;
- execution/receipt references;
- profile/policy/capability/schema version pinning;
- coexistence with v3 stores.

Do not delete or repurpose v3 stores/builders yet.

## Phase 3 — Semantic protocol and baseline convergence

Before real vNext profile execution, define the correctness-bearing semantic schemas required by the runtime:

- ObjectiveArtifact;
- AcceptanceCriteriaArtifact;
- PlanArtifact / PlanTask;
- Need;
- FindingArtifact;
- EvidenceArtifact;
- CriterionAssessment/Assessment;
- ReportArtifact;
- DeliveryArtifact;
- UserFeedbackArtifact;
- result-to-artifact promotion contract;
- baseline profile convergence predicate.

Also implement/supply the planning capability contract needed to turn admitted source into Objective/Criteria/Plan/Needs.

Baseline convergence must distinguish:

```text
WorkItem completed
PlanTask execution complete
Criterion assessed satisfied
WorkflowRun converged
```

Advanced budget/stagnation/waiver hardening may follow later, but no complete product journey may claim terminal semantic success without this baseline.

## Phase 4 — Deterministic vNext RunEngine/Driver/Scheduler

Add a vNext control path beside the v3 `WorkflowEngine` rather than mutating v3 in place.

Candidate responsibilities:

- load/update `WorkflowRun` with optimistic revision/fencing;
- deterministic Need -> WorkItem/PendingAction materialization;
- deterministic capability routing;
- readiness/dependency evaluation;
- exact InputBundle construction;
- execution lease/fencing/reconciliation;
- result promotion/validation;
- causal invalidation;
- baseline convergence evaluation;
- restart/resume scheduling.

Reuse/extract current mechanics only where doing so preserves v3 behavior and produces a single authoritative vNext implementation path. Do not make v3 graph vocabulary the generic kernel vocabulary.

## Phase 5 — Capability adapters and first executable software path

Add profile adapters around existing runners rather than replacing them.

Candidate paths:

- `src/workflow/profiles/common/planning-capability.ts`
- `src/workflow/profiles/software/research-capability.ts`
- `src/workflow/profiles/software/implementation-capability.ts`
- `src/workflow/profiles/software/review-capability.ts`
- `src/workflow/profiles/research/deep-research-capability.ts`

The adapter layer must preserve the boundary:

```text
Capability contract
  -> specialized executor/provider runner
  -> exact ExecutionResult
  -> schema-validated Artifact/Receipt promotion
```

No generic executor should accumulate GitHub/PR/browser-specific branches.

## Phase 6 — Durable in-run external interaction protocol

Add candidate surfaces:

- `src/workflow/interactions/types.ts`
- `src/workflow/pending-action-store.ts`
- `src/workflow/interactions/service.ts`
- `src/workflow/interactions/response-policy.ts`

Target client/runtime operations:

```text
query
preflight
activate
update
signal
respond
cancel
recover
```

`continue` remains only a legacy/recovery compatibility surface.

Required behavior:

- stable action identity/lifecycle;
- responder policy and provenance;
- exact subject/head/version binding;
- idempotent response retry;
- stale/conflicting response rejection;
- multiple independent actions;
- dependency-scoped waiting;
- `WAITING_EXTERNAL` only when no autonomous progress remains.

## Phase 7 — vNext software Delivery/feedback lifecycle

Implement the first complete product journey:

```text
idea
 -> admission
 -> Planner semantics
 -> research/implementation/review
 -> exact-head DeliveryArtifact
 -> User local validation
 -> typed feedback
 -> semantic consequence
 -> targeted invalidation/revision
 -> fresh exact-head assessment/review
 -> profile convergence / merge authority
```

Required behavior:

- Delivery binds exact repository/PR/head identity;
- User/local feedback is stored as typed external input with provenance;
- semantic capabilities interpret prose feedback, not the deterministic Orchestrator;
- changed correctness-bearing inputs invalidate dependent results deterministically;
- every changed PR head requires fresh exact-head review/assessment before delivery is current;
- terminal completion uses the baseline convergence contract from Phase 3.

## Phase 8 — Workstream and continuation

Add candidate surfaces:

- `src/workflow/workstream-store.ts`
- `src/workflow/continuation.ts`

Implement bounded run continuation and retention-safe artifact import:

```text
source run owns original Artifact
child run imports exact correctness-bearing snapshot
child import records source run/artifact/hash lineage
```

Workstream remains grouping/navigation/continuation metadata, not scheduler authority.

## Phase 9 — Durable Timer/ExternalEvent and long-running research profile

Add candidate surfaces:

- `src/workflow/awaitables/types.ts`
- `src/workflow/timer-store.ts`
- `src/workflow/external-event-store.ts`
- `src/workflow/wakeup-scheduler.ts`

Then implement a research profile capable of durable multi-round research, waits, refreshes, synthesis, assessment, and ReportArtifact delivery.

Refactor plugin bootstrap so generic workflow/profile availability is capability-dependent rather than requiring the software Writer topology for the whole workflow runtime.

## Phase 10 — Convergence/authority/budget hardening

Build on the baseline assessment/convergence contract rather than introducing it for the first time here.

Hardening includes:

- criterion assessment policy variants;
- waiver/override authority objects;
- contradiction policy;
- budget accounting;
- stagnation detection;
- equivalent-Need loop detection;
- long-running definition migration policy;
- advanced profile-specific convergence gates.

Budget exhaustion remains blocked/action-required, never semantic success.

## Phase 11 — Legacy migration and cleanup

Only after vNext software/research paths reach production parity and migration confidence is sufficient:

- define v3 retirement/migration policy;
- reduce duplicate command/tool adapters;
- move software-specific files under profile boundaries with compatibility re-exports;
- retire legacy static graph/prompt/handoff semantic paths when no longer authoritative;
- remove deprecated public exports only through an explicit compatibility/versioning decision.

## Test strategy

### Legacy characterization

All existing v3 tests remain green without being rewritten merely to match vNext.

### Design-contract tests

Before capability execution, add focused tests for:

- authorization context vs v3 owner-session adapter;
- admission persistence/hash/CAS/confirmation provenance;
- v3 + vNext state coexistence;
- run/artifact/work-item schema parsing;
- exact InputBundle identity;
- capability routing;
- Planner typed output parsing;
- CriterionAssessment exact-subject binding;
- baseline convergence predicate.

### Runtime tests

Cover:

- execution lease/fencing/restart reconciliation;
- result-to-artifact promotion;
- causal invalidation;
- PendingAction authority/idempotency/staleness;
- independent branch progress during external wait;
- continuation artifact import after parent cleanup;
- timer/event restart recovery;
- duplicate external event handling;
- budget/stagnation behavior.

### Profile integration

Software:

```text
idea -> reviewed PR -> delivery -> feedback -> new head -> fresh review -> convergence
```

Research:

```text
research -> timer/event wait -> refresh -> synthesis -> assessment -> report
```

## Required validation after implementation PRs

Canonical repository checks:

```bash
npm run check
npm test
npm run build
npm run verify-package
```

Use focused Vitest files during development, but every production implementation PR must finish with the full gate above.

## Non-goals for the first implementation slice

- no big-bang rewrite of `WorkflowEngine`;
- no deletion of v3 persisted state support;
- no hard-coding creator session identity as the permanent vNext authorization model;
- no in-memory-only admission confirmation state;
- no generic Timer implemented as fake recovery;
- no global cross-run reference-counted artifact GC;
- no moving software-specific files merely for naming purity;
- no replacement of Team/Writer/Research runners with one coupled generic executor;
- no change to v3 reviewed-PR completion semantics;
- no hidden LLM reasoning inside the Orchestrator control plane.
