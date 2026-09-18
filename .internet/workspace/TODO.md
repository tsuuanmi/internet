# Workflow vNext TODO

## Current status

**Design Gate D0 and Phases 0-6 have landed on `main`; Phase 7 software Delivery/User-feedback lifecycle is implemented in PR #45, and Phase 8 Workstream/continuation is implemented in PR #46.**

The migration now has one authoritative `WorkflowService` boundary, durable admission, the parallel vNext kernel/runtime, typed semantic artifacts, deterministic convergence, capability adapters, durable external interactions, and a software Delivery/User-feedback loop where implementation produces an exact reviewable output, review PASS creates an exact-head Delivery checkpoint, User/local feedback is persisted against that checkpoint, and reasoning capabilities—not the deterministic Orchestrator—derive typed consequences. The v3 runtime remains supported during migration.

The next implementation milestone after Phase 8 is Timer/ExternalEvent.

## D0 — Design contract harmonization

- [x] Replace stale `Local/Orchestrator` terminology in normative proposed docs with explicit `Local Agent` vs `Orchestrator Runtime` ownership where authoritative control is involved.
- [x] Rewrite `SRS-VNEXT.md` actor/core model so Local Agent is a reasoning client/operator, not the authoritative orchestrator.
- [x] Fix Planner ADR/SRS so Orchestrator Runtime, not Local Agent, materializes WorkItems, routes typed Needs, applies lineage invalidation, and performs authority/state transitions.
- [x] Fix PR-workspace ADR/SRS so Orchestrator Runtime owns deterministic publication/reconciliation and Local Agent remains only a client/operator.
- [x] Fix Git-mutation ADR/SRS so Orchestrator Runtime owns desired-effect derivation/reconciliation and Local Agent does not become repository control authority.
- [x] Add/confirm core Need vocabulary: `requirements_change` and `clarification`.
- [x] Correct core wording that implied `plan_change` may alter acceptance criteria; criteria/objective revision now uses `requirements_change`.
- [x] Update core/ADR Need routing so validated Need may materialize as `WorkItem` or `PendingAction` depending on typed semantics/policy.
- [x] Standardize workflow external-wait terminology on `WAITING_EXTERNAL` for vNext.
- [x] Clarify parent-owned source Artifact vs child-owned imported continuation Artifact/snapshot.
- [x] Add baseline CriterionAssessment/convergence ADR/SRS before complete product journeys.
- [x] Add explicit v3 compatibility/migration wording to core/kernel contracts.
- [x] Distinguish existing v3 `WorkflowPendingAction` from the vNext durable multi-action model.
- [x] Remove graph-as-universal-semantic-authority wording from ADR-0011/kernel contracts.
- [x] Scope Worker terminology to profiles that actually use an implementation/generation role rather than making Worker mandatory kernel vocabulary.

## P0 — WorkflowService / authorization boundary

- [x] Add `WorkflowService` as the single workflow client boundary.
- [x] Define an explicit authorization context/principal input for service operations.
- [x] Preserve v3 `ownerSessionId` behavior through a session-binding adapter.
- [x] Do not make creator-session identity the permanent vNext authorization model.
- [x] Route `/workflow` command operations through `WorkflowService`.
- [x] Route `internet_workflow` tool operations through `WorkflowService`.
- [x] Centralize authorization for status, cancel, continue/recover, and delete.
- [x] Add cross-session denial tests for status.
- [x] Add cross-session denial tests for cancel.
- [x] Add cross-session denial tests for continue/recover.
- [x] Add cross-session denial tests for delete.
- [x] Preserve current v3 execution semantics and exact-head behavior while routing new starts through admission.
- [x] Remove obsolete direct-start/tool compatibility paths once durable admission became the authoritative current-spec client protocol.

## P0 — Migration contract

- [ ] Document `WorkflowJob` v3 as a supported compatibility runtime during migration in implementation-facing code/comments/tests where needed.
- [ ] Do not change the current v3 parser so existing durable job files become unreadable.
- [ ] Introduce vNext `WorkflowRun` state in parallel storage rather than in-place replacement.
- [ ] Define schema/version compatibility rules for vNext stores.
- [ ] Define retention behavior for legacy and vNext stores independently.
- [ ] Add tests proving v3 and vNext persisted state can coexist.

## P1 — Durable admission

