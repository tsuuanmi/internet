# Software Requirements Specification — Internet Workflow Runtime

- **Status:** implemented normative requirements
- **Version:** 5.0
- **Last synchronized:** 2026-09-15

## 1. Purpose

This SRS defines the required behavior of the current `@tsuuanmi/internet` multi-account Website workflow runtime for coding tasks. The durable dependency graph is the authoritative execution model. Implementation detail lives in [`how-it-works.md`](../design/how-it-works.md), [`WORKFLOW-ENGINE.md`](../design/WORKFLOW-ENGINE.md), and [`WORKFLOW-GRAPH-ORCHESTRATION.md`](../design/WORKFLOW-GRAPH-ORCHESTRATION.md).

## 2. Primary UX

The standard coding workflow is started explicitly:

```text
/workflow <task>
```

Routine operator controls are:

```text
/workflow list
/workflow status [jobId]
/workflow watch [jobId]
/workflow stop [jobId]
/workflow continue [jobId]
/workflow delete <jobId>
```

The start command shall resolve repository authority, query the selected upstream remote for the exact current `main` head SHA, persist that SHA as `baseRevision`, create one durable workflow job, print its job ID, build the initial dependency graph, and enqueue deterministic execution. Local worktree `HEAD` shall not be workflow base authority. Automatic task detection is not required.

The standard human authority boundary is exact-head merge authorization after independent review and acceptable PR/CI health.

## 3. Actors and authority

### User

Owns final merge authority and explicit exception decisions surfaced by the workflow.

### Local Agent

Acts as the user-facing authority broker. It starts jobs, receives compact progress/action-required context, carries user decisions back to the workflow, and may inspect diagnostic details. It is not the deterministic workflow state machine and need not summarize normal research/review payloads.

### WorkflowEngine

Owns the authoritative durable graph/job snapshot, exact input/output receipts, phase gates, account routing, handoff gates, exact-head review/health validation, merge authority, and recovery/idempotency semantics.

### WorkflowDriver

Reconciles execution ownership, schedules READY nodes, deduplicates active work by job ID, resumes safe runnable work after restart, and stops at durable action/terminal boundaries. It does not own workflow-domain transitions.

### Agent-team members

Reasoning/review participants are logical `Member 1..N` roles backed by explicit authenticated thinker accounts. Provider identity is not a reasoning role.

Current default backing route for new jobs:

```text
Member 1 -> chatgpt-thinker
Member 2 -> chatgpt-thinker-2
```

`gemini-thinker` remains available for explicit direct/research/team use but is not required by the default workflow.

### Writer account

`chatgpt-writer` is a separate Website identity used for repository mutation, PR work, read-only PR health inspection, and merge only after exact user authorization. It shall not be reused as a reasoning member.

### GitHub / CI

The PR, exact head SHA, and check/status policy are canonical external implementation evidence.

## 4. Functional requirements

### FR-001 — Explicit durable workflow start

`/workflow <task>` shall start one durable job and shall not encode the complete protocol as one giant Local prompt.

### FR-002 — First-class semantic account identity

Authenticated runtime boundaries shall use explicit semantic `accountId`, not provider as an implicit identity selector.

Current accounts:

```text
chatgpt-thinker
chatgpt-thinker-2
chatgpt-writer
gemini-thinker
```

### FR-003 — Account isolation

Portable auth state, login profiles, browser/runtime ownership, schedulers, conversations, and remote-login state shall remain isolated per semantic account.

### FR-004 — Clean-break identity model

The runtime shall not depend on provider-to-account aliases, provider-keyed state read-through, legacy schema migration, or compatibility import unless a future explicit requirement changes this contract.

### FR-005 — High ChatGPT default

Ordinary ChatGPT browser turns shall default to reasoning level `high` unless explicitly configured otherwise.

### FR-006 — Explicit synthesis identity

Team synthesis shall route to an explicit backing account that belongs to the selected team and has synthesis capability. Current default: `chatgpt-thinker`.

### FR-007 — Shared deterministic team semantics

