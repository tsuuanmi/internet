# Proposal — Remote Controller ↔ Local Agent Boundary

- **Status:** proposed architecture direction; not production contract
- **Date:** 2026-09-27
- **Research:** [ChatGPT Work, Codex Remote, and the Controller ↔ Local Agent boundary](../research/CHATGPT-WORK-REMOTE-CONTROLLER.md)
- **Related:** [Workflow vNext product thesis](workflow-vnext/PRODUCT-THESIS.md), [external interaction SRS](workflow-vnext/SRS-VNEXT-INTERACTION.md), [deterministic orchestrator SRS](workflow-vnext/SRS-VNEXT-ORCHESTRATOR.md)

## 1. Motivation

Internet currently treats Local as the user-facing authority broker and uses website participants for native reasoning/research/implementation capabilities.

A useful extension is to let a remote conversational Controller talk to the same Local Agent without requiring the user to open the DSH UI, forward a UI port through SSH, or remain at the machine that hosts the repository and local data.

The intended experience is:

~~~text
user
  <-> Controller conversation
        <-> Local Agent
              -> local environment
              -> Internet tools
              -> workflow
              -> Internet Team
~~~

The Controller is not a replacement for Local.

The Local Agent is not a replacement for Internet Team.

The Workflow Runtime is not a conversational agent.

Each layer exists because it is better suited to a different class of work.

## 2. Role model

### 2.1 Controller — user-facing intelligence

The Controller is optimized for:

- natural user interaction;
- access from web/mobile/desktop;
- brainstorming and high-level reasoning;
- provider-native search/research;
- plugins and connected cloud services;
- preserving the user's conversational context;
- deciding when local execution is actually needed.

A Controller can perform useful work without contacting Local.

Example:

~~~text
user
  -> Controller
       research / discuss / compare / clarify
       only delegate when local execution is useful
~~~

The first implementation may be ChatGPT Chat, but Controller identity must not be hard-coded to ChatGPT.

Future implementations may include Work, Claude, Gemini, or another compatible conversational surface.

### 2.2 Local Agent — environment-aware execution intelligence

The Local Agent is optimized for work that depends on the real environment:

- repository state;
- uncommitted files;
- local datasets;
- private files;
- local databases;
- internal services;
- shell/toolchains;
- OS/hardware-specific behavior;
- local testing and debugging;
- local credentials and workspace-specific tooling;
- DSH services and plugins.

The Local Agent decides **how** to accomplish a local objective using the capabilities currently installed in its environment.

The Controller should normally send intent and constraints, not low-level tool calls.

### 2.3 Internet Team — external reasoning/capability plane

Internet Team is optimized for capabilities that can be expensive or awkward for Local to reproduce:

- source-heavy web research;
- provider-native Deep Research;
- large-context reading;
- specialist reasoning;
- independent critique/review;
- native website capabilities;
- provider/plugin integrations.

The Local Agent remains free to reason itself when that is useful.

The objective is not zero local token usage. The objective is to avoid forcing Local to perform expensive duplicate acquisition or reasoning when a website participant handles it better.

### 2.4 Workflow Runtime — durable deterministic coordination

Workflow owns:

- durable state;
- scheduling;
- typed artifacts;
- exact-input bindings;
- retries/fencing;
- PendingActions;
- authority gates;
- reconciliation;
- convergence.

Workflow correctness must not depend on Controller connectivity, Local Agent hidden reasoning, or one provider conversation remaining alive.

## 3. Why this separation is useful

### 3.1 Local can technically do everything, but should not have to

A sufficiently capable Local Agent can converse, research, inspect files, run tests, implement, review, and orchestrate.

The architecture exists because doing everything locally may impose unnecessary costs:

- poorer remote UX;
- dependence on the local DSH UI;
- more Local-model token/context usage;
- duplicated source acquisition;
- weaker access to provider-native research;
- duplicated integrations for cloud services already available natively elsewhere.

Therefore:

> Local capability is the fallback, not the requirement that every task stay local.

### 3.2 Controller can also become more capable without invalidating Local

ChatGPT Work and Codex Remote already demonstrate that hosted conversational products can control local execution environments.

That does not require Internet to remove the Local boundary.

Controller capabilities may grow over time, but Local remains useful as the environment-aware execution and DSH-composition boundary.

The architecture should not change every time one provider adds or removes a product feature.

### 3.3 The layers remain replaceable

Conceptually:

~~~text
Controller interface
  -> ChatGPT Chat today
  -> Work / Claude / Gemini / other tomorrow

