# Workflow vNext — Product Thesis and Adaptive Plugin Composition

- **Status:** proposed product/architecture thesis; not current production contract
- **Date:** 2026-09-25
- **Related:** [target architecture](WORKFLOW-VNEXT.md), [end-to-end use cases](WORKFLOW-VNEXT-USE-CASES.md), [external landscape research](../../research/ORCHESTRATION-LANDSCAPE.md)

## 1. Thesis

Internet should not become another general-purpose agent platform.

Internet is itself a **plugin**. Its target role is to be a **durable collaboration and orchestration plugin** that composes persistent AI identities, humans, and other replaceable plugins/tools around work that evolves over time.

A concise product thesis is:

> Keep AI teams working on the same evolving problem across conversations, providers, tools, and multiple rounds, while durable state and human authority remain outside any one model conversation.

The differentiated combination is:

```text
persistent participant identity
+ long-lived work continuity
+ multi-round collaboration
+ explicit artifacts/provenance
+ plugin/capability composition
+ human-governed authority
```

No individual item above is sufficient as a product moat. The value is the composition and the correctness boundary between them.

## 2. Internet is an orchestration plugin, not a platform

The host runtime should remain responsible for plugin discovery, lifecycle, service injection, and other generic platform concerns.

Internet should contribute collaboration semantics and compose capabilities exposed by the host/plugin ecosystem.

Conceptually:

```text
Host / Harness
│
├── Internet plugin
│   ├── work continuity
│   ├── collaboration state
│   ├── capability routing
│   ├── authority / approvals
│   ├── artifacts / provenance
│   └── recovery / reconciliation semantics
│
├── browser plugin
├── repository/GitHub plugin
├── coding-agent plugin
├── search/research plugin
├── storage plugin
├── notification plugin
└── future plugins
```

Internet should not absorb a capability merely because it needs to call that capability.

The preferred dependency direction is:

```text
Internet semantic need
  -> stable capability contract
  -> host/plugin resolution
  -> selected implementation
  -> typed result / receipt
```

This allows Internet to improve when better ecosystem components appear without rewriting collaboration logic.

## 3. Problems worth solving

### 3.1 Strong AI capabilities are trapped behind interactive products

Users may already have authenticated access to capable web products such as ChatGPT or Gemini, including provider-native reasoning modes, Deep Research, subscription usage, and persistent conversations.

Those capabilities are usually consumed manually:

```text
human -> web product -> answer
```

Internet can make them participants in a larger collaboration:

```text
workflow
  -> authenticated AI participant
  -> another participant critiques
  -> external plugin/tool acts
  -> artifact changes
  -> participant reviews the new state
  -> human decides whether to continue
```

Authenticated web accounts are therefore valuable adapters, not the definition of the core architecture.

### 3.2 Real work is iterative, not one-shot

A useful unit of work often survives multiple reasoning/action/review cycles.

Software example:

```text
PR
  -> research / brainstorm
  -> implementation
  -> review
  -> user feedback or new evidence
  -> research again
  -> update the same PR
  -> review again
  -> human merges, continues, or abandons
```

Research example:

```text
question
  -> initial research
  -> critique / contradiction discovery
  -> targeted follow-up research
  -> revised synthesis
  -> user asks a new related question
  -> continuation with explicit lineage
```

A workflow run may still be a bounded execution unit, but the user-level product needs a longer-lived **Workstream** or equivalent continuity object that can contain multiple rounds/runs and preserve artifact lineage.

### 3.3 Teams should be domain-agnostic

The core must not encode a mandatory software-engineering team topology.

Researcher, reviewer, writer, planner, scientist, analyst, or coding worker are profile-level roles. The generic concept is a **Participant** with identity, capabilities, authority, and an execution adapter.

Conceptually:

```text
Participant
  identity
  capabilities
  authority
  conversation/state reference
  execution adapter
```

Possible implementations include:

```text
ChatGPT web account
Gemini web account
API-backed model agent
coding-agent plugin
local model
human participant
future specialist service
```

The kernel should reason about required capabilities and authority, not provider brands.

## 4. Provider conversation is working memory, not authority

Persistent native conversations are useful because a specialist can retain provider-side context across multiple rounds without reconstructing the full interaction on every turn.

However, provider conversation history is not a safe correctness boundary. Providers may compact, truncate, migrate, or otherwise change conversation state.

The intended boundary is:

```text
provider conversation
  = working / experiential context

Internet durable state
  = authoritative workflow memory
```

Correctness-bearing information remains in typed artifacts, receipts, lineage, authority records, and exact workflow state.

## 5. Build-vs-adapt principle

Internet should own the semantics that define Internet and adapt commodity capabilities from the ecosystem.

> **Own collaboration contracts. Compose implementations.**

Internet should preferentially own:

```text
Workstream / WorkflowRun continuity
participant identity and authority
multi-round feedback / continuation semantics
artifact lineage and provenance
capability routing contracts
durable interaction / human authority
reconciliation and side-effect correctness
convergence semantics
provider-independent collaboration state
```

Internet should not automatically own:

```text
browser engine
Git implementation
GitHub/GitLab client
generic model API client
sandbox/runtime
search engine
memory/vector database
workflow persistence backend
coding-agent implementation
notification transport
```

A subsystem should be built internally only when existing implementations cannot satisfy a correctness-bearing requirement or when adapting them would create a worse boundary than a small internal implementation.

## 6. Adaptive composition target

The target is replaceability at real ownership/substitution boundaries, not abstraction for its own sake.

Illustrative capability contracts:

```text
ConversationProvider
BrowserRuntime
ReasoningCapability
ResearchCapability
CodeWorkspace
RepositoryHost
ArtifactStore
WorkflowStore
NotificationTransport
```

