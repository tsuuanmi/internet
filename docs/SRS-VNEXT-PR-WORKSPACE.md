# Software Requirements Specification — vNext PR Workspace Projection

- **Status:** proposed requirements; not implemented production contract
- **Version:** 0.1
- **Started:** 2026-09-16
- **Parent:** [`SRS-VNEXT.md`](./SRS-VNEXT.md)
- **Decision:** [`ADR/0013-pr-workspace-projection.md`](./ADR/0013-pr-workspace-projection.md)

## 1. Purpose and authority

This module defines proposed requirements for using the implementation pull-request branch as a temporary shared workspace projection for selected workflow artifacts.

It extends, but does not override, the core vNext requirements in `SRS-VNEXT.md`.

For current production behavior, current code and the as-built contracts remain authoritative. None of the requirements below are implemented merely because this document exists.

The PR workspace is explicitly **not** the authoritative workflow state store. Authoritative artifacts, WorkItems, graph state, receipts, and authority gates remain in the deterministic runtime.

## 2. Functional requirements

### PW-FR-001 — PR workspace is a projection

The runtime may project selected authoritative workflow artifacts onto the implementation PR branch after that PR exists.

A projected file shall be treated as a view/transport of an authoritative artifact unless its schema explicitly defines the repository file itself as the artifact.

### PW-FR-002 — Dedicated reserved root

Temporary collaboration files shall live under one runtime-owned reserved root. Proposed default:

```text
.internet/workspace/
```

Production code and normal user-authored repository files shall not be mixed into this namespace.

### PW-FR-003 — Runtime state remains authoritative

The workflow shall remain recoverable and semantically correct if the PR workspace is unavailable, stale, partially published, deleted, or unreadable.

Workspace publication failure may block an agent that requires that transport, but it shall not silently redefine authoritative artifact state.

### PW-FR-004 — Publication eligibility

Every artifact type shall have an explicit publication policy. The runtime shall distinguish at least:

```text
internal_only
pr_workspace_safe
deliverable
```

Only explicitly eligible artifacts may be materialized into Git.

### PW-FR-005 — Secret and sensitive-data prohibition

The workspace shall never contain credentials, tokens, cookies, auth/browser state, hidden chain-of-thought/private reasoning, or data whose retention policy is incompatible with Git/PR history.

Deletion before merge shall not be treated as secure erasure.

### PW-FR-006 — Deterministic projection

Projected bytes and paths shall be produced by versioned deterministic projection rules from authoritative artifacts.

Free-form Worker rewriting or summarization shall not be accepted as a correctness-bearing projection operation.

### PW-FR-007 — Projection receipt

Successful publication shall persist a receipt binding at least:

```text
workflowId
workspaceRevision
artifactId + artifactHash
projectionPath
projection blob/hash or equivalent content identity
resulting PR head / commit identity
projection-rule version
```

### PW-FR-008 — Publisher authority separation

Publishing a Research, Planner, or Reviewer artifact shall not grant that producer repository mutation authority.

If the Worker account is used as a Git transport adapter, the runtime shall provide exact expected projection bytes/hash and reconcile the resulting remote state.

### PW-FR-009 — Shared visibility is not InputBundle membership

An artifact being visible in the PR workspace shall not automatically make it a correctness-bearing input to another WorkItem.

Formal dependency requires explicit InputBundle inclusion.

### PW-FR-010 — Auxiliary reads are untrusted until promoted

If a website agent opportunistically reads additional workspace files outside its InputBundle, that information is auxiliary/untrusted context until converted into an explicit validated artifact and dependency.

### PW-FR-011 — Workspace manifest

The workspace shall expose a deterministic manifest that allows agents/runtime to discover the current published projection without scanning arbitrary repository history.

The manifest should identify at least:

```text
workspace schema version
workflowId
workspaceRevision
published artifact IDs/types/paths/hashes
current lifecycle phase
```

### PW-FR-012 — Human-readable status projection

The workspace may expose a compact human/model-readable `STATUS.md`, but that file shall be a derived projection and shall not override machine-readable manifest/runtime state.

### PW-FR-013 — Publication batching

Runtime policy may batch multiple artifact projections into one checkpoint commit to reduce Git and CI churn.

Correctness shall not depend on committing every internal state transition.

### PW-FR-014 — Commit classification

PR-branch commits participating in the workflow shall be classifiable at least as:

```text
implementation
workspace_only
workspace_cleanup
mixed
```

Workspace-only commits shall modify only the reserved workspace root.

### PW-FR-015 — Mixed commits are explicit policy

The runtime should prefer separable implementation and workspace commits for observability. A mixed commit shall be allowed only under an explicit policy and shall be treated as implementation-affecting for invalidation/review purposes.

### PW-FR-016 — Physical PR head semantics remain literal

Every workspace/checkpoint/cleanup commit changes the physical PR head SHA.

The runtime shall not fabricate an unchanged physical head or reuse old exact-head approvals against a new physical head.

### PW-FR-017 — Collaboration review is provisional

Reviewer work performed while temporary workspace projections may still change shall be classified as collaboration/provisional evaluation, not final merge approval.

It may create Findings, Needs, evidence requests, and repair work, but shall not satisfy the final exact-head approval gate.

### PW-FR-018 — Workspace lifecycle

The proposed collaboration lifecycle shall distinguish at least:

```text
WORKSPACE_OPEN
WORKSPACE_FINALIZING
FINAL_REVIEW
```

`WORKSPACE_OPEN` permits artifact publication and adaptive collaboration.

`WORKSPACE_FINALIZING` performs cleanup and deterministic final-tree checks.

`FINAL_REVIEW` operates only on the cleaned final PR head.

