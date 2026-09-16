# ADR-0013 — Use the Pull Request as a Curated Shared Agent Workspace

- **Status:** Proposed
- **Date:** 2026-09-16
- **Related:** ADR-0002, ADR-0004, ADR-0009..0012, ADR-0014, ADR-0015

## Context

Website agents do not share one reliable conversation memory. Planner, Research, Worker, and Reviewer therefore benefit from a small common repository-native surface containing task-local context that is useful across roles.

The authoritative workflow state already belongs to Local/Orchestrator. Mirroring Findings, Needs, WorkItems, graph state, retries, receipts, and every artifact into Git would create a second state system and excessive PR/CI churn.

Worker is the only workflow actor allowed to create repository commits. Local/Orchestrator is deterministic and non-reasoning under ADR-0015.

## Decision

After an implementation PR exists, the workflow may maintain a small reserved directory on the PR branch as **temporary shared collaboration memory**:

```text
.internet/workspace/
  PLAN.md
  TODO.md
  RESEARCH.md
  STATUS.md
  # ROADMAP.md only when needed
```

The workspace is a readable projection of typed semantic views plus deterministic runtime status. It is not the artifact store, scheduler queue, event log, or workflow database.

```text
Planner / Research / Reviewer
        |
        | typed semantic artifacts + shared views
        v
Local / Orchestrator
        |
        | schema + provenance + publication-policy checks only
        | deterministic render / desired workspace state
        v
Worker
        |
        | sole authorized Git writer
        v
PR shared workspace
```

## Three memory layers

The architecture distinguishes:

```text
1. Durable repository knowledge
   AGENTS.md / architecture docs / ADRs
   lifetime: many workflows

2. PR collaboration memory
   PLAN.md / TODO.md / RESEARCH.md / STATUS.md
   lifetime: one workflow / PR

3. Authoritative Local state
   Findings / Needs / WorkItems / graph / InputBundles / receipts / gates
   lifetime: workflow execution and recovery
```

No layer silently substitutes for another.

## Semantic source of each file

### `PLAN.md`

Derived from the active Planner-produced `PlanSharedView` (and, if schema permits, linked Objective/AcceptanceCriteria views).

Local may validate, select the active version by explicit version/supersession rules, and render a template. Local shall not rewrite or summarize the plan semantically.

### `RESEARCH.md`

Derived from `ResearchSharedView` / explicit Research Synthesis artifacts.

Research decides the research meaning. If multiple evidence artifacts require semantic synthesis, Local schedules a Research/Synthesis WorkItem; Local does not choose the important insights by reading prose.

### `TODO.md`

Derived from structured shared TODO/blocker items produced by authorized semantic roles plus explicitly defined deterministic runtime items.

Local may filter by status, stable identity, publication class, and deterministic policy. Local does not invent TODO meaning from prose.

### `STATUS.md`

A deterministic projection of Local runtime state, such as broad workflow phase, current PR head, running/blocked WorkItems, and counts of structured blocking items.

This is the file Local can generate directly because no semantic synthesis is required.

### `ROADMAP.md`

Optional. Derived from a Planner-produced `RoadmapSharedView` for unusually large workflows.

## Publication candidates

Semantic agents may explicitly attach a typed shared-context view/candidate to their outputs.

Example:

```yaml
type: ResearchSharedView
artifactId: RSV-7
sourceRefs: [E44, E45]
audience: [worker, reviewer]
publicationClass: pr_workspace_safe
content: |
  Package X guarantees behavior Y only in v4.x; this repository uses v3.x.
```

The producer owns the semantic content. The view is still only a candidate until deterministic publication rules accept it.

Local publication policy may check only code-defined properties such as:

```text
schema/version valid
producer role authorized for view type/channel
source refs exist and are active
not superseded
publication class allowed
audience intersects configured workspace consumers
size/count limits satisfied
retention/sensitivity classification allowed
synchronization trigger reached
```

If policy cannot decide without interpreting prose, the decision must be delegated to a reasoning WorkItem or fail closed.

## Publishing flow

```text
1. Reasoning role emits semantic artifact/shared view.
2. Local validates schema, provenance, authority, and active-version relationships.
3. Deterministic publication policy includes/excludes eligible shared views.
4. Local renders DesiredWorkspaceState mechanically.
5. Local creates a workspace GitMutationWorkItem.
6. Worker writes/commits the exact authorized workspace state.
7. Worker returns mutation receipt.
8. Local observes Git and reconciles desired versus actual state.
```

