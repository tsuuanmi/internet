# Orchestration Landscape — Build vs Adapt Research

- **Status:** exploratory research; not production authority
- **Date:** 2026-09-25
- **Purpose:** test whether Internet should exist as a distinct tool and identify which layers should be built, adapted, or delegated to the plugin ecosystem

## 1. Question

Internet should not be justified by novelty alone.

The useful questions are:

1. What user problems does Internet solve that are not already solved well by existing tools?
2. Which parts already have strong external implementations?
3. What remains meaningfully different in Internet's intended composition?
4. Which implementation layers should remain replaceable plugins/adapters rather than becoming Internet-owned infrastructure?

## 2. External landscape

Several mature or fast-moving projects already cover important parts of the problem space.

### Durable workflow orchestration

LangGraph and similar durable workflow systems already provide strong primitives for checkpointing, persistence, pause/resume, human-in-the-loop execution, and recoverable graph execution.

Implication:

> Durability, DAG execution, and checkpointing alone are not sufficient reasons for Internet to own a new general workflow engine.

Internet should own only the workflow semantics that are specific to its collaboration/correctness model, or adapt an external runtime when that runtime can satisfy the required contracts.

### Persistent agent identity and memory

Systems such as Letta focus on persistent agent identity, long-term memory, and continuity across conversations.

Implication:

> Persistent memory alone is not Internet's unique value.

Internet's stronger candidate boundary is persistent **multi-party work continuity**: several AI identities, humans, external tools, artifacts, and repeated rounds around the same evolving objective.

### Coding-agent runtimes

OpenHands and other coding agents provide repository workspaces, code modification, execution, GitHub integration, review/automation, skills, and extensibility.

Implication:

> Internet should not try to become the best coding agent runtime.

A coding agent can instead satisfy an implementation capability behind a stable contract.

### Browser automation and authenticated browser infrastructure

Browser Use, Stagehand, Playwright/Patchright ecosystems, and browser services already address browser control, profiles, adaptive interaction, and remote browser execution.

Implication:

> Browser control is an execution layer, not Internet's product identity.

Internet's current Patchright-based browser implementation should be replaceable when another browser/runtime can satisfy the same provider and reconciliation guarantees.

### Plugin-based harnesses

DeepSeek Harness demonstrates a useful architectural principle: generic platform concerns can remain in the host while plugins contribute tools, services, agents, UI, and other capabilities.

Implication:

> Internet should remain a plugin and compose other plugins where possible, instead of expanding into a standalone all-owning platform.

## 3. Candidate differentiation

No individual capability below is unique:

```text
multi-agent reasoning
durable workflows
browser automation
persistent memory
coding agents
human approvals
GitHub integration
```

The candidate differentiation is their composition around **long-lived evolving work**:

```text
persistent AI identities
+ real authenticated/native provider capabilities
+ multiple rounds over time
+ heterogeneous plugin/tool execution
+ durable artifact lineage
+ explicit authority and human decisions
+ provider/tool replaceability
```

A useful description is:

> Internet is a durable collaboration plugin for persistent AI identities, humans, and replaceable tools.

## 4. Why authenticated web accounts are useful

Authenticated web products can expose value that differs materially from ordinary stateless API calls:

- provider-native products such as ChatGPT Search/Deep Research and Gemini Deep Research;
- web-product subscription/usage allowance already available to the user;
- persistent native conversations;
- long-lived specialist context across repeated rounds;
- provider-native browsing/search performed inside the same conversation;
- direct access to future provider-native capabilities without requiring Internet to reproduce them.

This distinction is central to Internet's product motivation.

Routing research through a host `web.search/fetch` service may still require a separate API-model reasoning path and does not preserve the same native website conversation. It is therefore an optional complementary capability, **not a semantic substitute** for a requested website-native research turn.

```text
ChatGPT/Gemini native conversation
  -> native Search / Deep Research
  -> same provider-side thread/context
  -> provider product usage limits

host web.search / fetch
  -> separate host-side search/fetch capability
  -> useful for Local/other agents
  -> not an automatic downgrade path
```

This does not mean website usage is free or unlimited; it remains subject to provider plan limits and product behavior. The architectural point is that Internet should preserve native product capabilities when those are the reason the participant was selected.

However, these properties are opportunistic capabilities, not correctness guarantees.

The architecture must assume that provider conversations can change, compact, disappear, or become inaccessible.

Therefore:

```text
native conversation = working context
durable Internet artifacts/state = authoritative context
```

## 5. Why multi-round continuity matters

A one-shot execution model is insufficient for many real tasks.

### Software work

```text
research
-> PR implementation
-> review
-> user/local test
-> new evidence
-> research again
-> same PR update
-> fresh review
-> user decides merge / continue / abandon
```

### Research work

```text
initial question
-> broad research
-> contradiction/coverage analysis
-> targeted follow-up
-> revised synthesis
-> user changes scope
-> continuation with explicit lineage
```

The important object is not only an execution run. It is the longer-lived work context linking repeated runs/rounds and their artifacts.

