# How `@tsuuanmi/internet` Works

- **Status:** current implementation
- **Last synchronized:** 2026-09-15

`@tsuuanmi/internet` drives authenticated ChatGPT Web and Gemini Web sessions through isolated browser contexts. It exposes direct chat/research/team tools plus a durable coding workflow whose deterministic graph control plane is separate from model reasoning.

## Runtime layers

### Browser layer

`BrowserManager` owns account-scoped Chrome lifecycle, portable auth refresh, scheduler leases, stable Website conversation bindings, visible/hidden displays, provider turn receipts, and remote login.

Semantic accounts:

```text
chatgpt-thinker
chatgpt-thinker-2
chatgpt-writer
gemini-thinker
```

Every inference turn uses a fresh BrowserContext loaded from persisted account state. Stable workflow `sessionId` binds the logical Website conversation across turns/retries; it does not mean reusing the login browser or one BrowserContext forever.

### Provider adapters

ChatGPT and Gemini adapters own provider-specific auth, mode selection, prompt submission, stable completion observation, and response extraction. ChatGPT additionally owns scoped Website GitHub confirmation detection.

Provider turn receipts persist a stable workflow request identity, prompt hash, conversation identity when known, and submission/completion evidence. Recovery can therefore reconcile a previously submitted logical turn before any bounded resubmission.

### Team layer

The shared team layer exposes deterministic plan/step semantics rather than one opaque workflow call:

```text
buildTeamPlan(...)
prepareTeamStep(...)
runTeamStep(...)
```

`internet_team` executes these steps in-memory. Workflow maps the same steps to durable graph nodes.

Prompt strategies:

```text
generic-debate
workflow-research
workflow-review
```

Member prompts use only `Member 1..N`; account/provider names remain routing/diagnostic metadata. Peer output is untrusted evidence. Synthesis targets the strongest supported combined answer.

### Workflow layer

Main responsibilities are split across:

```text
WorkflowEngine           domain transitions, exact receipts, recovery policy integration
WorkflowDriver           ownership reconciliation + READY scheduling + cancellation
WorkflowJobStore         authoritative job/graph snapshot with revision guard
WorkflowNodeResultStore  exact immutable node payload results
WorkflowHandoffStore     verbatim research/review delivery receipts
WorkflowEventJournal     ordered diagnostic history
WorkflowOperator         status/watch/control projection
BrowserWorkflowTeamRunner shared TeamStep -> browser execution adapter
BrowserWorkflowWriterRunner writer/PR/health/merge adapter
approval policy          fail-closed scoped Website authority
retention manager        explicit cleanup only
```

There is no workflow team-trace correctness store and no second lane retry state machine.

## Plugin registration

With the default thinker/writer accounts enabled, the plugin exposes direct chat/research/team/browser surfaces and the workflow command/tool surfaces. Gemini is not required for default workflow registration.

## Direct chat and research

Direct calls select an explicit semantic account. The account scheduler controls capacity and same-session ordering. BrowserManager verifies auth, opens a fresh context from persisted account state, resumes the bound Website conversation, submits the request, waits for semantic completion, refreshes durable account/conversation state, and closes the context.

## Direct team flow

`internet_team` uses an `<agent>:team:<name>` namespace and executes a `TeamPlan` in memory. With the default two-member/two-round strategy:

```text
R1/M1 -> R1/M2 -> R2/M1 -> R2/M2 -> synthesis
```

Explicit calls may choose other enabled thinker accounts. Routing changes do not change member-facing semantics.

## Workflow admission

`/workflow <objective>` resolves repository authority, queries the selected upstream remote for the exact current `main` SHA, persists it as `baseRevision`, creates a schema-v2 durable job with an initial graph, and enqueues `WorkflowDriver`.

Local worktree `HEAD` is not base authority.

## Stable workflow sessions

```text
<owner>:workflow:<job>:research:A
<owner>:workflow:<job>:research:B
<owner>:workflow:<job>:review:A
<owner>:workflow:<job>:review:B
<owner>:workflow:<job>:writer
```

Review cycle/head are exact durable inputs, not new session identities.

## Graph execution

Workflow research/review uses `TeamPlan` dependencies to build member/synthesis nodes. Readiness is derived from dependencies; no procedural whole-team replay loop exists.

