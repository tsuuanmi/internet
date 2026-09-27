# Research — Agnostic Internet Capability Surface

- **Status:** exploratory evidence; not production authority
- **Date:** 2026-09-27
- **Related proposal:** [Remote Controller ↔ Local Agent](../proposals/REMOTE-CONTROLLER-LOCAL-AGENT.md)

## 1. Question

Internet wants Internet Team + Workflow to be usable from different Local Agent hosts such as DSH, Codex, Claude Code, and future runtimes.

The important question is:

> What is the smallest provider- and host-agnostic capability surface that preserves Internet's durable semantics without mirroring its internal APIs?

## 2. External evidence

### MCP is the strongest interoperability boundary

Anthropic describes MCP as an open protocol for connecting applications to tools and data. OpenAI also documents MCP across ChatGPT, Codex, Claude Code, Cursor, and other compatible clients.

Sources:

- https://docs.anthropic.com/en/docs/mcp
- https://developers.openai.com/learn/docs-mcp
- https://developers.openai.com/plugins/concepts/mcp-server

### Tools should map to user goals, not internal APIs

OpenAI's current plugin guidance explicitly recommends deriving tools from recognizable user outcomes and warns against mirroring an internal API.

Source:

- https://developers.openai.com/plugins/plan/tools

This argues against exporting the current monolithic Internet workflow operation switch as the canonical cross-host surface. Admission and activation are correctness mechanisms, not the user's goal.

### Skills and tools should remain separate

OpenAI distinguishes MCP tools for live data/actions from skills for workflow guidance, sequencing, examples, and output expectations.

Sources:

- https://developers.openai.com/plugins/concepts/skills
- https://developers.openai.com/plugins/build/skills

This maps well to Internet:

~~~text
MCP capability service
  = authoritative actions/state

portable skills
  = when/how a Local Agent should use research, consultation, workflow, artifacts
~~~

### Portable packaging is increasingly practical

OpenAI documents a portable Agent Plugins package and a migration path for Claude Code plugins and MCP connectors.

Sources:

- https://developers.openai.com/plugins/build/plugins
- https://developers.openai.com/plugins/guides/submit-claude-plugin
- https://developers.openai.com/learn/developers-codex-plugin

The package manifest should therefore be an adapter, not the capability contract.

### MCP 2026-07-28 favors explicit state handles

The 2026-07-28 MCP revision moves the core toward stateless request/response and explicit application state handles.

Source:

- https://blog.modelcontextprotocol.io/posts/2026-07-28/

This strongly supports explicit Internet identifiers such as:

~~~text
artifactId
workflowId
actionId
conversationScopeId
~~~

instead of relying on a transport session as durable identity.

### MCP Tasks maps closely to Internet Workflow

The MCP Tasks extension provides durable async handles with states such as working, input_required, completed, cancelled, and failed. Clients can poll and cancel, and the task store is expected to survive connection/worker loss.

Sources:

- https://tasks.extensions.modelcontextprotocol.io/
- https://tasks.extensions.modelcontextprotocol.io/seps/2663-tasks-extension

The correct relationship is:

~~~text
Internet Workflow
  = authoritative domain state

MCP Task
  = interoperability projection / async transport handle
~~~

MCP Task state must not replace Internet Workflow state.

## 3. Current Internet code boundary

The current production tools are DSH adapters:

~~~text
internet_chat
internet_research
internet_team
internet_workflow
internet_workflow_maintenance
~~~

The core is less coupled than the tool surface suggests.

- Team core accepts an explicit session ID and chat function; the DSH tool constructs the session ID from the DSH agent ID.
- Research similarly derives its durable thread from the DSH agent ID.
- Workflow's authorization model already supports generic principals such as session, user, and service; the DSH tool simply maps the current DSH agent ID into that model.

Therefore the main portability work is to extract host-neutral capability services beneath the DSH tool definitions, not to rewrite the Workflow engine.

## 4. Proposed portable capability model

A useful first grouping is:

~~~text
External reasoning
  research
  consult

Durable work
  workflow_start
  workflow_list
  workflow_get
  workflow_respond
  workflow_signal
  workflow_cancel