- [x] Define `WorkflowAdmissionDraft`.
- [x] Define immutable accepted `AdmissionSpec`.
- [x] Define field provenance: User explicit / Local interpretation / policy default / Planner derivation / system observation, with confirmation provenance recorded separately.
- [x] Add durable `WorkflowAdmissionStore` for pre-run records.
- [x] Define concrete admission lifecycle: DRAFT / PREFLIGHTED / AWAITING_CONFIRMATION / ACCEPTED / ACTIVATING / ACTIVATED.
- [x] Define deterministic admission validation.
- [x] Define deterministic preflight result/preview.
- [x] Define stable canonical admission hashing and schema/version identity.
- [x] Persist confirmation provenance/receipt when confirmation is required.
- [x] Require activation against the exact accepted-spec hash.
- [x] Add stale/mismatched admission activation tests.
- [x] Add reconstruction/retry coverage for outstanding confirmation and activation crash windows.
- [x] Add initial software profile admission mapping and profile registry boundary.
- [x] Keep `/workflow <objective>` as the User-explicit `AUTO_SUBMIT` convenience path while the low-level client uses explicit `admit -> confirm -> activate`.

## P1 — Kernel substrate

- [x] Define domain-neutral `WorkflowRun` type.
- [x] Add `WorkflowRunStore`.
- [x] Define generic immutable/superseding Artifact envelope.
- [x] Add `ArtifactStore`.
- [x] Define `WorkItem` lifecycle separately from semantic Need lifecycle.
- [x] Add `WorkItemStore`.
- [x] Define exact `InputBundle` schema and hash rules.
- [x] Define deterministic capability registry interface.
- [x] Define execution/result/receipt references without collapsing them into Artifact.
- [x] Bind profile/policy/capability/schema versions needed for long-lived recovery.
- [x] Keep provider/account/session allocation below capability identity.
- [x] Reuse current execution/recovery/fencing semantics where applicable while keeping one authoritative domain-neutral vNext implementation.

## P1 — Semantic protocol and Planner

- [x] Define ObjectiveArtifact.
- [x] Define AcceptanceCriteriaArtifact with provenance/authority.
- [x] Define PlanArtifact and PlanTask identity.
- [x] Define typed Need schema and request-owner binding.
- [x] Define FindingArtifact.
- [x] Define EvidenceArtifact.
- [x] Define ReportArtifact.
- [x] Define DeliveryArtifact.
- [x] Define UserFeedbackArtifact.
- [x] Define explicit execution-result-to-artifact promotion/validation path.
- [x] Keep `NodeResult` / execution result, Handoff/Receipt, and semantic Artifact separate.
- [x] Define a first-class `planning` capability contract.
- [x] Add a planning executor adapter/typed output contract; do not assume current `WorkflowTeamRunner` already provides Planner semantics.
- [x] Define Planner re-entry triggers without fixed phase assumptions.
- [x] Keep `plan_change`, `requirements_change`, and `clarification` distinct.
- [x] Define user/policy-owned acceptance-criterion authority checks.
- [x] Use ordinary versioned PlanRevision for progressive/lazy PlanTask refinement; add a separate artifact only if a future contract requires distinct semantics.

## P1 — Baseline criterion assessment and convergence

- [x] Create ADR/SRS for criterion-scoped assessment and baseline convergence.
- [x] Implement assessment identity and exact subject binding.
- [x] Implement verdicts: SATISFIED / UNSATISFIED / INCONCLUSIVE.
- [x] Implement deterministic vs Reviewer vs User assessment methods/policies.
- [x] Implement stale assessment rules when criterion/head/InputBundle/evidence changes.
- [x] Keep waiver/override outside CriterionAssessment verdicts; any future waiver authority object belongs to the convergence hardening milestone.
- [x] Implement a minimum profile convergence predicate over current valid assessments, Findings, required deliverables, authority gates, and external state.
- [x] Distinguish WorkItem completion, PlanTask execution completion, criterion satisfaction, and WorkflowRun convergence in runtime state/tests.
- [x] Land baseline assessment/convergence before any vNext product journey can claim terminal semantic success.

## P1 — vNext RunEngine / Driver / Scheduler

- [x] Add a vNext deterministic run coordinator beside legacy `WorkflowEngine`.
- [x] Define optimistic run revision/CAS behavior.
- [x] Implement the typed Need -> WorkItem/PendingAction materialization boundary from typed fields/policy only; durable multi-action lifecycle remains P2.
- [x] Implement deterministic capability routing.
- [x] Implement readiness/dependency evaluation.
- [x] Implement exact InputBundle construction.
- [x] Implement execution lease/fencing/reconciliation.
- [x] Implement result promotion/validation.
- [x] Implement causal invalidation.
- [x] Implement baseline convergence evaluation.
- [x] Implement restart/resume scheduling.
- [x] Do not make legacy Research/Writer/Review phase or node-kind vocabulary the generic vNext kernel vocabulary.

