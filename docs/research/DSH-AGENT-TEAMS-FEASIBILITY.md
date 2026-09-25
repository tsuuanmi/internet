# DSH Agent Teams Feasibility Study for Internet

- **Status:** exploratory feasibility study; not production authority
- **Date:** 2026-09-25
- **Question:** can Internet reuse DeepSeek Harness Agent Teams while preserving authenticated native ChatGPT/Gemini website sessions and reducing duplicated team infrastructure?
- **Related:** [product thesis](../proposals/workflow-vnext/PRODUCT-THESIS.md), [orchestration landscape](ORCHESTRATION-LANDSCAPE.md)

## 1. Executive conclusion

**Yes. The preferred Option A is a local-first team: every Team member remains a real DSH Agent, and selected local Agents are durably linked 1:1 to native ChatGPT/Gemini website conversations. Website Agents do not replace DSH teammates; they extend them with provider-native research, browsing, large-context reading, and website actions.**

This is more feasible than it initially appeared because current Internet already has the key identity bridge:

```text
DSH Agent id
  -> internet_chat sessionId
  -> persisted native website conversation binding
```

`internet_chat` uses `exec.agent.id` as the website `sessionId`. Therefore every Agent-Team teammate already receives a distinct stable namespace for its ChatGPT/Gemini conversation without a new identity system.

The resulting target is:

```text
User
  <-> Local Lead Agent

Local Lead Agent
  -> DSH Workflow when bounded scripted fan-out helps
  -> DSH Agent Teams for durable team coordination

DSH Team teammate
  = real local Agent
  = controller / coordinator / reasoner
        |
        | durable 1:1 link
        v
native ChatGPT/Gemini conversation
  = website collaborator
  = Search / Deep Research / large-context reading / website actions

website output
  -> linked local teammate
  -> compact reasoning / artifact reference
  -> DSH Team mailbox/task board
  -> other local teammates / Lead
```

The website conversation is therefore **not a Team member by itself**. The linked local Agent is the Team member and the bridge into local collaboration.

The controller is allowed to use Local/API model tokens. The goal is not zero Local-Agent token use; it is to avoid spending Local-Agent context on work that the website participant can perform more efficiently, especially source-heavy browsing, large-file/diff reading, and provider-native research.

A production migration should proceed incrementally:

1. prototype current Agent Teams + controller teammates using existing `internet_chat` / `internet_research`;
2. measure token/context overhead and recovery behavior;
3. add a durable request-identity path for controller -> website turns;
4. only then decide whether a small upstream Agent-Teams composition extension is worthwhile.

A generalized external-Team-participant redesign is **not** the recommended first step.

## 2. Desired behavior

The target collaboration loop is:

```text
Team Lead / Local Agent
  -> create or wake researcher teammate

Researcher teammate
  -> reason about what information is needed
  -> delegate source-heavy work to its linked website conversation

Native ChatGPT/Gemini conversation
  -> browse/search/read
  -> Deep Research when requested
  -> retain native conversation context
  -> return conclusions / selected evidence

Researcher teammate
  -> critique or refine when useful
  -> update Team task / message Lead
  -> later receive another Team message
  -> continue the same linked website conversation
```

The intended token allocation is:

```text
Local/API model tokens:
  decomposition
  coordination
  critique
  decisions
  authority-sensitive reasoning
  compact synthesis when useful

Website-product work:
  search
  Deep Research
  reading many sources
  long file/diff/context inspection
  provider-native interactions
  context that benefits from the persistent native thread
```

No rule forbids the Local Agent from reading source material when that is genuinely useful for reasoning, verification, or a final decision. However, source acquisition should avoid duplicate work.

The default routing policy should be:

```text
if a task needs substantial web/source/file reading
and the linked website Agent can perform it well:
  delegate acquisition/first-pass reading to the website Agent first
  receive a compact result / artifact reference
  let the Local Agent inspect raw source only when needed for:
    verification
    disagreement resolution
    exact implementation decisions
    authority-sensitive reasoning
```

Avoid the wasteful pattern:

```text
Local Agent reads all sources
  -> then website Agent reads the same sources again
```