Artifacts
  artifact_read
~~~

Names are provisional.

## 5. Research and consultation

### research

User goal:

> Investigate a question using source-heavy/provider-native research and return evidence-backed findings.

The caller supplies the question and useful constraints, not provider account IDs.

Conceptual result:

~~~text
summary
artifactId
evidence/source refs
continuity handle when useful
~~~

For long-running work in the portable plugin, MCP Tasks is required. A client that does not declare `io.modelcontextprotocol/tasks` is not eligible to start that long-running capability. There is intentionally no synchronous or bespoke-handle fallback in the initial production contract.

### consult

User goal:

> Ask independent reasoning participants to critique, brainstorm, review, or synthesize a problem.

This is the portable semantic version of the current Internet Team idea.

The common path should not require authenticated account IDs, synthesizer identity, browser visibility, or debate-round configuration.

Provider/model/account routing remains server policy.

## 6. Durable workflow surface

### workflow_start

User goal:

> Start durable work against an explicit objective and target.

The portable caller should not manually execute internal admission/confirm/activate transitions.

The server may return:

- started;
- input or confirmation required;
- validation error.

Admission confirmation remains a durable Internet PendingAction and is projected through the task's `input_required` / input-request lifecycle. The portable production path does not add a separate compatibility response path.

### workflow_list

Read-only discovery for reattachment across clients.

### workflow_get

Returns a compact authoritative projection:

~~~text
workflowId
lifecycle
current objective/phase
current exact target state
recent semantic progress
pending actions
artifact/result refs
updatedAt
~~~

The full internal DAG should not be exposed by default.

### workflow_respond

Resolves a specific persisted PendingAction.

Conceptual input:

~~~text
workflowId
actionId
expectedRevision
requestId
payload
~~~

The model must not be allowed to self-assert user authority through a free string field.

For USER_AUTHORITY, prefer a host path that actually presents the exact decision to the user. If the host cannot establish adequate provenance, fail closed.

### workflow_signal

Keeps unsolicited steering separate from answering a solicited PendingAction.

Example:

~~~text
Also preserve Node 20 compatibility.
~~~

### workflow_cancel

Cancellation remains a distinct consequential write.

## 7. Artifact boundary

Default results should remain compact:

~~~text
summary
stable IDs
important exact bindings
next actionable state
~~~

Large reports/transcripts stay in durable artifacts until requested.

A portable compatibility baseline is an artifact_read tool. Richer clients may additionally expose artifacts as MCP Resources.

## 8. Portable skills

A distributable Internet package should likely include provider-neutral skills:

### internet-research

- prefer website/provider-native acquisition for source-heavy work;
- avoid duplicate Local full-pass reading before delegation;
- re-read locally when verification or implementation-critical inspection needs it.

### internet-consult

- use independent consultation for critique, disagreement resolution, architecture review, and multi-perspective reasoning;
- avoid it for trivial work.

### internet-workflow

- use durable workflow for multi-step work that should survive disconnect/restart;
- inspect PendingActions rather than guessing authority;
- never treat conversational approval as committed workflow authority until the exact action is resolved.

Skills remain advisory. The capability server remains authoritative.

## 9. Host adapters

### DSH

~~~text
DSH native tool adapter
  -> direct in-process capability service
~~~

MCP is optional when both layers run in one process.

### Codex / Claude Code / Cursor

~~~text
Local agent
  -> MCP adapter
  -> capability service
~~~

### ChatGPT web / remote Controller

~~~text
ChatGPT
  -> remote MCP / secure tunnel
  -> Local Agent bridge or capability service
~~~

Transport choice does not change capability semantics.

## 10. Internal architecture

~~~text
                Host adapters
     DSH       MCP       future native
       \        |        /
        \       |       /
         v      v      v
       Internet Capability API
        /        |         \
       /         |          \
Research     Collaboration   Workflow
 service        service       service
       \         |          /
        \        |         /
          artifacts / auth
                |
          provider adapters
~~~

Domain services should not receive DSH execution objects, Codex session objects, or Claude-specific types.

