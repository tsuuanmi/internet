# Workflow vNext TODO

## Current status

Architecture/design only. No runtime implementation should be started in this PR until Design Gate D0 is complete.

The highest-priority current-production gap remains the lack of one authoritative application/service boundary shared by the slash command and low-level workflow tool. The architecture review also found several proposal-contract inconsistencies that must be resolved before vNext implementation relies on them.

## D0 — Design contract harmonization

- [ ] Replace stale `Local/Orchestrator` terminology in core SRS/ADRs with explicit `Local Agent` vs `Orchestrator Runtime` ownership.
- [ ] Fix `SRS-VNEXT.md` actor section so Local Agent is not called the authoritative orchestrator.
- [ ] Fix Planner ADR/SRS so Orchestrator Runtime, not Local Agent, materializes WorkItems, routes typed Needs, applies lineage invalidation, and performs authority/state transitions.
- [ ] Fix PR-workspace ADR/SRS so Orchestrator Runtime owns deterministic publication/reconciliation and Local Agent remains only a client/operator.
- [ ] Fix Git-mutation ADR/SRS so Orchestrator Runtime owns desired-effect derivation/reconciliation and Local Agent does not become repository control authority.
- [ ] Add/confirm core Need vocabulary: `requirements_change` and `clarification`.
- [ ] Correct core wording that implies `plan_change` may alter acceptance criteria; criteria/objective revision must use `requirements_change`.
- [ ] Update core Need routing so validated Need may materialize as `WorkItem` or `PendingAction` depending on typed semantics/policy.
- [ ] Standardize workflow external-wait terminology on `WAITING_EXTERNAL` for vNext.
- [ ] Clarify parent-owned source Artifact vs child-owned imported continuation Artifact/snapshot.
- [ ] Add baseline CriterionAssessment/convergence ADR/SRS before implementation reaches complete product journeys.
- [ ] Add explicit v3 compatibility/migration wording where overview/core contracts still imply clean-slate replacement.
- [ ] Distinguish existing v3 `WorkflowPendingAction` from vNext durable multi-action model.

## P0 — WorkflowService / authorization boundary

- [ ] Add `WorkflowService` (or equivalent application service) as the single workflow client boundary.
- [ ] Define an explicit authorization context/principal input for service operations.
- [ ] Preserve v3 `ownerSessionId` behavior through a legacy authorization adapter.
- [ ] Do not make creator-session identity the permanent vNext authorization model.
- [ ] Route `/workflow` command operations through `WorkflowService`.
- [ ] Route `internet_workflow` tool operations through `WorkflowService`.
- [ ] Centralize authorization for status, cancel, continue/recover, and delete.
- [ ] Add cross-session denial tests for status.
- [ ] Add cross-session denial tests for cancel.
- [ ] Add cross-session denial tests for continue/recover.
- [ ] Add cross-session denial tests for delete.
- [ ] Preserve all current v3 workflow behavior and exact-head semantics.
- [ ] Keep current public command/tool compatibility unless a breaking change is explicitly approved.

## P0 — Migration contract

- [ ] Document `WorkflowJob` v3 as a supported compatibility runtime during migration.
- [ ] Do not change the current v3 parser so existing durable job files become unreadable.
- [ ] Introduce vNext `WorkflowRun` state in parallel storage rather than in-place replacement.
- [ ] Define schema/version compatibility rules for vNext stores.
- [ ] Define retention behavior for legacy and vNext stores independently.
- [ ] Add tests proving v3 and vNext persisted state can coexist.

## P1 — Durable admission

- [ ] Define `WorkflowAdmissionDraft`.
- [ ] Define accepted `AdmissionSpec`.
- [ ] Define field provenance: User explicit / Local interpretation / policy default / User confirmation / Planner derivation / system observation.
- [ ] Add durable `AdmissionStore` or equivalent pre-run record store.
- [ ] Define admission lifecycle: DRAFT / PREFLIGHTED / AWAITING_CONFIRMATION / ACCEPTED / ACTIVATED / EXPIRED / SUPERSEDED or equivalent.
- [ ] Define deterministic admission validation.
- [ ] Define deterministic preflight result/preview.
- [ ] Define stable admission hash/version.
- [ ] Persist confirmation provenance/receipt when confirmation is required.
- [ ] Require `activate(expectedAdmissionHash/version)` or equivalent CAS semantics.
- [ ] Add stale/mismatched admission activation tests.
- [ ] Add reconnect/retry test for an outstanding User confirmation.
- [ ] Add initial software profile admission mapping.
- [ ] Keep existing `/workflow <objective>` as a compatibility adapter initially.