Prefer:

```text
Local Agent frames the research question
  -> website Agent performs the source-heavy pass
  -> Local Agent critiques/uses the result
  -> targeted Local re-reading only where useful
```

This is a routing preference, not a correctness shortcut.

## 3. Current DSH Agent Teams execution path

The current implementation is strongly built around continuable DSH child Sessions.

### 3.1 Service dependencies

`TeamService` injects:

```text
agents
sessions
sessionPersistence
sessionProjections
subagents
```

Source: [agent-team/src/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/agent-team/src/index.ts)

This already shows that Team state and teammate execution are separate concerns in code, but the current public service joins them through exact DSH Agent identities.

### 3.2 Teammate creation

The current path is:

```text
TeamService.spawnTeammate()
  -> TeamRoster.spawn()
  -> append durable team/member = provisioning
  -> ctx.subagents.startContinuable({ childId, provider, prompt, parent })
  -> wait until initial user message is durable in child Session
  -> append team/member = active
```

Source: [agent-team/src/roster.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/agent-team/src/roster.ts)

Important implications:

- teammate identity is a DSH `SessionId`;
- the teammate must currently be materialized through `ctx.subagents.startContinuable()`;
- the Team does not consider the member active merely because an external executor exists;
- child-Session durability is part of provisioning correctness.

### 3.3 Restart reconciliation

A provisioning member is recovered as active only when the persisted child Session proves:

```text
header.parentSession == Team Lead id
continuable subagent descriptor exists
descriptor.provider == provisioned provider
initial user message exists
```

Source: [agent-team/src/roster.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/agent-team/src/roster.ts)

Therefore replacing the teammate with a non-DSH external participant is not currently a thin provider adapter. Recovery semantics explicitly depend on a persisted DSH child Session and subagent descriptor.

### 3.4 Membership and authority

Most Team operations require an **exact live `Agent`**. Membership verifies the exact live Agent object and direct Lead/child lineage.

Tasks, messages, waits, spawn, and interrupt all depend on this membership. A native ChatGPT website conversation therefore cannot currently call `ctx.agentTeams` directly as a Team member.

### 3.5 Durable mailbox

The Lead Session stores `team/message/queued` and `team/message/delivered`. For teammate targets, delivery uses the continuable-subagent host path. A message is acknowledged only after the target child Session durably contains the corresponding `team-message` user message.

Source: [agent-team/src/mailbox.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/agent-team/src/mailbox.ts)

This provides strong crash/retry semantics, but it is also the deepest coupling to DSH child Sessions.

### 3.6 Shared task board

The task board itself is comparatively reusable: it is durable Team state stored in the Lead log with revision/CAS semantics and dependency validation. However, task authority and ownership names are resolved through the Team roster, which assumes DSH Agent members.

### 3.7 Current model-facing Team tools

The optional `tool-agent-team` package installs nine tools plus fixed coordination policy into each Team member.

Source: [tool-agent-team README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/tool-agent-team/README.md)

Its own docs explicitly note token cost: fixed policy + tool schemas are present on Team-member requests, peer messages append to target history, and tool results add compact JSON.

## 4. Current Internet already has the critical website-session binding

Current `internet_chat` does:

```ts
const sessionId = exec.agent?.id

manager.chat(accountId, {
  prompt,
  sessionId: String(sessionId),
  ...
})
```

