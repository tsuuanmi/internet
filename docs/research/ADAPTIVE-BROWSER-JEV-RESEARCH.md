# Adaptive Browser Interaction Research — Lessons from JEV Ultrafast

- **Status:** exploratory research; not an accepted architecture or implementation contract
- **Started:** 2026-09-24
- **Primary reference:** [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast)
- **Current system:** [tsuuanmi/internet](https://github.com/tsuuanmi/internet)

This document explores how internet could become less brittle when provider UI state differs from the expected deterministic path, while preserving the durable workflow, authority, reconciliation, and provider-completion guarantees that already make internet safe to operate.

The intended direction is **not** to replace the current provider adapters with a general autonomous browser agent. The narrower research question is:

> Can internet keep deterministic provider semantics as its primary control path, add a compact atomic browser observation layer, and use a bounded agent only when the observed UI does not match an expected state?

## Motivation

The current browser implementation deliberately encodes provider semantics in code. This is valuable because the runtime knows that a given control is the ChatGPT composer, Send action, reasoning selector, Deep Research control, confirmation surface, or Gemini mode selector.

That approach also creates a brittle edge: when a provider changes its UI or presents an unanticipated intermediate state, deterministic code may know only that the expected selector or postcondition is absent. A human or browser agent may immediately understand an obvious recovery step such as:

- press **Continue** after an interrupted generation;
- press **Retry** after a provider-side execution failure;
- dismiss a blocking modal;
- reopen the required mode picker;
- restore an exact prompt that disappeared from the composer;
- resubmit only when durable receipts prove that no equivalent turn was already accepted;
- choose a semantically equivalent control after a provider UI reshuffle.

The important distinction is between **semantic workflow truth** and **browser presentation state**. The former should remain deterministic and durable. The latter may benefit from a more adaptive observer and bounded recovery mechanism.

## What JEV Ultrafast demonstrates

JEV Ultrafast is a generic browser agent built around a small, dynamic, indexed action space. Its most relevant ideas for internet are below.

### 1. Atomic browser snapshots

JEV reads visible page state in one browser evaluation and returns a compact structure containing visible text, actionable controls, values, node identity, page markers, guards, and scroll state.

References:

- [jev_ultrafast/snapshot.js](https://github.com/browser-use/jev-ultrafast/blob/main/jev_ultrafast/snapshot.js)
- [jev_ultrafast/browser.py](https://github.com/browser-use/jev-ultrafast/blob/main/jev_ultrafast/browser.py)

This reduces protocol round trips and, more importantly, gives one internally consistent observation rather than assembling a decision from multiple DOM reads that may span UI transitions.

For internet, the equivalent should remain **provider-aware**. An atomic snapshot should capture semantic facts that the runtime cares about, for example:

~~~text
ProviderSnapshot
  identity
    url
    conversation identity
    document generation / freshness marker

  authentication
    authenticated | signed-out | challenge | unconfirmed

  composer
    present
    visible
    enabled
    exact attached text

  generation
    response present
    response text/html
    running
    recoverable interruption controls

  mode
    current reasoning level / provider mode
    available semantic alternatives

  overlays
    confirmation
    modal
    provider error
    retry / continue surfaces

  observed actions
    stable runtime-owned node id
    semantic role
    accessible name
    current value/state
    allowed action kinds
~~~

The snapshot should be produced atomically enough that the runtime can reason about one page state rather than several loosely related locator reads.

### 2. Observed node identity instead of model-authored selectors

JEV assigns runtime-owned identities to actual DOM nodes. Its policy can choose an indexed target, but model output never becomes arbitrary selectors, coordinates, JavaScript, or shell commands.

This separation is directly useful to internet.

A future recovery agent should be allowed to choose only among actions generated from the current snapshot:

~~~text
[1] button   Continue
[2] button   Retry
[3] textbox  Message
[4] button   Send
~~~

The agent may choose an observed action identifier, but the browser runtime owns:

- element discovery;
- node identity;
- action validation;
- geometry/actionability;
- exact text payloads;
- freshness checks;
- postcondition verification.

This prevents adaptive reasoning from becoming arbitrary browser execution.

### 3. Freshness guards before execution

JEV checks that the page and selected element still match the observation used for the decision. If they do not, it observes again rather than acting on stale state.

References:

- [Browser.fresh](https://github.com/browser-use/jev-ultrafast/blob/main/jev_ultrafast/browser.py)
- snapshot page_key, marker, and per-node guards in [snapshot.js](https://github.com/browser-use/jev-ultrafast/blob/main/jev_ultrafast/snapshot.js)

This is a strong candidate for a reusable internet browser primitive:

~~~text
observe
-> decide
-> verify observation is still current
-> execute
-> verify expected postcondition
~~~

Patchright actionability remains useful, but freshness is a higher-level semantic guarantee: the action should still refer to the state from which the decision was made.

### 4. Wait for useful state

JEV waits for the state implied by the previous action rather than applying one generic sleep after every interaction.

For internet, the exact timings are not important. The reusable idea is:

> Every deterministic or adaptive browser action should define the state transition that makes the action complete.

Examples:

~~~text
open reasoning selector
-> reasoning surface becomes visible

select High
-> semantic mode reads High

attach prompt
-> exact normalized prompt is present

submit
-> composer submission is acknowledged OR generation begins

click Continue
-> interrupted state disappears AND generation resumes

click Retry
-> a new provider attempt becomes observable without violating turn receipts
~~~

The existing semantic completion logic should remain authoritative for provider generation. This research concerns browser interaction transitions, not replacing completion contracts with animation waits.

### 5. Compact dynamic action spaces

JEV asks its decision policy to choose from operations and targets that are compatible with the current observation. That is useful as a recovery pattern, but internet should use a narrower variant.

The desired hierarchy is:

~~~text
deterministic semantic happy path
        |
        v
expected postcondition reached? -- yes --> continue
        |
        no
        v
atomic provider snapshot
        |
        v
known deterministic recovery? -- yes --> execute + verify
        |
        no
        v
bounded recovery agent
        |
        v
choose from runtime-approved observed actions
        |
        v
freshness + authority + receipt validation
        |
        v
execute
        |
        v
postcondition or re-observe
~~~

The agent is therefore a **recovery policy**, not the owner of the workflow.

## Core internet logic that should remain authoritative

The adaptive browser layer must not weaken existing correctness boundaries.

### Durable workflow and exact-input state

Workflow nodes, ownership, graph revisions, exact handoffs, input hashes, retries, and recovery remain runtime-owned.

A browser agent does not decide that a workflow node succeeded, should be replayed, or may be replaced by another node.

### Provider turn receipts and reconcile-before-resubmit

This is especially important for adaptive recovery.

A UI may show **Retry**, an empty composer, or an ambiguous interrupted state. An agent must not infer from appearance alone that the original logical request should be resubmitted.

The existing reconciliation principle remains:

~~~text
inspect durable receipt + exact provider/conversation state
-> recover completed result when safely identifiable
-> wait for already submitted work when still active
-> resubmit only when the runtime proves it is safe
-> fail closed on ambiguity
~~~

If an agent suggests “type the prompt again” or “press Retry”, the runtime must first establish that doing so does not create a duplicate provider turn.

### Exact prompt ownership

The recovery agent should not rewrite workflow prompts.

If an exact prompt must be restored, the runtime supplies the original prompt associated with the current request/receipt. The agent may select **which observed composer** to target; it does not generate replacement task text.

### Provider semantic completion

Current ChatGPT/Gemini response extraction, running-state interpretation, Deep Research completion, stable completion, and response representation remain provider contracts.

An adaptive browser action cannot declare success merely because a button disappeared or a page changed.

### Authentication and portable accounts

Account state, authenticated browser storage, reauthentication state, account revisioning, and login flows remain deterministic browser/runtime concerns.

### Confirmation and authority boundaries

Workflow confirmations, repository/branch/PR scope checks, merge authority, and fail-closed confirmation handling remain non-delegable.

A recovery agent may identify a visible confirmation surface. It may not decide that the user has granted authority.

## Candidate architecture

A useful long-term boundary would separate browser mechanics, provider semantics, and adaptive recovery.

~~~text
Workflow / durable orchestration
          |
          v
Provider semantic adapter
  ChatGPT | Gemini | ...
          |
          +-------------------------------+
          |                               |
          v                               v
Deterministic interaction           Recovery coordinator
          |                               |
          v                               v
        Provider atomic snapshot + observed action space
                              |
                              v
                    Browser execution substrate
                              |
                         Patchright / CDP
~~~

Possible responsibility split:

~~~text
browser/observation
  atomic evaluate
  observed node registry
  freshness markers
  actionability facts
  browser-level diagnostics

browser/execution
  execute observed action
  validate target
  enforce allowed operation
  exact text insertion
  targeted postcondition waits

providers/chatgpt
  semantic interpretation of snapshot
  happy-path interactions
  provider-specific postconditions

providers/gemini
  semantic interpretation of snapshot
  happy-path interactions
  provider-specific postconditions

recovery
  classify unexpected provider state
  deterministic recovery rules
  bounded agent decision when rules cannot resolve it
~~~

This is a research boundary, not a proposed source-tree migration yet.

## Bounded recovery agent

The central hypothesis is that a small browser agent can improve robustness without owning workflow semantics.

### Inputs

A recovery turn should receive only bounded, relevant state:

~~~yaml
goal:
  restore the current provider turn to a valid progress state

expected_state:
  generation_running_or_completed

provider:
  chatgpt-web

durable_facts:
  request_already_submitted: true
  resubmission_allowed: false
  exact_prompt_available: true

visible_text:
  <bounded visible provider text>

actions:
  - id: a17
    operation: CLICK
    role: button
    name: Continue
  - id: a18
    operation: CLICK
    role: button
    name: Retry
~~~

Durable facts are runtime-projected constraints, not model inferences.

### Outputs

The model should return a typed choice, not executable browser instructions:

~~~json
{
  "action": "a17",
  "reason": "The existing submitted turn appears paused and Continue is available."
}
~~~

The reason is diagnostic only. The selected action is valid only if the runtime independently accepts it.

### Runtime validation

Before execution, validate:

1. the recovery invocation is still for the current workflow/provider turn;
2. the action exists in the exact snapshot;
3. the snapshot is still fresh;
4. the action kind is allowed for this recovery scope;
5. the action does not expand user authority;
6. prompt insertion uses runtime-owned exact text;
7. retry/resubmission satisfies durable turn reconciliation;
8. the postcondition is explicitly defined.

If any condition fails, re-observe or fail closed.

## Recovery examples

### Interrupted generation with Continue

~~~text
expected: generation running/completed
observed: response present, not running, Continue visible

deterministic rule or recovery agent:
  CLICK observed Continue

runtime:
  freshness check
  execute
  require Continue to disappear and running/progress state to resume
~~~

This can be safe because it continues an existing provider turn rather than creating a new logical request.

### Provider Retry surface

~~~text
observed: Retry visible

before allowing Retry:
  inspect provider turn receipt
  inspect current semantic response
  determine whether Retry is provider-local continuation/re-execution
  determine whether a duplicate externally visible action is possible

ambiguous:
  fail closed

safe:
  expose Retry in allowed recovery action space
~~~

The button label alone is not sufficient authorization.

### Prompt disappeared before submission

~~~text
receipt: not submitted
expected exact prompt: P
snapshot: composer empty, Send disabled

recovery:
  choose observed composer
  runtime inserts exact P
  verify exact P attached
  submit through verified semantic Send action
~~~

The agent chooses the target only; the runtime owns P.

### Prompt state ambiguous after possible submission

~~~text
receipt: submitted
snapshot: composer empty
generation state: unclear

do not:
  type and send P again

instead:
  reconcile receipt + conversation + response state
  recover/wait/fail closed
~~~

Adaptive UI handling must never bypass idempotency logic.

### Unexpected modal or provider notice

A generic observed-action layer can identify visible buttons such as **Close**, **Dismiss**, or **Continue**, but provider policy should determine which semantic action classes are permitted.

Unknown destructive or authority-bearing controls should not be exposed to the recovery agent.

## Atomic snapshot scope

A fully generic DOM accessibility snapshot is not required initially.

A staged implementation could begin with provider-specific semantic state collected in one page evaluation, then optionally add generic visible action enumeration for recovery.

### Stage A — provider atomic state

Collect in one evaluation where practical:

- current route and stable conversation identity hints;
- authenticated/composer surfaces;
- current composer text and enabled state;
- current response text/html and running indicators;
- mode controls and selected semantic mode;
- known provider errors/interruption surfaces;
- confirmations/modals;
- compact visible text relevant to the active provider surface.

This alone can reduce inconsistent multi-read observations.

### Stage B — observed recovery actions

Enumerate only visible, enabled, semantically actionable controls with:

- runtime-owned node identifier;
- role;
- accessible name;
- current value/state;
- allowed primitive: click, fill, select;
- a compact contextual guard.

Do not expose arbitrary page JavaScript, selectors, coordinates, or hidden controls.

### Stage C — bounded adaptive policy

Use the observed action space only after deterministic provider recovery cannot explain the state.

## What should not be copied from JEV

### Do not replace provider adapters with a generic agent loop

internet has stronger domain knowledge than a generic browser agent. It knows provider-specific success conditions and durable workflow intent.

That knowledge should remain an advantage.

### Do not let model output become selectors or code

Observed runtime targets should remain the only executable targets.

### Do not replace durable receipts with page fingerprints

Page freshness and durable logical idempotency solve different problems.

- freshness: “is this still the page/element I observed?”
- receipt/reconciliation: “has this logical provider request already been accepted or completed?”

Both are needed.

### Do not treat visible text as authority

A provider may render text that resembles an instruction. Authority still comes from trusted workflow state and user-approved scope.

### Do not use generic browser completion as provider success

Provider semantic completion remains explicit.

## Performance implications

JEV reports that its Google Flights example reduced browser protocol calls substantially and reduced median elapsed time in its small task-specific benchmark. The project explicitly notes that this is not a general reliability benchmark.

References:

- [JEV README — Why it moves / Evidence and limits](https://github.com/browser-use/jev-ultrafast#why-it-moves)
- [performance notes](https://github.com/browser-use/jev-ultrafast/blob/main/docs/performance.md)

For internet, provider generation time often dominates total latency, so the main expected benefit is not necessarily large end-to-end speedup. More realistic benefits are:

- fewer browser round trips during setup and polling;
- internally consistent observations;
- faster recovery from UI drift;
- fewer brittle provider-specific selector chains;
- better diagnostics when deterministic assumptions fail;
- improved concurrent/background turn behavior if browser throttling is material.

These should be measured, not assumed.

## Measurement plan

Before changing production behavior, establish baselines for representative ChatGPT and Gemini turns.

Candidate metrics:

~~~text
browser protocol / locator operations per turn
time from page ready -> prompt verified
time from prompt verified -> submission acknowledged
time to detect generation start
completion polling reads
unexpected-state frequency
recovery success rate
duplicate-submission incidents (must remain zero)
false recovery / wrong-control incidents (must remain zero)
provider UI drift failures
~~~

For adaptive recovery, also record:

~~~text
recovery reason/class
snapshot hash / freshness revision
available action count
selected action
validator decision
postcondition result
number of recovery steps
whether deterministic fallback could have handled the case
~~~

Do not persist secrets or full account state in diagnostics.

## Validation and TDD direction

Any production implementation should follow Red -> Green -> Refactor.

Suggested first behavioral tests:

1. **Atomic observation consistency**
   - one fixture transition cannot produce a response from one DOM revision and a running flag from another;
   - hidden/disabled controls are not exposed as recovery targets.

2. **Freshness rejection**
   - an observed action cannot execute after its guarded state changes;
   - a replacement node with the same label is not silently treated as the original target when identity matters.

3. **Exact prompt recovery**
   - when no submission receipt exists, an empty composer can be restored with the exact runtime-owned prompt;
   - model-provided replacement prompt text is never accepted.

4. **No duplicate submission**
   - a submitted durable receipt prevents agent-driven resend from an empty composer;
   - ambiguous provider state fails closed.

5. **Continue recovery**
   - a valid Continue surface may resume an already submitted turn;
   - completion remains determined by provider semantic contracts.

6. **Retry policy**
   - Retry is hidden from the adaptive action space when durable reconciliation does not prove it safe;
   - safe provider-local retry can be executed and must satisfy a postcondition.

7. **Authority preservation**
   - unknown confirmations and merge/repository authority surfaces are never agent-authorized.

8. **Bounded recovery**
   - repeated no-progress recovery choices terminate under a fixed budget;
   - stale decisions trigger re-observation, not blind retry.

## Research questions

The following questions should be answered before promotion to an architecture proposal:

1. Can ChatGPT/Gemini provider state be collected atomically enough through page evaluation without losing Patchright semantics needed elsewhere?
2. Which state belongs in a generic browser snapshot versus a provider-specific semantic projection?
3. How should node identities survive reactive re-rendering without treating semantically changed controls as identical?
4. Which recovery action classes can be safely generic across providers?
5. When is **Retry** a continuation of the same logical provider request versus a new externally meaningful attempt?
6. Can browser events or mutation observation replace part of the current fixed completion polling without reducing reliability?
7. Does focus emulation materially improve background/concurrent provider turns in the actual deployment environment?
8. What is the minimum recovery context needed for a model to choose obvious UI recovery actions reliably?
9. Which states are better handled by deterministic recovery rules before invoking a model?
10. What recovery budget prevents loops while still covering common provider UI drift?

## Suggested experiment order

### Experiment 1 — instrumentation only

Add browser-operation measurements without changing behavior.

Goal: identify actual round-trip and wait hotspots.

### Experiment 2 — provider atomic completion snapshot

Reimplement current completion observation behind the same CompletionSnapshot contract using atomic provider reads where possible.

Goal: preserve behavior exactly while reducing inconsistent reads.

### Experiment 3 — freshness-aware deterministic interactions

Add observation/action/postcondition primitives to a small provider interaction such as opening and selecting reasoning mode.

Goal: prove stale-state rejection without introducing agent behavior.

### Experiment 4 — deterministic recovery catalogue

Encode obvious recovery states such as a known provider Continue surface.

Goal: learn which failures need adaptive reasoning and which only need better state modeling.

### Experiment 5 — bounded agent recovery

Invoke an agent only for states that remain unclassified, using a restricted observed action space and durable constraints.

Goal: test whether adaptive reasoning improves recovery without weakening idempotency or authority.

### Experiment 6 — broader provider action space

Only if earlier experiments are successful, evaluate whether more hardcoded interaction sequences can safely become semantic goals over observed actions.

## Promotion criteria

This research should become a proposal/ADR only when evidence supports all of the following:

- current durable workflow semantics remain unchanged;
- duplicate provider submissions remain prevented by construction;
- authority-bearing actions remain deterministic and fail closed;
- atomic observation demonstrates either reliability or measurable browser-efficiency benefit;
- adaptive recovery resolves meaningful real UI failures that deterministic recovery does not;
- recovery choices are reproducible enough to test and diagnose;
- bounded recovery cannot create unbounded loops;
- provider completion and exact response extraction remain authoritative;
- implementation boundaries are clear enough to avoid mixing browser mechanics, provider semantics, and workflow orchestration.

## Current research direction

The strongest candidate is a **hybrid deterministic + adaptive browser architecture**:

1. preserve internet workflow, receipt, authority, authentication, and provider-completion contracts;
2. introduce atomic provider snapshots as the browser observation substrate;
3. execute only runtime-owned observed actions with freshness and postcondition checks;
4. keep deterministic provider interactions as the normal path;
5. add deterministic recovery for known exceptional states;
6. use a bounded recovery agent only when the current observed state is valid but outside the deterministic model;
7. never let the recovery agent decide logical resubmission, user authority, workflow success, or exact prompt contents.

This direction uses the most valuable browser ideas demonstrated by JEV while preserving the correctness model that internet already has.
