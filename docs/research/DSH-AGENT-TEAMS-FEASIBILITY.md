# DSH Agent Teams Feasibility Study for Internet

- **Status:** exploratory feasibility study; not production authority
- **Date:** 2026-09-25
- **Question:** can Internet reuse DeepSeek Harness Agent Teams while preserving authenticated native ChatGPT/Gemini website sessions and reducing duplicated team infrastructure?
- **Related:** [product thesis](../proposals/workflow-vnext/PRODUCT-THESIS.md), [orchestration landscape](ORCHESTRATION-LANDSCAPE.md)

## 1. Executive conclusion

**Yes, Agent Teams is feasible as a near-term coordination substrate, but the best first integration is a DSH teammate acting as a controller for a linked native website conversation — not redefining ChatGPT/Gemini Web as a DSH subagent provider.**

This is more feasible than it initially appeared because current Internet already has the key identity bridge:

```text
DSH Agent id
  -> internet_chat sessionId
  -> persisted native website conversation binding
```

`internet_chat` uses `exec.agent.id` as the website `sessionId`. Therefore every Agent-Team teammate already receives a distinct stable namespace for its ChatGPT/Gemini conversation without a new identity system.

The resulting target is:

```text
DSH Agent-Team teammate
  = controller / coordinator / optional reasoner

Internet website participant
  = native ChatGPT/Gemini reasoning workspace
    + native Search / Deep Research
    + large-context reading
    + provider-native actions

durable binding
  DSH teammate SessionId
    <-> accountId
    <-> native website conversation
```

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

No rule requires the Local Agent to avoid reading source material when it is the better path. Efficiency is workload allocation, not a hard routing policy.

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

## 5. Feasible integration options

### Option A — current Agent Teams + controller teammate

```text
DSH Team teammate
  -> Local/API model reasons and coordinates
  -> calls internet_chat / internet_research
  -> website session performs heavy research/reading
  -> teammate sends compact Team result
```

**Requires DSH change:** no.

**Internet change:** little for a prototype.

**Reuse:** roster, durable mailbox, task DAG, cold-resume teammate Session, teammate identity, Team projection/UI, interruption and wait semantics.

**Local token use:** non-zero by design. This is acceptable when the Local model performs useful controller work.

**Main risks:**

- Team policy + tool schemas consume tokens;
- the teammate may ingest large website tool results into its Local context;
- direct `internet_chat` lacks workflow-style durable request identity;
- the child currently inherits normal Agent route/composition because Team spawn does not forward per-member `agentOptions` / tool restrictions;
- long Team messages can duplicate context already present in the website thread.

**Feasibility:** high.

This is the recommended first prototype.

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