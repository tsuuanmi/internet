# ADR-0013 — Use the Pull Request as a Curated Shared Agent Workspace

- **Status:** Proposed
- **Date:** 2026-09-16
- **Related:** ADR-0002, ADR-0004, ADR-0009, ADR-0010, ADR-0011, ADR-0012

## Context

Website agents do not share one reliable conversation memory. Research may discover information that Worker and Reviewer should both know, while Planner may refine a plan that later agents need to see.

The vNext runtime already keeps deterministic workflow state and typed artifacts under the Local Orchestrator/WorkflowEngine. Reproducing that whole state model inside Git would add unnecessary synchronization, commit churn, CI churn, and another surface that could drift from the real state.

The useful property of the implementation PR is simpler: it is a common durable place that GitHub-capable Website agents can inspect.

## Decision

After an implementation PR exists, the workflow may use a small reserved directory on the PR branch as **curated shared collaboration memory**.

The Local deterministic runtime remains the only authority for workflow state, WorkItems, routing, findings, exact-input bindings, approvals, budgets, and termination.

```text
Authoritative Local state / artifacts
              |
              | select important shared context
              v
      PR shared workspace files
              |
              v
   Research / Worker / Reviewer
       can inspect the same context
```

The PR workspace is deliberately **not** a mirror of the runtime artifact store.

## Default workspace

The proposed minimal layout is:

```text
.internet/workspace/
  PLAN.md
  TODO.md
  RESEARCH.md
  STATUS.md
```

For unusually large or long-running work, policy may additionally publish:

```text
ROADMAP.md
```

The runtime should not create per-artifact directories, manifests, finding databases, execution logs, or graph-state files in the PR by default.

## File semantics

### `PLAN.md`

Shared current working plan for agents.

It should contain only material planning context such as:

```text
objective
accepted constraints
acceptance criteria
current implementation approach
important assumptions
material plan revisions
```

The authoritative plan/version remains in Local state. `PLAN.md` is the readable collaboration view.

### `TODO.md`

Shared outstanding work that agents benefit from seeing.

Examples:

```text
implementation tasks
important unresolved review findings
research questions that materially block work
validation still required
```

It is not the scheduler queue and does not replace WorkItems or graph state.

### `RESEARCH.md`

Curated research/evidence that is broadly useful to downstream agents.

Examples:

```text
important discovered repository facts
external-source conclusions
constraints discovered during research
contradictions or uncertainty that affect implementation/review
source references needed by Worker or Reviewer
```

Not every research artifact belongs here. Only results expected to materially help more than one downstream role should be published.

### `STATUS.md`

A small convenience projection of current collaboration progress.

Examples:

```text
current broad phase
latest meaningful checkpoint
current implementation head
major open blocking topics
where an agent should start reading
```

`STATUS.md` is non-authoritative and may be generated from Local state.

### `ROADMAP.md`

Optional for large tasks that need multiple major milestones. It is unnecessary for ordinary workflow jobs.

## Curated projection, not artifact mirroring

The key rule is:

> Publish information because another agent is likely to need it, not because an artifact exists.

For example:

```text
Research produces 12 internal evidence artifacts
        |
        | Local determines 3 conclusions are broadly relevant
        v
RESEARCH.md receives those 3 conclusions
```

The other 9 artifacts remain only in Local/runtime storage and can still be supplied through exact InputBundles when needed.

This keeps the PR understandable and avoids creating a second workflow database.

## Authority boundary

PR files are collaboration context, never workflow authority.

The following remain exclusively Local/runtime-owned:

```text
workflow lifecycle/phase state
Finding and Need lifecycle
WorkItems
Graph nodes and dependencies
InputBundle identity
routing/capability decisions
retry/fencing/idempotency
resource budgets
exact-head approval state
CI/health authority
human authorization
termination/convergence
```

An agent editing or suggesting text in `PLAN.md`, `TODO.md`, `RESEARCH.md`, or `STATUS.md` does not directly change any of those authoritative states.

A semantic state change occurs only when the Local Orchestrator validates/accepts it through the normal typed-artifact/control path.

## Publishing authority

Research and Reviewer do not gain repository mutation authority merely because their results may appear in the shared workspace.

Preferred flow:

