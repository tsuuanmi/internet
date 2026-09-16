# Workflow vNext Roadmap

## Purpose

This roadmap turns the vNext architecture into a staged production migration. It intentionally preserves the current coding workflow while introducing a domain-agnostic runtime incrementally.

The roadmap is outcome-oriented. Detailed design and file-level implementation sequencing live in `PLAN.md`; concrete follow-up tasks live in `TODO.md`.

## Guiding constraints

- Existing `WorkflowJob` v3 remains supported during migration.
- Current exact-head, recovery, retry, retention, and Writer authority behavior remains production-authoritative until explicitly superseded.
- Local Agent is a reasoning client; the Orchestrator/runtime remains deterministic.
- New generic abstractions must have one authoritative execution path and should wrap existing production assets before replacing them.
- Every milestone must be independently releasable and testable.
- No milestone may depend on semantic interpretation inside Local/Orchestrator control logic.

## Milestone 0 — Authoritative workflow service boundary

### Outcome

One application/service boundary owns workflow caller authorization and command/tool coordination.

### Why first

Today the slash command and low-level tool reach the runtime differently, and owner checks are not centralized. Every future Local-Agent-facing workflow protocol depends on fixing this boundary first.

### Deliverables

- `WorkflowService` or equivalent application service;
- centralized ownership/session authorization;
- command and tool routed through the same service;
- cross-session access-denial tests;
- no change to v3 workflow semantics.

### Exit criteria

- all workflow operations use one authorization path;
- another session cannot inspect or mutate a workflow merely by knowing its ID;
- legacy workflow tests remain green.

---

## Milestone 1 — Admission protocol and software profile boundary

### Outcome

Natural-language workflow intent can be compiled into a provenance-preserving machine-readable admission request, deterministically preflighted, explicitly confirmed where required, and activated by exact accepted identity.

### Deliverables

- Admission draft/spec types;
- field provenance;
- deterministic validation/preflight;
- stable admission hash/version;
- initial software profile descriptor;
- compatibility adapter from existing `/workflow <objective>` startup.

### Exit criteria

```text
compile -> preflight -> preview/confirmation -> activate(expectedAdmissionHash)
```

cannot activate a request different from the one accepted.

---

## Milestone 2 — Parallel vNext durable kernel state

### Outcome

A domain-neutral `WorkflowRun` persistence model exists beside `WorkflowJob` v3 without invalidating existing durable jobs.

### Deliverables

- vNext Run store;
- Artifact store;
- WorkItem store;
- exact InputBundle representation;
- capability registry contract;
- explicit schema/version parsing;
- deterministic lifecycle invariants.

### Exit criteria

- v3 and vNext durable state can coexist;
- v3 parser/store behavior remains unchanged;
- vNext kernel tests do not depend on software PR concepts.

---

## Milestone 3 — Existing executors behind capability adapters

### Outcome

The new kernel can execute useful work without rewriting production browser/provider runners.

### Deliverables

- software repository-research adapter;
- software implementation adapter;
- software review adapter;
- provider-native deep-research adapter;
- deterministic capability-to-adapter routing.

### Exit criteria

- capability identity is independent from provider/account identity;
- Team/Writer/Research runner internals remain specialized;
- no generic executor accumulates software- and research-specific branching.

---

## Milestone 4 — Typed semantic artifacts

### Outcome

Correctness-bearing semantic outputs are durable, immutable/versioned artifacts rather than opaque transcript state or execution-result text.

### Deliverables

Initial artifact families:

- Objective;
- AcceptanceCriteria;
- Plan;
- Finding;
- Evidence;
- Assessment;
- Report;
- Delivery;
- UserFeedback.

### Exit criteria

- execution result, handoff receipt, and semantic artifact are distinct types;
- every semantic artifact has explicit identity, producer, inputs/lineage, schema/version, and status/supersession semantics;
- invalidation is based on declared dependencies, not prose interpretation by Local.

---

## Milestone 5 — Durable external interaction

### Outcome

Workflow runs can wait for or accept external input without globally blocking unrelated autonomous work.

### Deliverables

- durable `PendingAction` collection;
- response authority/provenance policy;
- stable action IDs and subject versions;
- idempotent response handling;
- stale/conflicting response rejection;
- domain-neutral client/runtime operations such as `query`, `update`, `signal`, `respond`, and `recover`.

