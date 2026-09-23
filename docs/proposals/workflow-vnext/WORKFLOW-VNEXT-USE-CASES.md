# Workflow vNext — End-to-End Product Use Cases

- **Status:** proposed product journeys; explanatory, not an implemented production contract
- **Date:** 2026-09-16
- **Related:** `WORKFLOW-VNEXT.md`, ADR-0018, ADR-0019, ADR-0020, `SRS-VNEXT-CONTINUATION.md`

These use cases anchor the vNext design in the intended product experience.

The User interacts primarily in natural language with Local Agent. Local Agent compiles requests/feedback into typed protocol inputs and explains authoritative workflow state. The deterministic Orchestrator coordinates durable artifact-based execution underneath.

## Use case 1 — Idea or feature request to reviewed PR, local test, feedback, and merge

### User experience

The User starts with a natural-language request, for example:

```text
"I want to add feature X. It should preserve behavior Y and work with Z."
```

The User does not need to construct a workflow graph, select agents, or use `/workflow` commands.

### Admission

```text
User natural language
  -> Local Agent Intake Compiler
  -> WorkflowAdmissionDraft
  -> deterministic preflight
  -> confirmation only when material assumptions/authority require it
  -> AcceptedAdmissionSpec
  -> software workflow run starts
```

The original User source is preserved separately from Local-Agent interpretation and Planner-derived semantics.

### Autonomous execution

A typical software run may dynamically perform:

```text
Planner
  -> repository/external research as needed
  -> Plan/AcceptanceCriteria
  -> Worker implementation
  -> validation/tests
  -> Reviewer
      -> more Research if evidence is missing
      -> Planner if strategy/requirements need revision
      -> Worker if implementation needs repair
  -> fresh review
  -> repeat until provisional convergence
```

The exact path is not fixed. The Orchestrator schedules typed Needs/WorkItems according to durable state and policy.

Worker remains the only repository writer for the software profile.

### PR delivery is not necessarily terminal completion

After autonomous review/validation reaches a deliverable state, the workflow produces a delivery checkpoint containing exact implementation identity, for example:

```text
PullRequestArtifact
DeliveryArtifact
  repository
  branch
  PR URL
  exact head SHA
  relevant test/run instructions
  current acceptance/review summary refs
```

The workflow may then create a durable User-validation PendingAction.

Conceptually:

```text
DELIVERABLE_READY
  -> User tests locally / inspects PR
  -> waits durably for User result
```

This is not workflow failure and does not require the original Local-Agent process to remain connected.

### User feedback from local testing or PR inspection

The User may respond naturally:

```text
"This looks good but the output for case A should be rounded differently."
```

or provide new test results/data/files.

Local Agent converts this into a typed response/input with:

```text
raw User source
provenance
subject PR/head/deliverable reference
structured feedback hints
attachment/artifact references when supplied
```

The Orchestrator persists the external input. Semantic interpretation is delegated to Planner/Reviewer as needed.

If feedback requires a change:

```text
UserFeedbackArtifact
  -> Finding / requirements-change / plan-change / implementation Need
  -> affected lineage invalidated
  -> Worker updates the same workflow PR
  -> fresh validation/review
  -> new DeliveryArtifact bound to new exact head
  -> User validation again
```

Stale approval/review/merge authority never transfers automatically to the new head.

### Merge

When the User explicitly authorizes merge for the current exact head:

```text
MergeAuthorization PendingAction
  -> user_explicit response
  -> exact-head validation
  -> merge policy/action
  -> terminal software-run completion
```

The completed run retains the full causal artifact/receipt lineage needed to explain how the merged result was produced.

## Use case 2 — Deep research to report, then implementation, then local feedback

### Research request

The User starts naturally:

```text
"Research idea X deeply. Compare approaches, verify sources, and give me a concrete report."
```

Local Agent compiles the request and the Orchestrator starts a research-profile run.

### Research execution

The research run may include:

```text
Planning
 -> parallel web/repository/source research
 -> EvidenceArtifacts
 -> contradiction/coverage checks
 -> additional bounded research rounds
 -> ResearchSynthesis
 -> source/citation verification
 -> ReportArtifact
```

