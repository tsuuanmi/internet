from pathlib import Path
import re


def rewrite(path: str, transform):
    file = Path(path)
    before = file.read_text()
    after = transform(before)
    if after != before:
        file.write_text(after)


def workflow(text: str) -> str:
    text = re.sub(
        r"## Tracking progress\n.*?\n## Stopping, recovering, and deleting",
        """## Tracking progress

Workflow progress is projected directly from durable graph nodes, execution attempts, exact result receipts, and the ordered event journal. There is no separate trace correctness store.

`/workflow status [jobId]` exposes phase/lifecycle, exact active or recovering node, execution attempt, provider activity, dependency blockers, structured failure/recovery action, PR/head/health state, pending action, and recent meaningful events. Normal research/review display remains `Member 1..N`; raw account/provider identity is diagnostic metadata.

A recoverable later-member failure is represented at the exact node boundary:

```text
Phase: RESEARCH
Status: RECOVERING
Node: research:A:round:1:member:2
Failure: HARD_TIMEOUT
Recovery: RECREATE_SESSION · attempt 2/3
```

Completed sibling nodes remain `COMPLETED` and are not replayed.

`/workflow watch [jobId]` returns the same authoritative snapshot. Live compact `PROGRESS` events continue through the Local event stream without creating a second polling/correctness state machine. Full model payloads remain outside Local progress injection.

## Stopping, recovering, and deleting""",
        text,
        flags=re.S,
    )
    text = text.replace(
        "It then removes that job's local durable job record, handoffs, and bounded team trace.",
        "It then removes that job's local durable job record, handoffs, exact node results, and event journal.",
    )
    text = re.sub(
        r"## Driver stop boundaries\n.*?\n## Retention",
        """## Driver stop boundaries

The driver stops dispatching at durable action/terminal boundaries:

```text
WAITING_USER
BLOCKED
CANCELLED
COMPLETED
```

Recoverable node failures remain `RECOVERING` and are scheduled automatically when policy allows. Unexpected scheduler/runtime invariant failures are persisted through `WorkflowEngine` as `BLOCKED` with `CODE_FIX_REQUIRED`; they do not reset the workflow or become a coarse retryable top-level state.

## Retention""",
        text,
        flags=re.S,
    )
    return text.replace(
        "removes the selected job + handoffs + team trace",
        "removes the selected job + handoffs + node results + event journal",
    )


def how_it_works(text: str) -> str:
    text = re.sub(
        r"## Concurrent research and review fan-out\n.*?\n## Exact handoffs",
        """## Durable graph execution and concurrent branches

Workflow research/review use the same deterministic `TeamPlan`/`TeamStep` primitives as `internet_team`, but each member/synthesis step is persisted as an executable graph node. Dependencies, not a procedural lane replay loop, determine readiness.

Research A/B and Review A/B are independent graph branches. When dependencies permit, READY nodes from both branches may execute concurrently. The account scheduler remains the only same-account capacity/session-ordering gate.

Completed exact-input nodes are stored separately in `WorkflowNodeResultStore` and remain reusable while their input/dependency hashes match. A later member or synthesis failure therefore recovers only that logical node.

Execution attempts carry unique `executionId` values, ownership leases, provider state, and progress timestamps. Expired ownership is reconciled as an orphaned execution; stale late progress/results cannot commit after fencing.

`WorkflowOperator.status()` projects the graph directly: phase/lifecycle, active or recovering nodes, attempts, provider activity, blockers, failure/recovery action, PR/head/health state, and recent meaningful events. The ordered event journal explains history without becoming a second correctness state machine.

## Exact handoffs""",
        text,
        flags=re.S,
    )
    text = re.sub(
        r"## Workflow events\n.*?\n## PR health, merge authorization, and execution",
        """## Workflow events, recovery, and operator control

Events are classified as `INTERNAL`, `PROGRESS`, or `ACTION_REQUIRED` and appended to an ordered per-job journal after/with authoritative graph transitions. Notification failure cannot roll back workflow correctness.

`WorkflowDriver` maintains at most one active run per job and owns scheduling, ownership reconciliation, and cancellation. Workflow-domain transitions remain in `WorkflowEngine`. Scheduler invariant failure is persisted through the engine as `BLOCKED` + `CODE_FIX_REQUIRED`.

Provider completion separates a hard deadline from a semantic no-progress stall lease. Response/generation transitions renew provider progress; static thinking controls and unrelated DOM churn do not. Provider stall, hard timeout, browser failure, auth failure, and deterministic automation defects are classified before recovery policy is selected.

`WorkflowOperator.stop()` aborts active work, waits for settlement, and persists terminal `CANCELLED`. `continue()` operates only on the existing graph and never resets completed exact-input work or persisted routing.

`WorkflowOperator.delete()` requires an exact job ID. Active work is cancelled/settled first; local deletion then removes the job record, handoffs, node results, and event journal. GitHub PR/branch state and provider Website conversations are external and remain untouched.

## PR health, merge authorization, and execution""",
        text,
        flags=re.S,
    )
    text = text.replace(
        "removes only the selected job/handoffs/team trace",
        "removes only the selected job/handoffs/node-results/event journal",
    )
    return text.replace(
        "Correctness-bearing facts are explicitly persisted in job, handoff, team trace, PR, review, health, authorization, and merge receipts.",
        "Correctness-bearing facts are explicitly persisted in the graph/job snapshot, exact node results, handoffs, PR/head/health/authorization/merge receipts, and execution ownership records. The event journal is diagnostic history.",
    )


def srs(text: str) -> str:
    text = text.replace(
        "remove only that exact job record, exact handoffs, and team trace.",
        "remove only that exact job record, exact handoffs, exact node results, and event journal.",
    )
    return text.replace(
        "Deletion shall remove only that workflow's local durable job record, handoffs, and bounded team trace.",
        "Deletion shall remove only that workflow's local durable job record, handoffs, exact node results, and event journal.",
    )


def architecture(text: str) -> str:
    text = text.replace(
        "Durable state enables restart recovery. Completed lanes/handoffs are reused. Provider/browser failures are execution failures, never member answers. Unexpected driver failures persist explicit retry state instead of resetting the job.",
        "Durable graph state enables restart recovery. Completed exact-input nodes/handoffs are reused. Provider/browser failures are execution failures, never member answers. Orphaned executions recover at the same logical node; scheduler invariant failures block durably through `WorkflowEngine` instead of resetting the job.",
    )
    text = text.replace(
        "Cleanup validates exact job identity and removes the selected job, exact handoffs and team trace while retaining a private audit receipt.",
        "Cleanup validates exact job identity and removes the selected job, exact handoffs, node results, and event journal while retaining a private audit receipt.",
    )
    return text.replace(
        "Automatic provider-turn retry/failover, dynamic provider health routing, generic DAG workflows, multi-writer pooling, Website memory as correctness state, autonomous deployment, and broad non-coding generalization remain deferred until concrete requirements justify them.",
        "Dynamic member/provider substitution beyond bounded same-node recovery, user-defined arbitrary DAG workflows beyond the internal graph, multi-writer pooling, Website memory as correctness state, autonomous deployment, and broad non-coding generalization remain deferred until concrete requirements justify them.",
    )


rewrite("docs/WORKFLOW.md", workflow)
rewrite("docs/how-it-works.md", how_it_works)
rewrite("docs/SRS.md", srs)
rewrite("docs/internet-team-architecture.md", architecture)
