# Software Requirements Specification — vNext Git Mutation Protocol

- **Status:** proposed requirements; not implemented production contract
- **Version:** 0.2
- **Started:** 2026-09-16
- **Parent:** [`SRS-VNEXT.md`](./SRS-VNEXT.md)
- **Decision:** [`ADR/0014-reconciled-git-mutation-protocol.md`](./adr/0014-reconciled-git-mutation-protocol.md)

## 1. Purpose and authority

This module defines the proposed contract between the deterministic **Orchestrator Runtime** and the single repository-writing Worker.

It does not change the current production authority model. Until implementation, current code and as-built documents remain authoritative.

The target design separates:

```text
Orchestrator Runtime
  = desired repository effect + policy + reconciliation

Worker
  = execution of authorized Git mutation

Git/GitHub
  = observed repository state

Local Agent
  = User-facing reasoning client/operator using the workflow API
```

Worker is the only workflow actor allowed to create repository commits, but that mutation authority does not grant Worker semantic workflow authority.

## 2. Mutation modes

### GM-FR-001 — Explicit mutation mode

Every repository mutation WorkItem shall declare one mutation mode.

Initial modes:

```text
WORKSPACE_EXACT
IMPLEMENTATION_AGENTIC
WORKSPACE_CLEANUP
```

### GM-FR-002 — Exact workspace mode

`WORKSPACE_EXACT` shall treat Orchestrator-provided desired workspace bytes/content identities as desired state. Worker shall not reinterpret or semantically rewrite exact content unless the WorkItem explicitly requests a non-exact migration behavior.

### GM-FR-003 — Agentic implementation mode

`IMPLEMENTATION_AGENTIC` may grant Worker implementation freedom inside explicitly declared objective, path, authority, and validation constraints.

Semantic correctness shall be established by validation/review/assessment rather than exact output hashing.

### GM-FR-004 — Exact cleanup mode

`WORKSPACE_CLEANUP` shall authorize removal of the temporary workspace scope without unrelated semantic repository changes.

## 3. Preconditions and scope

### GM-FR-005 — Exact expected head

Every repository mutation WorkItem shall bind one `expectedHeadSha`.

Worker shall verify the current remote workflow branch head before mutation.

### GM-FR-006 — Fail closed on stale head

If current branch head differs from `expectedHeadSha`, Worker shall not silently pull, merge, rebase, force-push, or reinterpret the WorkItem against the new head.

It shall return structured `STALE_HEAD` or equivalent failure.

### GM-FR-007 — Allowed path set

Every mutation WorkItem shall declare an authorized path scope sufficient for deterministic post-write verification.

### GM-FR-008 — Out-of-scope mutation failure

A commit modifying paths outside the authorized scope shall fail reconciliation even if tests pass or the result appears useful.

### GM-FR-009 — Fast-forward only

Normal workflow mutation shall be fast-forward only. Force-push shall not be part of routine mutation/recovery policy.

### GM-FR-010 — Parent binding

The resulting commit for a successful mutation shall descend directly from the authorized expected head unless an explicitly different runtime-owned transaction model is introduced later.

## 4. Desired workspace state

### GM-FR-011 — Desired workspace snapshot

For `WORKSPACE_EXACT`, Orchestrator shall represent the desired collaboration workspace as one deterministic snapshot/revision rather than an unordered set of prose edit requests.

### GM-FR-012 — Desired file identity

Each desired workspace file shall have deterministic content identity, such as an exact byte hash.

### GM-FR-013 — Complete revision publication

One logical workspace revision should normally be published as one coherent checkpoint commit.

### GM-FR-014 — No per-event Git mirroring

Correctness shall not require publishing every Artifact, event, or run transition into Git.

## 5. Semantic publication provenance

### GM-FR-015 — Publishable collaboration summary

Semantic reasoning artifacts may include an explicitly publishable summary/candidate intended for cross-agent collaboration context.

### GM-FR-016 — Candidate is not authority

A source capability's publishable summary is a publication candidate, not authority to mutate the repository.

