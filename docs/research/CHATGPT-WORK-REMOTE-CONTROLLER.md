# Research — ChatGPT Work, Codex Remote, and the Controller ↔ Local Agent Boundary

- **Status:** exploratory evidence; not production authority
- **Date:** 2026-09-27
- **Related proposal:** [Remote Controller ↔ Local Agent](../proposals/REMOTE-CONTROLLER-LOCAL-AGENT.md)
- **Related thesis:** [Workflow vNext product thesis](../proposals/workflow-vnext/PRODUCT-THESIS.md)

## 1. Research question

Internet is considering a remote interaction model where a user-facing AI conversation acts as a Controller and delegates environment-aware execution to a Local Agent.

Before building that surface, the important question is:

> Which parts are already solved well by ChatGPT Work, Codex Remote, plugins, and Secure MCP Tunnel, and which parts are still specific to Internet/DSH?

The goal is to avoid reproducing a mature remote coding product merely because a similar interaction loop is useful.

## 2. Current OpenAI product capabilities

### 2.1 Chat, Work, and Codex are distinct surfaces

OpenAI currently documents three different interaction modes:

- **Chat** for questions, search, brainstorming, and conversational help;
- **Work** for longer research/analysis/artifact workflows;
- **Codex** for software development with repositories, tests, commands, and developer tools.

Source:

- https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex

This distinction matters architecturally. A design that assumes every ChatGPT conversation is a coding-agent session would couple Internet to one product surface.

### 2.2 Work is broadly remote, but local execution is desktop-specific

OpenAI documents that:

- Work is available on supported web, mobile, and desktop surfaces;
- cloud Work conversations sync across web, mobile, and desktop;
- desktop Work may use local files and desktop apps when permissions allow;
- Work on web and mobile does not directly access files on the user's computer.

Source:

- https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex
- https://openai.com/index/chatgpt-for-your-most-ambitious-work/

This already solves much of the "work from anywhere" experience for cloud tasks and desktop-local Work sessions, but it does not make an ordinary Chat conversation a generic remote protocol for an arbitrary Local Agent.

### 2.3 Codex Remote already implements a strong remote local-coding control plane

OpenAI's current Codex Remote guidance is especially relevant.

The documented mental model is effectively:

~~~text
phone = control plane
development host = execution plane
~~~

The code still runs on the connected Mac, Windows machine, devbox, or another connected host while the mobile app controls the work.

Remote can select:

- host;
- repository/workspace;
- branch;
- fresh worktree;
- environment setup.

It also exposes:

- command/file/network/tool approvals;
- changed-file summaries and full diffs;
- inline review comments;
- test and terminal results;
- queued or steering prompts;
- durable goals;
- side chats;
- skills and plugins;
- multiple connected hosts.

Sources:

- https://learn.chatgpt.com/docs/remote
- https://developers.openai.com/blog/mastering-codex-remote-for-engineering

This overlaps heavily with any proposal to build a new "remote coding UI" for Internet.

### 2.4 Plugins already provide a cloud capability ecosystem

OpenAI plugins can package skills, connected apps, and other reusable capabilities. Connected apps can expose external data and actions through ChatGPT or Codex subject to plan, workspace, and provider permissions.

Examples include external services such as Google Drive, Slack, and other connected systems.

Source:

- https://help.openai.com/en/articles/20001256-plugins-in-chatgpt-and-codex

This reinforces a useful Internet design assumption:

> Cloud/product-native integrations should not automatically be reimplemented as Local Agent integrations.

A Controller or website participant may be better placed to use provider-native or plugin-native capabilities and return only the result needed by Local.

### 2.5 Secure MCP Tunnel already solves private reachability

OpenAI's Secure MCP Tunnel connects a private MCP server to supported OpenAI products without requiring a public inbound listener.

The documented model is:

~~~text
private MCP server
  <- local reachability ->
tunnel-client
  -> outbound HTTPS ->
OpenAI-hosted tunnel endpoint
  <- MCP requests from supported OpenAI products
~~~

The private side initiates the connection. The MCP server can remain behind the existing firewall/network boundary.

Sources:

- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://developers.openai.com/blog/connect-private-mcp-servers-to-openai-products

Therefore Internet should not invent its own tunnel protocol unless a concrete requirement cannot be satisfied through an existing transport.

## 3. Usage and token implications

OpenAI documents Work and Codex as agentic surfaces with their own usage structure. On supported plans they may share an agentic allowance and can use token-based credit accounting beyond included usage.

Regular Chat is a separate product surface and may have different limits and usage accounting.

Sources:

- https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex
- https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans

This supports an important product hypothesis, but not a universal pricing claim:

> For some users and tasks, ordinary Chat can be a more efficient place for conversation, research, plugins, and high-level control than using an agentic Work/Codex session for every turn.

Whether it is actually cheaper or uses fewer effective tokens depends on plan, model, task, and current product limits. Internet should measure this rather than encode it as an invariant.

## 4. What is already solved well and should not be rebuilt

### 4.1 Do not rebuild Codex Remote as an Internet feature

Internet should not own a second implementation of:

- mobile host selection;
- repository picker UI;
- worktree UI;
- diff viewer;
- inline code review UI;
- terminal/test result presentation;
- generic coding-agent approval UX;
- generic multi-machine remote control.

Codex Remote already provides a mature implementation of these ideas for Codex.

If the user's objective is simply:

> remotely operate a coding agent running on my development machine

