# Workflow vNext Roadmap

## Purpose

This roadmap turns the vNext architecture into a staged production migration. It intentionally preserves the current coding workflow while introducing a domain-agnostic runtime incrementally.

The roadmap is outcome-oriented. Detailed design and file-level sequencing live in `PLAN.md`; concrete follow-up tasks live in `TODO.md`.

## Guiding constraints

- Existing `WorkflowJob` v3 remains supported during migration.
- Current exact-head, recovery, retry, retention, and Writer authority behavior remains production-authoritative until explicitly superseded.
- Local Agent is a reasoning client; the deterministic Orchestrator Runtime owns authoritative workflow transitions.
- New generic abstractions must have one authoritative execution path and should wrap existing production assets before replacing them.
- Every milestone must be independently releasable and testable.
- No milestone may depend on semantic interpretation inside Orchestrator control logic.
- No complete product journey may claim terminal semantic success before baseline criterion assessment/convergence exists.

## Design Gate D0 — Contract harmonization

### Outcome

The proposed ADR/SRS set gives one unambiguous implementation contract.

### Why first

Older proposal documents still contain stale wording such as `Local/Orchestrator` or assign deterministic WorkItem materialization/invalidation to `Local`. Other documents already define Local Agent as a reasoning client and Orchestrator Runtime as the deterministic control plane.

### Deliverables

- normalize Local Agent vs Orchestrator Runtime terminology;
- synchronize Need vocabulary (`requirements_change`, `clarification`);
- define Need -> WorkItem **or** PendingAction materialization;
- standardize `WAITING_EXTERNAL` terminology;
- clarify parent-owned source artifact vs child-owned continuation import;
- add baseline CriterionAssessment/convergence contract;
- add explicit v3 compatibility/migration language where needed.

### Exit criteria

- no proposed normative document assigns deterministic control-plane authority to Local Agent;
- no core requirement contradicts specialized admission/interaction/planner/kernel contracts;
- implementation agents can follow one dependency order without hidden prerequisites.

---

## Milestone 0 — Authoritative workflow service boundary

### Outcome

One application/service boundary owns workflow caller authorization and command/tool coordination.

### Deliverables

- `WorkflowService` or equivalent application service;
- explicit authorization-context/principal input;
- v3 adapter preserving current owner-session rules;
- command and tool routed through the same service;
- cross-session access-denial tests;
- no change to v3 workflow semantics.

### Exit criteria

- all protected workflow operations use one authorization path;
- another session cannot inspect or mutate a v3 workflow merely by knowing its ID;
- service design does not make creator session identity the permanent vNext authorization model;
- legacy workflow tests remain green.

---

## Milestone 1 — Durable admission protocol and software profile boundary

### Outcome

Natural-language workflow intent can be compiled into a provenance-preserving machine-readable admission request, deterministically preflighted, durably confirmed where required, and activated by exact accepted identity.

### Deliverables

- Admission draft/spec types;
- durable Admission store/record lifecycle;
- field provenance;
- deterministic validation/preflight;
- stable admission hash/version;
- durable confirmation receipt/provenance;
- initial software profile descriptor;
- compatibility adapter from existing `/workflow <objective>` startup.

### Exit criteria

```text
compile
 -> persist draft
 -> preflight
 -> durable confirmation if required
 -> accepted AdmissionSpec
 -> activate(expectedAdmissionHash/version)
```

cannot activate a request different from the one accepted, and reconnect does not lose an outstanding confirmation.

---

## Milestone 2 — Parallel vNext durable kernel substrate

### Outcome

Domain-neutral vNext persistence contracts exist beside `WorkflowJob` v3 without invalidating existing durable jobs.

### Deliverables

- WorkflowRun store;
- Artifact store/envelope;
- WorkItem store;
- exact InputBundle representation;
- capability registry contract;
- schema/version parsing and pinning;
- deterministic lifecycle invariants.

### Exit criteria

- v3 and vNext durable state can coexist;
- v3 parser/store behavior remains unchanged;
- vNext kernel tests do not depend on PR/Git concepts;
- execution result/receipt/semantic artifact remain distinct.

---

## Milestone 3 — Semantic protocol and baseline convergence

### Outcome

The runtime has the semantic schemas required to evaluate meaningful workflow progress and eventual success.

### Deliverables

- ObjectiveArtifact;
- AcceptanceCriteriaArtifact;
- PlanArtifact / PlanTask;
- Need and Finding schemas;
- Evidence/Report/Delivery/UserFeedback artifacts;
- CriterionAssessment/Assessment artifact;
- result-to-artifact promotion contract;
- planning capability contract;
- baseline profile convergence predicate.

### Exit criteria

The system can distinguish:

```text
WorkItem completed
PlanTask execution complete
Criterion assessed satisfied
WorkflowRun converged
```

without asking Orchestrator to make semantic judgments.

---

## Milestone 4 — Deterministic vNext RunEngine/Driver/Scheduler

### Outcome

A durable vNext run can progress, recover, schedule, invalidate, and converge using the new kernel state rather than the static v3 software graph vocabulary.

