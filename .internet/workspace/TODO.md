# Workflow vNext TODO

## Current status

Architecture/design only. No runtime implementation should be started in this PR.

The highest-priority production gap found during code review is the lack of one authoritative application/service boundary shared by the slash command and low-level workflow tool.

## P0 — Required before vNext runtime implementation

- [ ] Add `WorkflowService` (or equivalent application service) as the single workflow client boundary.
- [ ] Route `/workflow` command operations through `WorkflowService`.
- [ ] Route `internet_workflow` tool operations through `WorkflowService`.
- [ ] Centralize owner/session authorization for status, cancel, continue/recover, and delete.
- [ ] Add cross-session denial tests for status.
- [ ] Add cross-session denial tests for cancel.
- [ ] Add cross-session denial tests for continue/recover.
- [ ] Add cross-session denial tests for delete.
- [ ] Preserve all current v3 workflow behavior and exact-head semantics.
- [ ] Keep existing public command/tool compatibility unless a breaking change is explicitly approved.

## P0 — Migration contract

- [ ] Document `WorkflowJob` v3 as a supported compatibility runtime during migration.
- [ ] Do not change the current v3 parser so existing durable job files become unreadable.
- [ ] Introduce vNext `WorkflowRun` state in parallel storage rather than in-place replacement.
- [ ] Define schema/version compatibility rules for vNext stores.
- [ ] Define retention behavior for legacy and vNext stores independently.
- [ ] Add tests proving v3 and vNext persisted state can coexist.

## P1 — Admission

- [ ] Define `WorkflowAdmissionDraft`.
- [ ] Define accepted `AdmissionSpec`.
- [ ] Define field provenance: User / Local inference / policy default / User confirmation / Planner derivation.
- [ ] Define deterministic admission validation.
- [ ] Define deterministic preflight result/preview.
- [ ] Define stable admission hash/version.
- [ ] Require `activate(expectedAdmissionHash)` or equivalent CAS semantics.
- [ ] Add stale/mismatched admission activation tests.
- [ ] Add initial software profile admission mapping.
- [ ] Keep existing `/workflow <objective>` as a compatibility adapter initially.

## P1 — Kernel state

- [ ] Define domain-neutral `WorkflowRun` type.
- [ ] Add `WorkflowRunStore`.
- [ ] Define `WorkItem` lifecycle separately from semantic Need lifecycle.
- [ ] Add `WorkItemStore`.
- [ ] Define exact `InputBundle` schema and hash rules.
- [ ] Add immutable/versioned `ArtifactStore`.
- [ ] Define artifact lineage and supersession semantics.
- [ ] Define deterministic capability registry interface.
- [ ] Keep provider/account/session allocation below capability identity.
- [ ] Reuse existing execution/recovery/fencing mechanics where possible instead of duplicating them.

## P1 — Capability adapters

- [ ] Add software repository-research capability adapter around `WorkflowTeamRunner`.
- [ ] Add software implementation capability adapter around `WorkflowWriterRunner`.
- [ ] Add software review capability adapter around `WorkflowTeamRunner`.
- [ ] Add external deep-research capability adapter around `BrowserManager.research`.
- [ ] Verify capability routing does not require Local to interpret PlanTask prose.
- [ ] Verify generic interfaces do not absorb GitHub/PR/browser-specific responsibilities.

## P1 — Semantic artifact model

- [ ] Define ObjectiveArtifact.
- [ ] Define AcceptanceCriteriaArtifact with provenance/authority.
- [ ] Define PlanArtifact and PlanTask identity.
- [ ] Define FindingArtifact.
- [ ] Define EvidenceArtifact.
- [ ] Define CriterionAssessment/Assessment artifact.
- [ ] Define ReportArtifact.
- [ ] Define DeliveryArtifact.
- [ ] Define UserFeedbackArtifact.
- [ ] Keep `NodeResult`, `Handoff`, and semantic Artifact as separate concepts.
- [ ] Define explicit result-to-artifact promotion/validation path.

## P1 — Planner lifecycle consistency

- [ ] Synchronize core Need types with Planner design.
- [ ] Add/confirm `requirements_change` Need type.
- [ ] Add/confirm `clarification` Need type.
- [ ] Keep `plan_change`, `requirements_change`, and `clarification` distinct.
- [ ] Define user/policy-owned acceptance-criterion authority checks.
- [ ] Define Planner re-entry triggers without fixed phase assumptions.
- [ ] Decide whether progressive/lazy PlanTask refinement needs a separate artifact or ordinary PlanRevision.

## P1 — Criterion assessment and convergence design

