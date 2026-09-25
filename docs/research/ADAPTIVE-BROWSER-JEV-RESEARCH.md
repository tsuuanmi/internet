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


## Broader goal: a less strict browser control loop

The larger opportunity is not merely to make selectors more resilient. It is to stop treating a Website turn as a single opaque operation that either follows the expected path or fails.

A more flexible model is:

~~~text
Website/browser state
        |
        v
atomic snapshot + semantic progress event
        |
        v
Local agent / workflow reasoning
        |
        v
typed browser intent
        |
        v
runtime policy + durable validation
        |
        v
observed browser action
        |
        v
Website/browser state
~~~

This allows Local to reason about unexpected but understandable provider states without giving Local raw browser authority.

The key conversion boundary is:

~~~text
browser observation
-> semantic event
-> agent decision
-> typed intent
-> runtime-approved action
~~~

For example:

~~~text
Website shows:
  "Research timed out"
  [Retry]

Snapshot/event says:
  provider_state = recoverable_timeout
  actions = [retry:a42]
  request_receipt = submitted
  retry_policy = provider_local_retry_allowed

Local decides:
  RETRY_CURRENT_PROVIDER_ATTEMPT

Runtime validates:
  same execution
  same conversation
  same request receipt
  fresh action a42
  no duplicate logical submission

Browser executes:
  CLICK a42
~~~

The adaptive layer therefore makes the system **less strict about UI trajectories** while remaining strict about correctness, idempotency, and authority.

## Scenario 1 — Website research timeout and agent-directed retry

Today a research turn can reach a hard or semantic timeout from the runtime's perspective even though the Website itself exposes a useful recoverable state. Local deterministic logic may know only that the expected completion contract was not reached.

The browser can often observe more:

~~~text
research is no longer running
visible provider notice says the attempt timed out
Retry is available
conversation remains intact
partial research state may still be present
~~~

Rather than immediately collapsing this into a terminal generic timeout, the browser layer could return a bounded diagnostic/recovery packet:

~~~yaml
event: provider_recovery_required
reason: research_timeout
conversation: <stable conversation receipt>
execution: <current provider execution>
snapshot_revision: <freshness marker>

provider_state:
  response_present: true
  running: false
  visible_notice: "..."
  partial_output_present: true

allowed_actions:
  - id: a42
    intent: retry_current_attempt
    operation: CLICK
    role: button
    name: Retry
~~~

Local can then reason at the semantic level:

~~~text
current workflow still needs this research result
+ provider reports a recoverable timeout
+ retry refers to the current provider attempt
+ runtime says retry is safe
=> retry
~~~

The result is converted back into a typed browser intent rather than arbitrary instructions:

~~~text
RETRY_CURRENT_PROVIDER_ATTEMPT(snapshot=a42)
~~~

The browser runtime revalidates freshness and durable receipts before clicking the observed Retry control.

This is stronger than hardcoding every possible timeout/error surface because:

- the browser captures what is actually visible now;
- Local can combine that observation with workflow context;
- the same semantic recovery intent can survive provider UI wording/layout changes;
- the executor remains constrained to runtime-approved actions.

### Timeout should become a diagnostic boundary before a terminal boundary

A useful experiment is to change the conceptual sequence from:

~~~text
completion timeout
-> close provider turn
-> return timeout error
~~~

to:

~~~text
completion deadline reached
-> take final atomic snapshot
-> classify provider state

completed/recoverable:
  reconcile normally

known recoverable:
  emit recovery-required event

unknown but actionable:
  ask bounded recovery policy

ambiguous or unsafe:
  fail closed
~~~

This does not mean every timeout must be extended indefinitely. A workflow still needs a hard budget. It means the budget boundary should preserve enough observed state for an informed recovery decision instead of discarding the browser situation immediately.

## Scenario 2 — User adds information while a Website agent is running

> Current production architecture explicitly defers live resumable headless-browser user interaction. This section is research for a possible future promotion; it does not change the current architecture contract.


A second opportunity is live steering.

Suppose Research Team A is already running a Website research turn and the user adds an important constraint or source. The desired behavior is not necessarily:

~~~text
cancel everything
-> restart workflow
-> replay research from the beginning
~~~

If the provider conversation supports receiving a follow-up/steering message while the ongoing task remains usable, Local could convert the user update into a durable **turn augmentation** and deliver it into the same stable Website conversation.

