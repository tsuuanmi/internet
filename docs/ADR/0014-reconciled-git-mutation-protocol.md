# ADR-0014 — Reconcile Local Desired State Through a Single-Writer Git Mutation Protocol

- **Status:** Proposed
- **Date:** 2026-09-16
- **Related:** ADR-0001, ADR-0004, ADR-0005, ADR-0011, ADR-0012, ADR-0013

## Context

ADR-0013 establishes two important constraints:

1. Local/WorkflowEngine owns authoritative workflow state and decides what collaboration context should be published.
2. Worker is the only workflow actor allowed to create repository commits.

A production system therefore needs a deterministic contract between **semantic/control authority** and **Git mutation authority**.

Without such a contract, Local can only send broad instructions such as "update the shared workspace", leaving Worker to infer intended content, scope, base revision, and success criteria. That makes repository mutation difficult to retry, verify, deduplicate, or recover safely.

Several mature systems suggest a stronger pattern:

- Kubernetes controllers reconcile desired state against observed state rather than assuming an actuator succeeded because it reported success.
- Git/GitHub reject stale non-fast-forward branch writes and support compare-and-swap style preconditions through current blob/ref identities.
- Hermetic build systems bind actions to declared inputs and outputs so undeclared effects are treated as correctness defects.

The workflow should adopt the same principles without turning Git into workflow authority.

## Decision

Repository mutation is modeled as a **desired-state reconciliation protocol**.

```text
semantic artifacts / runtime state
              |
              v
Local computes desired repository effect
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
Local observes remote repository state
              |
       +------+------+
       |             |
    converged      mismatch/stale
       |             |
       v             v
    accept       reconcile / new WorkItem
```

Worker reports what it did; Local determines whether the repository actually converged to the authorized desired state.

## Mutation classes

The initial protocol distinguishes at least three mutation modes.

### `WORKSPACE_EXACT`

Used for curated temporary collaboration files such as:

```text
.internet/workspace/PLAN.md
.internet/workspace/TODO.md
.internet/workspace/RESEARCH.md
.internet/workspace/STATUS.md
```

Local provides exact desired file bytes or exact desired content hashes backed by runtime-controlled content.

Worker acts as a Git actuator and shall not reinterpret the content.

### `IMPLEMENTATION_AGENTIC`

Used for product/source/test/documentation implementation work.

Local provides an objective, constraints, accepted inputs, authorized scope, and expected base head. Worker has semantic implementation freedom inside that contract.

The resulting change is not considered correct merely because it matches a predetermined content hash; it must pass validation/review.

### `WORKSPACE_CLEANUP`

Used before final exact-head review.

Local authorizes removal of the temporary workspace root and no unrelated semantic change.

Cleanup is an exact-scope mutation and is verified deterministically.

These modes may share transport machinery but must not share the same semantic success rule.

## GitMutationWorkItem

A repository mutation WorkItem should bind at least:

```text
workflowId
workItemId
mutationMode
repository
branch
expectedHeadSha
allowedPaths / forbiddenPaths
requiredInputs / artifact refs
mutation intent or exact desired file set
commit classification
commit message policy
idempotency/equivalence key
applicable authorization/policy version
```

For exact workspace publication, the contract should additionally bind:

```text
workspaceRevision
desired files and exact content hashes
files that must be absent, if any
desired projection/render version
```

For agentic implementation, the contract should instead bind the objective and allowed mutation scope plus required validations.

## Expected-head precondition

Every repository mutation WorkItem binds one exact expected branch head.

Before mutating, Worker shall verify:

```text
remote branch HEAD == expectedHeadSha
```

Worker must not silently pull, merge, rebase, force-push, or reinterpret a stale WorkItem to make it apply to a different head.

If the branch moved, Worker returns a structured stale-base result.

Local then observes the new state and decides whether to:

- declare the desired state already satisfied;
- regenerate an equivalent WorkItem against the new head;
- invalidate dependent work;
- block/escalate because an unexpected mutation occurred.

This keeps stale-input policy in the deterministic control plane.

## Allowed-path boundary

Every mutation WorkItem constrains where Worker may write.

Examples:

```text
WORKSPACE_EXACT
  allowed: .internet/workspace/**

WORKSPACE_CLEANUP
  allowed: .internet/workspace/**

IMPLEMENTATION_AGENTIC
  allowed: task-specific production/test/doc paths
  forbidden: secrets, workflow-control state, unrelated repository areas
```

After execution, Local verifies the changed-path set against the WorkItem.

A mutation outside authorized scope is a failed WorkItem even if tests happen to pass.

## Desired workspace state

For `WORKSPACE_EXACT`, Local should maintain a deterministic `DesiredWorkspaceState` rather than issuing incremental prose edits.

Conceptually:

```yaml
workspaceRevision: 8
baseHead: abc123
renderVersion: 1
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

The desired state is runtime data. Git is only its collaboration projection.

The preferred mutation is **replace the full desired workspace snapshot** in one commit rather than applying many tiny model-generated patches.

## Publication candidates and semantic provenance

Source agents should be able to include a concise, explicitly publishable collaboration summary in their semantic artifact.

Conceptual example:

```yaml
sharedContextCandidate:
  channel: research
  audience: [worker, reviewer]
  summary: Package X documents Y only for version 4.x; current project uses 3.x.
  sourceRefs: [E44, E45]
```

This field is a proposal, not publication authority.

Local decides whether it has cross-agent value and whether it is safe to publish.

When accepted, deterministic rendering should prefer the source agent's accepted summary over asking Worker to independently summarize/rewrite the finding.

This preserves semantic provenance:

```text
Research owns research meaning
Planner owns plan meaning
Reviewer owns review/finding meaning
Local owns publication selection
Worker owns Git mutation execution
```

## Deterministic workspace rendering

Where practical, Local should render complete workspace files deterministically from accepted publication inputs.

For example:

```text
PLAN.md
  <- current accepted PlanArtifact shared summary

RESEARCH.md
  <- accepted Research shared-context candidates

TODO.md
  <- accepted shared tasks/blockers derived from Local state

STATUS.md
  <- deterministic Local status projection