`internet_team` and workflow research/review shall use the same lower-level deterministic team-plan and step primitives. Workflow shall not invoke the public tool wrapper as an internal RPC and shall not duplicate speaking-order, peer-context, prompt-strategy, or synthesis semantics.

### FR-008 — Two independent workflow branches per team phase

The standard coding job shall contain two research team branches and two post-PR review team branches.

### FR-009 — Concurrent graph readiness

Research A/B and Review A/B shall remain independently schedulable when graph dependencies are satisfied. Workflow shall not introduce an A-then-B mutex. The account scheduler remains the sole owner of same-account capacity and per-session serialization.

### FR-010 — Stable per-job Website sessions

Research A/B, Review A/B, and writer shall use stable deterministic job-scoped session identities. Review cycle, exact PR head, and account routing shall remain durable facts rather than creating new session identities.

### FR-011 — Provider-agnostic member prompts

Team prompt semantics shall identify reasoning participants only as ordered `Member 1`, `Member 2`, ... roles. Normal prompts shall not reveal or depend on provider/account identity.

### FR-012 — Untrusted peer-content boundary

Peer model output supplied to another member or synthesizer shall be clearly delimited as untrusted content/evidence rather than instruction authority.

### FR-013 — Strongest-supported synthesis

Synthesis shall target one strongest supported combined answer. It shall not require equal weighting, concatenation, neutral summarization, or preservation of every member proposal.

### FR-014 — Deterministic workflow prompt strategy

Workflow prompts shall be constructed from authoritative job facts including objective, repository/base or PR/head identity, team focus, constraints, and output contract. Research and review may use purpose-specific strategies while sharing the same team semantics.

### FR-015 — Durable account routing

Each workflow job shall persist exact ordered thinker accounts, writer account, and synthesizer account. Routing validation shall use semantic account capabilities rather than hard-coding one provider pair.

### FR-016 — No silent routing mutation

Retry/restart of an existing durable job shall retain that job's persisted member routing. A change to global/default routing shall affect only newly created jobs unless an explicit migration operation is specified.

### FR-017 — Current default two-ChatGPT route

New workflow jobs shall currently route Member 1 to `chatgpt-thinker` and Member 2 to `chatgpt-thinker-2`. `chatgpt-writer` remains separate. Gemini shall not be required for default workflow registration.

### FR-018 — Verbatim handoffs

Each research/reviewer final output shall be stored and delivered to the writer without summarization or rewriting. Metadata shall remain outside the payload.

### FR-019 — Payload integrity

Each handoff shall persist SHA-256 of exact UTF-8 payload and deterministic logical identity. Corrupted/tampered persisted handoffs shall fail closed.

### FR-020 — Delivery semantics

Website handoff transport shall be treated as at-least-once with durable idempotent acknowledgement. The runtime shall not claim transactional exactly-once Website UI delivery.

### FR-021 — Separate trusted controls

Trusted controls such as `START_IMPLEMENTATION`, `APPLY_REVIEWS`, `CHECK_PR_HEALTH`, and `MERGE_AUTHORIZED` shall remain separate from model data payloads.

### FR-022 — Writer start gate

`START_IMPLEMENTATION` shall not be sent until all required research handoffs are durably acknowledged.

### FR-023 — Writer base authority verification

Before mutation, the writer shall verify the exact target repository, required base branch `main`, and the exact freshly resolved upstream `main` base revision. The deterministic workflow branch shall be created or reused from that revision.

### FR-024 — One-PR idempotency

The deterministic workflow branch plus job identity shall act as the PR idempotency key. Retry shall reconcile/reuse exactly one matching open PR targeting `main`; closed/merged/conflicting duplicate identity shall block rather than create another PR.

### FR-025 — Durable PR receipt

Successful writer implementation shall persist repository, PR number/URL, base branch, head branch, and exact head SHA. A writer result whose base branch is not `main` shall not advance the workflow.

### FR-026 — Scoped Website auto-approval

A recognized Website GitHub confirmation may be auto-approved only when actual runtime account/session, repository, workflow state, action type, and branch/PR identity match authoritative workflow scope.