Local Agent interface
  -> DSH Agent today
  -> another local agent tomorrow

Internet capability interface
  -> ChatGPT / Gemini website participants today
  -> Claude / Grok / other providers tomorrow

Workflow contracts
  -> deterministic Internet runtime
  -> replaceable execution substrate where semantics remain equivalent
~~~

No individual provider, model, UI, or local-agent product is architectural authority.

### 3.4 Internet Team + Workflow are agnostic Local capabilities

The most important portability boundary is not the remote UI. It is the capability layer available to Local Agents.

Internet Team and Workflow should be consumable as agnostic plugin/service capabilities by any compatible Local Agent host.

Conceptually:

~~~text
Local Agent
  -> Internet Team capability
  -> Workflow capability
~~~

Possible Local hosts include:

~~~text
DSH Agent
Codex
Claude Code
another MCP/plugin-capable local agent
future custom runtime
~~~

The plugin contract must not assume that the caller is DSH, Codex, Claude, or any other specific agent.

Likewise, the Local Agent must not need to know whether an Internet capability is currently implemented through ChatGPT, Gemini, Claude, Grok, or another website/provider participant.

This creates two independent substitution axes:

~~~text
Controller
  -> replaceable

Local Agent host
  -> replaceable

Internet capability providers
  -> replaceable

Workflow semantics
  -> durable / provider-independent
~~~

A useful current composition may therefore be:

~~~text
Codex Remote
  -> Local Codex
       -> Internet Team plugin
       -> Workflow plugin
~~~

without making Codex Remote or Local Codex the architecture.

The same capabilities should remain usable from:

~~~text
ChatGPT Controller
  -> DSH Local Agent
       -> Internet Team
       -> Workflow
~~~

or another compatible Controller/Local pair.

DSH is currently attractive as the default Local host because it is itself plugin-oriented, can compose multiple models/providers, and does not make one model vendor the architectural center. That preference is an implementation/product choice, not a correctness dependency.

## 4. Controller is outside Internet Team

The Controller is not an Internet Team member.

The Local Agent is also not automatically an Internet Team member merely because it can call Internet tools.

A clean topology is:

~~~text
Controller
    |
    v
Local Agent
    |
    +-> Internet Team
    |     +-> Member 1
    |     +-> Member 2
    |     +-> Reviewer
    |     +-> Writer
    |
    +-> local environment
    |
    +-> Workflow Runtime
~~~

This means a ChatGPT Controller may legitimately ask Local to invoke Internet Team, whose participants may themselves include ChatGPT website conversations.

There is no logical recursion as long as Controller identity and worker conversation identity are distinct.

## 5. MCP should expose the Local Agent boundary, not Internet internals

The remote MCP surface should stay intentionally small.

It should **not** make the following remote architectural primitives:

- internet_chat;
- internet_research;
- internet_team;
- workflow_start/status/continue;
- raw Git;
- raw shell;
- arbitrary file read/write.

Those are Local capabilities.

The Controller should know at the behavioral level that Local can use them, but should not depend on their concrete schemas.

Preferred boundary:

~~~text
Controller
  -> high-level request
  -> Local Agent
       chooses current local tools/capabilities
~~~

This keeps the Controller decoupled from Internet and DSH implementation details.

## 6. Minimal Controller ↔ Local Agent protocol

The first protocol should be smaller than a generic remote workspace API.

Conceptual primitives:

~~~text
agent_attach
agent_turn
agent_poll / event stream
agent_respond
agent_interrupt
~~~

These names are illustrative, not committed API names.

### 6.1 attach

Binds the Controller conversation/client to a durable Local Session context.

The Local Session may include:

- stable session identity;
- selected workspace;
- cwd/environment reference;
- active local task;
- active workflow references;
- pending interactions;
- event cursor.

Binding should target a durable Local Session, not a process ID.

Agent processes may restart or be replaced while the session remains meaningful.

### 6.2 turn

Sends a high-level objective or follow-up instruction to Local.

Example:

~~~text
Review PR #72 against the current repository.
Run appropriate local validation.
Do not merge until explicit user approval.
~~~

Local decides whether to:

- inspect files;
- create a worktree;
- run tests;
- call Internet Team;
- start a workflow;
- query GitHub;
- ask the Controller for clarification.

### 6.3 poll / event stream

Projects semantic Local Agent state rather than every low-level tool call.

Suggested event classes:

~~~text
STARTED
PROGRESS
DELEGATED
ACTION_REQUIRED
COMPLETED
FAILED
~~~

Examples:

