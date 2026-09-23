# ADR-0014 — Reconcile Orchestrator Desired State Through a Single-Writer Git Mutation Protocol

- **Status:** Proposed
- **Date:** 2026-09-16
- **Related:** ADR-0001, ADR-0004, ADR-0005, ADR-0011..0013, ADR-0015

## Context

The deterministic Orchestrator Runtime owns workflow coordination and Worker is the only workflow actor allowed to create repository commits.

A production system therefore needs a strict contract between deterministic control authority and Git mutation authority. Broad prose such as "update the workspace" leaves too much semantic and concurrency policy to Worker and makes retries/recovery difficult to verify.

Mature controller systems instead reconcile desired and observed state. Git/GitHub also expose compare-and-swap style semantics through expected/current object identities and reject stale non-fast-forward writes.

## Decision

Repository mutation is a desired-state reconciliation protocol:

```text
accepted typed artifacts / runtime state
              |
              v
Orchestrator mechanically derives authorized repository effect
              |
              v
GitMutationWorkItem
              |
              v
Worker executes against exact expected head
              |
              v
GitMutationReceipt
              |
              v
Orchestrator observes actual repository state
              |
       +------+------+
       |             |
    converged      mismatch/stale
       |             |
       v             v
     accept      deterministic recovery
                  or reasoning WorkItem
```

The Orchestrator does not use semantic reasoning to invent desired effects. Semantic content must already exist in accepted artifacts/shared views, or the workflow must obtain it from a reasoning capability.

The Local Agent may inspect/explain mutation state through the workflow API but is not mutation-policy or reconciliation authority.

## Mutation modes

### `WORKSPACE_EXACT`

For temporary collaboration files. Orchestrator renders exact desired bytes/hashes mechanically from active typed shared views and deterministic runtime state. Worker must not reinterpret them.

### `IMPLEMENTATION_AGENTIC`

For product/source/test/documentation implementation. Orchestrator supplies objective/criteria/input references, authorized scope, expected head, and validation policy. Worker has semantic implementation freedom within that envelope.

### `WORKSPACE_CLEANUP`

For exact removal of temporary workspace files before final review, with no unrelated semantic change.

The transport can be shared, but semantic success rules differ by mode.

## GitMutationWorkItem

A mutation WorkItem binds at least:

```text
workflowRunId / workItemId
mutationMode
repository / branch
expectedHeadSha
allowedPaths / forbiddenPaths
input/artifact references
exact desired file set OR bounded implementation objective
commit classification/message policy
idempotency/equivalence key
policy/schema versions
```

Workspace publication additionally binds:

```text
workspaceRevision
renderVersion
desired paths + content hashes
required absent paths
```

## Expected-head precondition

Before mutating, Worker verifies:

```text
remote branch HEAD == expectedHeadSha
```

Worker shall not silently merge, rebase, force-push, or reinterpret a stale WorkItem against another head.

A moved head returns structured `STALE_HEAD` evidence. Orchestrator then applies deterministic policy: observe current state, accept if already converged, re-materialize against the new head when equivalence rules allow, invalidate affected work, or block/escalate.

## Authorized effect boundary

Every mutation WorkItem constrains its write scope.

```text
WORKSPACE_EXACT
  allowed: .internet/workspace/**

WORKSPACE_CLEANUP
  allowed: .internet/workspace/**

IMPLEMENTATION_AGENTIC
  allowed: task-specific product/test/docs paths
```

A write outside allowed scope fails the WorkItem even if tests pass.

Orchestrator verifies the changed-path/effect set mechanically after execution.

## DesiredWorkspaceState

For exact workspace mutation, Orchestrator keeps a deterministic desired-state object:

```yaml
workspaceRevision: 8
baseHead: abc123
renderVersion: 2
files:
  .internet/workspace/PLAN.md:
    sha256: ...
  .internet/workspace/TODO.md:
    sha256: ...
  .internet/workspace/RESEARCH.md:
    sha256: ...
  .internet/workspace/STATUS.md:
    sha256: ...
absent: []
```

Its semantic inputs are capability-produced typed shared views. Orchestrator only applies schema/version/supersession/publication rules and deterministic templates.