### FR-027 — Unknown confirmation fail-closed

Unknown, malformed, ambiguous, or scope-mismatched Website confirmations shall not be clicked and shall produce a durable action-required stop. Current browser execution closes the affected context at this boundary; it does not claim a resumable live browser wait.

### FR-028 — Merge excluded from implementation authority

Starting `/workflow` shall not authorize merge. Ordinary implementation/remediation confirmation policy shall not include premature merge.

### FR-029 — PR-centric independent review

After PR creation, two independent review team graphs shall inspect the actual PR and exact current head SHA.

### FR-030 — Strict reviewer head binding

Each review final shall include `PASS` or `CHANGES_REQUIRED` plus exact reviewer-asserted `reviewedHeadSha`. Malformed or wrong-head results shall fail that exact synthesis/result boundary.

### FR-031 — Verbatim reviewer delivery

Complete reviewer final payloads shall be delivered verbatim to the persistent writer conversation.

### FR-032 — Same-PR remediation

If changes are required, `APPLY_REVIEWS` shall be sent only after required review handoffs are delivered. Writer remediation shall preserve exact PR identity and advance head SHA.

### FR-033 — Review cycle limit

The default maximum review cycle count shall be three. Exhaustion shall stop at the defined review-limit boundary.

### FR-034 — Durable graph authority

The workflow graph/job snapshot shall be the sole authoritative execution correctness state. It shall persist phase/lifecycle, deterministic node identities/dependencies, exact node input/output receipts, current execution ownership, recovery state, account routing, external receipts, and pending action.

### FR-035 — Exact node input binding

A completed node may be reused only while its exact correctness-bearing input identity still matches, including dependency result hashes and applicable prompt/control, repository/base, PR/head, review-cycle, and Website session identity.

### FR-036 — Step-level team persistence

Each workflow team member turn and synthesis shall be independently executable/persisted as graph nodes derived from the shared `TeamPlan`. A later member or synthesis failure shall not cause completed exact-input-matching sibling work to replay.

### FR-037 — Immutable node result boundary

Provider/model payloads for completed executable nodes shall be written to the node-result store before graph completion references them. A stale/fenced execution shall not be able to replace the current node result.

### FR-038 — Execution identity, lease, and fencing

Every provider execution attempt shall have a unique `executionId`, positive attempt, owner identity, start/heartbeat/lease timestamps, and execution state. Expired/lost ownership shall be reconciled as orphaned work. A late fenced execution shall never commit completion.

### FR-039 — Reconcile before resubmit

Recovery shall inspect durable node/provider/external receipts before resubmitting a logical request. When an exact provider result can be recovered safely, it shall be reused. Ambiguous provider completion shall fail closed instead of blind resubmission.

### FR-040 — Failure classification

Provider, transport, browser, auth, output, automation, and user failures shall remain distinct from retry disposition. Deterministic selector/parser defects shall classify as automation/code-fix failures rather than provider timeout.

### FR-041 — Bounded smallest-node recovery

Recoverable execution failures shall transition only the affected logical node to `RECOVERING` with bounded attempt policy. `FAILED` shall be reserved for terminal or operator-action boundaries, not used as a temporary retry state.

### FR-042 — Restart recovery

Startup recovery shall load the existing graph, reconcile `RUNNING`/owned execution leases and durable provider/external receipts, preserve exact completed work, and recover only orphaned/recoverable nodes. It shall not replay successful teams/branches procedurally.

### FR-043 — Automatic driver

`WorkflowDriver` shall reconcile ownership and schedule READY/RECOVERING nodes while deduplicating active work by `jobId`. Workflow-domain state transitions remain in `WorkflowEngine`.

### FR-044 — Cancellation ordering

Cancellation shall abort and settle active driver work before persisting terminal `CANCELLED`. Cancelled jobs shall not auto-resume after restart.

### FR-045 — Explicit continue semantics

`/workflow continue [jobId]` shall operate on the existing durable graph and only reopen an engine-approved failed recovery target. It shall not create a new job, reset research, change persisted routing, or blindly rerun completed exact-input work.