### Deliverables

- vNext run coordinator/engine;
- readiness/dependency evaluation;
- Need -> WorkItem/PendingAction materialization;
- exact InputBundle construction;
- execution leases/fencing/reconciliation;
- causal invalidation;
- result promotion;
- baseline convergence evaluation;
- restart/resume driver behavior.

### Exit criteria

- vNext run progress survives process restart;
- stale attempts cannot commit authoritative results;
- deterministic routing/scheduling does not inspect prose;
- v3 engine behavior remains unchanged.

---

## Milestone 5 — Existing executors behind capability adapters

### Outcome

The vNext runtime can execute useful semantic work without rewriting production browser/provider runners.

### Deliverables

- planning reasoning adapter;
- software repository-research adapter;
- software implementation adapter;
- software review adapter;
- provider-native deep-research adapter;
- deterministic capability-to-adapter routing.

### Exit criteria

- capability identity is independent from provider/account identity;
- Team/Writer/Research runner internals remain specialized;
- no generic executor accumulates software- and research-specific branching;
- every adapter yields exact validated execution results/artifact promotion.

---

## Milestone 6 — Durable in-run external interaction

### Outcome

Workflow runs can wait for or accept external input without globally blocking unrelated autonomous work.

### Deliverables

- durable PendingAction collection;
- response authority/provenance policy;
- stable action IDs and subject versions;
- idempotent response handling;
- stale/conflicting response rejection;
- `query` / `update` / `signal` / `respond` protocol surfaces;
- derived `WAITING_EXTERNAL` behavior.

### Exit criteria

- `USER_AUTHORITY` cannot be satisfied by Local Agent provenance;
- one blocked branch does not stop independent runnable work;
- restart preserves outstanding interactions;
- valid response re-evaluates readiness without a generic `continue` call.

---

## Milestone 7 — Software delivery checkpoint and feedback loop

### Outcome

The first complete vNext software journey is available:

```text
idea
 -> admission/planning
 -> research / implementation / review
 -> reviewed PR DeliveryArtifact
 -> User local validation
 -> feedback
 -> same run resumes
 -> revised exact-head review/assessment
 -> convergence / merge authority
```

### Deliverables

- exact-head DeliveryArtifact;
- User-validation PendingAction;
- typed feedback ingestion;
- feedback-to-semantic-work routing through reasoning capabilities;
- deterministic stale-result invalidation;
- fresh exact-head assessment/review after changed head;
- terminal decision using baseline convergence.

### Compatibility constraint

The legacy v3 path continues to treat review PASS as terminal completion until explicitly deprecated.

### Exit criteria

- vNext reviewed PR delivery is usable without implying terminal completion;
- stale feedback/approval against an older head fails closed or is explicitly reassessed;
- a changed head cannot inherit prior review/merge authority accidentally.

---

## Milestone 8 — Workstream continuation

### Outcome

Terminal research or other runs can feed later runs without reopening history or creating unsafe retention dependencies.

### Deliverables

- Workstream metadata store;
- continuation admission;
- explicit source-run/source-artifact lineage;
- child-owned imported correctness-bearing artifact snapshots;
- source ownership retained in lineage metadata;
- retention-safe continuation behavior.

### Exit criteria

```text
ResearchRun R1 --Report/Evidence--> SoftwareRun S1
```

remains reproducible even if R1 later becomes retention-eligible.

---

## Milestone 9 — Durable Timer/Event and long-running research profile

### Outcome

The generic runtime supports workflows that sleep, wake, refresh external evidence, and continue after process restart.

### Deliverables

- first-class Timer;
- first-class ExternalEvent;
- durable wake-up scheduler;
- research profile using provider-native deep research as a capability;
- multi-round research/refresh/synthesis/assessment/report flow;
- profile-aware bootstrap independent of software Writer availability.

### Exit criteria

- timers survive process downtime and reconcile correctly after restart;
- duplicate external events are idempotently handled;
- research workflows can run without requiring `chatgpt-writer`;
- recovery delay and semantic Timer remain distinct concepts.

---

## Milestone 10 — Convergence, authority, budget, and version hardening

### Outcome

The baseline convergence model is hardened for long-running production use.

### Deliverables

- assessment policy variants;
- waiver/override authority objects;
- contradiction handling;
- budget accounting;
- stagnation/equivalent-Need detection;
- profile/capability/schema migration policy during long waits;
- advanced profile-specific convergence gates.

### Exit criteria

- resource exhaustion never means semantic success;
- stale assessments/waivers are fenced by exact subject/version rules;
- workflow can stop safely on bounded non-convergence while preserving causal state.

---

## Milestone 11 — Legacy migration and cleanup

### Outcome

Only after vNext reaches production parity, reduce legacy duplication deliberately.

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
- hard-coding current owner session as permanent vNext identity;
- in-memory-only admission confirmation;
- using recovery delays as fake semantic timers;
- premature global artifact reference counting;
- prematurely moving/renaming production files without a compatibility need;
- broad abstraction work not required by a concrete milestone.