~~~text
PROGRESS
Checked out PR #72 at exact head abc123 and running canonical validation.

DELEGATED
Started Internet review team for architecture review.

ACTION_REQUIRED
Merge authorization is required for PR #72 at head abc123.
~~~

### 6.4 respond

Returns an answer to an exact Local/Workflow interaction.

Where authority matters, the response must preserve provenance and exact-state binding.

This should compose with existing Workflow vNext concepts such as:

- USER_AUTHORITY;
- LOCAL_AGENT_INPUT;
- USER_OR_LOCAL;
- exact subject/head/version;
- action revision;
- idempotent response identity.

Controller is a transport/presentation layer for user authority, not a way to weaken Workflow policy.

### 6.5 interrupt

Optional control for cancelling or steering an active Local conversational turn.

It must not silently cancel an independently durable workflow unless the user explicitly requests the workflow operation.

## 7. Conversation binding

A Controller conversation should be able to bind to one durable Local Session/Agent context.

Conceptually:

~~~text
Controller conversation C1
        |
        v
Remote binding B1
        |
        v
Local Session L1
        |
        +-> workspace
        +-> active task
        +-> workflow references
        +-> pending interactions
~~~

The useful property is continuity.

The user can say:

- continue;
- what is the current status?;
- run the local test now;
- ask the team to review this;
- apply the latest feedback.

without restating the entire local context.

However, the Local Session is not the Workflow.

One Local Session may interact with multiple workflows, and durable workflows must survive the loss of the Controller or Local Agent process.

## 8. Selective context transfer

The bridge should not copy the full Controller transcript into Local on every turn.

The Controller should normally provide only task-relevant context:

- current objective;
- constraints;
- decisions already made;
- selected evidence/references;
- relevant attachments;
- explicit user authority.

Example:

~~~text
Objective:
Evaluate the proposed Controller ↔ Local Agent bridge.

Constraints:
- MCP only connects Controller and Local Agent.
- Internet/workflow tools remain local.
- Controller is outside Internet Team.
- Local remains the environment-aware operator.
- durable workflow must not depend on either chat remaining connected.
~~~

This keeps Local context bounded and avoids paying twice for large conversational histories.

## 9. Bidirectional interaction is required

The bridge must support Local → Controller communication.

Typical flow:

~~~text
Controller
  -> Local Agent
       -> executes
       -> discovers ambiguity
       -> ACTION_REQUIRED
  <- Controller
       -> asks user
       -> exact response
  -> Local Agent
~~~

A one-way prompt proxy would not provide enough value for durable workflows, approvals, or environment-driven clarification.

## 10. Local PR validation belongs below the bridge

A concrete high-value Local capability is exact-head PR validation.

Example:

~~~text
Controller:
Test PR #72 locally.

Local Agent:
  -> fetch exact PR head
  -> isolated worktree where appropriate
  -> repository-owned validation
  -> optional app/runtime scenario
  -> collect result bound to exact head
~~~

A validation result should bind at least:

~~~text
repository
PR
head SHA
validation profile
environment identity/version where relevant
result
~~~

If the head changes, the old validation cannot satisfy the new head.

This follows the same exact-head correctness principle already used elsewhere in Internet.

The Controller does not need a remote shell tool to request this.

## 11. Relationship to ChatGPT Work and Codex Remote

Research shows that OpenAI already provides mature functionality overlapping this proposal.

Codex Remote already supports a strong remote local-coding control plane with host/workspace/worktree selection, approvals, diffs, tests, plugins, and mobile steering. It should therefore be treated as a first-class optional composition, not as the definition of Internet's remote architecture.

ChatGPT Work already provides long-running cloud/mobile/desktop work and desktop-local file/app access.

Therefore Internet must **not** build a competing generic remote coding product.

The proposal is justified only where the smaller composition boundary provides differentiated value.

Candidate differentiation:

- use regular Chat as Controller rather than requiring an agentic Work/Codex session for every conversation;
- retain DSH Local Agent as execution/orchestration owner;
- keep Internet Team and custom durable workflow local;
- allow non-OpenAI Controllers;
- allow non-Codex Local Agents;
- preserve one local workflow across different clients over time;
- access local datasets/services that belong to an existing DSH environment;
- selectively delegate source-heavy work to website participants rather than making the local coding agent absorb it all.

A valid deployment may therefore use Codex Remote as the Controller surface and Local Codex as the Local Agent while Internet Team and Workflow remain external agnostic capabilities.

However, if Internet-specific differences do not produce measurable value for actual tasks, prefer Work/Codex Remote and do not implement a duplicate bridge.