- [ ] Create ADR for criterion-scoped assessment and convergence.
- [ ] Define assessment identity and exact subject binding.
- [ ] Define verdicts: SATISFIED / UNSATISFIED / INCONCLUSIVE.
- [ ] Keep waiver/override as separate authority object rather than normal assessment verdict.
- [ ] Define deterministic vs Reviewer vs User assessment methods/policies.
- [ ] Define stale assessment rules when criterion/head/InputBundle/evidence changes.
- [ ] Define convergence predicate over current valid assessments, Findings, review/check gates, authority, and budgets.
- [ ] Ensure budget exhaustion transitions to BLOCKED/HUMAN_ACTION, never success.

## P2 — Durable external interactions

- [ ] Replace/augment single v3 job-level PendingAction with vNext durable action collection.
- [ ] Give every action stable `actionId`.
- [ ] Add action state lifecycle.
- [ ] Add owner/subject references.
- [ ] Add responder policy: `USER_AUTHORITY`, `LOCAL_AGENT_INPUT`, `USER_OR_LOCAL`.
- [ ] Add response schema/version.
- [ ] Add exact subject/head version binding where required.
- [ ] Add response provenance.
- [ ] Add idempotent response retry behavior.
- [ ] Reject conflicting second responses deterministically.
- [ ] Reject stale action responses deterministically.
- [ ] Verify independent runnable branches continue while one action is pending.
- [ ] Keep `continue` as legacy/recovery surface, not generic semantic response.

## P2 — Software delivery feedback loop

- [ ] Add vNext exact-head `DeliveryArtifact` for reviewed PR checkpoints.
- [ ] Add User-validation PendingAction after delivery when profile requires it.
- [ ] Store User/local feedback as typed external input with raw source and target Delivery/head.
- [ ] Route semantic interpretation of feedback to a reasoning capability.
- [ ] Never let Local interpret free-form feedback into mutations directly.
- [ ] Invalidate dependent current artifacts/results when correctness-bearing inputs change.
- [ ] Require fresh exact-head review after any changed PR head.
- [ ] Reject or explicitly reconcile feedback targeting an obsolete Delivery/head.
- [ ] Preserve v3 behavior where review PASS is terminal.

## P2 — Workstream and continuation

- [ ] Define Workstream as continuity metadata, not an execution graph.
- [ ] Add Workstream store.
- [ ] Add continuation admission linking parent/child runs.
- [ ] Define source run/artifact/hash lineage.
- [ ] Import/copy correctness-bearing artifacts into child run storage for first implementation.
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
- [ ] Produce Evidence and Report artifacts.
- [ ] Support continuation from terminal research run into later software run.
- [ ] Ensure research workflow availability does not depend on `chatgpt-writer`.

## P2 — Bootstrap and configuration

- [ ] Decouple generic workflow runtime registration from software account topology.
- [ ] Register software profile only when required software capabilities are available.
- [ ] Register research profile when research capabilities are available.
- [ ] Avoid flattening profile policy into `BrowserConfig` prematurely.
- [ ] Introduce separate runtime/profile config boundaries only when concrete settings require them.
- [ ] Update `test/index.test.ts` registration expectations when profile-aware bootstrap is implemented.

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
- [ ] Caller B guesses Caller A's workflow ID.
- [ ] Pending approval/feedback arrives after PR head changes.
- [ ] Feedback targets Delivery H7 while workflow is already on H8.
- [ ] Process dies after external side effect succeeds but before receipt persistence.
- [ ] Timer deadline passes while process is offline.
- [ ] Same external event is delivered twice.
- [ ] Capability exists in profile but executor/account is unavailable.
- [ ] Profile/capability/schema definition changes during a long wait.
- [ ] New evidence contradicts evidence already consumed by implementation.
- [ ] Equivalent Need/patch repeats without meaningful state change.
- [ ] Merge authorization is for H1 but H2 exists at execution time.
- [ ] Parent run becomes retention-eligible after child continuation starts.
- [ ] Cancellation races with an active external mutation.

## Validation checklist for every implementation PR

- [ ] Run focused Vitest files while developing.
- [ ] `npm run check`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run verify-package`
- [ ] Confirm existing v3 characterization tests remain green unless the PR explicitly and intentionally changes the v3 contract.

## Design-PR completion checklist

- [x] Record production migration sequence in `PLAN.md`.
- [x] Record milestone/outcome sequence in `ROADMAP.md`.
- [x] Record actionable implementation backlog in this `TODO.md`.
- [ ] Add CriterionAssessment/convergence ADR/SRS before implementation reaches convergence work.
- [ ] Synchronize Planner-only Need types into core Need/capability docs.
- [ ] Review existing vNext docs for wording that implies current primitives are being introduced from zero rather than evolved.
- [ ] Review existing vNext docs for any wording that treats current `WorkflowEngine` as already domain-neutral.
- [ ] Add explicit v3 compatibility/migration language to the authoritative vNext overview/SRS where needed.
