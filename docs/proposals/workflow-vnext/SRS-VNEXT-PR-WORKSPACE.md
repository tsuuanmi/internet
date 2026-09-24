# Software Requirements Specification — vNext PR Shared Workspace

- **Status:** proposed requirements; not implemented production contract
- **Version:** 0.3
- **Started:** 2026-09-16
- **Parent:** [`SRS-VNEXT.md`](./SRS-VNEXT.md)
- **Decision:** [`ADR/0013-pr-workspace-projection.md`](./adr/0013-pr-workspace-projection.md)

## 1. Purpose and authority

This module defines proposed requirements for using the implementation pull-request branch as a small shared collaboration surface for Website agents.

It extends, but does not override, the core vNext requirements in `SRS-VNEXT.md`.

For current production behavior, current code and the as-built contracts remain authoritative. None of the requirements below are implemented merely because this document exists.

The PR workspace is explicitly **not** the authoritative workflow state store. Authoritative Artifacts, Findings, Needs, WorkItems, InputBundles, approvals, budgets, and authority gates remain in the deterministic Orchestrator Runtime.

The Local Agent may inspect/explain this state through workflow APIs, but it is not an alternate state store or publication authority.

## 2. Functional requirements

### PW-FR-001 — Curated shared workspace

After the implementation PR exists, software-profile runtime policy may maintain a small temporary shared workspace on the PR branch for information that materially benefits multiple agents.

The workspace shall not mirror all runtime artifacts or execution state.

### PW-FR-002 — Dedicated reserved root

Temporary shared files shall live under one runtime-owned reserved root. Proposed default:

```text
.internet/workspace/
```

### PW-FR-003 — Minimal default file set

The default workspace should contain only:

```text
PLAN.md
TODO.md
RESEARCH.md
STATUS.md
```

`ROADMAP.md` may be added for unusually large or long-running tasks.

The runtime shall not require a per-artifact directory tree, graph-state dump, execution log, or artifact manifest in Git.

### PW-FR-004 — `PLAN.md` semantics

`PLAN.md` shall contain a human/model-readable projection of material shared planning context produced by Planner-owned typed views.

The authoritative PlanArtifact/version remains in Orchestrator durable state.

### PW-FR-005 — `TODO.md` semantics

`TODO.md` shall contain broadly useful outstanding work derived from structured shared items, such as implementation tasks, major unresolved review findings, material research questions, and required validation.

It shall not be the scheduler queue and shall not replace WorkItems or graph/dependency state.

### PW-FR-006 — `RESEARCH.md` semantics

`RESEARCH.md` shall contain only research/evidence conclusions explicitly produced for shared publication by authorized reasoning capabilities.

The Orchestrator shall not select semantic importance by reading raw evidence prose.

### PW-FR-007 — `STATUS.md` semantics

`STATUS.md` may expose a compact non-authoritative deterministic projection of broad collaboration progress, current implementation head, important blockers, PendingActions, and navigation guidance.

It shall not override authoritative run state.

### PW-FR-008 — Optional `ROADMAP.md`

`ROADMAP.md` shall be optional and used only when the task has enough major milestones to justify persistent cross-agent roadmap context.

Its semantic content shall originate from a Planner/shared-view artifact rather than Orchestrator or Local Agent semantic synthesis.

### PW-FR-009 — Runtime state remains authoritative

The workflow shall remain semantically correct if shared PR files are unavailable, stale, deleted, or unreadable.

A failure to publish shared context may block an agent capability that depends on that transport, but shall not redefine authoritative workflow state.

### PW-FR-010 — Deterministic publication policy

Orchestrator policy shall select publication candidates using code-owned schema/provenance/status/publication rules rather than free-form semantic curation.

If publication suitability cannot be decided without semantic judgment, the workflow shall delegate that judgment to a reasoning capability or fail closed.

### PW-FR-011 — Correctness-critical dependency remains explicit

Information visible in a PR workspace file shall not automatically become a correctness-bearing WorkItem input.

When correctness depends on a specific fact/artifact, authoritative Artifact/InputBundle provenance shall remain explicit regardless of whether a readable summary also appears on the PR branch.

### PW-FR-012 — PR text cannot mutate Orchestrator authority

Editing `PLAN.md`, `TODO.md`, `RESEARCH.md`, `STATUS.md`, or `ROADMAP.md` shall not directly change authoritative workflow state.

Any semantic state change must pass through normal typed Artifact/control validation by the Orchestrator Runtime.

### PW-FR-013 — Producer mutation authority remains unchanged

Research and Reviewer shall not gain repository mutation authority because their information can be represented in the shared workspace.

Only Worker may perform repository commits under an authorized mutation WorkItem.

### PW-FR-014 — Traceable shared meaning

When shared workspace content materially represents another capability's result or accepted decision, runtime state shall retain enough provenance to identify the source Artifact/decision from which that content was derived.

The PR file itself need not be the canonical artifact.

### PW-FR-015 — Meaningful synchronization points

Shared files should be updated at meaningful synchronization points rather than on every graph/event transition.

Appropriate deterministic triggers include:

```text
initial active PlanSharedView becomes ready
research materially changes an accepted ResearchSharedView
material plan revision
meaningful Worker implementation checkpoint
Reviewer emits a broadly relevant structured blocker
shared TODO set changes
before starting a capability whose policy requires fresher shared context
```

### PW-FR-016 — Internal runtime noise excluded