Source: [internet-chat.ts](https://github.com/tsuuanmi/internet/blob/main/src/tools/internet-chat.ts)

`BrowserManager.chat()` then loads the conversation binding for that exact `sessionId`, navigates back to the persisted native conversation URL, verifies its conversation id, and persists a new binding when the first turn creates one.

Therefore:

```text
Agent-Team teammate SessionId = S1

first internet_chat:
  S1 -> new native ChatGPT conversation C1
  persist S1 <-> C1

later Team message wakes same teammate:
  internet_chat from S1
  -> load C1
  -> continue C1
```

This is exactly the desired identity relationship for ordinary chat.

Current `internet_research` uses a namespaced id `<agent-id>:research:<name>`.

Source: [internet-research.ts](https://github.com/tsuuanmi/internet/blob/main/src/tools/internet-research.ts)

That gives each teammate durable ordinary and research website threads anchored to the same DSH teammate identity. Whether future Deep Research should sometimes reuse the ordinary native conversation is a separate product decision.

### 4.1 Native user interaction and DSH composition model

The user-facing interaction remains native DSH interaction:

```text
User
  <-> Local Agent
```

The user does not need to address ChatGPT/Gemini website accounts directly or manage Team internals.

The Local Agent may use host capabilities when appropriate:

```text
Local Agent
  -> ordinary reasoning/tools
  -> DSH Workflow for bounded scripted fan-out
  -> DSH Agent Teams for durable roster/mailbox/task coordination
  -> linked website conversation for native Search/Deep Research/high-context work
```

DSH Workflow is useful inside a bounded round, but its current implementation is foreground-only and explicitly has no journaling/resume after process restart. It should therefore be treated as an execution primitive beneath Internet's longer-lived Workstream semantics, not as a replacement for them.

Source: [DSH workflow package](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/workflow/workflow/README.md)

### 4.2 Website outputs flow through the local Team

The linked website Agent does not need Team membership.

Its output returns to the owning local Agent first:

```text
native website conversation
  -> Internet result / artifact
  -> owning DSH teammate
```

That local teammate then decides what the rest of the Team needs:

```text
owning teammate
  -> critique / transform / accept
  -> Team message
  -> Team task update
  -> artifact reference
```

This preserves a clean authority boundary:

```text
DSH Agent Teams
  owns local membership / mailbox / task authority

Internet
  owns local-Agent <-> website-conversation binding and website execution

website Agent
  owns provider-native reasoning/context, but not Team authority
```
## 5. Feasible integration options

### Option A — local DSH Team + linked website collaborator

This is the recommended target, not merely a temporary proxy pattern.

```text
User
  <-> Lead Local Agent
        |
        +-> DSH Agent Teams
              |
              +-> researcher-a (local DSH Agent)
              |      |
              |      +-> linked ChatGPT native conversation
              |
              +-> researcher-b (local DSH Agent)
              |      |
              |      +-> linked Gemini native conversation
              |
              +-> reviewer (local DSH Agent)
```

The local Agent remains the Team identity and can reason normally. Its linked website conversation is a high-context/native-capability collaborator.

#### A.1 Routing behavior

For substantial research/read-heavy work, the teammate should normally:

1. identify the question or evidence gap;
2. delegate the first source-heavy pass to its linked website conversation;
3. receive a compact result and durable artifact/reference;
4. reason locally over that result;
5. inspect raw sources locally only when extra verification or exact judgment is useful;
6. share only the necessary conclusion/artifact reference through the local Team.

The policy should explicitly discourage duplicate full-pass reading by Local and Website Agents unless independent replication is intentionally requested.

#### A.2 DSH capability reuse

Use host capabilities rather than rebuilding them:

```text
Agent Teams
  durable roster
  task DAG
  mailbox
  wake / cold resume
  Team UI projection

DSH Workflow
  bounded fan-out/pipeline inside a live round when useful

Subagents
  underlying continuable local teammate lifecycle

Internet
  website-session binding
  native website execution
  provider reconciliation
  artifacts / Workstream semantics
```

Current DSH Workflow is foreground-only and has no journal/resume, so it remains a bounded execution helper rather than the owner of long-lived Internet workflows.

#### A.3 Website output propagation

```text
website response
  -> linked local teammate
  -> optional local critique/reasoning
  -> compact Team message and/or durable artifact reference
  -> Lead / peer teammates
```

Do not inject an entire long report into every teammate by default.

#### A.4 Current implementation fit

Current Internet already has the key identity link:

```text
exec.agent.id
  -> internet_chat sessionId
  -> native conversation binding
```

So each DSH teammate naturally gets its own ordinary native website conversation.

Research threads currently use:

```text
<agent-id>:research:<name>
```

which can remain separate when Deep Research benefits from its own durable thread.

#### A.5 Required Internet changes for production

Prototype requires little or no DSH change, but production should add:

- a first-class local-Agent -> website-participant binding/service instead of relying only on a model-facing tool;
- durable logical request identity for website turns;
- compact/full result projection with artifact spill;
- explicit routing guidance preferring website-first source acquisition when appropriate;
- telemetry for Local tokens, website turns, artifact size, and duplicate reading;
- tests proving Team cold resume preserves the same website binding.

**Requires DSH change for prototype:** no.

**Likely DSH optimization later:** allow bounded teammate composition such as route/persona/tool filtering if upstream accepts it.

**Feasibility:** high.
### Option B — controller teammate + small DSH composition extension

The continuable-subagent API already supports fields including `agentOptions`, `toolFilter`, `persona`, and `maxDepth`, but current Agent Teams calls `startContinuable()` with only prompt and parent.

Sources: [subagent types](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent/src/types.ts) and [agent-team roster](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/agent-team/src/roster.ts)

A small upstream extension could allow host callers to provide a bounded teammate controller composition. This could make a website-controller teammate intentionally compact: Team coordination + Internet website execution + only the Local tools/reasoning actually needed.

The goal is not necessarily the cheapest model. It is the right amount of Local reasoning without loading all heavy source context into that model.

**Feasibility:** high.

**Architecture impact:** small-to-moderate, but it changes an experimental upstream API.

This is the preferred optimization after Option A proves useful.

### Option C — external/native participant support inside Agent Teams

This would allow a Team member to execute directly through a native website executor with no resident DSH Agent. It initially sounds clean but is a much larger redesign.

At minimum it affects identity, provisioning, recovery, membership/authority, mailbox acknowledgement, status, interrupt semantics, and model-facing Team tools.

An external participant contract would need equivalents for:

```text
provision()
deliver()
acknowledge()
status()
interrupt()
recover/reconcile()
authority identity
```

At that point Agent Teams becomes a multi-executor coordination framework rather than its current DSH-Agent Team abstraction.

**Feasibility:** technically possible.

**Change size:** large.

**Recommendation:** do not start here unless controller-token measurements prove Option A/B unacceptable.

### Option D — keep current Internet team runtime

This remains the baseline: direct native website participants, no controller-model hop, and existing workflow request receipts.

The cost is duplicated team/coordination infrastructure and less reuse of DSH Team UI/task/mailbox improvements.

Use this as the control when evaluating Options A/B.

## 6. Token-efficiency model

The correct objective is:

> **Spend Local-Agent tokens where Local reasoning adds value; keep avoidable bulk reading and provider-native research inside the website session.**

### 6.1 Good Local-Agent token use

Examples: decomposition, coordination, critique, deciding what evidence is missing, comparing compact conclusions, interpreting user feedback, and applying authority/policy.

### 6.2 Work that can often stay in the website participant

Examples: reading many web sources, long articles, large files/diffs when accessible, ChatGPT/Gemini native Search, Deep Research, and long provider-native context.

### 6.3 Current token leak: full tool results

`internet_chat` renders the website answer back into the DSH model tool result. `internet_research` currently renders full report(s) back into the DSH model result.

For long outputs this can erase a substantial part of the token saving.

A future production controller path should support bounded projection, conceptually:

```text
full website result
  -> durable Internet artifact

controller receives:
  result id
  provider/conversation identity
  website-produced concise conclusion
  selected evidence refs/excerpts
```

The Local Agent should be able to request more content when reasoning actually needs it.

### 6.4 Team mailbox should carry coordination, not bulk artifacts

Prefer compact messages with artifact/result references rather than copying complete long reports into Team mailbox history.

## 7. Reliability gap for Agent-Team controller turns

The current direct `internet_chat` model tool binds conversation identity correctly but does **not** provide a durable logical `requestKey`.

The workflow-specific team runner does:

```text
WorkflowTeamStepRequest.requestKey
  -> BrowserManager.chat(requestKey)
  -> ProviderTurnReceiptStore
  -> reconcile WAIT / RECOVER / RESUBMIT / AMBIGUOUS
```

Sources: [workflow/team-runner.ts](https://github.com/tsuuanmi/internet/blob/main/src/workflow/team-runner.ts) and [browser/turn-receipts.ts](https://github.com/tsuuanmi/internet/blob/main/src/browser/turn-receipts.ts)

Therefore a production Agent-Teams integration should not treat the model-facing `internet_chat` tool as the final correctness-bearing execution contract.

A better target is an Internet website-participant service/adapter accepting participant/session identity, logical request identity, prompt, execution mode, and cancellation, and returning native conversation identity plus durable result/artifact receipt and a compact controller projection.

The DSH controller Agent can still decide **when and why** to invoke it; execution underneath remains reconcile-before-resubmit.

### 7.1 Option A implementation plan

The smallest complete implementation plan should preserve current production behavior until each boundary is proven.

### Phase A0 — characterize current behavior

Before production changes:

- add/confirm tests for `exec.agent.id -> native conversation` continuity;
- characterize `internet_research` namespaced research-thread behavior;
- characterize ProviderTurnReceipt reconciliation;
- record current `internet_team` behavior as the comparison baseline.

### Phase A1 — compose Agent Teams in an experimental Internet profile

Create an opt-in composition/profile using:

```text
durable DSH Session persistence
DSH Agent Teams
DSH Team tools
Internet plugin
existing subagent provider
```

Do not remove current `internet_team` yet.

Goal: prove local teammates can use Internet and keep stable website conversations.

### Phase A2 — define linked website participant service

Refactor the correctness-bearing website call below the model-facing tools:

```text
WebsiteParticipantService.execute({
  ownerSessionId,
  accountId,
  logicalRequestId,
  mode,
  prompt
})
```

The model-facing `internet_chat` and `internet_research` become consumers of the same service.

Required semantics:

- stable owner Session -> native conversation binding;
- request identity and reconcile-before-resubmit;
- native chat/research mode;
- cancellation/failure classification;
- result/artifact identity.

### Phase A3 — add website-first delegation policy

Install concise guidance for linked teammates:

```text
For source-heavy research/read tasks:
  prefer the linked website participant for first-pass acquisition.
Do not read the full source corpus locally and then ask the website participant
to repeat the same pass unless independent replication is intentional.
Use Local reasoning for planning, critique, verification, and decisions.
```

This should be policy/guidance plus observability, not a brittle hard-coded router that prevents Local judgment.

### Phase A4 — compact artifact/result path

Add a bounded controller projection:

```text
website execution
  -> full durable result/artifact
  -> compact Local projection
```

The local teammate receives enough to reason and can request deeper material if needed. Team messages should normally carry compact conclusions + artifact ids rather than raw full reports.

### Phase A5 — use Agent Teams as authoritative team substrate

Once continuity/recovery/token tests pass:

- route new team collaboration through DSH Agent Teams;
- stop maintaining duplicate roster/mailbox/task state in Internet;
- retain Internet-specific Workstream/artifact/authority state;
- remove the old duplicate team implementation when migration no longer requires it.

### Phase A6 — bounded DSH Workflow integration

Allow Local Lead/teammates to use DSH Workflow for bounded live fan-out where appropriate.

Do **not** make DSH Workflow the durable Workstream owner because current DSH Workflow has no journaling/resume and blocks until a live run settles.

### Phase A7 — evaluate upstream optimization

After measurements, decide whether Agent-Team spawn should expose a small subset of existing continuable-child composition controls such as `agentOptions`, `toolFilter`, or `persona`.

Only pursue this if the controller composition materially improves token use, quality, or isolation.

## 8. Recommended prototype

### Phase F0 — no upstream changes

Use current DSH Agent Teams exactly as shipped with durable Session persistence and Internet.

Create fresh teammates such as `researcher-a`, `researcher-b`, and `reviewer` to avoid inheriting the Lead's large conversation initially.

Expected mapping:

```text
researcher-a DSH Session S1
  -> chatgpt-thinker
  -> native conversation C1

researcher-b DSH Session S2
  -> chatgpt-thinker-2
  -> native conversation C2
```

### Phase F1 — continuity test

1. send initial Team task;
2. call `internet_chat`;
3. record native `conversationId`;
4. let teammate settle/inactivate;
5. send a second Team message;
6. verify the same DSH Session resumes;
7. call `internet_chat` again;
8. verify the same native `conversationId`;
9. restart Harness;
10. wake the teammate through Team mailbox;
11. verify both DSH child Session and native website conversation continue.

### Phase F2 — token allocation experiment

Run one research task in three modes:

```text
A. Local Agent reads/researches everything
B. Local controller delegates heavy reading to website participant
C. current Internet direct website-team path
```

Record at minimum Local input/output tokens, number of Local steps, website turn count, wall-clock duration, result quality under the same rubric, and amount of raw source text entering Local context.

The hypothesis is **not** that B has zero Local tokens. The useful result is that B preserves or improves quality while materially reducing source/context tokens consumed by Local reasoning.

### Phase F3 — recovery test

Test failures before website submit, after submit/before completion, after website completion/before Local tool result settles, after Team-message enqueue/before child wake, process restart, auth expiry, and missing native conversation.

This phase should establish the durable request-identity requirements before migration.

### Phase F4 — evaluate upstream extension

Only after measurement, decide whether to request a small DSH change allowing Agent-Team spawn to forward bounded continuable-child composition such as `agentOptions`, `toolFilter`, or `persona`.

Do not propose external-participant support unless measurements show controller Agents themselves are the wrong abstraction.

## 9. Acceptance criteria for adopting Agent Teams

### Identity and continuity

- one Team teammate maps deterministically to one Internet participant identity;
- ordinary website chat resumes the same native conversation across rounds;
- process restart preserves Team teammate and website binding.

### Token allocation

- Local tokens remain available for useful reasoning;
- source-heavy reading can occur without forcing all raw source content into Local context;
- Team policy/tool overhead does not erase the expected savings;
- large website results can be projected compactly when Local does not need the full payload.

### Correctness

- website turns have durable logical request identity before production migration;
- crash recovery does not blindly duplicate website submissions;
- Team mailbox delivery and Internet website-turn receipts have a clear causal relation;
- large artifacts are not duplicated into Team mailbox history unnecessarily.

### Architecture

- Agent Teams becomes authoritative roster/task/mailbox state rather than being mirrored by another Internet team state;
- Internet keeps website account/conversation bindings plus workflow-level artifact/authority semantics;
- current workflow exact-head/review/merge guarantees are not weakened.

## 10. Recommendation

Proceed with **Option A as a measured prototype**, then likely Option B if measurements are positive.

Target ownership:

```text
DSH Agent Teams
  roster / teammate Session / task DAG / mailbox / wake / Team UI

Internet
  website account identity
  DSH teammate <-> native conversation binding
  native Search / Deep Research
  durable website-turn receipts
  compact/full result artifact policy
  Workstream / WorkflowRun / authority / convergence

Local controller teammate
  useful reasoning
  deciding what to delegate
  interpreting compact results
  Team coordination
```

This is a better fit than either extreme: all work through a Local API agent, or zero Local tokens with website agents doing everything.

The target is **hybrid reasoning with deliberate context placement**.

## 11. Primary source references

- [DSH Agent Teams package](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/agent-team/README.md)
- [DSH Agent Teams service](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/agent-team/src/index.ts)
- [DSH Team roster/provisioning](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/agent-team/src/roster.ts)
- [DSH Team mailbox](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/agent-team/src/mailbox.ts)
- [DSH Team model tools](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/tool-agent-team/README.md)
- [DSH continuable subagents](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md)
- [Internet direct chat tool](https://github.com/tsuuanmi/internet/blob/main/src/tools/internet-chat.ts)
- [Internet Deep Research tool](https://github.com/tsuuanmi/internet/blob/main/src/tools/internet-research.ts)
- [Internet workflow team runner](https://github.com/tsuuanmi/internet/blob/main/src/workflow/team-runner.ts)
- [Internet provider-turn receipts](https://github.com/tsuuanmi/internet/blob/main/src/browser/turn-receipts.ts)