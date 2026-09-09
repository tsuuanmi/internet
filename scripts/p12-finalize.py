from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing replacement anchor in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1))

# Public package surface: the new durable health receipt/status are first-class
# workflow types, not hidden implementation details.
replace_once(
    "src/index.ts",
    "\tWorkflowPendingAction,\n\tWorkflowPullRequestReceipt,\n\tWorkflowState,\n",
    "\tWorkflowPendingAction,\n\tWorkflowPrHealthReceipt,\n\tWorkflowPrHealthStatus,\n\tWorkflowPullRequestReceipt,\n\tWorkflowState,\n",
)
replace_once(
    "src/index.ts",
    "export { TERMINAL_WORKFLOW_STATES, WORKFLOW_STATES, WORKFLOW_TEAM_STATUSES } from \"#internet/workflow/types\";\n",
    "export {\n\tTERMINAL_WORKFLOW_STATES,\n\tWORKFLOW_PR_HEALTH_STATUSES,\n\tWORKFLOW_STATES,\n\tWORKFLOW_TEAM_STATUSES,\n} from \"#internet/workflow/types\";\n",
)

# Keep the injected workflow guidance aligned with the deterministic P12 gate.
replace_once(
    "src/index.ts",
    "\t\"Scoped Website confirmation classification is fail-closed. Implementation/remediation actions auto-confirm only in exact writer scope; merge remains excluded until a reviewed PR reaches the explicit P9 gate. request_merge emits a concrete ACTION_REQUIRED request, approve binds repository + PR + branch + exact head SHA, and only MERGING may auto-confirm the exact merge after the writer revalidates the live PR head. Successful merge records the merge SHA/executor and completes the job. PROGRESS and ACTION_REQUIRED events remain compact Local context without raw team/reviewer payloads.\",\n",
    "\t\"Scoped Website confirmation classification is fail-closed. Implementation/remediation actions auto-confirm only in exact writer scope; merge remains excluded until a reviewed PR also has an exact-head PR-health receipt. CHECK_PR_HEALTH is read-only and classifies the authoritative PR head as PASS, FAIL, PENDING, NONE, or UNKNOWN; only PASS/NONE may reach request_merge. request_merge emits a concrete ACTION_REQUIRED request, approve binds repository + PR + branch + exact head SHA, and MERGING re-checks the same head's health immediately before MERGE_AUTHORIZED. A moved head or non-eligible health invalidates authorization instead of guessing. Successful merge records the merge SHA/executor and completes the job. PROGRESS and ACTION_REQUIRED events remain compact Local context without raw team/reviewer payloads.\",\n",
)

# README: explain the actual merge sequence and fail-closed health semantics.
old = "The merge gate is head-SHA-bound: a reviewed PR first becomes an ACTION_REQUIRED request, explicit approval persists the exact repository/PR/head authorization, and only then may the writer revalidate the live PR and execute the merge. A changed head invalidates stale authorization. The workflow is registered only when both thinker\naccounts are enabled; the writer path additionally requires a ready `chatgpt-writer` account when implementation is driven.\n"
new = "The merge gate is head-SHA-bound and now includes exact-head PR health. Before Local receives the merge-authorization request, the writer performs a trusted read-only `CHECK_PR_HEALTH` against the persisted PR/head and returns one strict classification: `PASS`, `FAIL`, `PENDING`, `NONE`, or `UNKNOWN`. The engine persists that receipt; only `PASS` or a genuinely check-free `NONE` may advance to user authorization. `FAIL`, `PENDING`, and `UNKNOWN` fail closed as `PR_HEALTH_REQUIRED` instead of being guessed or automatically polled in a loop. Explicit approval then persists the exact repository/PR/head authorization. Immediately before `MERGE_AUTHORIZED`, the engine reads PR health again for that same head; a moved head or newly non-eligible check state invalidates the authorization and blocks the merge. The workflow is registered only when both thinker\naccounts are enabled; the writer path additionally requires a ready `chatgpt-writer` account when implementation is driven.\n"
replace_once("README.md", old, new)

print("P12 finalization applied")
