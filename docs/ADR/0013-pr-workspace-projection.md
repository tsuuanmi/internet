# ADR-0013 — Use the Pull Request Branch as a Shared Agent Workspace Projection

- **Status:** Proposed
- **Date:** 2026-09-16
- **Related:** ADR-0002, ADR-0004, ADR-0009, ADR-0010, ADR-0011, ADR-0012

## Context

Website agents do not share one reliable conversation memory. A Research agent may discover evidence that a Reviewer or Worker cannot see unless the Orchestrator explicitly re-delivers it. The vNext artifact model solves correctness by persisting durable structured artifacts, but website agents still benefit from a common external place they can inspect directly.

The implementation pull request already provides a repository/branch that all GitHub-capable agents can inspect. Git also gives immutable commits, file-level diffs, ordering, authorship metadata, and a natural audit trail.

The question is whether the PR branch can also act as a temporary shared collaboration workspace for selected workflow artifacts without weakening the runtime's authoritative state model or polluting the final repository.

## Decision

After the implementation PR exists, the workflow may materialize selected workflow artifacts into a dedicated temporary directory on the PR head branch.

The PR branch is a **shared workspace projection**, not the workflow source of truth.

```text
Authoritative artifact/state store
          |
          | deterministic projection
          v
PR workspace files + checkpoint commits
          |
          | read by Website agents
          v
Research / Planner / Worker / Reviewer
```

The runtime artifact store and authoritative graph/job state remain correctness authority. Deleting, rewriting, failing to publish, or failing to read the PR workspace must not destroy authoritative workflow state.

## Workspace location

The proposed default path is:

```text
.internet/workspace/
```

A representative layout is:

```text
.internet/workspace/
  README.md
  manifest.json
  STATUS.md
  artifacts/
    plans/
    findings/
    research/
    reviews/
    decisions/
```

The exact physical layout is an implementation detail, but one reserved root and deterministic paths are required.

## Projection model

Only artifacts explicitly eligible for PR-workspace publication are materialized.

A projection record should bind:

```text
workflowId
workspaceRevision
artifactId
artifactHash
projectionPath
projectionBlobHash / commit SHA
publicationClass
createdAt
```

The projection must be deterministic from the authoritative artifact payload plus versioned projection rules.

A published file is not a new reasoning artifact. It is a transport/view of an existing authoritative artifact unless the schema explicitly defines the file itself as a user-authored artifact.

## Publication classes

Artifacts shall not be published merely because they exist.

At minimum the runtime should distinguish:

```text
internal_only
pr_workspace_safe
deliverable
```

Only `pr_workspace_safe` and explicitly allowed `deliverable` content may be written to the PR branch.

The workspace must never contain:

- credentials, tokens, cookies, auth state, or secrets;
- private execution internals not intended for repository collaborators;
- sensitive user data that should not persist in Git history;
- raw browser/provider state;
- hidden chain-of-thought or private reasoning;
- content whose retention policy forbids Git persistence.

Deletion before merge is **not secure erasure**. Historical commits and PR metadata may retain prior content.

## Shared-state visibility

The PR workspace improves discoverability for agents, but does not replace sparse InputBundle projection.

An agent may be instructed to inspect the workspace manifest or selected files. The runtime still determines the correctness-bearing InputBundle consumed by a WorkItem.

Therefore:

```text
visible in PR workspace != consumed correctness input
```

If an agent reads additional workspace files opportunistically, those observations are untrusted auxiliary context unless promoted into an explicit artifact/InputBundle dependency.

## Publishing authority

Artifact publication is transport, not semantic generation.

Preferred order:

1. WorkflowEngine validates/commits the authoritative artifact.
2. A deterministic workspace-projection operation renders exact bytes.
3. A mutation-capable transport writes those bytes to the PR branch.
4. The runtime verifies the resulting path/blob/commit and stores a projection receipt.

If the current runtime cannot write GitHub directly and must use the mutation-capable Worker account as the transport adapter, Worker must not summarize or rewrite the artifact. The returned remote content/hash must be reconciled against the expected projection.

Research and Reviewer roles do not gain repository mutation authority merely because their artifacts are projected into the PR.

## Checkpoint commits