Conceptually:

~~~text
User
  -> Local
  -> interpret update against active workflow
  -> create durable augmentation
  -> target active research conversation
  -> deliver as provider message when browser state permits
  -> research continues
  -> final result records the augmentation as part of its exact input lineage
~~~

Example:

~~~yaml
augmentation:
  id: aug-17
  target_node: research:A:synthesis
  target_execution: exec-42
  source: user
  message: "Also compare the new upstream JEV snapshot design."
  message_hash: ...
  created_at: ...

delivery:
  conversation: <stable Website conversation>
  status: pending | delivered | incorporated | superseded
~~~

### Preserve the main workflow while allowing live steering

The workflow graph does not need to be replaced by an open-ended chat loop.

The durable graph can remain:

~~~text
Research A -> synthesis -> Writer
~~~

while the active provider execution has an ordered control/input stream:

~~~text
initial exact input
  + augmentation aug-17
  + augmentation aug-18
  -> final provider result
~~~

The resulting node receipt must bind to the final ordered augmentation set. Otherwise the system would violate its own exact-input rule by claiming that a result was produced from the original input when the user materially changed it mid-run.

A candidate identity is therefore:

~~~text
effective_input_hash =
  hash(
    base_input_hash,
    ordered_applied_augmentation_hashes
  )
~~~

If an augmentation arrives after the provider result is already complete, it should not be retroactively attached. It becomes either:

- a follow-up provider turn in the same stable Website conversation;
- a new/reopened workflow WorkItem;
- or an input revision that invalidates the old result under normal workflow rules.

Which behavior is correct depends on the semantic ownership of the active node.

### Browser action conversion for live steering

The local agent should not directly call DOM operations.

It emits an intent such as:

~~~text
SEND_AUGMENTATION(
  augmentation_id = aug-17,
  target_execution = exec-42
)
~~~

The browser layer then observes the current Website state and chooses the safe mechanical action:

~~~text
if composer accepts steering message now:
  attach exact runtime-owned augmentation text
  verify exact attachment
  submit through observed semantic Send action

else if provider exposes "add details", "continue", or equivalent:
  map intent to the observed supported control

else:
  keep augmentation pending and re-observe

if current provider state makes delivery semantically unsafe:
  return blocked / defer; do not invent a path
~~~

This makes the Website agent interactive without making browser presentation state part of workflow correctness.

## A general Local <-> Website control protocol

The two scenarios above suggest a broader interface than today's request/response-shaped browser turn.

Possible semantic events from Browser/Provider to Local:

~~~text
PROGRESS
RESPONSE_CHANGED
RECOVERY_REQUIRED
RECOVERABLE_TIMEOUT
CONTINUE_AVAILABLE
RETRY_AVAILABLE
INPUT_REQUIRED
PROVIDER_BLOCKED
CONFIRMATION_REQUIRED
COMPLETED
~~~

Possible typed intents from Local to Browser/Provider:

~~~text
CONTINUE_CURRENT_ATTEMPT
RETRY_CURRENT_ATTEMPT
WAIT_FOR_PROGRESS
SEND_AUGMENTATION(augmentation_id)
RESTORE_PENDING_EXACT_INPUT
DISMISS_NON_AUTHORITY_MODAL
ABORT_CURRENT_ATTEMPT
~~~

Not every event or intent needs to become a public API. This is a research vocabulary for separating:

- what the Website/browser currently says is possible;
- what Local/workflow reasoning wants to do;
- what the deterministic runtime is actually allowed to execute.

The runtime remains the compiler and policy enforcement layer between semantic intent and browser action.

## How JEV could improve internet

JEV's contribution is not one isolated optimization. Its design suggests several complementary improvements.

### 1. From selector-first automation to observation-first automation

Current provider code often starts with an expected selector/action sequence:

~~~text
find expected control
-> interact
-> wait for expected next control/state
~~~

JEV starts by observing the actual actionable state.

For internet, the hybrid form would be:

~~~text
take provider-aware atomic snapshot
-> recognize expected semantic state
-> use deterministic path when recognized
-> otherwise reason over observed state
~~~

This makes the implementation tolerant of legitimate alternate UI trajectories without abandoning provider semantics.

### 2. Atomic snapshots make failures explainable

