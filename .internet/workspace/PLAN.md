# Workflow vNext Production-Readiness Plan

## Objective

Turn the current vNext design into a production-ready implementation path without destabilizing the existing durable coding workflow.

This plan is based on review of the current `main` codebase and treats the existing workflow as a supported v3 compatibility runtime during migration.

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

## Production-readiness corrections to the proposed design

### 1. Preserve v3 during migration

Do not mutate `WorkflowJob` v3 in place or make existing persisted jobs unreadable.

Introduce vNext runtime state alongside v3 state. Existing v3 jobs, tests, CLI behavior, exact-head behavior, recovery, and retention remain supported until an explicit migration/deprecation milestone.

Preferred storage boundary:

```text
workflows/
  jobs/          # existing WorkflowJob v3
  runs/          # vNext WorkflowRun
  artifacts/     # vNext semantic artifacts
  work-items/    # vNext executable work
  actions/       # vNext external interactions
  workstreams/   # long-lived continuation metadata
```

### 2. Add an authoritative application/service boundary first

Both the slash command and Local Agent tool currently reach workflow runtime behavior through separate paths. The low-level tool can bypass the owner filtering performed by `WorkflowOperator`.

Before adding vNext semantics, introduce one authoritative workflow application service responsible for:

- caller/session ownership checks;
- workflow selection;
- start/status/cancel/recover/delete authorization;
- admission entry points;
- mapping protocol requests onto the correct legacy or vNext runtime.

Target boundary:

```text
Slash command ----\
                  > WorkflowService -> legacy v3 runtime / vNext runtime
Local Agent tool -/
```

The Engine must not own UI syntax, Local Agent semantics, or caller authorization.

### 3. Keep current execution primitives; separate semantic artifacts

Do not equate existing `WorkflowNodeResult` or handoff records with vNext semantic artifacts.

Use three distinct concepts:

```text
NodeResult  = exact execution/reconciliation result
Handoff     = exact delivery/transport receipt
Artifact    = durable semantic workflow product
```

A capability execution may create a NodeResult, which is schema-validated and promoted into one or more typed Artifacts.

### 4. Capability registry wraps existing executors first

Do not rewrite Team/Writer/Research runners into one generic executor.

Initial registry adapters should reuse existing provider-specific implementations:

```text
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

The vNext model should use durable action objects with:

- stable `actionId`;
- owner/subject references;
- state/lifecycle;
- responder/authority policy;
- response schema/version;
- exact subject version or head binding when required;
- response provenance;
- idempotent retry handling.

A pending external action blocks only its dependent paths. The whole run becomes externally waiting only when no unrelated runnable work remains.

### 6. Keep Workstream outside execution graphs

A Workstream is continuity metadata across bounded WorkflowRuns, not another scheduler/state machine.

A terminal run remains terminal. Follow-up work creates another run in the same Workstream with explicit artifact lineage.

For the first continuation implementation, import/copy correctness-bearing source artifacts into the child run and retain source lineage (`sourceRunId`, `sourceArtifactId`, hash). Avoid global reference-counted cross-run garbage collection initially.

### 7. Delivery is not terminal completion in vNext software runs

Preserve the current v3 rule where exact-head review PASS means completion.

For the vNext software profile only:

```text
review PASS
  -> DeliveryArtifact(PR + exact head)
  -> User validation checkpoint
  -> feedback may resume the same non-terminal run
  -> fresh implementation/review if needed
  -> merge authorization / profile convergence
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

Recovery delays can later share wake-up infrastructure without sharing semantic identity.

## Dependency-aware implementation sequence

### Phase 0 — WorkflowService and ownership consistency

Add:

- `src/workflow/service.ts`
- `test/workflow-service.test.ts`

Modify:

- `src/tools/internet-workflow.ts`
- `src/commands/workflow.ts`
- `src/workflow/operator.ts`
- `src/index.ts`
- relevant tool/operator/index tests

Requirements:

- command and tool use one authoritative service path;
- all non-public operations validate caller ownership;
- cross-session status/cancel/continue/delete attempts fail closed;
- preserve current v3 behavior and outputs where compatible.