### FR-046 — Exact-head PR health receipt

PR health shall be persisted against repository + PR + exact head SHA with one state:

```text
PASS | FAIL | PENDING | NONE | UNKNOWN
```

### FR-047 — Read-only health inspection

`CHECK_PR_HEALTH` shall perform live read-only inspection and shall not mutate repository or PR.

### FR-048 — Health merge gate

`PASS` shall be merge-eligible. `NONE` shall be merge-eligible only when absence of required checks/statuses is established. `PENDING` shall be retryable. `FAIL` shall not advance. `UNKNOWN` shall fail closed.

### FR-049 — Health invalidation

Any new/remediated PR head shall invalidate prior health evidence.

### FR-050 — Explicit exact-head merge authorization

Merge approval shall be bound to concrete job, repository, PR, expected head SHA, and review cycle. Approval shall move the same graph toward merge and shall not imply reusable generic permission.

### FR-051 — Pre-merge revalidation

Immediately before merge, workflow shall re-read live PR head and current PR health. Changed head or unacceptable health shall invalidate stale authority.

### FR-052 — Authorized Website merge confirmation

Website merge confirmation may be auto-approved only in exact authorized merge state with matching durable authority.

### FR-053 — Durable merge receipt

Successful merge shall persist executor, authorized/verified head, resulting merged SHA, and timestamp before `DONE`/`COMPLETED`.

### FR-054 — Operator projection from graph

`/workflow status` and `/workflow watch` shall project authoritative phase/lifecycle, exact active/recovering/failed node, execution attempt/evidence, provider activity, dependency blockers, structured failure/recovery/action, PR/head/health state, and recent diagnostic events. They shall not depend on a separate team-trace correctness store.

### FR-055 — Diagnostic event journal

Meaningful control-plane events shall be ordered per job and shall include the current graph revision plus applicable node/execution identity. The journal is diagnostic history only; missing notification/event delivery shall never roll authoritative graph state backward.

### FR-056 — Payload-free Local progress

Full research/review payloads shall not be projected into Local progress context by default. Compact progress shall contain control-plane execution metadata only.

### FR-057 — Owner-scoped operator target selection

Operator commands shall scope jobs to the current owner session and fail rather than guess when an omitted job ID is ambiguous. `/workflow delete` shall always require an explicit job ID.

### FR-058 — Operator-only retention preview

Retention preview shall list only aged terminal jobs: completed jobs after 30 days and `CANCELLED` after 14 days, measured from authoritative `updatedAt`.

### FR-059 — Exact cleanup guard

Cleanup shall require exact `jobId` plus unchanged `updatedAt` from preview. Changed job state shall fail closed.

### FR-060 — Scoped cleanup

Cleanup shall validate the selected job's expected private artifacts and remove only that exact job record, exact handoffs, exact node results, and event journal. Cleanup audit shall be durable and idempotent.

### FR-061 — Stable remote-login identity

Adding a new semantic account shall not silently remap existing stable login ports. Current mapping:

```text
39000 chatgpt-thinker
39001 chatgpt-writer
39002 gemini-thinker
39003 chatgpt-thinker-2
```

### FR-062 — No hidden automatic provider failover

The runtime shall not silently replace a failed member/provider inside an existing durable workflow. Any future health-aware retry/failover policy requires explicit durable routing/retry semantics.

### FR-063 — Explicit exact-ID workflow deletion

`/workflow delete <jobId>` shall require exactly one explicit workflow ID owned by the current Local session. If the workflow is non-terminal, the operator shall cancel and settle it first. Deletion shall remove only that workflow's local durable job record, handoffs, exact node results, and event journal. It shall not implicitly delete the GitHub PR/branch or provider Website conversations.

### FR-064 — Squash-only workflow merge history

Authorized workflow merge shall use squash merge only. One workflow PR shall contribute exactly one commit to `main`. If squash merge is unavailable, the writer shall block rather than fall back to merge-commit or rebase-merge modes.