```text
agent result
  -> Local validates/persists authoritative artifact/state
  -> Local decides whether shared publication is useful
  -> mutation-capable transport updates curated workspace file(s)
  -> Local records publication/checkpoint evidence as needed
```

If the Worker account performs the Git mutation as a transport adapter, that does not give Worker authority to reinterpret another role's result. Material changes to shared meaning must remain traceable to their source artifact or accepted Local decision.

## Update cadence

The workspace should be updated at **meaningful synchronization points**, not for every state transition.

Good publication triggers include:

```text
initial plan ready
research synthesis materially changes shared understanding
plan materially revised
Worker completes a meaningful implementation checkpoint
Reviewer discovers a broadly relevant blocking issue
major TODO set changes
before another role is started and needs fresher shared context
```

Avoid publishing:

```text
provider progress
retry attempts
heartbeat/lease state
small internal findings
raw tool output
routine graph-node transitions
```

Updates may be batched into one checkpoint commit.

## Context use

Website agents may be told to begin by reading the shared workspace files relevant to their role.

Typical guidance:

```text
Worker:
  read PLAN.md + TODO.md + RESEARCH.md

Reviewer:
  read PLAN.md + RESEARCH.md + current implementation diff

Research:
  read PLAN.md + TODO.md, then answer the bounded research question
```

This is shared situational awareness, not a replacement for exact WorkItem InputBundles.

If correctness depends on a particular fact, the authoritative artifact/input binding still records that dependency in Local state.

## Git/head implications

Any workspace update committed to the PR branch changes the physical PR head SHA.

Therefore collaboration-time review is provisional. Final exact-head approval must occur only after temporary workspace files have stopped changing and, when they are temporary, have been removed.

Target lifecycle:

```text
PR created
  -> COLLABORATION
       plan / research / implementation / review feedback
       curated workspace updates when materially useful
  -> COLLABORATION_COMPLETE
  -> remove temporary .internet/workspace files
  -> verify clean product diff
  -> FINAL_REVIEW
  -> exact-head CI/health
  -> existing user/merge authority boundary
```

If final review finds a material defect, collaboration may reopen, followed by cleanup and a fresh final review.

## Cleanup

The default workspace is temporary and must not appear in the final product diff.

Before final exact-head review:

```text
remove .internet/workspace/
verify no temporary files remain
verify intended implementation changes remain
```

The cleanup commit creates a new head, so any earlier exact-head approval is stale by definition.

A repository may later choose to retain selected files as real deliverables, but that is a separate explicit product decision rather than the default workflow behavior.

## CI boundary

Workspace commits may trigger CI. The runtime should reduce unnecessary churn through coarse checkpointing rather than committing every internal update.

Repository CI policy must be validated explicitly. The workflow must not assume that skipping required workflows via path filters or commit messages is safe.

## Security and retention

Temporary does not mean erasable.

Content committed to Git may remain retrievable from branch/PR history after deletion. Therefore the workspace must never contain:

```text
credentials/tokens/cookies
auth/browser state
hidden chain-of-thought or private reasoning
retention-sensitive secrets
sensitive data that must later be securely deleted
```

## Consequences

### Positive

- Worker and Reviewer can see the same important research without re-sending entire conversations;
- agents gain a simple shared mental model of plan, work remaining, and important discoveries;
- Git/PR provides durable cross-agent visibility using infrastructure already available to Website agents;
- Local retains a clean deterministic state machine;
- implementation cost is much lower than mirroring every runtime artifact into Git.

### Costs / risks

- curated files can become stale if publication policy is poor;
- updates move PR head and can trigger CI;
- summarization/curation can omit information, so correctness-critical dependencies still belong in Local artifacts/InputBundles;
- temporary Git content is retained in history even after cleanup.

## Invariants

> Local deterministic workflow state remains authoritative; PR shared files are collaboration memory only.

> The PR workspace is curated for cross-agent usefulness, not a mirror of all artifacts or execution state.

> Publishing shared context does not grant Research or Reviewer repository mutation authority.

> Correctness-critical inputs remain explicitly bound in Local WorkItems/InputBundles even when the same information is visible in PR files.

> Temporary workspace files are removed before final exact-head review unless explicitly promoted to real product deliverables.

> Secrets and retention-sensitive information never enter the PR workspace.