If semantic synthesis is required, Orchestrator schedules a reasoning WorkItem before `DesiredWorkspaceState` exists.

One desired workspace revision should normally become one checkpoint commit.

## Semantic provenance

Representative source ownership:

```text
PlanSharedView       <- Planner
ResearchSharedView   <- Research / Research Synthesis
SharedTodoItem       <- authorized reasoning capability / explicit runtime item
STATUS projection    <- deterministic Orchestrator state
```

Orchestrator does not decide semantic importance from prose. Worker does not rewrite accepted shared-view meaning.

## Atomicity and serialization

Worker is the single repository writer. Mutations on the same branch/head are serialized.

A multi-file exact workspace snapshot should preferably become one tree/commit instead of unrelated per-file commits. This reduces partial publication and CI/head churn.

Normal operation is fast-forward only. A non-fast-forward rejection is a concurrency signal returned to Orchestrator, not permission for Worker to repair history autonomously.

## Mutation receipt

Worker returns structured execution evidence:

```text
workItemId / mutationMode
preHeadSha
commitSha / postHeadSha / parentSha
changedPaths
created / modified / deleted paths
resulting tree/content identity when available
workspaceRevision when applicable
validation command/results
push/update result
```

A receipt proves attempted execution; Orchestrator still verifies observed repository state.

## Reconciliation

For `WORKSPACE_EXACT`, Orchestrator verifies mechanically:

```text
observed remote head == receipt.postHeadSha
commit parent == authorized expectedHeadSha
changed paths within allowed scope
workspace file hashes == desired hashes
required absent paths absent
no unrelated tree changes
```

For cleanup:

```text
workspace root absent
no unrelated changes
intended product diff remains
```

For `IMPLEMENTATION_AGENTIC`, Orchestrator checks structural/authority constraints; semantic correctness is delegated to tests/Reviewer/Assessment policy, never judged by Orchestrator.

## Idempotency and recovery

Before retrying an uncertain mutation, Orchestrator observes actual state.

- if desired exact state already exists, mark converged without another commit;
- if head is unchanged and retry policy permits, retry the same bounded attempt;
- if head changed, reconcile and create/rebind a new WorkItem according to deterministic equivalence/invalidation rules.

This prevents duplicate commits and stale writes after lost responses.

## Failure taxonomy

At minimum:

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

Recovery keys off structured category and authoritative state, not Worker prose.

## Prompt-injection boundary

Workspace text is untrusted collaboration data. It may contain research-derived content but cannot override repository instructions, WorkItem constraints, or Orchestrator policy.

Protection relies primarily on architecture:

```text
exact InputBundle
expected HEAD
allowed paths
mutation mode
single-writer authority
post-write Orchestrator reconciliation
```

Published context should prefer accepted concise shared views over raw external tool/web content.

## Consequences

### Positive

- Worker remains sole Git writer without becoming workflow authority;
- Orchestrator remains deterministic and non-reasoning;
- stale mutations fail closed;
- exact workspace updates are reproducible/idempotent;
- uncertain transport outcomes can be reconciled from observed Git state;
- same mutation infrastructure supports exact workspace writes and bounded agentic implementation while keeping success semantics separate.

### Costs

- Orchestrator must observe post-write Git state;
- exact workspace publication needs deterministic renderers and shared-view schemas;
- mutation receipts/failure taxonomy add protocol surface;
- stale-head conflicts become explicit rather than silently rebased.

## Invariants

> Orchestrator Runtime mechanically derives authorized repository effects from accepted typed state; it does not semantically invent or curate mutation content.

> Local Agent may request/inspect workflow operations through the typed API but does not independently derive or reconcile repository mutation authority.

> Worker alone executes repository commits, but Worker does not gain semantic or orchestration authority.

> Every mutation binds to one exact expected branch head and uses fast-forward-only normal operation.

> Worker never silently merges, rebases, force-pushes, or expands mutation scope to rescue stale work.

> Exact workspace publication is accepted only after desired-versus-observed reconciliation.

> Repository effects outside a WorkItem's authorized scope are failures even when resulting code appears functional.