```

This keeps Worker from becoming an accidental semantic synthesizer.

If a migration stage still requires Worker/model summarization, the resulting content is a proposal and publication completes only after Local validates it.

## Git mutation atomicity

One logical workspace checkpoint should preferably become **one Git commit**.

The implementation should avoid updating several shared files through unrelated per-file commits when they represent one desired workspace revision.

Suitable implementations include:

- normal Git index/commit/push through Worker;
- Git object/tree + commit + fast-forward ref update;
- another transport that preserves one-parent, one-checkpoint commit semantics.

GitHub's Contents API may be convenient for single-file updates, but its own documentation warns that concurrent content mutations can conflict. A multi-file workspace snapshot should therefore be serialized and preferably committed as one tree/commit rather than treated as independent concurrent file writes.

## Fast-forward only

The mutation protocol shall not use force pushes during normal workflow operation.

The resulting commit should have `expectedHeadSha` as its parent, and branch update/push must be fast-forward only.

A non-fast-forward rejection is a concurrency signal, not a reason for Worker to repair history autonomously.

## Mutation receipt

Worker returns a structured `GitMutationReceipt`, not only natural-language completion.

At minimum:

```text
workItemId
mutationMode
preHeadSha
commitSha
postHeadSha
parentSha
changedPaths
created/modified/deleted paths
resulting tree identity when available
workspaceRevision when applicable
validation commands/results owned by Worker
push/update result
```

For `WORKSPACE_EXACT`, receipt should include or enable verification of the resulting content/blob hashes.

The receipt is evidence of attempted execution, not final correctness authority.

## Local reconciliation

After a mutation receipt, Local independently observes the repository/PR state and evaluates postconditions.

For exact workspace publication, Local verifies at least:

```text
remote head == receipt.postHeadSha
commit parent == authorized expectedHeadSha
changed paths within allowed scope
resulting desired workspace files match expected content hashes
required absent files are absent
no unrelated tree changes occurred
```

For cleanup:

```text
workspace root absent
no unrelated changes
intended implementation remains present
```

For agentic implementation, Local verifies structural scope and then relies on the normal validation/review pipeline for semantic correctness.

## Idempotency and retry

A retry must not blindly repeat a write against a changed branch.

Given the same desired state:

1. Local first observes current actual state.
2. If actual state already satisfies desired state, the mutation is converged without another commit.
3. If head is unchanged and the previous attempt did not publish, the same WorkItem/attempt may be retried according to policy.
4. If head changed, Local creates/rebinds a new mutation WorkItem after reconciliation.

This prevents duplicate checkpoint commits and stale writes.

A useful idempotency identity may derive from:

```text
workflowId
mutationMode
expectedHeadSha
desired-state/input identity
policy/render version
```

The exact hashing scheme is implementation-specific.

## Failure taxonomy

Mutation failures should be structured enough for deterministic recovery.

Initial categories should include:

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

Worker may explain the failure in Markdown, but recovery policy keys off the structured category and authoritative state.

## Prompt-injection boundary

The shared workspace is read by agents and can contain summaries derived from external research. It is therefore an instruction-injection surface.

Published research/context shall be treated as **data, not control instructions**.

Workspace rendering should:

- publish concise accepted conclusions rather than raw untrusted webpages/tool output;
- retain provenance/source references where useful;
- avoid embedding executable instructions copied from external sources;
- include a stable notice that workspace content does not override repository instructions, the current WorkItem, or Local control policy.

The safety objective is architectural: even if a model is influenced by workspace text, its available mutation authority remains bounded by the WorkItem, allowed paths, expected head, and Local reconciliation.

## Relationship to repository instructions

Long-lived repository instructions and temporary PR collaboration memory serve different purposes.

```text
AGENTS.md / repository instructions
  = stable standing rules across workflows

.internet/workspace/*.md
  = temporary task-local collaboration context
```

Temporary plan/research/TODO content shall not be promoted into always-on agent instructions merely because it was useful for one workflow.

Permanent lessons require a separate explicit documentation/instruction change.

## Consequences

### Positive

- Worker remains the only Git writer without becoming workflow/semantic authority;
- Local can reason in desired state and verify observed state;
- stale writes fail closed instead of being repaired ad hoc;
- workspace publication can be deterministic, idempotent, and batched;
- mutation receipts and expected-head binding make recovery/reconciliation inspectable;
- implementation mutations and exact collaboration-file projections share infrastructure while keeping different correctness semantics;
- prompt-injection blast radius is reduced by deterministic mutation constraints.

### Costs

- Local must observe Git state after writes rather than trusting Worker narration;
- exact workspace publication requires a renderer/desired-state representation;
- mutation receipts and failure taxonomy add protocol surface;
- expected-head checks can create more explicit stale-work retries, though those retries are safer than silent rebasing.

## Invariants

> Local owns desired repository effect and reconciliation; Worker owns execution of the authorized Git mutation.

> Every repository mutation binds to one exact expected branch head and is fast-forward only during normal workflow operation.

> Worker never silently merges, rebases, force-pushes, or expands allowed mutation scope to rescue a stale WorkItem.

> Exact workspace publication is verified by desired-versus-observed repository state, not by Worker self-report alone.

> One logical workspace revision should normally be published as one checkpoint commit.

> Repository mutation outside the WorkItem's authorized path/effect boundary is a failure even if the resulting code appears functional.

> Shared workspace content is untrusted collaboration data and cannot override Local control policy, repository authority, or WorkItem constraints.