A failed sequence currently may expose only the failed locator/postcondition.

A snapshot can preserve:

- visible provider notice;
- running/completed status;
- composer contents;
- retry/continue controls;
- modal state;
- current mode;
- bounded visible text;
- exact observed action set.

That gives Local enough evidence to distinguish:

~~~text
wait more
retry
continue
restore input
dismiss modal
ask user
fail closed
~~~

instead of mapping every unknown state to a generic provider error.

### 3. Dynamic action spaces reduce hardcoded mechanical paths

internet should keep hardcoded **semantic invariants**, but it does not need to hardcode every mechanical UI path.

For example, the invariant may be:

~~~text
Deep Research must be enabled before submitting this research request.
~~~

The mechanical UI path could evolve:

~~~text
old UI:
  Tools -> Deep research

new UI:
  Research button

alternate UI:
  mode menu -> Deep Research
~~~

An atomic snapshot plus runtime-owned action space allows a bounded agent to select the current path while the provider adapter still verifies the semantic postcondition: Deep Research is actually enabled.

### 4. Semantic actions can survive UI renames and reshuffles

JEV separates “what operation is needed” from “which current target can perform it.”

internet can use the same idea at a safer semantic level:

~~~text
intent: CONTINUE_CURRENT_ATTEMPT

snapshot candidates:
  [a1] Continue
  [a2] Resume
~~~

The runtime can expose only candidates compatible with that intent. The agent does not search the whole DOM or invent selectors.

### 5. Freshness guards reduce wrong-button interactions

When UI changes between observation and action, the system should re-observe rather than click a stale target.

This directly addresses cases where internet occasionally presses the wrong control because a menu, modal, or rerender changed the page between locator discovery and execution.

### 6. Postcondition-oriented execution makes retries safer

A successful click is not the same as a successful semantic transition.

Every adaptive action should have a postcondition:

~~~text
Continue
-> generation resumes

Retry
-> a new provider-local attempt starts

Send augmentation
-> exact augmentation is acknowledged in the target conversation

Select research mode
-> research mode reads enabled
~~~

This lets deterministic logic remain the final judge of whether an adaptive browser action worked.

### 7. Local reasoning can use workflow context that the browser cannot

A pure browser agent sees the page but may not know:

- whether the logical request was already submitted;
- whether a retry is idempotent;
- whether the user just changed requirements;
- whether this node is still authoritative;
- whether a newer workflow revision superseded the current execution;
- whether an action would expand user authority.

Local/workflow state knows these facts.

JEV-style observation becomes much more useful when paired with internet's durable context:

~~~text
browser says what is visible/possible
+
workflow says what is correct/allowed
+
Local reasons about what should happen
+
runtime executes only the intersection
~~~

### 8. The browser turn can evolve from request/response into a controlled session

The current abstraction is close to:

~~~text
submit request
-> wait
-> return completed result or error
~~~

The researched abstraction is closer to:

~~~text
start/attach provider execution
-> observe semantic events
-> optionally receive typed control intents
-> execute validated browser actions
-> continue observing
-> reconcile durable result
~~~

This better matches long-running research where timeouts, interruptions, new user information, provider questions, and recovery actions can occur before final completion.

It should still be bounded by one durable workflow execution and exact conversation/request receipts.

### 9. Less strict trajectory, stricter boundary

The intended outcome can be summarized as:

~~~text
BEFORE
strict UI trajectory
+ strict correctness boundary

AFTER
adaptive UI trajectory
+ strict correctness boundary
~~~

The goal is not “let the agent click whatever looks right.”

The goal is:

> make the system flexible about how it reaches a valid provider state, while remaining uncompromising about what counts as the correct workflow state.

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

## Self-debugging and development feedback loop

A third use case is especially valuable for internet itself: the same observation layer can make provider integration development much more self-explanatory.

Today, when a new Website feature is added or a provider UI changes, Local may know only that a deterministic step failed:

~~~text
expected Send button
-> selector did not match
-> provider interaction failed
~~~

At that point, development often becomes manual DOM archaeology:

- inspect the live page;
- dump HTML around the composer;
- search for current attributes or ARIA roles;
- compare several similar buttons;
- determine which control is actually enabled/visible;
- update selectors;
- rerun and repeat.

This is expensive because Local is reasoning from an error produced by old assumptions rather than from the page that actually exists.

