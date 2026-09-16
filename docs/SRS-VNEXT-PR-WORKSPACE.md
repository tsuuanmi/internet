# Software Requirements Specification — vNext PR Shared Workspace

- **Status:** proposed requirements; not implemented production contract
- **Version:** 0.2
- **Started:** 2026-09-16
- **Parent:** [`SRS-VNEXT.md`](./SRS-VNEXT.md)
- **Decision:** [`ADR/0013-pr-workspace-projection.md`](./ADR/0013-pr-workspace-projection.md)

## 1. Purpose and authority

This module defines proposed requirements for using the implementation pull-request branch as a small shared collaboration surface for Website agents.

It extends, but does not override, the core vNext requirements in `SRS-VNEXT.md`.

For current production behavior, current code and the as-built contracts remain authoritative. None of the requirements below are implemented merely because this document exists.

The PR workspace is explicitly **not** the authoritative workflow state store. Authoritative artifacts, Findings, Needs, WorkItems, graph state, InputBundles, approvals, budgets, and authority gates remain in the Local deterministic runtime.

## 2. Functional requirements

### PW-FR-001 — Curated shared workspace

After the implementation PR exists, runtime policy may maintain a small temporary shared workspace on the PR branch for information that materially benefits multiple agents.

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

`PLAN.md` shall contain a human/model-readable projection of material shared planning context, such as objective, constraints, acceptance criteria, implementation approach, important assumptions, and major plan revisions.

The authoritative PlanArtifact/version remains in Local state.

### PW-FR-005 — `TODO.md` semantics

`TODO.md` shall contain broadly useful outstanding work, such as implementation tasks, major unresolved review findings, material research questions, and required validation.

It shall not be the scheduler queue and shall not replace WorkItems or graph dependencies.

### PW-FR-006 — `RESEARCH.md` semantics

`RESEARCH.md` shall contain only research/evidence conclusions expected to materially help multiple downstream roles.

It may include important repository facts, external evidence, discovered constraints, relevant contradictions/uncertainty, and source references.

The runtime shall not publish every EvidenceArtifact merely because it exists.

### PW-FR-007 — `STATUS.md` semantics

`STATUS.md` may expose a compact non-authoritative view of broad collaboration progress, latest meaningful checkpoint, implementation head, important blockers, and navigation guidance.

It shall not override Local state.

### PW-FR-008 — Optional `ROADMAP.md`

`ROADMAP.md` shall be optional and used only when the task has enough major milestones to justify persistent cross-agent roadmap context.

### PW-FR-009 — Runtime state remains authoritative

The workflow shall remain semantically correct if shared PR files are unavailable, stale, deleted, or unreadable.

A failure to publish shared context may block a Website agent that depends on that transport, but shall not redefine authoritative workflow state.

### PW-FR-010 — Curated publication policy

Runtime/Orchestrator policy shall select information for PR publication based on cross-agent usefulness rather than one-to-one artifact mirroring.

A typical publication rule is:

```text
publish when another role is reasonably expected to need the information
keep internal otherwise
```

### PW-FR-011 — Correctness-critical dependency remains Local

Information visible in a PR workspace file shall not automatically become a correctness-bearing WorkItem input.

When correctness depends on a specific fact/artifact, Local state shall retain explicit artifact/InputBundle provenance regardless of whether a readable summary also appears on the PR branch.

### PW-FR-012 — PR text cannot mutate Local authority

Editing `PLAN.md`, `TODO.md`, `RESEARCH.md`, `STATUS.md`, or `ROADMAP.md` shall not directly change authoritative workflow state.

Any semantic state change must pass through normal typed-artifact/control validation by the Local Orchestrator/WorkflowEngine.

### PW-FR-013 — Producer mutation authority remains unchanged

Research and Reviewer shall not gain repository mutation authority because their information can be represented in the shared workspace.

A mutation-capable transport may publish accepted shared context on their behalf.

### PW-FR-014 — Traceable shared meaning

When shared workspace content materially represents another agent's result or an accepted decision, the Local runtime should retain enough provenance to identify the source artifact/decision from which that content was curated.

The PR file itself need not be the canonical artifact.

### PW-FR-015 — Meaningful synchronization points

Shared files should be updated at meaningful synchronization points rather than on every graph/event transition.

Appropriate triggers include:

```text
initial plan becomes ready
research materially changes shared understanding
material plan revision
meaningful Worker implementation checkpoint
Reviewer discovers a broadly relevant blocker
major TODO set changes
before starting a role that needs fresher shared context
```

### PW-FR-016 — Internal runtime noise is excluded