then Codex Remote should be considered a first-class existing solution, not a competitor to reimplement.

### 4.2 Do not rebuild private network tunneling unless required

Secure MCP Tunnel already provides an outbound-only path from a private MCP server to supported OpenAI surfaces.

Internet should treat the tunnel as transport, not workflow architecture.

### 4.3 Do not wrap every cloud integration locally

If ChatGPT/Gemini/another Controller can use a provider-native plugin or connected app directly, Local does not need to reproduce the same OAuth/integration layer merely for architectural symmetry.

## 5. What remains distinct for Internet

The overlap above does not eliminate Internet's proposed Controller ↔ Local Agent model.

The differentiated boundary is narrower.

### 5.1 Controller is not necessarily Codex or Work

A Controller may be:

- a regular ChatGPT Chat conversation;
- ChatGPT Work;
- Codex Remote;
- a future Claude/Gemini equivalent;
- another compatible conversational client.

The architecture should not require a specific Controller product.

### 5.2 Local Agent is not necessarily Codex

The Local Agent may be:

- DSH Agent;
- another local coding/reasoning agent;
- a headless server agent;
- a future replaceable local runtime.

Internet-specific semantics should remain above that implementation choice.

### 5.3 Local owns the environment-aware execution boundary

The Local Agent is the natural place for work that depends on:

- private/local files;
- local datasets;
- uncommitted repository state;
- local databases;
- internal network services;
- machine-specific toolchains;
- tests that require the real environment;
- hardware or OS-specific behavior.

The Controller can request this work without needing direct access to every low-level tool.

### 5.4 Internet Team remains the external reasoning plane

The Local Agent may delegate source-heavy research, provider-native search, deep research, or specialist reasoning to website participants.

This avoids forcing the Local model to ingest every large source corpus or reproduce provider-native capabilities.

Conceptually:

~~~text
Controller
  <-> Local Agent
        |
        +-> local environment / repository / data
        |
        +-> Internet Team
              -> ChatGPT / Gemini / future providers
              -> provider-native research/plugins
~~~

### 5.5 Workflow remains durable and independent of client connectivity

A Local Agent or Controller should be able to disconnect without corrupting or cancelling durable workflow state.

A later authorized client should be able to reattach from durable state.

This is already aligned with the Workflow vNext external-interaction requirements.

## 6. Refined build-vs-adapt conclusion

The research suggests the following split.

### Adapt/reuse

Prefer existing products for:

- full remote coding-agent UI;
- mobile diff/review UX;
- host/worktree selection UX;
- generic remote command approvals;
- private MCP reachability;
- cloud plugins and connected apps.

### Internet should own only if justified

Internet may own a small Controller ↔ Local Agent protocol when it provides value that existing product surfaces do not provide:

- ordinary Chat as a lightweight Controller;
- provider-agnostic Controller support;
- Local-Agent-agnostic binding;
- DSH-specific local orchestration;
- direct access to Internet Team and Internet workflow through Local;
- durable Local Session binding independent of one provider conversation;
- bidirectional Local Agent questions/progress;
- explicit provenance/authority transport;
- the ability to keep workflow state independent from both Controller and Local Agent processes.

## 7. Important counterargument

There is a serious reason not to implement even the small bridge immediately.

Codex Remote already demonstrates much of the desired user journey:

~~~text
remote conversational control
-> local host
-> repository/worktree
-> tests/commands
-> approvals
-> review
~~~

If most target use cases can be satisfied by using Codex Remote or Work directly, adding another Controller protocol would create maintenance cost without meaningful product value.

Therefore implementation should require evidence of a concrete gap.

Candidate gaps worth testing:

1. regular Chat provides materially better conversational/tool/token economics for the user's actual workload;
2. DSH-specific workflows/Internet Team need to remain local and cannot be composed cleanly through existing Work/Codex surfaces;
3. the user wants a non-OpenAI Controller or non-Codex Local Agent;
4. local datasets/services require a persistent DSH environment that should not be replaced by a Codex session;
5. one durable Internet workflow must be controllable through different clients over time.

If these gaps are not material, prefer existing OpenAI Remote/Work functionality.

## 8. Suggested experiment before implementation

Run the same representative tasks through two paths.

### Existing-product baseline

~~~text
ChatGPT Work or Codex Remote
-> local repository/environment
-> test/review task
~~~

### Proposed composed path

~~~text
regular Chat Controller
-> small Controller/Local bridge
-> DSH Local Agent
-> local tools + Internet Team + Workflow
~~~

Measure:

- total user friction;
- remote accessibility;
- token/credit usage;
- time to useful result;
- quality of local validation;
- quality of research;
- number of duplicated source-reading passes;
- recovery after disconnect/restart;
- ability to switch Controller/provider;
- maintenance surface.

Implementation is justified only if the composed path wins on a concrete recurring use case rather than merely duplicating Remote.

## 9. Research conclusion

Coworker was useful evidence that a conversational product can be a good remote interface to a local execution environment.

Current OpenAI products provide stronger evidence: Codex Remote already implements a capable remote engineering control plane, Work already spans cloud/mobile/desktop workflows, plugins provide cloud-native integrations, and Secure MCP Tunnel solves private MCP reachability.

Therefore the Internet opportunity should be deliberately narrower:

> Do not build another remote coding product. If needed, build the smallest replaceable Controller ↔ Local Agent boundary that lets ordinary or third-party conversational Controllers use DSH's local execution, Internet Team, and durable workflow semantics without exposing those internal tools as the remote architecture.