### PW-FR-019 — Reopen on final-review defect

A material finding during `FINAL_REVIEW` shall invalidate final approval and reopen the collaboration/workspace path as needed.

After remediation, workspace finalization and fresh exact-head final review shall run again.

### PW-FR-020 — Mandatory cleanup before final review

All temporary PR-workspace files shall be removed from the PR branch before final exact-head review begins.

### PW-FR-021 — Cleanup verification

Cleanup completion shall be accepted only after deterministic checks establish at least:

```text
reserved workspace root absent from final tree
no required deliverable accidentally removed
final implementation diff contains no temporary workspace files
```

### PW-FR-022 — Cleanup invalidates old head evidence

The cleanup commit changes PR head and therefore invalidates previous exact-head review/health evidence.

Final review and health must bind to the post-cleanup head.

### PW-FR-023 — Merge cleanliness

Merge eligibility shall require the reserved temporary workspace root to be absent from the final merge tree unless a separately classified deliverable intentionally uses that path.

### PW-FR-024 — Squash merge is history cleanup, not data erasure

When squash merge is used, intermediate checkpoint commits are not preserved as separate commits on `main`, and temporary files deleted before merge do not appear in the final base-branch tree delta.

The runtime/documentation shall not describe this as deletion from GitHub history or secure erasure.

### PW-FR-025 — Required-check compatibility

Repository-specific CI policy shall be validated before relying on workspace-only commits.

The runtime shall not assume that skipping a required workflow by path filtering or commit-message filtering is safe.

### PW-FR-026 — Required checks must resolve

If a required check applies to the PR, workspace-only commits shall leave that check in a merge-compatible terminal state rather than intentionally causing it to remain indefinitely Pending.

Repository implementations may accomplish this by running the workflow normally, batching checkpoint commits, or using job-level conditions that still report success where appropriate.

### PW-FR-027 — CI churn is policy, not correctness state

The runtime may optimize checkpoint cadence to reduce CI cost, but CI optimization shall not weaken exact-head review/health semantics.

### PW-FR-028 — PR body/status block is non-authoritative

The runtime may maintain one idempotently updated status block in the PR body for navigation, but PR-body text shall not become workflow correctness state.

### PW-FR-029 — Workspace publication is observable

Status/trace should expose current workspace revision, latest projection/checkpoint identity, projection failures, cleanup state, and whether final review is operating on a clean workspace-free head.

### PW-FR-030 — Workspace projection is optional transport

The architecture shall permit a future workflow or repository policy to disable PR workspace publication while retaining the core artifact/WorkItem model.

No core semantic artifact type shall require Git publication as its only persistence mechanism.

## 3. Proposed workspace layout

A default projection may use:

```text
.internet/workspace/
  manifest.json
  STATUS.md
  artifacts/
    plans/
    findings/
    research/
    reviews/
    decisions/
```

`manifest.json` is the machine-readable navigation surface. `STATUS.md` is derived convenience output.

The runtime may use content-addressed filenames or stable logical filenames plus hashes in the manifest; the choice must preserve unambiguous artifact identity.

## 4. Proposed collaboration flow

```text
PR created
  -> WORKSPACE_OPEN
       -> publish selected artifacts/checkpoints
       -> Planner / Research / Worker / Reviewer inspect shared projection
       -> Findings / Needs / WorkItems continue through authoritative runtime
       -> provisional convergence
  -> WORKSPACE_FINALIZING
       -> delete temporary workspace root
       -> verify final implementation tree/diff
  -> FINAL_REVIEW
       -> independent exact-head review
       -> required CI/health
       -> ready for existing user handoff/merge authority boundary
```

If final review finds a material defect:

```text
FINAL_REVIEW
  -> reopen WORKSPACE_OPEN as needed
  -> remediate / publish collaboration state
  -> finalize + cleanup
  -> new FINAL_REVIEW on new exact head
```

## 5. Acceptance scenarios

### Scenario A — Reviewer asks for new research

1. Reviewer publishes/commits no repository mutation directly.
2. Reviewer emits Finding + Need into authoritative runtime.
3. Runtime creates Research WorkItem.
4. Research result becomes authoritative EvidenceArtifact.
5. Eligible evidence is projected into `.internet/workspace/...` and checkpointed.
6. Reviewer can inspect it in the PR and receives it through its formal InputBundle when re-run.
7. Reviewer resolves or extends the Finding.

### Scenario B — Workspace publication fails

1. Authoritative EvidenceArtifact commits successfully to runtime storage.
2. Git projection fails.
3. Artifact remains authoritative and durable.
4. Projection state records failure.
5. Runtime retries/blocks according to transport policy without pretending the artifact was lost.

### Scenario C — Final cleanup

1. Workflow reaches provisional convergence.
2. Runtime removes `.internet/workspace/`.
3. Cleanup creates a new physical PR head.
4. Old review approvals are stale.
5. Runtime verifies clean tree/diff.
6. Final Review A/B inspect the cleaned exact head.
7. Required health checks run/resolve for that exact final state.

### Scenario D — Sensitive artifact

1. Internal artifact is classified `internal_only`.
2. Projection request is rejected deterministically.
3. Artifact remains available only in runtime-controlled storage/InputBundles allowed by policy.
4. No Git commit ever contains it.

## 6. Non-goals

This proposal does not make Git:

- the workflow database;
- an event store that must be replayed for correctness;
- a secret store;
- a replacement for InputBundles;
- a direct agent-to-agent control channel;
- a place where model-authored files can grant authority;
- secure ephemeral storage.

The PR is a collaboration surface and durable projection of selected safe state, while the runtime remains the control and correctness authority.