## 11.1 Canonical agnostic capability surface

Research now recommends that Internet standardize the semantic capability layer underneath the current DSH tool definitions rather than exporting those definitions directly.

A deliberately small portable first surface is:

~~~text
research
consult
workflow_start
workflow_list
workflow_get
workflow_respond
workflow_signal
workflow_cancel
artifact_read
~~~

The design rules are:

- user-goal tools rather than internal API mirrors;
- provider/account/team-topology routing stays server-side;
- workflow admission/activation internals stay behind workflow_start;
- unsolicited workflow steering stays separate from resolving a persisted PendingAction;
- USER_AUTHORITY provenance cannot be self-asserted by model input;
- large research/team output stays in durable artifacts with compact projections;
- DSH may call the capability services directly in-process;
- Codex/Claude/other hosts may call the same services through MCP;
- modern MCP Tasks/input-required/Apps/Resources are progressive projections, not authoritative Internet state.

MCP Tasks are especially promising for asynchronous interoperability because their durable task handle, polling, cancellation, and input-required lifecycle map naturally to long-running research and Workflow. Internet Workflow remains the source of truth; MCP Task state is only an adapter projection.

See [agnostic capability surface research](../research/AGNOSTIC-CAPABILITY-SURFACE.md).

## 12. Transport should be replaceable

The protocol should not depend on one transport.

Possible transports include:

- Secure MCP Tunnel;
- direct HTTPS MCP where appropriate;
- another authenticated outbound relay;
- a future host-native transport.

Transport responsibilities:

~~~text
reachability
authentication
encryption
request/response delivery
streaming/event delivery
~~~

Transport must not own:

~~~text
workflow transitions
Internet Team routing
Local tool semantics
authority policy
workspace correctness
~~~

Secure MCP Tunnel is a strong initial candidate because it already supports private MCP servers without public inbound exposure.

## 13. Graceful degradation

The architecture should remain useful when one layer is unavailable.

~~~text
Controller unavailable
  -> use Local directly

Internet Team unavailable
  -> Local may research/reason itself

Local unavailable
  -> Controller can still research/discuss/plan

one website provider unavailable
  -> another registered capability may be used when policy allows

remote bridge unavailable
  -> DSH local UI/CLI remains authoritative
~~~

Remote access is an additional entry point, not a new single point of failure.

## 14. Build/adapt rule for this proposal

Before adding a component, ask:

1. Is this already solved adequately by Work/Codex Remote, plugins, Secure MCP Tunnel, DSH, or another host component?
2. Does Internet need to own the semantic contract, or only adapt an implementation?
3. Would the proposed abstraction still make sense with a different Controller?
4. Would it still make sense with a different Local Agent?
5. Does it preserve existing Workflow authority and durability?
6. Does it reduce real friction/token/context cost on a recurring task?

If the answer is mainly "this would be convenient to have our own version", do not build it.

## 15. Implementation admission criteria

This proposal should remain docs/research until a small experiment demonstrates a concrete gap versus existing products.

At minimum, compare:

~~~text
Baseline:
Codex Remote or ChatGPT Work

Candidate:
regular Chat Controller
  -> Controller/Local bridge
  -> DSH Local Agent
  -> local tools + Internet Team + Workflow
~~~

Measure:

- remote/user friction;
- token/credit usage;
- task completion quality;
- local validation quality;
- research quality;
- duplicate context/source acquisition;
- disconnect/restart recovery;
- provider/controller replaceability;
- implementation and maintenance complexity.

Only then should a production MCP bridge be implemented.

## 16. Non-goals

This proposal does not:

- replace DSH UI or CLI;
- replace Codex Remote;
- create a generic remote desktop;
- expose raw shell/filesystem as the primary remote API;
- move Internet Team tools into MCP;
- move Workflow APIs into the remote Controller;
- make Controller a Workflow state machine;
- make Local Agent a durable Workflow state machine;
- make one model/provider mandatory;
- require Local Agent to stay connected for a durable workflow;
- claim that regular Chat is always cheaper than Work/Codex.

## 17. Design principles

The current discussion can be summarized as:

> **Controller is optimized for access and human interaction.**

> **Local Agent is optimized for environment-aware execution.**

> **Internet Team is optimized for external reasoning, research, and provider-native capabilities.**

> **Workflow Runtime is optimized for durable deterministic coordination and authority.**

> **Local can do everything; the architecture exists so Local does not have to do everything.**

> **Do not rebuild a mature product surface when a small compositional boundary is sufficient.**