Illustrative implementations/plugins:

```text
ConversationProvider
  -> ChatGPTWeb
  -> GeminiWeb
  -> API-backed participant
  -> local participant

BrowserRuntime
  -> current Patchright implementation
  -> Browser Use adapter
  -> Stagehand adapter
  -> remote CDP/browser service

CodeWorkspace
  -> local worktree
  -> coding-agent workspace
  -> remote sandbox

RepositoryHost
  -> GitHub
  -> GitLab
  -> Bitbucket
```

These names are conceptual. vNext should avoid introducing interfaces merely to satisfy a plugin aesthetic.

An abstraction is justified when at least one of the following is true:

- multiple real implementations need to be substitutable;
- the dependency is independently owned/lifecycled by the host;
- the boundary carries authority, side effects, or correctness semantics that must be testable independently;
- a credible migration path to a better implementation should exist without changing workflow semantics.

## 7. Plugin composition must preserve correctness

Replaceability must not mean arbitrary duck-typing.

Plugins used by correctness-bearing workflows need explicit contracts for the properties Internet relies on, such as:

```text
capability identity/version
input/output schema
side-effect class
authority requirements
idempotency/reconciliation behavior
cancellation semantics
durability expectations
observability/receipt semantics
failure classification
```

For example, replacing one browser runtime with another is safe only if the provider adapter can still establish the required authentication, conversation identity, completion observation, cancellation, and reconciliation guarantees.

The plugin boundary is therefore:

> replace implementations behind stable semantics, not weaken semantics to accommodate arbitrary implementations.

## 8. Profiles compose capabilities

Profiles should define domain behavior without owning infrastructure implementations.

Examples:

```text
software_change
  repository research
  implementation
  validation
  review
  CI verification
  delivery / merge authority

deep_research
  source acquisition
  evidence extraction
  synthesis
  citation verification
  report generation

monitoring
  observation
  timer/event wait
  condition evaluation
  notification
```

Provider/model/account/browser selection stays below semantic capability selection.

The same research capability could therefore be satisfied by a native web Deep Research adapter today and a different provider or research plugin later without changing the research profile's semantic contract.

## 9. Human-governed, not autonomy-maximal

Internet may continue autonomously wherever authority and evidence permit, but autonomy is not the product goal by itself.

Protected decisions remain explicit. Examples include requirement changes, merge/release/deployment authority, paid access, destructive actions, or other profile-defined gates.

The target relationship is:

```text
AI participants reason
plugins execute within granted authority
Internet owns durable collaboration/correctness state
the user owns reserved decisions
```

## 10. Current implementation gap

The current production plugin already has semantic account identities, durable workflow stores, capability descriptors, profiles, receipts, and recovery logic.

However, browser/provider execution is still more concrete than the target architecture. Production wiring constructs a `BrowserManager` directly and browser-specific team/writer runners consume it. The package also directly depends on its current browser implementation.

Therefore:

```text
current production
  !=
fully replaceable plugin-composed runtime
```

The existing vNext capability-first direction is compatible with the target, but implementation changes should only be promoted when concrete substitution boundaries are proven by code and tests.

## 11. Competitive boundary

External systems already provide strong implementations for individual layers:

- durable graph/checkpoint/HITL runtimes;
- persistent agent identity and memory;
- coding-agent runtimes and workspaces;
- authenticated browser/profile infrastructure;
- adaptive browser automation;
- plugin-based agent harnesses.

Therefore Internet must not position any one of these generic capabilities as its unique value.

The more defensible product boundary is:

> **Persistent, multi-round collaboration across heterogeneous AI identities and plugins, with durable artifacts, explicit authority, and replaceable implementations.**

See [external landscape research](../../research/ORCHESTRATION-LANDSCAPE.md) for current examples.

## 12. Strategic risks

### Provider and UI dependency

Web adapters inherit provider UI changes, authentication behavior, rate limits, product availability, and applicable terms/policies. Web access must therefore remain a provider adapter rather than a kernel assumption.

### Native conversation opacity

Provider-side context may be useful but is not fully observable or versionable. Durable correctness cannot depend on replaying hidden provider state.

### Overbuilding

The largest architecture risk is reproducing mature ecosystem components under Internet-specific names. Every new subsystem should answer:

1. What Internet-specific invariant requires ownership?
2. Can an existing plugin/component satisfy the contract behind an adapter?
3. What is the migration path if a better implementation appears?
4. Is the new boundary used by a real alternative implementation or clearly independently owned subsystem?

### Framework-without-product risk

A highly generic kernel can become technically elegant while solving no user problem. Product work should stay anchored in concrete long-lived use cases such as iterative research and evolving PR collaboration.

## 13. Falsifiability

This thesis should be rejected or narrowed if evidence shows that:

- authenticated/native AI participation provides little value over ordinary API agents;
- existing durable workflow frameworks already provide the required collaboration semantics with only thin configuration;
- multi-round continuity can be handled adequately by the host without an Internet-specific state model;
- replaceable plugin composition adds more complexity than practical adaptability;
- users primarily need one-shot execution rather than continuing workstreams.

The goal is not to justify Internet's existence. The goal is to keep only the smallest architecture that solves a real collaboration problem better than composing existing tools directly.

## 14. Design heuristic

For future vNext work:

```text
If a behavior defines collaboration correctness:
  consider owning the contract.

If a component executes a capability already solved well elsewhere:
  prefer a plugin/adapter.

If the host already owns the lifecycle:
  integrate through the host instead of duplicating it.

If no real substitution or ownership boundary exists:
  do not create an abstraction yet.
```
