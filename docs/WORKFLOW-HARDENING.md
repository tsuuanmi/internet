# Workflow Team Observability, Control, and Routing Hardening

- **Status:** implemented
- **Last synchronized:** 2026-09-15
- **Scope:** shared team semantics, durable graph execution, failure/recovery evidence, operator projection, concurrency, and routing

This document records the hardening that moved workflow execution from coarse team/lane replay to exact graph-node recovery while preserving the provider-agnostic team model.

## Triggering failures

Long-running Website work exposed three distinct problems:

1. a later member/synthesis or Writer failure could not be recovered precisely enough with lane-level retry state;
2. operator output needed the exact logical node, attempt, provider activity, failure class/code, and next recovery action;
3. team semantics were too easy to conflate with provider/account routing.

The current runtime therefore separates **team semantics**, **graph correctness state**, **execution ownership**, and **provider diagnostics**.

## Shared team semantics

`internet_team` and workflow research/review share deterministic primitives from the team layer:

```text
buildTeamPlan(...)
prepareTeamStep(...)
runTeamStep(...)
```

`internet_team` executes the plan in-memory. Workflow maps the same member/synthesis steps into durable graph nodes. Workflow does not contain a second debate loop or a second synthesis implementation.

The shared team layer owns:

```text
member speaking order and dependency semantics
peer-context construction
purpose-specific prompt strategies
provider-agnostic Member 1..N roles
strongest-supported synthesis
structured member/provider failures
```

For teams larger than two members, a prepared member prompt depends on every latest prior peer contribution it actually consumes, plus the sequencing dependency needed by the plan. Synthesis depends on all member steps whose transcript it consumes.

## Provider-agnostic member model

Normal reasoning prompts use only:

```text
Member 1
Member 2
...
```

Provider/account identity remains routing and diagnostic metadata. Peer output is delimited as untrusted evidence. Synthesis is asked to keep the strongest supported result rather than average or preserve symmetry.

Current default route for new workflows:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
Writer   -> chatgpt-writer
```

Existing durable jobs keep their persisted account routing. `gemini-thinker` remains available for explicit direct/research/team use. `chatgpt-writer` is never reused as a thinker.

## Durable graph instead of lane replay

Workflow correctness is represented by graph nodes and dependencies, not by a coarse lane state machine.

Each executable node has a stable logical identity and, once runnable, an exact input receipt. Each provider attempt has a separate `executionId`. Completed payloads live in the node-result store; the graph completion receipt references that durable result.

A completed node is reusable only while the exact correctness-bearing input still matches. Recovery therefore targets the smallest affected node:

```text
later member fails      -> recover that member only
synthesis orphaned      -> recover synthesis only
Writer fails            -> reconcile Writer/provider/PR receipts first
new PR head             -> create a fresh review cycle bound to that head
```

There is no degraded research/review quorum and no procedural “restart team from round 1” fallback.

## Ownership, progress, and recovery

An active execution persists unique execution identity, owner, attempt, heartbeat/lease, provider state, and meaningful progress timestamps. Lost/expired ownership becomes orphaned recovery. Fencing prevents late stale results from committing.

Provider completion distinguishes hard timeout from semantic no-progress stall. Recovery classification is separate from retry disposition. In particular:

```text
provider/browser transient -> bounded same-node recovery
provider result ambiguity  -> fail closed; do not blindly resubmit
auth boundary              -> action required
invalid selector/parser    -> AUTOMATION / CODE_FIX
```

Provider turn receipts bind a stable request identity to the exact logical prompt/session so retry can reconcile before resubmission.

## Concurrency boundary

Research A/B and Review A/B are independent graph branches. READY nodes from siblings may be dispatched concurrently. Workflow adds no A-then-B mutex.

The account scheduler remains the only same-account capacity/session-ordering authority. Graph readiness answers *what may run*; the account scheduler answers *when this account/session may run*.

## Operator projection

`/workflow status` and `/workflow watch` are graph projections. They expose:

```text
phase + lifecycle
exact active/recovering/failed node
execution attempt and ownership evidence
provider activity and progress lease
waiting dependencies/blockers
failure class/code/retry action
PR/head/health/review state
pending user/code action
recent ordered diagnostic events
```

Normal research/review output stays `Team A/B` + `Member 1..N`. Raw account/provider identity is diagnostic detail. Full research/review payloads are not injected into Local progress context.

The obsolete workflow team-trace correctness store and coarse retry state were removed; the graph snapshot is authoritative and the event journal is diagnostic only.

## Human-action boundary

Routine recognized, scope-valid Writer GitHub confirmations are auto-approved according to ADR-0007. Unknown/malformed/scope-mismatched confirmations are never clicked and currently terminate that browser attempt into a durable action-required blocked state.

Top-level `WAITING_USER` is currently used for durable workflow authority such as exact-head merge authorization. The graph/provider model reserves live `WAITING_USER`, but no current headless workflow adapter claims to preserve a reachable live browser session after an unknown confirmation. That capability remains deferred until a concrete safe reachability/resume contract is implemented.

## Stop and continue

`/workflow stop` aborts/settles active work and persists terminal `CANCELLED`.

`/workflow continue` operates on the same durable graph. It may reopen one failed engine-approved recovery target for reconciliation; it does not create a new job, replay completed exact-input work, change account routing, or bypass merge authority.

## Verification invariants

Coverage includes:

```text
shared TeamPlan dependency semantics, including >2 members
exact prompt/input binding
later-member retry without sibling replay
orphaned synthesis-only recovery
restart ownership reconciliation
provider-result ambiguity fail-closed
selector defect -> code-fix boundary
exact-head remediation H1 -> H2 review-cycle isolation
no degraded research quorum
graph-derived operator status
scheduler failure persistence
semantic stall vs hard timeout
Writer scoped confirmation authority
full formatter/typecheck/test/build/package Verify gate
```

## Completion invariants

- one shared team semantic core;
- one durable graph correctness authority;
- one graph scheduler plus the existing account scheduler boundary;
- exact input/output receipts and execution fencing;
- reconcile-before-resubmit recovery;
- provider-agnostic member prompts;
- exact-head review/health/merge authority;
- terminal stop and explicit durable recovery;
- no duplicate team loop, compatibility fallback, trace state machine, or hidden provider substitution.