## 6. Build-vs-adapt matrix

| Layer | Default stance | Reason |
|---|---|---|
| Collaboration/workstream semantics | Build/own contract | Candidate Internet-specific value |
| Website participant/session binding | Build/own provider contract | Core value: stable authenticated native conversation identity |
| Participant identity + authority | Build/own contract | Required for cross-provider/human governance |
| Artifact lineage/provenance | Build/own contract | Correctness-bearing cross-plugin state |
| Feedback/continuation semantics | Build/own contract | Required for multi-round work |
| Side-effect reconciliation requirements | Build/own contract | Correctness boundary |
| Capability routing contract | Build/own contract | Enables adaptive composition |
| Browser engine/backend | Adapt/plugin | Infrastructure implementation; current Patchright should not be permanent architecture |
| Team roster/task/mailbox substrate | Prefer DSH Agent Teams if semantics fit | DSH already has durable team coordination |
| Subagent/session lifecycle | Prefer DSH `ctx.subagents` where it can link cleanly to website sessions | Avoid duplicate durable child lifecycle |
| Workflow scheduler/runtime | Build only missing semantics; keep replaceable | DSH/external runtimes may eventually satisfy mechanics |
| Storage backend | Adapter boundary | Implementation should remain replaceable |
| Generic plugin lifecycle/service discovery | Host responsibility | Internet is itself a Cordis plugin |
| Jira/MCP/LSP/domain tools | Outside this substitution discussion | Agents may consume them normally; Internet need not wrap them |

This table is a design default, not a rule that forbids a small internal implementation.

An internal implementation is justified when it is the smallest way to satisfy a concrete Internet-specific invariant and remains behind a replaceable contract where substitution is valuable.

## 7. DeepSeek Harness reuse findings

DSH already contains several infrastructure seams that Internet should try to reuse before maintaining parallel implementations.

### 7.1 `ctx.subagents` is promising, but website participants should not become generic subagent providers

DSH continuable subagents provide durable child Session identity, cold resume, FIFO message delivery, cancellation, and provider-neutral child lifecycle.

That is useful infrastructure.

However, the target Internet participant is still an authenticated ChatGPT/Gemini **website session**. The native conversation should remain the actual reasoning workspace because that is where provider-native Search, Deep Research, long context, and website actions live.

Therefore the target is **not**:

```text
ChatGPT Web = generic DSH subagent provider
```

The preferred binding is:

```text
DSH durable child/team identity
  <-> Internet participant binding
  <-> native ChatGPT/Gemini conversation
```

The DSH child is a real local reasoning/controller participant, not a relay that should be eliminated. Local/API token use is expected where it adds decomposition, critique, coordination, verification, or decision quality. The optimization target is avoiding duplicated source-heavy context work: the linked website conversation should normally perform the first broad search/read pass when it can do that well, and the Local Agent should inspect raw material selectively when useful.

### 7.2 DSH Agent Teams is the preferred local-team substrate to prototype

DSH Agent Teams already owns:

```text
durable roster
shared task DAG
durable mailbox
teammate identity
continuable teammate lifecycle
```

These semantics align well with the preferred Option A because the Team member remains a real DSH Agent. Internet adds a durable 1:1 binding from that local teammate to its native website conversation.

```text
DSH teammate
  -> local reasoning / Team authority
  <-> Internet website binding
  <-> native ChatGPT/Gemini conversation
```

The website conversation does not need direct Team membership. Its output returns to the owning local teammate, which then shares compact conclusions or artifact references through the local Team.

The remaining questions are implementation-quality questions rather than a fundamental identity mismatch: continuity across cold resume/restart, workflow-grade website-turn request identity, compact result projection, token/context allocation, and whether per-teammate composition controls are worth an upstream DSH extension.

### 7.3 DSH browser-use confirms replaceability, but is not a drop-in API

DSH `ctx.browserUse` is intentionally a provider-registration seam with no common browser-operation methods. Providers own their own tools/resources.

This supports the architectural principle that browser infrastructure can be swapped, but Internet's website adapters need programmatic guarantees beyond generic browser-use registration:

```text
authenticated account restore
exact native conversation binding
provider mode selection
stable completion observation
turn reconciliation
failure classification
```

A DSH or external browser implementation is reusable only if the ChatGPT/Gemini website adapter can preserve those guarantees.

### 7.4 Reuse host plugins first, then external projects

The priority order should be:

```text
1. existing DSH/Cordis capability that satisfies the semantics
2. small adapter around another DSH plugin
3. adapter around a strong external project
4. Internet-owned implementation only when required
```

This keeps Internet small and lets it benefit from improvements in DSH and the broader ecosystem.

### 7.5 "Tool" is overloaded

In this research, "replaceable tools/plugins" mainly means **implementation infrastructure used by Internet itself**:

```text
browser
team coordination
subagent/session lifecycle
workflow runtime
persistence
```