The Orchestrator shall accept/reject publication according to deterministic policy.

### GM-FR-017 — Preserve semantic source

When an accepted source summary is sufficient, publication should preserve its meaning rather than asking Worker to independently resynthesize the underlying evidence.

### GM-FR-018 — Runtime-rendered derived files

`STATUS.md` and other state projections whose meaning comes from deterministic workflow state should be rendered from Orchestrator state rather than freely authored by Worker.

## 6. Single-writer execution

### GM-FR-019 — Worker-only commit authority

Worker shall remain the only workflow actor authorized to create repository commits.

Planner, Research, Reviewer, and Local Agent shall not directly publish workspace or implementation commits.

### GM-FR-020 — Mutation serialization

Repository mutation WorkItems targeting the same workflow branch shall be serialized sufficiently to preserve expected-head semantics.

### GM-FR-021 — Batch compatible workspace updates

When multiple accepted shared-context changes are simultaneously ready, Orchestrator policy should be able to batch them into one `WORKSPACE_EXACT` checkpoint.

### GM-FR-022 — Worker does not own publication policy

Worker shall not decide independently that an unrequested Artifact should be published or that an authorized publication should be omitted based on semantic preference.

## 7. Mutation receipt

### GM-FR-023 — Structured mutation receipt

Every attempted repository mutation shall return a structured receipt.

### GM-FR-024 — Receipt identity

The receipt shall identify at least:

```text
workflowRunId
workItemId
mutationMode
preHeadSha
commitSha/postHeadSha when created
parentSha
changed paths
push/update result
```

### GM-FR-025 — Workspace receipt details

For exact workspace publication, the receipt shall include enough information for Orchestrator to verify resulting file identities and workspace revision.

### GM-FR-026 — Receipt is evidence, not authority

Worker self-report shall not by itself mark repository mutation as converged.

Orchestrator reconciliation against observed remote state is required.

## 8. Reconciliation

### GM-FR-027 — Observe actual state after mutation

After Worker reports mutation completion, Orchestrator shall independently observe repository/PR state before accepting convergence.

### GM-FR-028 — Exact workspace postconditions

For `WORKSPACE_EXACT`, Orchestrator shall verify at minimum:

```text
remote head identity
expected parent/head relationship
allowed changed paths
expected workspace file contents/hashes
required absent paths
absence of unrelated tree changes
```

### GM-FR-029 — Cleanup postconditions

For `WORKSPACE_CLEANUP`, Orchestrator shall verify at minimum:

```text
workspace root absent
no unrelated changed paths
desired product changes still present
```

### GM-FR-030 — Agentic implementation postconditions

For `IMPLEMENTATION_AGENTIC`, Orchestrator shall verify structural/authority constraints and then rely on normal tests, evidence, Reviewer/CriterionAssessment policy for semantic correctness.

### GM-FR-031 — Desired-state convergence

If observed Git state already satisfies the authorized desired state, Orchestrator may declare the mutation converged without creating a duplicate commit.

## 9. Retry and idempotency

### GM-FR-032 — Retry observes first

Before retrying an uncertain mutation, Orchestrator shall observe current remote state.

### GM-FR-033 — No blind duplicate commit

If a previous attempt actually succeeded despite a lost/ambiguous response, retry shall detect convergence rather than creating an equivalent duplicate commit.

### GM-FR-034 — Changed head requires reconciliation

If branch head changed after the original WorkItem was created, Orchestrator shall reconcile and create/rebind work according to policy instead of telling Worker to apply the stale WorkItem opportunistically.

### GM-FR-035 — Deterministic idempotency identity

Mutation policy should derive an idempotency/equivalence identity from correctness-bearing inputs such as WorkflowRun, mutation mode, expected head, desired state/InputBundle identity, and policy/render version.

## 10. Failure taxonomy

### GM-FR-036 — Structured mutation failures

The protocol shall distinguish at least:

```text
STALE_HEAD
UNAUTHORIZED_PATH_CHANGE
CONTENT_MISMATCH
PUSH_REJECTED
REMOTE_STATE_MISMATCH
VALIDATION_FAILED
TRANSPORT_FAILURE
AUTH_FAILURE
POLICY_REJECTED
```

### GM-FR-037 — Deterministic recovery selection

Runtime recovery policy shall key from structured failure classification plus authoritative state, not from Worker prose alone.

## 11. Untrusted shared context

### GM-FR-038 — Workspace content is data

Text published in the collaboration workspace shall be treated as untrusted collaboration data, not as runtime control instructions.

### GM-FR-039 — External raw content minimization

Shared workspace publication should prefer concise accepted conclusions with provenance over copying raw external webpages/tool output into agent-readable files.

### GM-FR-040 — WorkItem authority dominates workspace prose

No text in `PLAN.md`, `TODO.md`, `RESEARCH.md`, `STATUS.md`, or `ROADMAP.md` may expand mutation scope, change authorization, override repository instructions, or replace the active WorkItem contract.

## 12. Stable instructions versus task-local memory

### GM-FR-041 — Separate repository instructions

Long-lived repository instructions such as `AGENTS.md` remain separate from temporary workflow collaboration files.

### GM-FR-042 — No automatic promotion

Temporary PR-workspace content shall not become permanent standing instructions merely because it was useful in one workflow.

Promotion into repository documentation/instructions requires an explicit product/documentation change.

## 13. Acceptance scenarios

### Scenario A — Exact research publication

1. Research returns authoritative evidence plus a `sharedContextCandidate`.
2. Orchestrator policy accepts the candidate for `RESEARCH.md`.
3. Orchestrator renders desired workspace revision `R8`.
4. Orchestrator creates `WORKSPACE_EXACT` against head `H12`.
5. Worker verifies `HEAD == H12`.
6. Worker writes the desired snapshot and creates one commit `H13` with parent `H12`.
7. Worker returns a mutation receipt.
8. Orchestrator observes `H13`, verifies paths/content hashes, and marks workspace revision `R8` published.

### Scenario B — Stale publication

1. Orchestrator creates workspace WorkItem against `H12`.
2. Another authorized Worker mutation advances branch to `H13` before execution.
3. Worker observes mismatch and returns `STALE_HEAD` without committing.
4. Orchestrator observes `H13`, recomputes/rebinds desired workspace state if still needed, and issues a new WorkItem according to policy.

### Scenario C — Lost success response

1. Worker pushes expected commit `H13` but transport response is lost.
2. Orchestrator sees uncertain attempt state.
3. Orchestrator observes remote branch and workspace content.
4. Desired state already matches revision `R8` at `H13`.
5. Orchestrator records convergence without asking Worker for a duplicate commit.

### Scenario D — Worker changes extra file

1. `WORKSPACE_EXACT` authorizes only `.internet/workspace/**`.
2. Worker commit also modifies `src/app.ts`.
3. Orchestrator reconciliation detects unauthorized path change.
4. WorkItem fails regardless of workspace content correctness.
5. Runtime blocks/repairs according to repository mutation policy rather than silently accepting the extra change.

### Scenario E — Agentic implementation

1. Orchestrator creates `IMPLEMENTATION_AGENTIC` with objective, exact head, allowed paths, and required validation.
2. Worker chooses implementation details within scope.
3. Orchestrator verifies commit ancestry/path authority.
4. Tests/Reviewer/CriterionAssessment determine semantic correctness.
5. Exact byte equality is not required because this mutation class intentionally delegates implementation design to Worker.

## 14. Non-goals

This protocol does not make Worker:

- the workflow controller;
- publication-policy authority;
- the semantic owner of Planner/Research/Reviewer output;
- free to merge/rebase stale work autonomously;
- free to write outside WorkItem scope;
- a trusted source of final repository truth without reconciliation.

It does not make Local Agent the Git control plane.

It also does not require Git to become the workflow database. Git remains an observed mutation target and collaboration surface; Orchestrator durable state remains authoritative.