A JEV-style atomic snapshot changes the development loop:

~~~text
new feature / provider UI drift
        |
        v
deterministic logic cannot satisfy expected semantic state
        |
        v
atomic browser snapshot
        |
        v
Local receives:
  visible semantic state
  actionable controls
  accessible names/roles
  values / enabled state
  bounded context
  freshness marker
        |
        v
Local can understand the current Website state
        |
        +--> choose a safe runtime recovery action
        |
        +--> identify which provider assumption is stale
        |
        +--> propose/update provider adapter code and tests
~~~

The key improvement is that internet can expose **what the browser sees in a machine-reasonable form** instead of forcing Local to rediscover the DOM from scratch.

### Example — Send button no longer matches

Old development loop:

~~~text
chatgptSend()
-> CHATGPT_SEND_BUTTON_SELECTOR finds 0 controls
-> provider_error

Developer/Local:
  manually inspect DOM
  find new button structure
  determine whether it is really Send
  update selector
~~~

With an observation layer:

~~~yaml
expected_semantic_action: submit_prompt

snapshot:
  composer:
    role: textbox
    text_matches_expected_prompt: true

  observed_actions:
    - id: a31
      role: button
      name: Send message
      enabled: true
      context: composer form

    - id: a32
      role: button
      name: Start voice mode
      enabled: true
      context: composer form
~~~

Local can immediately reason:

~~~text
the provider still exposes a semantic Send action
the hardcoded selector no longer recognizes it
a31 is the likely canonical submit control
a32 must remain excluded
~~~

That information is useful in two different ways:

1. **runtime:** a bounded policy may execute a31 if current policy permits it;
2. **development:** Local can update the deterministic provider adapter and add a regression test representing the new DOM shape.

The adaptive layer therefore does not merely hide provider drift. It can help turn drift into a concrete, testable maintenance task.

### Semantic expectation versus observed reality

Every important provider interaction can expose a diagnostic pair:

~~~text
Expected:
  semantic action = SEND_PROMPT
  invariant = exact prompt attached
  postcondition = submission acknowledged

Observed:
  composer present
  exact prompt attached
  known Send selector missing
  observed button "Send message" present/enabled
  voice button also present
~~~

This is much more useful to a coding agent than:

~~~text
locator timeout after 10000ms
~~~

The diagnostic should answer:

- what semantic state was expected;
- what semantic state was actually observed;
- which expected selector/assumption failed;
- which actionable controls currently exist;
- which controls are close semantic candidates;
- what changed since a known-good fixture/snapshot, when available.

### Snapshot-driven provider adapter development

A future development workflow could be:

~~~text
1. Run provider interaction in diagnostic/development mode.
2. Capture sanitized atomic snapshots at semantic boundaries.
3. Deterministic adapter fails or reaches an unknown state.
4. Local receives the failure plus the exact bounded snapshot.
5. Local identifies stale provider assumptions.
6. Local adds/updates a fixture representing the observed state.
7. Red: regression test proves current adapter cannot handle it.
8. Green: update deterministic semantic adapter.
9. Refactor: reduce duplicated selectors/rules and keep snapshot/recovery generic.
10. Re-run live diagnostic to verify the postcondition on the real Website.
~~~

This fits internet's preferred TDD workflow particularly well: a live Website failure becomes evidence for a reproducible fixture and regression test rather than a one-off selector patch.

### The snapshot should support explanation, not only execution

For runtime action selection, the action space can stay compact.

For development diagnostics, Local may need slightly richer but still bounded information:

~~~yaml
semantic_boundary: prompt_submission

expected:
  composer_present: true
  exact_prompt_attached: true
  send_action_present: true

observed:
  composer_present: true
  exact_prompt_attached: true
  send_action_present_by_known_adapter: false

actions:
  - id: a31
    role: button
    accessible_name: Send message
    enabled: true
    visible: true
    ancestor_summary: composer form
    semantic_features:
      near_composer: true
      submit_like: true

  - id: a32
    role: button
    accessible_name: Start voice mode
    enabled: true
    visible: true
    ancestor_summary: composer form

diagnostic:
  failed_assumption: known_send_selector
~~~

This can remain far smaller and safer than sending a complete raw DOM dump.

### Optional snapshot diffing