Local owns deterministic publication policy and reconciliation. It does not own semantic curation.

Worker owns Git mutation execution. It does not own shared-view meaning.

## Single-writer serialization

All repository mutations, including implementation and workspace updates, go through Worker.

Repository mutations sharing a branch/head are serialized under expected-head policy. When several read-only agents complete near the same time, Local may batch already-accepted shared views into one deterministic workspace revision and one Worker checkpoint commit.

```text
ResearchSharedView A
ResearchSharedView B
PlanSharedView P5
        |
        | deterministic eligibility + rendering
        v
DesiredWorkspaceState R8
        |
        v
one Worker checkpoint commit
```

## Context use

The workspace gives agents situational awareness but does not replace exact InputBundles.

Typical reads:

```text
Worker:   PLAN.md + TODO.md + RESEARCH.md
Reviewer: PLAN.md + RESEARCH.md + current product diff
Research: PLAN.md + TODO.md + bounded research question
```

Visibility in the workspace does not automatically create a correctness dependency. Correctness-bearing dependencies remain explicit in Local artifacts/InputBundles.

## Update cadence

Workspace revisions should happen at meaningful synchronization points, not every runtime transition.

Deterministic triggers may include:

```text
new active PlanSharedView
new accepted ResearchSynthesis/ResearchSharedView eligible for publication
structured blocking/shared TODO set changed
implementation checkpoint policy reached
before scheduling a role whose policy requires a newer shared-workspace revision
```

Do not publish provider progress, retries, leases, raw tool output, graph-node chatter, or every internal Finding.

## Git/head and final-review semantics

Every workspace commit advances the physical PR head. Collaboration-time review is therefore provisional.

Target lifecycle:

```text
PR created
  -> COLLABORATION
       shared-view checkpoint commits as needed
       implementation/research/review loops
  -> COLLABORATION_COMPLETE
  -> Local creates WORKSPACE_CLEANUP mutation WorkItem
  -> Worker removes .internet/workspace/
  -> Local verifies clean product diff
  -> FINAL_REVIEW
  -> exact-head review + CI/health
  -> existing user/merge authority boundary
```

A material final-review defect reopens collaboration, followed by cleanup and another fresh exact-head final review.

## Cleanup

Temporary workspace files are removed before final exact-head review unless explicitly promoted as product deliverables through a separate authorized change.

Cleanup is performed only by Worker under an exact-scoped mutation WorkItem. Local verifies:

```text
workspace root absent
no unrelated mutation
intended product changes remain
```

Cleanup changes HEAD, so pre-cleanup exact-head approvals are stale.

## Security and retention

Temporary does not mean erasable. Git history can retain deleted content.

The workspace must never contain:

```text
credentials/tokens/cookies
auth/browser state
hidden chain-of-thought/private reasoning
retention-sensitive secrets
sensitive data requiring secure deletion
```

External/research-derived workspace text is untrusted data and cannot override repository instructions, the active WorkItem, or Local policy.

## Consequences

### Positive

- agents share important task-local context without shared conversation memory;
- Local remains a deterministic controller rather than a semantic curator;
- semantic authorship stays with Planner/Research/Reviewer;
- Worker remains the single Git writer;
- PR remains understandable because only shared views are projected, not the whole artifact store;
- shared memory can later be disabled/replaced without changing workflow correctness.

### Costs / risks

- reasoning roles need explicit shared-view schemas;
- semantic synthesis may require a dedicated extra WorkItem;
- workspace commits move HEAD and may trigger CI;
- stale shared views require correct supersession/publication rules;
- temporary Git content remains in history.

## Invariants

> Local deterministic state is authoritative; PR files are temporary collaboration memory only.

> Local never determines semantic importance by reading/summarizing workspace-source prose; agents produce explicit shared views and Local applies deterministic publication policy.

> Worker is the only workflow actor authorized to create repository commits.

> Worker commit authority does not grant semantic authority over shared-view content.

> Planner, Research, and Reviewer never write workspace commits directly.

> Correctness-critical inputs remain explicit Local/InputBundle dependencies even when the same information is visible in PR files.

> Temporary workspace files are removed before final exact-head review unless explicitly promoted to product deliverables.

> Secrets, hidden reasoning, and retention-sensitive information never enter the workspace.