The PR workspace shall not be used for provider progress, retries, leases/heartbeats, raw graph/run state, raw tool output, or other control-plane noise.

### PW-FR-017 — Batched checkpoint commits

Runtime policy may update multiple shared files in one checkpoint commit. Correctness shall not depend on committing every internal state change.

### PW-FR-018 — Role-oriented read guidance

The runtime may instruct agents to inspect different shared files by role.

Recommended defaults:

```text
Worker   -> PLAN.md + TODO.md + RESEARCH.md
Reviewer -> PLAN.md + RESEARCH.md + implementation diff
Research -> PLAN.md + TODO.md + bounded research question
```

These files provide situational awareness; formal exact WorkItem inputs remain controlled by InputBundles.

### PW-FR-019 — Physical PR head remains literal

Every committed shared-workspace update changes the physical PR head SHA.

Runtime shall not reuse an exact-head final assessment/approval after any such commit.

### PW-FR-020 — Collaboration evaluation is provisional

Review performed while shared workspace or implementation may continue changing shall be treated as collaboration feedback rather than final merge approval.

It may create Findings, Needs, repairs, or additional research.

### PW-FR-021 — Collaboration/final-review boundary

The software profile may distinguish at least:

```text
COLLABORATION
COLLABORATION_COMPLETE
FINAL_REVIEW
```

`COLLABORATION` permits curated shared-file updates and adaptive work.

`COLLABORATION_COMPLETE` freezes collaboration publication and prepares a clean implementation head.

`FINAL_REVIEW` evaluates only the cleaned exact head.

These are software-profile lifecycle concepts, not mandatory generic kernel phases.

### PW-FR-022 — Temporary shared files removed before final review

By default, `.internet/workspace/` shall be removed before final exact-head review.

A file may remain only if explicitly promoted as a real product deliverable rather than temporary workflow memory.

### PW-FR-023 — Cleanup verification

Before entering software-profile final review, deterministic Orchestrator checks shall establish at least:

```text
reserved temporary workspace absent from final tree
intended implementation changes remain
no required deliverable was accidentally removed
```

### PW-FR-024 — Cleanup invalidates prior exact-head evidence

Workspace cleanup changes PR head and therefore invalidates prior exact-head assessment/health evidence.

Final review and health shall bind the post-cleanup head.

### PW-FR-025 — Reopen on final-review defect

If final review finds a material defect, collaboration may reopen. Any subsequent implementation or shared-workspace commits require cleanup and a new final exact-head review.

### PW-FR-026 — CI-aware checkpointing

Shared-workspace commits may trigger CI. Runtime policy should minimize unnecessary churn through coarse checkpointing.

Repository CI behavior shall be validated rather than assumed.

### PW-FR-027 — Required-check correctness unchanged

Shared-workspace optimizations shall not weaken exact-head CI/health semantics or intentionally leave required checks permanently Pending.

### PW-FR-028 — Sensitive-data prohibition

The PR workspace shall never contain credentials, tokens, cookies, browser/auth state, hidden chain-of-thought/private reasoning, retention-sensitive secrets, or data that may later require secure deletion.

Deleting a committed file shall not be treated as secure erasure from Git/PR history.

### PW-FR-029 — Optional transport

The architecture shall permit PR shared-workspace publication to be disabled while retaining the core Artifact/WorkItem/InputBundle model.

No correctness-bearing semantic artifact shall require Git publication as its only persistence mechanism.

### PW-FR-030 — Status observability

Runtime/operator status may expose whether shared context is current enough for the next capability, latest collaboration checkpoint commit, publication failures, and whether final review is operating on a clean workspace-free head.

## 3. Default workspace

```text
.internet/workspace/
  PLAN.md
  TODO.md
  RESEARCH.md
  STATUS.md
  # ROADMAP.md optional
```

## 4. Example collaboration flow

```text
Research produces detailed internal evidence artifacts
  -> Orchestrator persists authoritative evidence
  -> Research/Synthesis emits ResearchSharedView
  -> deterministic publication policy renders RESEARCH.md

Planner revises approach
  -> accepted PlanArtifact v2 / PlanSharedView
  -> PLAN.md/TODO.md publication becomes eligible

Worker begins/remediates implementation
  -> reads published PLAN/TODO/RESEARCH for situational awareness
  -> exact correctness inputs still come from its WorkItem/InputBundle

Reviewer inspects implementation
  -> detailed Findings/Needs remain authoritative runtime artifacts
  -> only structured broadly relevant blocker is eligible for shared publication
```

## 5. Finalization flow

```text
COLLABORATION
  -> shared files updated only at meaningful checkpoints
  -> provisional convergence toward a deliverable

COLLABORATION_COMPLETE
  -> stop temporary shared-file publication
  -> remove .internet/workspace/
  -> verify clean product diff

FINAL_REVIEW
  -> independent exact-head assessment/review
  -> required CI/health
  -> DeliveryArtifact / User validation / convergence according to software profile
```

## 6. Non-goals

This proposal does not make the PR:

- the workflow database;
- the scheduler queue;
- the Finding/Need/WorkItem store;
- an execution/event log;
- a mirror of every typed artifact;
- a replacement for InputBundles;
- a secret store;
- a direct control channel between agents.

The PR is a temporary shared notebook. Deterministic Orchestrator state remains authoritative; Local Agent remains the User-facing client/operator.