Once snapshots exist, internet can compare a failing provider state with a known-good semantic fixture:

~~~text
known good
  button name = Send
  data-testid = send-button

current
  button name = Send message
  data-testid = absent

unchanged
  composer relationship
  enabled state
  semantic location
  exact prompt
~~~

A Local coding agent can then see that the likely change is a provider presentation contract rather than the workflow logic itself.

The goal is not to automatically patch selectors from arbitrary live HTML. The goal is to make the evidence required for a correct patch immediately available.

### Development-mode action trace

A useful diagnostic artifact could record only browser semantics around a failed interaction:

~~~text
OBSERVE rev=17
  expected SEND_PROMPT
  known target absent
  candidates a31 Send message, a32 Start voice mode

DECIDE
  deterministic adapter unresolved

RECOVERY/DEBUG
  Local maps a31 -> SEND_PROMPT candidate

EXECUTE
  a31

POSTCONDITION
  generation_started = true
~~~

If the action succeeds and satisfies the canonical postcondition, that trace becomes strong evidence for how the deterministic adapter should be updated.

It is still evidence, not authority: a successful exploratory click should not automatically rewrite production selectors or promote new behavior without tests/review.

### Self-development boundary

The long-term opportunity is that internet can become partially **self-debuggable**:

~~~text
internet runs
-> internet observes an unexpected Website state
-> Local understands that state from the snapshot
-> Local can continue safely when allowed
-> Local can also diagnose why deterministic code failed
-> Local updates tests + provider adapter
-> internet becomes more deterministic for that state next time
~~~

This produces a healthy feedback loop:

~~~text
unknown state
-> adaptive observation/recovery
-> captured evidence
-> deterministic implementation improvement
-> smaller unknown-state surface
~~~

The adaptive layer should therefore be treated as both:

- a runtime resilience mechanism; and
- an engineering observability/development mechanism.

A good outcome is not that more and more behavior moves into an agent. A good outcome is that the agent helps internet understand new Website states, and repeated/important states can then be promoted into clear deterministic semantics and regression tests.

### Safety and privacy for development diagnostics

Development snapshots should remain sanitized and bounded.

Avoid exposing or persisting:

- cookies;
- access tokens;
- account identifiers not needed for the interaction;
- full raw DOM when semantic extraction is sufficient;
- unrelated conversation content;
- hidden form values;
- password/file inputs.

The diagnostic contract should prioritize semantic facts and actionable visible controls, matching the same principle used for runtime recovery.

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

9. **Timeout diagnosis before teardown**
   - a research deadline captures one final atomic snapshot before the provider context is discarded;
   - a safe Retry/Continue surface becomes a typed recovery event rather than an unstructured timeout;
   - unsafe or ambiguous timeout states still fail closed.

10. **Mid-run augmentation lineage**
   - a user update is durably recorded before browser delivery;
   - delivered augmentations are ordered and included in the effective input hash;
   - a stale completion produced before a material augmentation cannot satisfy the revised input;
   - an augmentation arriving after completion becomes an explicit follow-up/reopen rather than silently changing history.

11. **Control-stream isolation**
   - control intents cannot mutate workflow graph authority directly;
   - browser actions are executed only after current execution, receipt, freshness, and policy validation;
   - duplicate augmentation delivery is idempotently reconciled.

12. **Self-debugging diagnostics**
   - a failed semantic interaction returns the expected state plus a sanitized atomic observation of the actual state;
   - diagnostic snapshots expose enough role/name/state/context to distinguish a new Send control from nearby non-Send controls;
   - live evidence can be converted into an offline regression fixture without persisting secrets;
   - successful exploratory recovery does not silently modify or promote production provider rules.

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
11. What is the smallest sanitized snapshot that lets a Local coding agent diagnose provider UI drift without requiring raw DOM dumps?
12. Which observed states should be promoted from adaptive recovery into deterministic provider fixtures and rules, and on what evidence threshold?
13. Can semantic snapshot diffs reliably distinguish provider presentation drift from actual workflow/provider-contract changes?

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

## Codebase-validated implementation direction

A repository-level review against the current `main` branch materially refines the research direction above. The JEV-inspired concepts remain useful, but they should be introduced in layers that match internet's existing browser, provider, receipt, workflow, and authority boundaries rather than as one generic browser-agent feature.

### Current execution paths that must not be conflated