For long-running research it may additionally use durable Timers or ExternalEvents between rounds.

If one source requires User authority, authentication, payment, or another external decision, only the dependent path waits. Independent research continues where possible.

### Research run completes as a valid result

When its research-specific convergence criteria are satisfied, the research workflow may become terminal with a durable `ReportArtifact` and supporting evidence lineage.

Terminal means the research objective is complete; it does not mean the broader User project can never continue.

### User asks to implement the research

Later the User may say:

```text
"Good. Implement this approach in repository Y."
```

Local Agent recognizes the current conversational/workstream context and compiles a **continuation admission**, conceptually:

```yaml
continuesFrom:
  workflowRun: research-run-1
inputArtifacts:
  - report:R1
  - selected evidence/design artifacts
profileHint: software_change
objectiveSource: <new User statement>
target:
  repository: Y
```

A new software WorkflowRun is created under the same Workstream rather than reopening and mutating the terminal research run.

### Artifact lineage crosses the run boundary

The implementation run consumes the research result explicitly:

```text
Research Run R1
  -> ReportArtifact RP1
  -> Evidence E1..En

Software Run S1
  input lineage:
    derived_from RP1
    consumes selected E*
```

Planner may translate the research outcome into implementation-specific Objective/AcceptanceCriteria/Plan artifacts. The deterministic Orchestrator does not perform that semantic translation itself.

### Implementation and PR cycle

The software continuation run then follows the same pattern as use case 1:

```text
Planner
 -> targeted repository research
 -> Worker
 -> validation
 -> Reviewer
 -> adaptive repair/research/replan loops
 -> PR DeliveryArtifact
 -> User local test/feedback
 -> revisions as necessary
 -> exact-head merge authorization
```

### User supplies updated data after local testing

If the User tests locally and supplies new numbers/data/evidence:

```text
User
 -> Local Agent
 -> typed feedback/external-input envelope
 -> Artifact/Input persisted with provenance
 -> Planner/Reviewer evaluates semantic impact
 -> dependent implementation/review artifacts invalidated if required
 -> workflow resumes autonomously
```

The new evidence is not silently treated as equivalent to the earlier research data. Its provenance and causal impact remain explicit.

## Workstream versus WorkflowRun

These use cases distinguish two lifecycle levels.

### Workstream

A long-lived User-level project/initiative that may contain multiple related WorkflowRuns and shared artifact lineage.

Examples:

```text
"Feature X"
"New mtDNA analysis approach"
"Research and implement workflow architecture"
```

A Workstream is mainly continuity/grouping/navigation context. It does not replace the authoritative state machine of each run.

### WorkflowRun

One admitted objective with a bounded lifecycle, policies, profile, versions, artifacts, and convergence state.

Examples:

```text
Research idea X
Implement selected approach
Follow-up migration
Regression investigation
```

A terminal WorkflowRun is not mutated back into RUNNING merely because the User begins new follow-up work. Follow-up creates a continuation run with explicit lineage.

## Delivery checkpoint versus completion

A run can produce something usable before it is terminal.

For example, software work may reach:

```text
reviewed PR ready for local User validation
```

while remaining active/waiting for User feedback or merge authority.

Therefore:

```text
Artifact delivered
!=
WorkflowRun completed
```

Delivery is represented by durable artifact/checkpoint state plus any associated PendingAction.

## Product interaction principle

The User should experience a continuous natural-language project conversation:

```text
"Build this"
"How is it going?"
"I tested the PR; change this"
"Merge it"
"Research this idea"
"Now implement the report"
"Here are updated measurements; revise the implementation"
```

Local Agent resolves the intended Workstream/WorkflowRun, queries current state, compiles typed inputs, and calls the workflow protocol.

The User should not need to manage workflow IDs, graph nodes, artifact IDs, or slash commands in normal use.

Underneath that conversational UX, every correctness-bearing transition remains explicit, typed, provenance-preserving, deterministic at the control-plane boundary, and recoverable from durable state.