## P1 — Kernel substrate

- [ ] Define domain-neutral `WorkflowRun` type.
- [ ] Add `WorkflowRunStore`.
- [ ] Define generic immutable/superseding Artifact envelope.
- [ ] Add `ArtifactStore`.
- [ ] Define `WorkItem` lifecycle separately from semantic Need lifecycle.
- [ ] Add `WorkItemStore`.
- [ ] Define exact `InputBundle` schema and hash rules.
- [ ] Define deterministic capability registry interface.
- [ ] Define execution/result/receipt references without collapsing them into Artifact.
- [ ] Bind profile/policy/capability/schema versions needed for long-lived recovery.
- [ ] Keep provider/account/session allocation below capability identity.
- [ ] Reuse current execution/recovery/fencing mechanics where possible instead of duplicating them.

## P1 — Semantic protocol and Planner

- [ ] Define ObjectiveArtifact.
- [ ] Define AcceptanceCriteriaArtifact with provenance/authority.
- [ ] Define PlanArtifact and PlanTask identity.
- [ ] Define typed Need schema and request-owner binding.
- [ ] Define FindingArtifact.
- [ ] Define EvidenceArtifact.
- [ ] Define ReportArtifact.
- [ ] Define DeliveryArtifact.
- [ ] Define UserFeedbackArtifact.
- [ ] Define explicit execution-result-to-artifact promotion/validation path.
- [ ] Keep `NodeResult` / execution result, Handoff/Receipt, and semantic Artifact separate.
- [ ] Define a first-class `planning` capability contract.
- [ ] Add a planning executor adapter/typed output contract; do not assume current `WorkflowTeamRunner` already provides Planner semantics.
- [ ] Define Planner re-entry triggers without fixed phase assumptions.
- [ ] Keep `plan_change`, `requirements_change`, and `clarification` distinct.
- [ ] Define user/policy-owned acceptance-criterion authority checks.
- [ ] Decide whether progressive/lazy PlanTask refinement needs a separate artifact or ordinary PlanRevision.

## P1 — Baseline criterion assessment and convergence

- [ ] Create ADR/SRS for criterion-scoped assessment and baseline convergence.
- [ ] Define assessment identity and exact subject binding.
- [ ] Define verdicts: SATISFIED / UNSATISFIED / INCONCLUSIVE.
- [ ] Define deterministic vs Reviewer vs User assessment methods/policies.
- [ ] Define stale assessment rules when criterion/head/InputBundle/evidence changes.
- [ ] Keep waiver/override as separate authority object rather than normal assessment verdict.
- [ ] Define a minimum profile convergence predicate over current valid assessments, Findings, required deliverables, authority gates, and external state.
- [ ] Distinguish WorkItem completion, PlanTask execution completion, criterion satisfaction, and WorkflowRun convergence.
- [ ] Ensure no product-journey milestone claims terminal success before this baseline exists.

## P1 — vNext RunEngine / Driver / Scheduler

- [ ] Add a vNext deterministic run coordinator beside legacy `WorkflowEngine`.
- [ ] Define optimistic run revision/CAS behavior.
- [ ] Implement Need -> WorkItem/PendingAction materialization from typed fields/policy only.
- [ ] Implement deterministic capability routing.
- [ ] Implement readiness/dependency evaluation.
- [ ] Implement exact InputBundle construction.
- [ ] Implement execution lease/fencing/reconciliation.
- [ ] Implement result promotion/validation.
- [ ] Implement causal invalidation.
- [ ] Implement baseline convergence evaluation.
- [ ] Implement restart/resume scheduling.
- [ ] Do not make legacy Research/Writer/Review phase or node-kind vocabulary the generic vNext kernel vocabulary.

