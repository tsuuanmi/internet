# Workflow vNext — External Research Notes

- **Status:** evolving research notes; not an accepted architecture contract
- **Started:** 2026-09-16

This document records external patterns and candidate ideas for `internet`. Accepted decisions should be promoted separately into ADRs and `SRS-VNEXT.md`.

## Sources reviewed

- Anthropic engineering: multi-agent research system and evaluator-optimizer patterns.
- OpenAI Agents SDK: manager/handoff orchestration and tracing.
- Agent2Agent (A2A): Tasks, Messages, Artifacts, Agent Cards, and capabilities.
- LangGraph: shared state, conditional routing, dynamic `Send` fan-out, interrupts.
- AutoGen: stateful/composable termination conditions and dynamic teams.
- OpenHands SDK: immutable typed events and append-only event history.
- Temporal: durable deterministic orchestration around nondeterministic activities.
- NeurIPS 2025 MAST: multi-agent failures across system design, inter-agent alignment, and verification/termination.
- EMNLP 2025 communication-topology study: moderately sparse communication can reduce error propagation while preserving useful information flow.
- ICLR 2025 multi-agent scaling study: collaboration shows diminishing/logistic returns and topology matters.

## Candidate design patterns

### Finding -> Need -> WorkItem -> Artifact

Do not overload a Need with execution state.

```text
Finding  = observed defect/uncertainty/unmet criterion
Need     = capability or information required to progress
WorkItem = concrete bounded execution request created by Orchestrator
Artifact = durable output produced by a WorkItem
```

Example:

```text
Finding F17
  -> Need N22: external_evidence(question=Q9)
  -> WorkItem W31: bounded research for Q9
  -> Artifact E44: evidence packet
  -> return E44 to owner(F17)
```

This mirrors the useful A2A separation between stateful Tasks and result Artifacts.

### Manager-owned control

Prefer bounded manager/orchestrator delegation over direct agent takeover.

```text
Agent emits Need
-> Orchestrator validates/deduplicates
-> Orchestrator creates WorkItem
-> capability executes WorkItem
-> result Artifact is committed
-> Orchestrator returns it to the causal owner
```

No specialist directly owns workflow control or graph mutation authority.

### Capability-based routing

Agents should request semantic capabilities rather than concrete roles/accounts.

```yaml
capability: external_research
accepts: [research_question]
produces: [evidence_packet]
sideEffects: none
supportsParallel: true
```

Then:

```text
Need(external_evidence)
-> routing policy
-> Capability(external_research)
-> eligible executor/account
```

Logical roles remain useful for reasoning ownership; provider/account selection remains runtime policy.

### Sparse deterministic context projection

Artifact visibility in shared state is not equivalent to context delivery.

Every WorkItem should receive an exact `InputBundle`/context manifest containing only correctness-relevant artifacts.

```yaml
workItemId: W31
inputArtifacts:
  - plan:P4
  - finding:F17
  - evidence:E12
```

Do not inject the entire workflow transcript or unrelated branch outputs by default.

This improves exact-input hashing, independence, context efficiency, and resistance to error propagation.

### Safe graph motifs

Dynamic graph behavior does not require arbitrary model-authored DAG edges. Prefer deterministic graph templates instantiated from validated Needs.

```text
research-return:
  Owner -> Research -> Owner

parallel-research-join:
  Owner -> Research[1..N] -> EvidenceJoin -> Owner

repair-review:
  Reviewer -> Worker -> fresh exact-head Review

replan-execute-review:
  Reviewer -> Planner -> Worker -> fresh Review

verify-return:
  Owner -> Verification capability -> Owner
```

This gives irregular/adaptive topology while the runtime keeps graph authority.

### First-class termination policy

Success should be convergence, not a round count. Limits should be safety guards.

```yaml
success:
  allBlockingFindingsResolved: true
  currentHeadReviewApproved: true
  requiredChecksPassed: true
  unresolvedCriticalContradictions: 0

limits:
  maxTotalWorkItems: 30
  maxResearchWorkItemsPerFinding: 3
  maxRepairWorkItemsPerFinding: 2
  maxFindingReopens: 2

stagnation:
  rejectEquivalentNeedWithoutNewInput: true
  rejectEquivalentPatchWithoutStateChange: true
```

### Explicit adaptive effort budget

Instead of globally increasing team size or rounds, assign a workflow budget from task complexity/risk and consume it through WorkItems.

Possible dimensions:

```text
max concurrent WorkItems
max specialist fan-out
max model turns/tool calls
max tokens/cost
max wall-clock time
```

Budget exhaustion should stop/escalate rather than silently overrun.

### Artifact lineage and causal invalidation

A flat artifact store is insufficient for dynamic feedback loops. Add typed relationships such as:

```text
consumes
produces
derived_from
supports
contradicts
resolves
supersedes
invalidates
```

Exact-input invalidation can then walk only correctness-bearing dependencies instead of globally restarting phases.

### Verification as capability first

Do not immediately create a permanent Verifier team. Model verification as on-demand capabilities:

```text
schema_validation
source_reachability
citation_entailment
source_freshness/quality
claim_coverage
contradiction_check
```

Orchestrator requests the minimum verification needed for current artifact/risk class.

### Evaluate end state and checkpoints, not one canonical trajectory

A dynamic graph may reach the same correct end state through different valid paths. Eval should emphasize:

```text
correct final repository/PR state
acceptance criteria satisfied
critical findings resolved
correct evidence relationships
no stale exact-input approvals
correct authority behavior
bounded resource use
```

Do not require one exact Research -> Worker -> Review sequence.

### Semantic coordination tracing

Trace causal coordination in addition to raw provider/tool calls:

```text
Finding F17
-> caused Need N22
-> materialized WorkItem W31
-> consumed InputBundle B9
-> produced Evidence E44
-> returned_to Reviewer R2
-> resolved_by Resolution R8
```

## Suggested promotion order

The strongest next candidates for ADR/SRS discussion are:

1. first-class `WorkItem` separate from Need and Artifact;
2. capability-based routing;
3. deterministic sparse `InputBundle` context projection;
4. safe dynamic graph motifs;
5. composable termination + resource-budget policy;
6. artifact lineage + causal invalidation;
7. verification as an on-demand capability;
8. end-state/checkpoint evals + semantic coordination tracing.

The first three are likely the highest-leverage because every later feedback loop and specialist can reuse them.
