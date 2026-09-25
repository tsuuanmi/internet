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

Authenticated web products can expose value that differs from ordinary stateless API calls:

- provider-native products such as Deep Research or UI-only modes;
- subscription usage already available to the user;
- persistent native conversations;
- long-lived specialist context across repeated rounds;
- direct access to future provider-native capabilities without requiring Internet to reproduce them.

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
| Participant identity + authority | Build/own contract | Required for cross-provider/human governance |
| Artifact lineage/provenance | Build/own contract | Correctness-bearing cross-plugin state |
| Feedback/continuation semantics | Build/own contract | Required for multi-round work |
| Side-effect reconciliation requirements | Build/own contract | Correctness boundary |
| Capability routing contract | Build/own contract | Enables adaptive composition |
| Browser engine | Adapt/plugin | Mature external ecosystem |
| Git/GitHub implementation | Adapt/plugin | Commodity integration layer |
| Coding agent | Adapt/plugin | Strong dedicated systems exist |
| Model/API client | Adapt/plugin | Provider-specific commodity layer |
| Search/research engine | Adapt/plugin | Multiple existing implementations |
| Memory/vector database | Adapt/plugin unless required | Mature external systems |
| Storage backend | Adapter boundary | Implementation should remain replaceable |
| Notifications | Adapt/plugin | Host/ecosystem concern |
| Generic plugin lifecycle | Host responsibility | Internet is itself a plugin |

This table is a design default, not a rule that forbids a small internal implementation.

An internal implementation is justified when it is the smallest way to satisfy a concrete Internet-specific invariant and remains behind a replaceable contract where substitution is valuable.

## 7. Current repository fit

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

## 8. Tests for whether a plugin boundary is real

A boundary is meaningfully adaptive when:

1. Internet's semantic workflow does not import implementation-specific types across the boundary.
2. At least two implementations could plausibly satisfy the same contract.
3. Capability version and input/output contracts are explicit.
4. Authority, side-effect, retry, cancellation, and reconciliation semantics are defined where relevant.
5. Swapping the implementation does not require rewriting profile semantics.
6. Tests can validate the contract independently of one implementation.
7. Failure classification is stable enough for the orchestrator to react deterministically.

A boundary that merely wraps one concrete class without independent lifecycle or substitution value is not automatically useful.

## 9. Strategic risks

### Provider policy and product dependency

Authenticated web automation depends on provider UI, authentication behavior, usage limits, product availability, and applicable terms/policies.

This increases the importance of provider replaceability.

### Framework duplication

Internet can lose focus by rebuilding durable workflow, browser, agent, memory, search, Git, and sandbox infrastructure already available elsewhere.

### Over-generalization

A domain-agnostic kernel is useful only when grounded in concrete workflows. Software collaboration and deep research should remain the primary proving grounds until another domain creates a real need.

### Abstraction without substitution

Plugin interfaces created before there is a real ownership or replacement boundary can add coupling rather than reduce it.

## 10. Decision heuristic

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

## 11. Research conclusion

There is a plausible reason for Internet to exist, but not as a general agent framework.

The strongest product thesis is:

> **Internet is a plugin that keeps heterogeneous AI participants and tools collaborating on the same evolving work across multiple rounds, while durable artifacts and human authority remain independent of any one provider or implementation.**

The architecture should become more valuable as the surrounding ecosystem improves. Better browser runtimes, coding agents, search systems, storage backends, or repository tools should be composable into Internet rather than forcing Internet to compete with them.