The adapter resolves host identity into a stable Internet principal/context first.

## 11. What remains internal

Do not put these in the default portable contract unless a concrete cross-host use case requires them:

~~~text
provider account IDs
browser visibility
team synthesizer identity
raw debate rounds
workflow graph mutation
admission/activation internals
recovery continue
writer conversation internals
raw handoff receipts
maintenance/retention operations
~~~

They can remain operator/admin or DSH-native advanced controls.

## 12. Tasks-required production contract

For portable long-running capabilities, the initial production contract requires the MCP Tasks extension.

~~~text
required:
  MCP 2026-07-28
  io.modelcontextprotocol/tasks
  durable task creation before response
  tasks/get
  tasks/update
  tasks/cancel
  input_required for outstanding interaction

optional presentation enhancements:
  MCP Apps
  Resources
  subscriptions/listen
~~~

There is intentionally no fallback to a blocking tool call, custom polling handle, or legacy Tasks surface.

If a target host does not support the required Tasks contract, that host is not considered supported for long-running Internet Workflow execution yet.

This keeps one production lifecycle instead of maintaining parallel semantics.

### 12.1 Workflow is a composition, not a monolith

The term "Workflow" describes the durable collaboration capability and its invariants, not one permanently-owned engine implementation.

Its internal responsibilities should be separable behind explicit contracts:

~~~text
Workflow capability
  |
  +-- async task lifecycle / client projection
  |     -> MCP Tasks today
  |     -> replaceable later
  |
  +-- semantic planning / decomposition
  |     -> planner capability
  |
  +-- scheduling / dependency readiness
  |     -> current scheduler
  |     -> replaceable runtime later
  |
  +-- execution / worker dispatch
  |     -> DSH / Codex / Claude / future workers
  |
  +-- interaction / approvals
  |     -> PendingAction semantics
  |     -> MCP input_required projection
  |
  +-- artifacts / lineage / provenance
  |
  +-- exact-state bindings / reconciliation
  |
  +-- authority policy
  |
  +-- convergence
~~~

MCP Tasks can replace or standardize the generic asynchronous task lifecycle, polling, cancellation, recovery handle, and client input transport.

It does **not** by itself replace Internet-specific semantics such as artifact lineage, exact repository/head bindings, authority policy, causal invalidation, convergence, or domain capability routing.

Those components should also remain independently replaceable when a better implementation appears, provided the Internet contracts and invariants remain satisfied.

The build-vs-adapt rule therefore applies *inside* Workflow as well:

> Own only the collaboration/correctness semantics that distinguish Internet; compose commodity runtime components behind those semantics.

## 13. Recommended v1

A deliberately small portable v1:

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

Nine tools cover the primary cross-host goals without exporting browser/provider/workflow internals.

## 14. Migration path

1. Characterize the current DSH ownership/session behavior with tests.
2. Extract host-neutral Research, Collaboration, Workflow Capability, Artifact, and Authorization services.
3. Keep existing DSH tools as adapters over those services.
4. Add one MCP adapter over the same services; do not duplicate business logic.
5. Add provider-neutral skills.
6. Make MCP Tasks part of the initial portable production contract; validate target-host support before declaring that host supported. Do not add a second long-running fallback path.
7. Keep runtime responsibilities behind replaceable contracts so Tasks or future runtimes can replace commodity workflow mechanics without rewriting Internet semantics.

## 15. Conclusion

Internet should not standardize today's DSH tool definitions.

It should standardize the semantic capability layer underneath them.

~~~text
DSH / Codex / Claude / future host
          |
          v
  portable capability contract
          |
   +------+------+
   |             |
Internet Team   Workflow
   |             |
   +------ artifacts/auth
          |
   provider/runtime adapters
~~~

MCP is the portability protocol.

Skills provide portable usage guidance.

MCP Tasks is the required portable long-running execution/projection contract for the initial production design. Internet durable collaboration semantics remain authoritative, while the concrete task lifecycle, scheduler, worker runtime, persistence, and other mechanics remain replaceable components behind explicit contracts.