## P1 — Capability adapters

- [ ] Add planning reasoning capability adapter.
- [ ] Add software repository-research capability adapter around `WorkflowTeamRunner`.
- [ ] Add software implementation capability adapter around `WorkflowWriterRunner`.
- [ ] Add software review capability adapter around `WorkflowTeamRunner`.
- [ ] Add external deep-research capability adapter around `BrowserManager.research`.
- [ ] Verify capability routing does not require Orchestrator to interpret PlanTask prose.
- [ ] Verify generic interfaces do not absorb GitHub/PR/browser-specific responsibilities.
- [ ] Verify every adapter produces an exact result that is schema-validated before Artifact promotion.

## P2 — Durable external interactions

- [ ] Replace/augment single v3 job-level PendingAction with vNext durable action collection.
- [ ] Give every action stable `actionId`.
- [ ] Add action state lifecycle.
- [ ] Add owner/subject references.
- [ ] Add responder policy: `USER_AUTHORITY`, `LOCAL_AGENT_INPUT`, `USER_OR_LOCAL`.
- [ ] Add response schema/version.
- [ ] Add exact subject/head/version binding where required.
- [ ] Add response provenance.
- [ ] Add idempotent response retry behavior.
- [ ] Reject conflicting second responses deterministically.
- [ ] Reject stale action responses deterministically.
- [ ] Verify independent runnable branches continue while one action is pending.
- [ ] Derive `WAITING_EXTERNAL` only when no autonomous progress remains.
- [ ] Keep `continue` as legacy/recovery surface, not generic semantic response.

## P2 — Software delivery feedback loop

- [ ] Add vNext exact-head `DeliveryArtifact` for reviewed PR checkpoints.
- [ ] Add User-validation PendingAction after delivery when profile requires it.
- [ ] Store User/local feedback as typed external input with raw source and target Delivery/head.
- [ ] Route semantic interpretation of feedback to a reasoning capability.
- [ ] Never let deterministic Orchestrator interpret free-form feedback into mutations directly.
- [ ] Invalidate dependent current artifacts/results when correctness-bearing inputs change.
- [ ] Require fresh exact-head assessment/review after any changed PR head.
- [ ] Reject or explicitly reassess feedback targeting an obsolete Delivery/head.
- [ ] Use baseline criterion assessment/convergence for terminal decision.
- [ ] Preserve v3 behavior where review PASS is terminal.

## P2 — Workstream and continuation

- [ ] Define Workstream as continuity metadata, not an execution graph.
- [ ] Add Workstream store.
- [ ] Add continuation admission linking parent/child runs.
- [ ] Define source run/artifact/hash lineage.
- [ ] Preserve historical ownership of original source Artifact in the parent run.
- [ ] Import/copy exact correctness-bearing Artifact snapshots into child-owned storage for first implementation.
- [ ] Verify parent-run retention cannot break child-run reproducibility.
- [ ] Avoid global reference-counted artifact GC in the first version.

## P2 — Timer / ExternalEvent

- [ ] Define first-class Timer separate from recovery receipts.
- [ ] Define first-class ExternalEvent.
- [ ] Add durable wake-up scheduler.
- [ ] Persist timer deadlines so restart does not lose waits.
- [ ] Reconcile overdue timers after process restart.
- [ ] Deduplicate repeated external events.
- [ ] Keep recovery `notBefore` semantics separate even if wake-up infrastructure is shared later.

## P2 — Research profile

- [ ] Define `deep_research`/research workflow profile.
- [ ] Reuse provider-native deep research through the capability adapter.
- [ ] Support multiple durable research rounds.
- [ ] Support timer/event waits between rounds.
- [ ] Produce Evidence, Assessment, and Report artifacts.
- [ ] Support continuation from terminal research run into later software run.
- [ ] Ensure research workflow availability does not depend on `chatgpt-writer`.

## P2 — Bootstrap and configuration