The repository currently has three distinct paths that can all be described informally as "research":

1. **Workflow Research A/B** is part of the production v3 coding workflow. It runs through `WorkflowEngine -> BrowserWorkflowTeamRunner -> BrowserManager.chat()`. These are ordinary provider turns and already participate in workflow-scoped provider-turn receipts and reconcile-before-resubmit behavior.
2. **`internet_research`** runs provider-native Deep Research through `BrowserManager.research()`. It has durable conversation binding, but it does not currently use workflow provider-turn receipts.
3. **Workflow vNext external deep research** is represented by `WorkflowExternalDeepResearchAdapter -> BrowserManager.research()`. The capability and vNext runtime primitives exist in the repository, but the production plugin wiring in `src/index.ts` still instantiates the existing `WorkflowEngine` / `WorkflowDriver` path rather than the vNext coordinator.

Recovery, retry, and live-control design must preserve these distinctions. In particular, a safe ordinary workflow-turn retry does not automatically imply that provider-native Deep Research can use the same retry semantics today.

### Production workflow and vNext coexist intentionally

The current plugin wiring still creates the v3 workflow runtime:

~~~text
WorkflowEngine
    +
WorkflowDriver
    |
    v
BrowserManager
~~~

The repository also contains the newer capability/runtime/interaction architecture:

~~~text
workflow/runtime/*
workflow/interactions/*
capability-registry.ts
artifact-store.ts
input-bundle-store.ts
work-item-store.ts
profiles/research/deep-research-capability.ts
~~~

These newer modules are not obsolete merely because they are not yet the production entry path. They are the stronger future boundary for typed external signals, PendingAction authority, exact-input materialization, deterministic execution fencing, and capability routing.

New browser primitives may be shared by both generations. New workflow control-plane concepts should not be grafted deeply into v3 if the same responsibility already has a canonical vNext home.

### Split lightweight completion observation from full recovery observation

JEV performs one rich browser observation per decision cycle. internet has a different workload: completion can be polled every few hundred milliseconds while provider generation may last minutes.

A full JEV-style action-space scan on every completion poll would mix two distinct needs.

The browser substrate should therefore expose at least two observation levels:

~~~text
LIGHTWEIGHT ATOMIC COMPLETION SNAPSHOT
- newest provider response
- response text/html
- running state
- minimal provider error/completion facts

used frequently by waitForStableCompletion()

FULL DIAGNOSTIC / ACTION SNAPSHOT
- current semantic provider state
- visible actionable controls
- runtime-owned node identities
- local context/guards
- known interruption/error surfaces
- modal/authority surfaces
- freshness marker

used at semantic boundaries, unexpected states, timeout/stall diagnosis,
or before bounded recovery
~~~

This preserves the main JEV benefit — internally coherent observations with fewer round trips — without paying the cost of building a generic action table five times per second.

### Provider completion remains provider-specific

`waitForStableCompletion()` already has a useful narrow responsibility:

- semantic progress transitions;
- stall detection;
- hard timeout;
- stable completed response detection.

It should not become the home of recovery policy or browser-agent reasoning.

The preferred boundary is:

~~~text
provider-specific atomic completion reader
        |
        v
waitForStableCompletion()
        |
        +-- completed -> return
        |
        +-- stall / timeout
                 |
                 v
          recovery orchestration
          using a FULL observation
~~~

The completion state machine remains reusable and deterministic.

### Preserve current strict submission invariants

Current ChatGPT submission deliberately verifies the exact attached prompt and requires the semantic Send action. Tests explicitly ensure the implementation never falls back to nearby controls such as Start Voice.

Adaptive observation must preserve this invariant.

A future recovery packet may report:

~~~text
expected:
  semantic action = SEND_PROMPT

observed:
  [a31] button "Send message"
  [a32] button "Start voice mode"
~~~

but that does not grant a generic browser agent permission to click either control. The provider/runtime layer still decides whether an observed candidate is semantically compatible with the intended action, then validates freshness and the postcondition before accepting success.

### Self-debugging is the safest first adaptive capability

The lowest-risk, highest-value first step is not autonomous recovery. It is structured diagnosis.

Today failures may be flattened into a locator/provider error even though the page contains enough evidence for Local to understand that a deterministic provider assumption has drifted.

A canonical diagnostic should capture, before context teardown:

~~~text
ProviderTurnDiagnostic
  provider
  stage
  failure kind
  expected semantic state / invariant
  observed completion state
  composer state
  provider issue
  sanitized visible action candidates
  freshness identity
~~~

Example:

~~~yaml
kind: interaction_contract_changed
stage: submit_prompt

expected:
  semanticAction: SEND_PROMPT
  exactPromptAttached: true

observed:
  composerPresent: true

actions:
  - id: a31
    role: button
    name: Send message
    enabled: true
    scope: composer
  - id: a32
    role: button
    name: Start voice mode
    enabled: true
    scope: composer
~~~

This is enough for a Local coding agent to understand a provider UI drift, create an offline fixture, reproduce the problem as a Red regression test, and update the deterministic adapter without first granting the agent browser mutation authority.

### Authority surfaces must stay outside generic recovery

`chatgpt-confirmation.ts` already classifies workflow-scoped GitHub confirmations and fails closed when structured metadata or authority cannot be proven.

A generic action snapshot may report that an authority-bearing confirmation exists, but its approval controls must not become ordinary adaptive actions.

Conceptually:

~~~text
snapshot:
  authoritySurfacePresent = true

generic recovery action space:
  approval controls omitted

authority path:
  existing workflow confirmation policy
~~~

Adaptive UI handling must not become an authority bypass.

### Ordinary workflow turns can gain recovery before Deep Research

Ordinary workflow provider turns already have a durable logical identity through `ProviderTurnReceipt` and reconciliation states:

~~~text
WAIT
RECOVER
RESUBMIT
AMBIGUOUS
~~~

This makes them the safer first place to test bounded recovery.

The conceptual sequence can become:

~~~text
stall / timeout
    |
    v
final full observation
    |
    v
known recoverable provider state?
    |
    +-- yes -> validate durable receipt + semantic intent
    |          -> validate fresh observed action
    |          -> execute
    |          -> verify postcondition
    |          -> resume completion wait
    |
    +-- no  -> preserve existing workflow recovery
               (for example RECREATE_SESSION or USER_ACTION)
~~~

Browser recovery should therefore augment the existing workflow recovery system rather than replace it.

### Provider-native Deep Research needs stronger logical-turn identity first

`BrowserManager.research()` does not currently use the ordinary workflow receipt path. `internet_research` and the vNext external deep-research adapter both call this provider-native flow without a workflow `requestKey`.

The existing receipt implementation is also explicitly workflow-scoped: its logical request key embeds a 32-hex workflow job ID and its storage path lives under workflow provider-turn state.

Therefore this rule is important:

> A visible provider Retry button is not sufficient proof that retrying provider-native Deep Research is semantically safe.

Before provider-native Deep Research gains adaptive Retry/Continue behavior, the logical provider-turn receipt concept should be generalized so that the same authoritative identity/reconciliation model can cover:

- ordinary workflow turns;
- direct `internet_research` turns;
- vNext capability-owned Deep Research turns.

Do not create a parallel `DeepResearchReceiptStore` unless code inspection proves that the semantics are genuinely different. Prefer one authoritative logical-turn representation.

### Live user steering belongs in the workflow control plane

The repository already contains vNext primitives for durable external interaction:

- `WorkflowExternalSignal`;
- request idempotency;
- expected run revision;
- provenance;
- schema validation;
- responder/authority policy;
- durable PendingAction handling.

These are a better foundation for user steering than a new browser-specific augmentation store.

A future live update should follow a boundary like:

~~~text
User
  |
  v
Local
  |
  v
WorkflowExternalSignal
  |
  v
schema + revision + authority validation
  |
  v
effective execution input / control projection
  |
  v
provider semantic intent
  |
  v
fresh observed browser action
~~~

The final provider result must bind to the effective input that actually produced it. If a material user signal is incorporated during a run, the result cannot truthfully claim only the original InputBundle as its complete provenance.

Because the vNext interaction/runtime path is not yet the production entry point, this live-control feature should not be implemented as a second ad-hoc protocol inside `WorkflowEngine` v3.

### Proposed implementation sequence

The refined implementation sequence is intentionally smaller and more dependency-aware than a single "adaptive browser" change.

#### PR A — atomic observation and structured diagnostics

No adaptive mutation behavior.

Add a provider-neutral browser observation module for runtime-owned visible action identities and sanitized local context, plus a canonical provider-turn diagnostic type/formatter.

Refactor ChatGPT and Gemini completion readers so the lightweight completion snapshot is atomic per provider document where practical.

Capture a full diagnostic snapshot before BrowserManager closes a failed context.

Return one typed diagnostic shape through `internet_chat` and `internet_research` rather than provider-specific diagnostic strings.

TDD emphasis:

- one DOM transition cannot combine response state from one revision with running state from another;
- hidden, disabled, read-only, password, file, and irrelevant offscreen controls are excluded;
- missing ChatGPT Send never permits Start Voice;
- the same failure still exposes enough action metadata to diagnose the changed UI;
- diagnostic collection failure never masks the original provider failure.

#### PR B — freshness-safe observed action execution

Introduce a browser execution primitive that accepts only runtime-owned observed action identities.

Before interaction, revalidate:

- document/freshness identity;
- node connectivity;
- visibility;
- enabled/read-only state;
- semantic guard;
- click occlusion where relevant.

Expose semantic intents such as `CONTINUE_CURRENT_ATTEMPT` or `DISMISS_TRANSIENT_MODAL`, not raw model-authored selectors or JavaScript.

Keep authority-bearing confirmations outside this generic executor.

#### PR C — bounded recovery for ordinary receipt-backed turns

Use the full observation only after deterministic provider progress fails or reaches a recovery boundary.

Allow a small fixed recovery budget for known safe provider-local actions.

Every action must have a semantic postcondition, for example:

~~~text
Continue -> generation resumes
Retry    -> same logical provider attempt becomes active
Dismiss  -> blocking non-authority modal disappears
~~~

If recovery cannot be proven safe or makes no progress, fall back to the existing workflow recovery behavior.

Do not add configuration knobs until there is evidence operators need them.

#### PR D — generalize provider logical-turn identity and recover Deep Research

Refactor the workflow-specific provider-turn receipt concept into one canonical logical provider-turn representation that can cover ordinary chat and provider-native Deep Research ownership.

Preserve durable migration semantics for existing receipt data. Avoid maintaining two permanent runtime paths for old and new receipts.

Only after this identity exists should provider-native Deep Research expose Retry/Continue recovery.

#### Later — workflow-native Local <-> Website live control

After the vNext runtime/control plane is the canonical production path, map user updates into typed durable external signals and effective-input lineage.

Do not first implement this as a v3-only augmentation protocol that would later need to be migrated.

### Module boundary guidance

Do not immediately reorganize all provider files into a new directory tree. The architectural separation should first be made explicit through behavior and module responsibility.

Keep these responsibilities narrow:

~~~text
browser/completion
  completion/stall state machine only

browser observation
  what is currently visible/actionable

browser execution
  freshness-safe mechanical execution

provider adapters
  what controls and states mean for ChatGPT/Gemini

BrowserManager
  orchestration, session/account/conversation lifecycle

workflow
  logical correctness, receipts, authority, exact input, recovery ownership
~~~

After these boundaries stabilize, a later structural refactor may move provider semantics under `src/providers/` without mixing it into the behavioral change.

### Dependency guidance

Do not add Browser Harness solely because JEV uses it.

internet already owns browser lifecycle through `patchright-core`. The useful JEV ideas — atomic observation, runtime-owned node identities, freshness guards, focused postconditions, and reduced protocol round trips — can be implemented without replacing the current browser stack.

Optional raw CDP usage should be evidence-driven and narrowly scoped, for example for:

- focus emulation experiments;
- protocol-call instrumentation;
- performance measurements that Patchright cannot expose cleanly.

### Validation commands for implementation PRs

The repository's canonical verification remains:

~~~bash
npm ci
npm run check
npm test
npm run build
git diff --exit-code -- dist
test -z "$(git ls-files --others --exclude-standard -- dist)"
npm run verify-package
~~~

During Red -> Green -> Refactor development, run focused tests first, then the complete canonical suite.

### Promotion principle

The most important refined rule is:

> Learn from how JEV observes and safely executes against a changing browser; do not replace internet's provider semantics, workflow truth, receipts, or authority model with JEV's generic decision policy.

The browser may become more adaptive about **how** it reaches a valid state. The workflow/runtime must remain authoritative about **which** states and actions are valid.