### Exit criteria

- `USER_AUTHORITY` cannot be satisfied by Local Agent provenance;
- one blocked branch does not stop independent runnable work;
- restart preserves outstanding interactions.

---

## Milestone 6 — Software delivery checkpoint and feedback loop

### Outcome

The first complete vNext product journey is available:

```text
idea
 -> software run
 -> research / plan / implementation / review
 -> reviewed PR DeliveryArtifact
 -> User/local validation
 -> feedback
 -> same run resumes
 -> revised exact-head review
 -> final convergence
```

### Deliverables

- exact-head `DeliveryArtifact`;
- User validation `PendingAction`;
- typed feedback ingestion;
- feedback-to-semantic-work routing through reasoning capabilities;
- deterministic stale-result invalidation;
- fresh review requirement after changed PR head.

### Compatibility constraint

The legacy v3 path continues to treat review PASS as terminal completion until explicitly deprecated.

### Exit criteria

- vNext reviewed PR delivery is usable without implying terminal run completion;
- stale feedback against an older delivery/head fails closed or is explicitly reconciled;
- a changed head cannot inherit prior review approval accidentally.

---

## Milestone 7 — Workstream continuation

### Outcome

Terminal research or other runs can feed later runs without reopening history or creating unsafe cross-run retention dependencies.

### Deliverables

- Workstream metadata store;
- continuation admission;
- explicit source-run/source-artifact lineage;
- import/copy of correctness-bearing source artifacts into child run storage;
- retention-safe continuation behavior.

### Exit criteria

```text
ResearchRun R1 --Report/Evidence--> SoftwareRun S1
```

remains reproducible even if R1 later becomes retention-eligible.

---

## Milestone 8 — Durable Timer/Event and long-running research profile

### Outcome

The generic runtime supports long-lived workflows that sleep, wake, refresh external evidence, and continue after process restart.

### Deliverables

- first-class Timer;
- first-class ExternalEvent;
- durable wake-up scheduler;
- research profile using provider-native deep research as a capability;
- multi-round research/refresh/synthesis/report flow;
- profile-aware bootstrap independent of software Writer availability.

### Exit criteria

- timers survive process downtime and fire/reconcile correctly after restart;
- duplicate external events are idempotently handled;
- research workflows can run without requiring `chatgpt-writer`;
- recovery delay and semantic Timer remain distinct concepts.

---

## Milestone 9 — Convergence, assessment, and authority hardening

### Outcome

Workflow completion becomes a deterministic predicate over typed current state rather than a hard-coded phase terminal.

### Deliverables

- criterion-scoped assessment artifacts;
- exact subject/input binding;
- stale assessment invalidation;
- profile-defined convergence policy;
- explicit waiver/authorization objects rather than implicit Reviewer override;
- budget/stagnation stop conditions.

### Exit criteria

Local determines only whether required current typed assessments/gates exist and satisfy code-defined policy; Local never decides semantic criterion satisfaction itself.

---

## Milestone 10 — Legacy migration and cleanup

### Outcome

Only after vNext has production parity and sufficient migration confidence, reduce legacy duplication deliberately.

### Candidate cleanup

- static v3 graph builder/prompt path;
- legacy handoff-only semantic communication path;
- direct command/tool runtime entry duplication;
- software-specific files moved under software profile boundaries;
- deprecated public exports and compatibility re-exports;
- eventual v3 durable-state migration or retirement policy.

### Exit criteria

- no persisted v3 jobs are orphaned;
- public package compatibility impact is explicitly versioned/documented;
- one authoritative production workflow path remains.

## Release discipline for every milestone

Every implementation PR should finish with:

```bash
npm run check
npm test
npm run build
npm run verify-package
```

Existing v3 characterization tests remain part of the gate until the legacy runtime is formally retired.

## Roadmap anti-goals

The roadmap explicitly avoids:

- a big-bang `WorkflowEngine` rewrite;
- introducing a second competing software execution stack;
- treating transcript text as durable authority;
- hiding semantic reasoning inside orchestration code;
- using recovery delays as fake semantic timers;
- premature global artifact reference counting;
- prematurely moving/renaming production files without a compatibility need;
- broad abstraction work not required by a concrete milestone.