This is the first implementation milestone.

### Phase 1 — Admission protocol, software profile first

Add:

- `src/workflow/admission/types.ts`
- `src/workflow/admission/validation.ts`
- `src/workflow/admission/preflight.ts`
- `src/workflow/admission/hash.ts`
- `src/workflow/profiles/types.ts`
- `src/workflow/profiles/software-profile.ts`

Core invariant:

```text
compile -> preflight -> preview/confirmation -> activate(expectedAdmissionHash)
```

The exact accepted admission identity must be activated.

Keep `/workflow <objective>` and existing tool start behavior as compatibility adapters initially.

### Phase 2 — Parallel vNext WorkflowRun kernel state

Add:

- `src/workflow/kernel/types.ts`
- `src/workflow/run-store.ts`
- `src/workflow/artifact-store.ts`
- `src/workflow/work-item-store.ts`
- `src/workflow/input-bundle.ts`
- `src/workflow/capability-registry.ts`

Do not delete or repurpose v3 stores/builders yet.

Add unit tests for schema parsing, versioning, exact InputBundle identity, immutable artifacts, WorkItem lifecycle, and deterministic capability routing.

### Phase 3 — Capability adapters

Add software and research profile adapters around existing runners rather than replacing them.

Candidate paths:

- `src/workflow/profiles/software/research-capability.ts`
- `src/workflow/profiles/software/implementation-capability.ts`
- `src/workflow/profiles/software/review-capability.ts`
- `src/workflow/profiles/research/deep-research-capability.ts`

### Phase 4 — Typed semantic artifact promotion

Add typed artifacts such as:

- Objective / AcceptanceCriteria / Plan;
- Finding / Evidence / Assessment;
- Report;
- Delivery;
- UserFeedback.

Execution result promotion must be explicit and schema validated.

### Phase 5 — Durable external interaction protocol

Add:

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

### Phase 6 — vNext software Delivery/feedback lifecycle

Implement reviewed delivery checkpoints without immediately completing the run.

Required behavior:

- Delivery binds exact repository/PR/head identity;
- User/local feedback is stored as typed external input with provenance;
- semantic capabilities interpret prose feedback, not the deterministic orchestrator;
- changed correctness-bearing inputs invalidate dependent results deterministically;
- every changed PR head requires fresh exact-head review before delivery is current.

### Phase 7 — Workstream and continuation

Add:

- `src/workflow/workstream-store.ts`
- `src/workflow/continuation.ts`

Implement bounded run continuation and artifact import with source lineage.

### Phase 8 — Durable Timer/ExternalEvent and research workflow

Add:

- `src/workflow/awaitables/types.ts`
- `src/workflow/timer-store.ts`
- `src/workflow/external-event-store.ts`
- `src/workflow/wakeup-scheduler.ts`

Then implement a research profile capable of durable multi-round research, waits, refreshes, synthesis, and ReportArtifact delivery.

Refactor plugin bootstrap so profile availability is capability-dependent rather than requiring the software Writer topology for the whole workflow runtime.

## Test strategy

### Legacy characterization

All existing v3 tests remain green without being rewritten merely to match vNext.

### New kernel tests

Cover:

- admission hash/CAS;
- caller ownership;
- run/artifact/work-item persistence;
- exact InputBundle identity;
- deterministic routing;
- PendingAction authority and idempotency;
- stale response rejection;
- lineage and continuation import;
- timer/event restart recovery;
- budget/stagnation behavior.

### Profile integration

Software:

```text
idea -> reviewed PR -> delivery -> feedback -> new head -> fresh review -> convergence
```

Research:

```text
research -> timer/event wait -> refresh -> synthesis -> report
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
- no generic Timer implemented as fake recovery;
- no global cross-run reference-counted artifact GC;
- no moving software-specific files merely for naming purity;
- no replacement of Team/Writer/Research runners with one coupled generic executor;
- no change to v3 reviewed-PR completion semantics;
- no hidden LLM reasoning inside Local/Orchestrator control logic.