It does not primarily mean Jira, LSP, MCP servers, or arbitrary application tools. Those may remain normal tools available to agents through DSH.

## 8. Current repository fit

The repository already contains several elements aligned with this direction:

- semantic account identity rather than only provider identity;
- capability descriptors and a capability registry;
- workflow profiles;
- durable typed artifacts/receipts and exact-input execution concepts;
- vNext design language that places provider/model/account/session routing below semantic capability selection;
- Workstream versus WorkflowRun distinction in the proposed use cases.

The main architectural tension is that current production execution still wires a concrete `BrowserManager` directly into browser-specific team and writer runners.

This is acceptable as current implementation reality, but it is not yet proof of adaptive plugin composition.

The target should be reached incrementally by proving real substitution boundaries rather than introducing speculative interfaces.

## 9. Tests for whether a plugin boundary is real

A boundary is meaningfully adaptive when:

1. Internet's semantic workflow does not import implementation-specific types across the boundary.
2. At least two implementations could plausibly satisfy the same contract.
3. Capability version and input/output contracts are explicit.
4. Authority, side-effect, retry, cancellation, and reconciliation semantics are defined where relevant.
5. Swapping the implementation does not require rewriting profile semantics.
6. Tests can validate the contract independently of one implementation.
7. Failure classification is stable enough for the orchestrator to react deterministically.

A boundary that merely wraps one concrete class without independent lifecycle or substitution value is not automatically useful.

## 10. Strategic risks

### Provider policy and product dependency

Authenticated web automation depends on provider UI, authentication behavior, usage limits, product availability, and applicable terms/policies.

This increases the importance of provider replaceability.

### Framework duplication

Internet can lose focus by rebuilding durable workflow, browser, agent, memory, search, Git, and sandbox infrastructure already available elsewhere.

### Over-generalization

A domain-agnostic kernel is useful only when grounded in concrete workflows. Software collaboration and deep research should remain the primary proving grounds until another domain creates a real need.

### Abstraction without substitution

Plugin interfaces created before there is a real ownership or replacement boundary can add coupling rather than reduce it.

## 11. Decision heuristic

For each new subsystem:

```text
Does this define Internet's collaboration semantics?
  yes -> Internet should probably own the contract.

Is this an execution capability already solved well elsewhere?
  yes -> prefer plugin/adapter.

Does the host already own discovery/lifecycle?
  yes -> use the host boundary.

Does correctness require stronger semantics than available externally?
  yes -> define the required contract, then decide build vs adapt.

Is there no concrete alternative or independent lifecycle?
  yes -> avoid speculative abstraction.
```

## 12. Research conclusion

There is a plausible reason for Internet to exist, but not as a general agent framework.

The strongest product thesis is:

> **Internet is a plugin that keeps heterogeneous AI participants and tools collaborating on the same evolving work across multiple rounds, while durable artifacts and human authority remain independent of any one provider or implementation.**

The architecture should become more valuable as the surrounding ecosystem improves. Better DSH team/subagent infrastructure, browser backends, workflow runtimes, persistence layers, or external execution components should be composable into Internet rather than forcing Internet to compete with them.

At the same time, provider-native website Search/Deep Research should remain first-class website-participant behavior rather than being normalized away into generic host web search.

## 13. Primary references

- [DeepSeek Harness architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md) — plugin/service composition and replaceability.
- [DeepSeek Harness subagents](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md) — named providers, durable continuable child Sessions, cold resume, and messaging.
- [DeepSeek Harness Agent Teams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md) — durable roster, task DAG, mailbox, and continuable teammate model.
- [DeepSeek Harness browser-use](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/browser-use.md) — provider-registration browser seam with provider-owned tools/resources.
- [OpenAI ChatGPT Search and Deep Research](https://openai.com/academy/search-and-deep-research/) — native web search and research inside ChatGPT conversations.
- [OpenAI Deep Research Help](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt) — in-product public-web research, citations, and provider-managed usage.
- [Gemini Deep Research Help](https://support.google.com/gemini/answer/15719111?hl=en) — in-product Deep Research using Google Search and other signed-in sources by default.
- [LangGraph persistence](https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/persistence.mdx) — checkpointed graph state, conversation continuity, HITL, and fault tolerance.
- [LangGraph checkpoint interface](https://github.com/langchain-ai/langgraph/blob/main/libs/checkpoint/README.md) — replaceable persistence interface for durable graph execution.
- [Letta](https://github.com/letta-ai/letta) — stateful agents with durable memory, identity, and conversations.
- [OpenHands](https://github.com/OpenHands/OpenHands) — coding-agent runtime and software-engineering execution ecosystem.
- [Browser Use](https://github.com/browser-use/browser-use) — browser-agent/runtime ecosystem and authenticated browser use cases.
- [Stagehand](https://github.com/browserbase/stagehand) — Playwright-compatible adaptive browser automation.

These references demonstrate that many execution layers already have dedicated ecosystems. They do not establish that Internet's proposed composition is unique; that claim should continue to be tested against new systems as they appear.