## P1 — Capability adapters

- [x] Add planning reasoning capability adapter.
- [x] Add software repository-research capability adapter around `WorkflowTeamRunner`.
- [x] Add software implementation capability adapter around `WorkflowWriterRunner`.
- [x] Add software review capability adapter around `WorkflowTeamRunner`.
- [x] Add external deep-research capability adapter around `BrowserManager.research`.
- [x] Verify capability routing does not require Orchestrator to interpret PlanTask prose.
- [x] Verify generic interfaces do not absorb GitHub/PR/browser-specific responsibilities.
- [x] Verify every adapter produces an exact result that is schema-validated before Artifact promotion.

## P2 — Durable external interactions

- [x] Replace/augment single v3 job-level PendingAction with vNext durable action collection.
- [x] Give every action stable `actionId`.
- [x] Add action state lifecycle.
- [x] Add owner/subject references.
- [x] Add responder policy: `USER_AUTHORITY`, `LOCAL_AGENT_INPUT`, `USER_OR_LOCAL`.
- [x] Add response schema/version.
- [x] Add exact subject/head/version binding where required.
- [x] Add response provenance.
- [x] Add idempotent response retry behavior.
- [x] Reject conflicting second responses deterministically.
- [x] Reject stale action responses deterministically.
- [x] Verify independent runnable branches continue while one action is pending.
- [x] Derive `WAITING_EXTERNAL` only when no autonomous progress remains.
- [x] Keep `continue` as legacy/recovery surface, not generic semantic response.

## P2 — Software delivery feedback loop

- [x] Add vNext exact-head `DeliveryArtifact` for reviewed PR checkpoints.
- [x] Add User-validation PendingAction after delivery when profile requires it.
- [x] Store User/local feedback as typed external input with raw source and target Delivery/head.
- [x] Route semantic interpretation of feedback to a reasoning capability.
- [x] Never let deterministic Orchestrator interpret free-form feedback into mutations directly.
- [x] Invalidate dependent current artifacts/results when correctness-bearing inputs change.
- [x] Require fresh exact-head assessment/review after any changed PR head.
- [x] Reject or explicitly reassess feedback targeting an obsolete Delivery/head.
- [x] Use baseline criterion assessment/convergence for terminal decision.
- [x] Preserve v3 behavior where review PASS is terminal.

## P2 — Workstream and continuation

- [x] Define Workstream as continuity metadata, not an execution graph.
- [x] Add Workstream store.
- [x] Add continuation admission linking parent/child runs.
- [x] Define source run/artifact/hash lineage.
- [x] Preserve historical ownership of original source Artifact in the parent run.
- [x] Import/copy exact correctness-bearing Artifact snapshots into child-owned storage for first implementation.
- [x] Verify parent-run retention cannot break child-run reproducibility.
- [x] Avoid global reference-counted artifact GC in the first version.

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
- [ ] Retire legacy semantic handoff path only after typed Artifacts fully replace its semantic role.
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
- [ ] Parent run becomes retention-eligible after child continuation imported source Artifacts.
- [ ] Cancellation races with an active external mutation.

## Validation checklist for every implementation PR

- [x] Run focused Vitest files while developing Phase 0/1.
- [x] `npm run check`
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run verify-package`
- [x] Confirm existing v3 characterization tests remain green; Phase 1 changes startup admission without replacing the v3 execution/state contract.

## Design-PR completion checklist

- [x] Record production migration sequence in `PLAN.md`.
- [x] Record milestone/outcome sequence in `ROADMAP.md`.
- [x] Record actionable implementation backlog in this `TODO.md`.
- [x] Review PLAN/ROADMAP/TODO against current codebase and identify hidden dependency/order corrections.
- [x] Complete Design Gate D0 terminology/authority corrections across normative proposed docs.
- [x] Add baseline CriterionAssessment/convergence ADR/SRS.
- [x] Synchronize Planner Need types into core Need/capability docs.
- [x] Rewrite `SRS-VNEXT.md` as the harmonized umbrella contract (v0.3).
- [x] Align ADR-0009/0010/0011/0019 and `SRS-VNEXT-KERNEL.md` with core v0.3.
- [x] Add explicit v3 compatibility/migration language to authoritative core/kernel contracts.
- [x] Update documentation indexes/PR summary with `ADR-0021` and `SRS-VNEXT-CONVERGENCE`.
- [x] Final terminology/search pass for stale authority phrases in remaining narrative/non-core proposal docs.