A node input receipt binds correctness-bearing inputs including exact dependency output hashes plus applicable prompt/control, repository/base, PR/head, cycle, lane, account, and Website session identity. Completed payloads live in `WorkflowNodeResultStore`; the graph stores a result/output receipt.

Research A/B and Review A/B are independent graph branches. The graph scheduler can dispatch READY work from both branches; the account scheduler remains the only same-account capacity gate.

## Execution ownership and progress

Every provider attempt gets a unique `executionId`, attempt number, owner instance, start/heartbeat/lease timestamps, provider state, and progress timestamps. An expired/lost owner becomes orphaned recovery. Fencing prevents stale attempts from committing late results.

Provider completion has separate hard and semantic-stall deadlines. Meaningful response/generation changes renew progress; static UI indicators and unrelated DOM churn do not.

## Recovery

Recovery is exact and reconciliation-first:

```text
load graph
-> reconcile ownership
-> reconcile persisted node/provider/external receipts
-> recover exact result when safe
-> otherwise bounded same-node retry
```

Examples:

- later member failure retries only that member node;
- orphaned synthesis retries only synthesis;
- provider-result ambiguity fails closed rather than blindly resubmitting;
- selector parser defects classify as automation/code-fix failures;
- Writer retry reconciles deterministic branch/PR identity before another mutation attempt.

`/workflow continue` uses the existing graph and may reopen one failed engine-approved recovery target. It does not create a new job, reset research, mutate routing, or replay completed exact-input work.

## Exact handoffs and Writer

Required research synthesis results become verbatim handoffs with SHA-256 identity and idempotent delivery receipts. Only after those handoffs are acknowledged does the stable `chatgpt-writer` session receive `START_IMPLEMENTATION`.

Writer verifies repository/base authority, uses the deterministic workflow branch, implements/validates, and reconciles exactly one open PR targeting `main`. The exact PR/head receipt then expands the review graph.

## Exact-head review/remediation

Review A/B inspect the persisted PR at the exact current head. Each synthesis must return `PASS` or `CHANGES_REQUIRED` plus the exact requested `reviewedHeadSha`.

If changes are required, exact review handoffs are delivered to the same writer, which remediates the same PR. A new head creates a new review cycle; previous-head evidence cannot satisfy new dependencies.

## Health and merge

After PASS/PASS on one exact head, read-only PR health is persisted as:

```text
PASS | FAIL | PENDING | NONE | UNKNOWN
```

Merge authorization is an explicit durable user authority gate bound to repository + PR + exact head + review cycle. Immediately before merge, head and health are revalidated. Authorized workflow merge is squash-only.

## Website confirmation boundary

Recognized scope-valid implementation/remediation GitHub confirmations may be auto-approved. Unknown, malformed, ambiguous, or scope-mismatched confirmations are never clicked.

Current BrowserManager closes the turn context when such a confirmation throws into the workflow boundary, so current behavior is a durable blocked/action-required state, not a resumable live headless-browser wait. The graph model reserves `WAITING_USER` for future adapters that can safely keep and expose a live session; top-level `WAITING_USER` today is used by durable authority gates such as merge authorization.

## Events and operator projection

The graph/job snapshot is authoritative. The event journal records ordered diagnostic control-plane events with per-job sequence and graph revision. Event/Local notification failure cannot roll correctness backward.

`/workflow status` and `/workflow watch` read graph state: phase/lifecycle, exact node, execution attempt/evidence, provider activity, blockers, failure/recovery action, PR/head/health state, pending action, and recent events. Full model payloads stay outside Local progress injection.

## Stop, delete, and retention

`/workflow stop` aborts active work, waits for settlement, and persists terminal `CANCELLED`.

`/workflow delete <jobId>` requires an exact ID, cancels active work first, then removes only that workflow's local job/handoffs/node-results/event journal. It does not delete external PR/branch or Website conversations.

Aged retention is explicit operator maintenance; no automatic startup/background deletion exists.

## Correctness boundary

Website memory is tactical context, not correctness state. Correctness-bearing facts are explicit in the job/graph snapshot, exact node results, provider request receipts, handoffs, PR/head/health/authorization/merge receipts, and execution ownership records. The event journal is diagnostic history only.