The PR workspace shall not be used for provider progress, retries, leases/heartbeats, raw graph-node state, raw tool output, or other control-plane noise.

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

These files provide situational awareness; formal exact WorkItem inputs remain controlled by Local state.

### PW-FR-019 — Physical PR head remains literal

Every committed shared-workspace update changes the physical PR head SHA.

Runtime shall not reuse an exact-head final approval after any such commit.

### PW-FR-020 — Collaboration evaluation is provisional

Review performed while shared workspace or implementation may continue changing shall be treated as collaboration feedback rather than final merge approval.

It may create Findings, Needs, repairs, or additional research.

### PW-FR-021 — Collaboration/final-review boundary

The target lifecycle shall distinguish at least:

```text
COLLABORATION
COLLABORATION_COMPLETE
FINAL_REVIEW
```

`COLLABORATION` permits curated shared-file updates and adaptive work.

`COLLABORATION_COMPLETE` freezes collaboration content and prepares a clean implementation head.

`FINAL_REVIEW` evaluates only the cleaned exact head.

### PW-FR-022 — Temporary shared files removed before final review

By default, `.internet/workspace/` shall be removed before final exact-head review.

A file may remain only if explicitly promoted as a real product deliverable rather than temporary workflow memory.

### PW-FR-023 — Cleanup verification

Before entering `FINAL_REVIEW`, deterministic checks shall establish at least:

```text
reserved temporary workspace absent from final tree
intended implementation changes remain
no required deliverable was accidentally removed
```

### PW-FR-024 — Cleanup invalidates prior exact-head evidence

Workspace cleanup changes PR head and therefore invalidates prior exact-head review/health evidence.

Final review and health shall bind to the post-cleanup head.

### PW-FR-025 — Reopen on final-review defect

If final review finds a material defect, collaboration may reopen. Any subsequent implementation or shared-workspace commits require cleanup and a new final exact-head review.

### PW-FR-026 — CI-aware checkpointing

Shared-workspace commits may trigger CI. Runtime policy should minimize unnecessary churn through coarse checkpointing.

Repository CI behavior shall be validated rather than assumed.

### PW-FR-027 — Required-check correctness remains unchanged

Shared-workspace optimizations shall not weaken current exact-head CI/health semantics or intentionally leave required checks permanently Pending.

### PW-FR-028 — Sensitive-data prohibition

The PR workspace shall never contain credentials, tokens, cookies, browser/auth state, hidden chain-of-thought/private reasoning, retention-sensitive secrets, or data that may later require secure deletion.

Deleting a committed file shall not be treated as secure erasure from Git/PR history.

### PW-FR-029 — Optional transport

The architecture shall permit PR shared-workspace publication to be disabled in the future while retaining the core Local artifact/WorkItem/InputBundle model.

No correctness-bearing semantic artifact shall require Git publication as its only persistence mechanism.

### PW-FR-030 — Status observability

Runtime/operator status may expose whether shared context is current enough for the next role, the latest collaboration checkpoint commit, publication failures, and whether final review is operating on a clean workspace-free head.

## 3. Default workspace

```text
.internet/workspace/
  PLAN.md
  TODO.md
  RESEARCH.md
  STATUS.md
  # ROADMAP.md optional
```

The files should remain concise enough that a Website agent can read the relevant set at the beginning of a task without reconstructing the entire workflow history.

## 4. Example collaboration flow

```text
Research produces detailed internal evidence artifacts
  -> Local persists authoritative evidence
  -> Local curates broadly useful conclusions into RESEARCH.md

Planner revises approach
  -> Local accepts PlanArtifact v2
  -> PLAN.md updated with material plan changes
  -> TODO.md updated with new shared work

Worker begins/remediates implementation
  -> reads PLAN.md / TODO.md / RESEARCH.md
  -> implementation checkpoint may update STATUS.md/TODO.md

Reviewer inspects implementation
  -> reads PLAN.md / RESEARCH.md
  -> detailed Findings/Needs stay in Local state
  -> only broadly relevant blocker is reflected in TODO.md/STATUS.md
```

The PR provides shared situational awareness. Local still decides what is authoritative and what executes next.

## 5. Finalization flow

```text
COLLABORATION
  -> shared files updated only at meaningful checkpoints
  -> provisional convergence

COLLABORATION_COMPLETE
  -> stop temporary shared-file publication
  -> remove .internet/workspace/
  -> verify clean product diff

FINAL_REVIEW
  -> independent exact-head review
  -> required CI/health
  -> existing user handoff/merge authority boundary
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

The PR is simply a **curated shared notebook for agents**. Deterministic workflow state remains Local.