- [ ] Decouple generic workflow runtime registration from software account topology.
- [ ] Register software profile only when required software capabilities are available.
- [ ] Register research profile when research capabilities are available.
- [ ] Avoid flattening profile policy into `BrowserConfig` prematurely.
- [ ] Introduce separate runtime/profile config boundaries only when concrete settings require them.
- [ ] Update `test/index.test.ts` registration expectations when profile-aware bootstrap is implemented.

## P2 — Convergence/authority/budget hardening

- [ ] Add advanced criterion-assessment policy variants.
- [ ] Add explicit waiver/override authority objects.
- [ ] Add contradiction policy.
- [ ] Add workflow resource-budget accounting.
- [ ] Add equivalent Need/patch stagnation detection.
- [ ] Add profile/capability/schema migration policy for long waits.
- [ ] Ensure budget/stagnation exhaustion transitions to BLOCKED/ACTION_REQUIRED, never success.

## P2 — Public API compatibility

- [ ] Treat new vNext types as additive initially.
- [ ] Keep legacy `WorkflowJob`, graph, runner, and store exports while v3 is supported.
- [ ] Use compatibility re-exports before moving exported files.
- [ ] Document any eventual package-level breaking change explicitly.
- [ ] Update package-contract tests for new built/exported surfaces when added.

## Cleanup candidates — defer until vNext parity

- [ ] Remove duplicate command/tool application logic after `WorkflowService` is authoritative.
- [ ] Move software-only approval policy under software profile boundary when compatibility allows.
- [ ] Move software-only repository context under software profile boundary when compatibility allows.
- [ ] Move/rename Writer runner only after public import compatibility is handled.
- [ ] Retire static v3 graph builder only after vNext software profile reaches production parity.
- [ ] Retire legacy semantic handoff path only after typed artifacts fully replace its semantic role.
- [ ] Define v3 durable-state retirement/migration policy before deleting v3 parser/store support.

## Required edge-case tests

- [ ] User confirms admission H1; Local attempts to activate H2.
- [ ] Admission requires User confirmation; Local/client disconnects and a new authorized client resumes it.
- [ ] Caller B guesses Caller A's v3 workflow ID.
- [ ] Authorized replacement client attaches to a vNext run under future principal policy without impersonating the creator session.
- [ ] Pending approval/feedback arrives after PR head changes.
- [ ] Feedback targets Delivery H7 while workflow is already on H8.
- [ ] Process dies after external side effect succeeds but before receipt persistence.
- [ ] Stale/fenced execution attempts to commit after a replacement attempt succeeded.
- [ ] Timer deadline passes while process is offline.
- [ ] Same external event is delivered twice.
- [ ] Capability exists in profile but executor/account is unavailable.
- [ ] Profile/capability/schema definition changes during a long wait.
- [ ] New evidence contradicts evidence already consumed by implementation.
- [ ] Criterion assessment becomes stale after exact subject/head changes.
- [ ] Equivalent Need/patch repeats without meaningful state change.
- [ ] Merge authorization is for H1 but H2 exists at execution time.
- [ ] Parent run becomes retention-eligible after child continuation imported source artifacts.
- [ ] Cancellation races with an active external mutation.

## Validation checklist for every implementation PR

- [ ] Run focused Vitest files while developing.
- [ ] `npm run check`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run verify-package`
- [ ] Confirm existing v3 characterization tests remain green unless the PR explicitly and intentionally changes the v3 contract.

## Design-PR completion checklist

- [x] Record initial production migration sequence in `PLAN.md`.
- [x] Record initial milestone/outcome sequence in `ROADMAP.md`.
- [x] Record implementation backlog in this `TODO.md`.
- [x] Review PLAN/ROADMAP/TODO against current codebase and identify hidden dependency/order corrections.
- [ ] Complete Design Gate D0 terminology/authority corrections across normative proposed docs.
- [ ] Add baseline CriterionAssessment/convergence ADR/SRS.
- [ ] Synchronize Planner Need types into core Need/capability docs.
- [ ] Review remaining vNext docs for wording that implies current durable primitives are introduced from zero rather than evolved.
- [ ] Add explicit v3 compatibility/migration language to authoritative vNext overview/SRS where needed.