### FR-065 — Human-action state semantics

Top-level `WAITING_USER` is valid for a durable workflow authority gate such as merge authorization and does not imply a live provider browser. The graph model also reserves node/provider `WAITING_USER` for a future adapter that can safely preserve and expose a live browser execution. Until such an adapter exists, unknown confirmation/auth boundaries shall fail closed into a durable action-required stop rather than pretending the browser remains reachable.

### FR-066 — No degraded quorum

Both required research teams and both required review teams remain required. A failed/missing team result shall not be silently treated as a valid quorum.

## 5. Core persisted authority

### Workflow job / graph snapshot

```text
jobId + ownerSessionId
objective + repository + exact upstream baseRevision
account routing + stable writer conversation identity
phase + lifecycle
graphRevision + eventSeq
nodes:
  stable nodeId/kind/phase/dependencies
  state + blocking/wait reason
  exact input receipt
  exact output/result receipt
  current execution identity/lease/provider state
  structured failure/recovery
handoff receipts
PR/head + CI health receipt
review cycle
pending action
merge authorization + merge receipt
createdAt / updatedAt
```

### Exact node result

```text
jobId
nodeId
inputHash
resultId/outputHash
payload
createdAt
```

### Provider turn receipt

```text
stable workflow request key
session identity
prompt hash
conversation identity when known
submission/completion evidence
```

### Diagnostic event

Current event records persist:

```text
jobId
eventSeq
graphRevision
type
class = INTERNAL | PROGRESS | ACTION_REQUIRED
at
nodeId? / executionId?
message?
```

The graph snapshot, not event replay, is correctness authority.

### Handoff

```text
handoffId
jobId
source / recipient / sequence
verbatim payload
payloadHash
delivery state/timestamps
```

### Merge authorization

```text
jobId
repository
PR number/URL
head branch
expected head SHA
review cycle
owner session
authorizedAt
```

Secrets shall not be persisted in shared workflow artifacts.

## 6. Non-functional requirements

- **Determinism:** code owns graph topology, state transitions, durable routing, base authority, exact-head bindings, and authority gates.
- **Provider agnosticism:** team intellectual semantics depend on ordered members, not provider brands.
- **Intent fidelity:** normal data routing shall not introduce avoidable LLM transformations.
- **Isolation:** same-provider accounts remain isolated at auth/runtime/conversation/scheduler boundaries.
- **Fail-closed safety:** ambiguous authority, stale exact-head state, malformed routing, wrong PR base, corrupted durable data, or ambiguous provider completion shall stop rather than guess.
- **Recoverability:** Local turn completion or plugin restart shall not discard durable jobs or replay exact completed work unnecessarily.
- **Idempotency:** recovery reconciles exact provider/external receipts before resubmission and prevents stale execution commits.
- **Context efficiency:** Local receives compact control-plane context rather than full team/review payloads by default.
- **Least workflow authority:** technical GitHub capability never substitutes for job/repository/head/user authority.
- **Diagnosability:** graph/execution/failure evidence remains inspectable without leaking provider identity into normal member reasoning prompts.
- **Reviewable history:** each authorized workflow PR contributes exactly one squash commit to `main`.

## 7. End-to-end acceptance flow

```text
/workflow <task>
-> resolve fresh upstream main HEAD
-> durable job + initial graph
-> schedule READY Research A/B member nodes independently
-> exact member results -> per-team synthesis nodes
-> required research handoff gate
-> Writer implementation/reconciliation -> one PR targeting main
-> exact-head Review A/B graphs
-> review decision gate
-> same-PR remediation + new head/new review cycle when required
-> PASS/PASS exact head
-> exact-head CHECK_PR_HEALTH
-> durable merge-authorization WAITING_USER gate
-> explicit user approval
-> immediate head + health revalidation
-> MERGE_AUTHORIZED
-> writer squash merge
-> durable merge receipt
-> DONE / COMPLETED
```

The normal path shall not require Local to summarize team results, implement code, manually inspect private job JSON, manually select the next workflow phase, or infer merge authority.
