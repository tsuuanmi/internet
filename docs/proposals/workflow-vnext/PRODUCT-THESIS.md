# Workflow vNext — Product Thesis and Adaptive Plugin Composition

- **Status:** proposed product/architecture thesis; not current production contract
- **Date:** 2026-09-25
- **Related:** [target architecture](WORKFLOW-VNEXT.md), [end-to-end use cases](WORKFLOW-VNEXT-USE-CASES.md), [external landscape research](../../research/ORCHESTRATION-LANDSCAPE.md), [DSH Agent Teams feasibility](../../research/DSH-AGENT-TEAMS-FEASIBILITY.md)

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
DeepSeek Harness / Cordis
│
├── Internet plugin
│   ├── work continuity
│   ├── website-session participant bindings
│   ├── collaboration state
│   ├── capability routing
│   ├── authority / approvals
│   ├── artifacts / provenance
│   └── recovery / reconciliation semantics
│
├── DSH subagent/session services
├── DSH Agent Teams when their semantics fit
├── browser execution implementation
├── workflow/runtime implementation
└── other infrastructure providers
```

The important replaceability target is **infrastructure used to implement Internet**: browser control, team/subagent coordination, workflow runtime, persistence, and similar execution substrate.

This principle is not primarily about making Jira, MCP, LSP, or every domain tool into an Internet abstraction. Those tools may still be available to agents through the host, but they are orthogonal to the architectural substitution boundary described here.

Internet should not absorb an infrastructure subsystem merely because the workflow needs it.

The preferred dependency direction is:

```text
Internet collaboration semantics
  -> stable host/service or Internet capability contract
  -> selected infrastructure/provider implementation
  -> typed result / receipt / durable binding
```

This allows Internet to improve when DSH or an external project provides a better browser, team, subagent, or runtime implementation without rewriting collaboration semantics.

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

Their value is also not equivalent to ordinary host-side web search. ChatGPT and Gemini can search/research from inside the signed-in product conversation itself. That native path can preserve the same provider conversation context, use provider-native Search/Deep Research behavior, and consume the user's web-product allowance rather than forcing every research step through a separate API-backed `web.search/fetch` call.

The goal is **not zero Local-Agent/API token use**. Local reasoning remains valuable for decomposition, orchestration, critique, policy/authority decisions, and any step where the host model is the better reasoner. The efficiency goal is to allocate expensive context work to the execution surface that handles it best.

In particular, source-heavy work such as browsing many pages, reading long files/diffs, collecting evidence, and provider-native research can often stay inside the website participant so the Local Agent sees only the conclusions, compact evidence references, or selected excerpts it actually needs.

```text
Local Agent
  reason / coordinate / decide what needs inspection
        |
        +-> website participant
              search / browse / read large context / Deep Research
        |
        <- compact result / artifact / evidence reference
  critique / decide / continue
```

A workflow may intentionally use more Local-Agent reasoning when that improves quality. Token efficiency is an optimization objective, not an authority rule or a prohibition on local reasoning.

The default should also avoid duplicate source acquisition. When substantial source/web/file reading can be performed well by the linked website participant, the Local Agent should normally delegate that first-pass reading before ingesting the same corpus itself. Local re-reading remains appropriate for verification, disagreement resolution, implementation-critical details, or other reasoning that benefits from direct inspection.

Therefore:

```text
website-native search / Deep Research
  = first-class capability of the authenticated participant

host web.search / fetch
  = separate optional capability for Local/other agents
```

Internet should not silently downgrade a requested website-native research turn into generic host web search.

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
ChatGPT website participant
Gemini website participant
DSH-hosted agent/subagent
coding-agent integration
local model
human participant
future specialist service
```

The kernel should reason about required capabilities and authority, not provider brands.

A website participant should remain bound to its **native website conversation**. The website participant does not replace the DSH teammate: the local DSH Agent remains the Team member, reasoner, and coordination authority, while its linked website conversation provides native/high-context capabilities. Reusing DSH subagent or Agent-Team infrastructure must preserve that pairing.

A useful target binding is:

```text
DSH local Agent / Team member
  -> Internet participant binding
  -> exact authenticated ChatGPT/Gemini native conversation
```