The runtime may batch one or more projection updates into deterministic workspace checkpoint commits rather than committing every small state transition.

Representative commit message:

```text
workflow: checkpoint shared agent workspace

Workflow-Job: <jobId>
Workspace-Revision: <N>
Workspace-Only: true
```

Checkpoint granularity is policy. It should balance agent visibility against Git/CI churn.

## Code commits versus workspace-only commits

The runtime should classify branch commits at least as:

```text
implementation
workspace_only
workspace_cleanup
mixed
```

A workspace-only commit changes only the reserved workspace root.

A mixed commit is allowed only when policy deliberately wants one coherent code+state checkpoint; otherwise implementation and workspace projection should remain separable for observability.

## CI boundary

Workspace checkpoint commits advance the physical PR head and can trigger GitHub Actions/status checks.

The runtime must not assume `paths-ignore` or commit-level skip directives are always safe for required checks: GitHub documents that skipped required workflows may remain Pending and block merge.

Production repositories should use one of these explicit policies:

- allow normal CI on workspace commits;
- keep the same required check visible but make workspace-only execution fast and successful through job-level logic;
- batch workspace publications to reduce CI churn;
- use repository-specific non-required auxiliary checks for workspace-only updates.

CI policy is repository configuration and must be validated rather than guessed.

## Collaboration phase versus final approval

Workspace commits continuously move the PR head, so intermediate Reviewer work during active collaboration is not merge authorization.

The target lifecycle is:

```text
WORKSPACE_OPEN
  -> adaptive Research / Planner / Worker / Reviewer collaboration
  -> provisional convergence
  -> WORKSPACE_FINALIZING
  -> remove all temporary workspace files
  -> verify clean implementation tree
  -> FINAL_REVIEW
  -> exact-head review + required CI/health
  -> READY_FOR_USER_HANDOFF / merge authority boundary
```

If final review finds a material problem:

```text
FINAL_REVIEW
  -> reopen WORKSPACE_OPEN
  -> further work / artifact projection
  -> finalize + cleanup again
  -> fresh exact-head final review
```

No approval from a pre-cleanup head may authorize the final clean head.

## Cleanup semantics

Before final exact-head review, the runtime creates a workspace-cleanup change that removes all temporary workspace files from the PR branch.

The cleanup is accepted only when deterministic verification establishes that:

```text
reserved workspace root absent from final tree
AND no required deliverable was accidentally deleted
AND implementation diff remains the intended product change
```

The cleanup commit itself advances PR head and therefore invalidates prior exact-head approval/health evidence.

Final review/health must run after cleanup.

## Squash merge consequence

When the repository uses squash merge, intermediate workspace/checkpoint commits are not preserved as separate commits on the base branch. If workspace files are deleted before merge, the final squashed tree delta does not include them.

This provides a clean `main` history and tree, but it does not mean temporary content was erased from GitHub/PR history.

## Optional PR body projection

The runtime may also maintain one idempotently updated status block in the PR body containing compact non-authoritative information such as:

```text
workflow job
workspace revision
current phase
open blocking finding count
latest checkpoint commit
```

This is an operator/agent navigation aid only. The PR body is not correctness state.

## Consequences

### Positive

- Website agents gain a common durable place to inspect current shared context;
- artifacts become visible without requiring every conversation to receive every prior message;
- Git provides history, diffs, ordering, and a natural audit trail;
- the same implementation PR becomes both code-review surface and temporary collaboration room;
- squash merge plus pre-review cleanup keeps the base branch clean.

### Costs / risks

- artifact-only commits can trigger CI and invalidate literal PR-head evidence;
- the PR diff is noisier during collaboration;
- Git publication has retention/security consequences;
- a projection publisher and cleanup verifier are additional runtime responsibilities;
- agents may opportunistically read workspace content that was not part of their formal InputBundle.

## Invariants

> The PR workspace is a projection of authoritative workflow artifacts, never the only source of truth.

> Publishing an artifact to the PR does not grant its producer repository mutation authority.

> Temporary workspace content must be removed before final exact-head review and merge eligibility.

> Cleanup does not erase Git history; secret or retention-sensitive data must never enter the PR workspace.

> Final review and CI/health bind to the cleaned final PR head, not to an earlier collaboration head.
