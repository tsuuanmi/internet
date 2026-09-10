# Internet Team Architecture

> **Status:** current as-built architecture  
> **Last synchronized:** 2026-09-10  
> **Implementation:** [`how-it-works.md`](./how-it-works.md)  
> **Operational flow:** [`WORKFLOW.md`](./WORKFLOW.md)  
> **Runtime state machine:** [`WORKFLOW-ENGINE.md`](./WORKFLOW-ENGINE.md)

## Goal

`@tsuuanmi/internet` is a browser-backed multi-account Website runtime. Agent-team reasoning is provider-agnostic; deterministic code preserves workflow state and user authority; a separate writer account performs scoped GitHub work.

The defining principle is:

> **User owns authority, Local brokers authority, WorkflowEngine/Driver own deterministic orchestration, provider-agnostic agent teams reason, the writer performs scoped GitHub actions, and exact PR/head/health state gates merge.**

## Planes

### Authority plane

```text
User
  -> approve/reject exact merge and explicit exceptions
Local
  -> present compact action-required state and carry user decision
```

Technical capability never equals workflow authority.

### Deterministic control plane

```text
WorkflowEngine
WorkflowDriver
Job/Handoff/TeamTrace stores
Approval policy
Event sink
Retention manager
```

This plane decides what runs next, worker cardinality, handoff ordering, retries, state validity, account routing, and authority gates.

### Cognition/data plane

```text
Research Team A/B -> exact finals -> Writer
PR -> Review Team A/B -> exact finals -> Writer
```

Full model payloads do not need to pass through Local.

### Action plane

```text
chatgpt-writer
  -> repo read
  -> branch/file/commit/PR mutation
  -> read-only PR health inspection
  -> exact authorized merge
```

## Shared team execution boundary

The public `internet_team` tool and workflow research/review are adapters over one lower-level team runtime:

```text
                         shared team runtime
                              runTeam(...)
                             /            \
                            /              \
                 internet_team        workflow team runner
                 public adapter       deterministic adapter
```

The shared runtime owns ordered member turns, peer contribution passing, purpose-specific prompt strategy, strongest-answer synthesis, provider `chat(...)` calls, transcript accumulation, structured progress/failures, and AbortSignal handling.

Adapters intentionally remain separate:

```text
internet_team
  - model/user-facing arguments and rendering
  - <agent>:team:<name> namespace
  - optional rounds/accounts/visibility/transcript projection

workflow team runner
  - authoritative workflow-generated task
  - <owner>:workflow:<job>:<phase>:<lane> namespace
  - durable per-job account routing
  - workflow prompt strategy and trace observation
  - workflow AbortSignal and engine result
```

Workflow never invokes the public `internet_team` tool as an internal RPC.

## Provider-agnostic member model

Team reasoning roles are ordinal:

```text
Member 1
Member 2
...
```

The underlying account/provider is execution metadata, not reasoning identity. Member prompts do not say ChatGPT, Gemini, or account names. Peer contributions are delimited as untrusted evidence. The synthesizer is instructed to choose the strongest supported result rather than average, concatenate, or preserve symmetry.

Current default backing route for new team/workflow executions:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
Writer   -> chatgpt-writer
```

`chatgpt-thinker` and `chatgpt-thinker-2` should be authenticated with separate ChatGPT accounts for genuine independent account state/quota. `chatgpt-writer` is not reused as a member.

`gemini-thinker` remains a supported thinker for direct chat/research and explicit team composition, but is temporarily outside the default team/workflow route. Changing the backing route must not require rewriting team prompt semantics or the shared execution loop.

## Account identities

```text
chatgpt-thinker
  provider: ChatGPT Web
  role: reasoning/review/synthesis

chatgpt-thinker-2
  provider: ChatGPT Web
  role: reasoning/review/synthesis

chatgpt-writer
  provider: ChatGPT Web
  role: terminal GitHub executor

gemini-thinker
  provider: Gemini Web
  role: optional reasoning/review
```

Authentication state, login profiles, browser pools, schedulers, remote login and durable conversations are account-scoped. Provider-to-account fallback is not part of correctness.

## Standard workflow

```text
/workflow <task>
  -> resolve repo + exact base revision
  -> durable job + automatic driver
  -> Research Team A/B concurrently
       each: Member 1 + Member 2 -> strongest synthesis
  -> exact handoffs A then B
  -> START_IMPLEMENTATION
  -> persistent chatgpt-writer
  -> deterministic branch + one PR
  -> Review Team A/B concurrently against exact PR head
       each: Member 1 + Member 2 -> exact-head synthesis
  -> exact review handoffs
  -> APPLY_REVIEWS if needed
  -> same PR, new head, re-review
  -> PASS/PASS
  -> CHECK_PR_HEALTH
  -> exact-head merge authorization request
  -> explicit user approval
  -> immediate head + health revalidation
  -> MERGE_AUTHORIZED
  -> writer merge
  -> DONE
```

Research A/B and Review A/B are launched concurrently at the workflow-lane level. Same-account turns may serialize through their account scheduler; workflow adds no A-then-B lane mutex.

## Stable Website conversations

```text
<local>:workflow:<job>:research:A
<local>:workflow:<job>:research:B
<local>:workflow:<job>:review:A
<local>:workflow:<job>:review:B
<local>:workflow:<job>:writer
```

Review cycle, exact PR head, and account routing are durable job facts rather than new session identities. Existing durable jobs retain the route they were created with; new jobs use the current default route.

## Observability

The shared team core emits structured stages:

```text
prepare_prompt
provider_turn
synthesis
complete
```

Workflow persists bounded private trace evidence with phase/lane/attempt/round/account/provider/stage/status/failure metadata. Normal operator output projects accounts as `Member 1..N`; raw account/provider identity appears only when diagnostic attribution is useful.

`/workflow status` starts with a pipeline summary and then expands Team A/B. `/workflow watch` uses the same authoritative durable state plus compact live `PROGRESS` events; it does not create another state machine.

## Handoff invariant

For every research/review handoff:

```text
handoff.payload == source final output
```

Metadata such as source, sequence, hash and delivery state stays outside the payload. Website delivery uses durable at-least-once semantics plus idempotent acknowledgement.

## PR-centric verification

The PR is canonical after writer execution. Reviewer teams inspect the actual PR and exact current head. Remediation preserves the same PR and advances the head before a new review cycle.

## PR health and merge authority

After review PASS/PASS, live PR health is classified against exact current head:

```text
PASS | FAIL | PENDING | NONE | UNKNOWN
```

Only `PASS`, or verified `NONE` where no required checks/statuses exist, may advance. Merge still requires explicit user authority bound to repository + PR + exact head and immediate pre-merge head/health revalidation.

## Local integration and recovery

Local sees compact control-plane events:

```text
INTERNAL
PROGRESS
ACTION_REQUIRED
```

Full model payloads remain in dedicated durable stores. `agent.inject()` failure cannot roll back committed workflow state.

Durable state enables restart recovery. Completed lanes/handoffs are reused. Provider/browser failures are execution failures, never member answers. Unexpected driver failures persist explicit retry state instead of resetting the job.

## Operations / retention

Retention remains explicit operator maintenance:

```text
DONE      -> eligible after 30 days
CANCELLED -> eligible after 14 days
```

Cleanup validates exact job identity and removes the selected job, exact handoffs and team trace while retaining a private audit receipt.

## Deferred boundary

Automatic provider-turn retry/failover, dynamic provider health routing, generic DAG workflows, multi-writer pooling, Website memory as correctness state, autonomous deployment, and broad non-coding generalization remain deferred until concrete requirements justify them.