The local Agent remains the user-facing/team-facing participant. Website output returns to that local Agent and can then flow through DSH Team messages, tasks, or Internet artifacts to the rest of the team. The provider conversation is the high-context/native-capability workspace, not an independent Team authority.

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
team roster/task/mailbox substrate
subagent/session lifecycle substrate
generic workflow scheduler/runtime
workflow persistence backend
generic model/API runtime
sandbox/runtime
other host infrastructure already supplied well by DSH or external projects
```

Domain tools such as Jira, MCP servers, LSP, or arbitrary business integrations are not the main subject of this build-vs-adapt rule. Agents may use those through the host normally; Internet does not need to wrap them merely to claim composability.

A subsystem should be built internally only when existing implementations cannot satisfy a correctness-bearing requirement or when adapting them would create a worse boundary than a small internal implementation.

## 6. Adaptive composition target

The target is replaceability at real infrastructure ownership/substitution boundaries, not abstraction for its own sake.

The most important candidate seams are:

```text
WebsiteSessionAdapter
  owns provider-specific authenticated/native conversation behavior

BrowserBackend
  executes the website adapter's browser interactions

TeamCoordination
  roster / task board / mailbox / peer coordination

HostParticipantLifecycle
  durable child/session identity and continuation where useful

WorkflowRuntime
  scheduling / wakeup / recovery mechanics beneath Internet semantics

WorkflowStore
  durable storage implementation
```

The separation matters:

```text
Internet core
  -> WebsiteSessionAdapter
       -> BrowserBackend

Internet core
  -> TeamCoordination / HostParticipantLifecycle
       -> DSH services when semantics fit

Internet semantic workflow
  -> WorkflowRuntime
       -> native implementation today
       -> replaceable implementation later if proven
```

For ChatGPT/Gemini website participants, the website session adapter owns the stable account/conversation binding and provider-native capabilities such as Search or Deep Research. The browser is below that adapter and should be replaceable without changing participant identity or workflow semantics.

### 6.1 Reuse DSH subagents without turning website sessions into generic subagent providers

`ctx.subagents` is attractive because DSH already owns durable child Session identity, continuations, lifecycle, and messaging.

The preferred model keeps the DSH child Session as the real local participant and links it durably to one native ChatGPT/Gemini conversation:

```text
DSH child Session / local teammate
  <-> Internet participant binding
  <-> native website conversation
```

The local model is not transport overhead. It may perform useful decomposition, critique, coordination, verification, and authority-sensitive reasoning. The efficiency requirement is narrower: avoid making the local model ingest large raw files, source corpora, or full research transcripts before asking the linked website participant to perform the same source-heavy pass.

The website collaborator extends the local teammate; it does not replace it or become a separate Team authority.

### 6.2 Reuse DSH Agent Teams where the execution model fits

DSH Agent Teams already provides a durable roster, task DAG, mailbox, and teammate messaging. Internet should prefer those semantics over rebuilding equivalent infrastructure when they fit.

Current DSH Agent Teams creates teammates as continuable local subagents, which matches the preferred Option A well: the DSH teammate remains the Team member and is linked to a native website conversation through Internet.

The desired direction is:

```text
DSH Agent Teams
  -> authoritative local roster / task board / mailbox
  -> continuable local teammate
       <-> Internet website binding
       <-> native ChatGPT/Gemini conversation
```

This integration is architecturally feasible with current primitives, but it is not yet production-proven. Internet should first validate conversation continuity, crash recovery, request reconciliation, token/context behavior, and output quality before replacing the current team execution path.

### 6.3 DSH browser-use is inspiration, not automatically the website backend

DSH's `ctx.browserUse` seam intentionally registers a provider name but exposes no common browser-operation API; each provider owns its tools/resources.

That is useful architectural evidence that browser infrastructure should stay independently replaceable, but it does not mean Internet can simply call `ctx.browserUse` as a drop-in replacement for `BrowserManager`.

The website adapter requires stronger programmatic guarantees: authenticated account restoration, exact native-conversation binding, provider-mode selection, completion observation, and provider-turn reconciliation. A DSH or external browser backend is reusable only if the website adapter can obtain those guarantees without weakening them.

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
