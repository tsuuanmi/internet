from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"expected text not found in {path}")
    file.write_text(text.replace(old, new, 1))


# Normalize repository identity when proving that remediation stayed on the same PR.
replace_once(
    "src/workflow/engine.ts",
    'import { createWorkflowControlMessage, type WorkflowControlMessage } from "#internet/workflow/control";\n',
    'import { normalizeGitHubRepository } from "#internet/workflow/approval-policy";\nimport { createWorkflowControlMessage, type WorkflowControlMessage } from "#internet/workflow/control";\n',
)
replace_once(
    "src/workflow/engine.ts",
    '''\treturn (\n\t\ta.repository === b.repository &&\n\t\ta.number === b.number &&\n\t\ta.url === b.url &&\n\t\ta.base === b.base &&\n\t\ta.head === b.head\n\t);\n''',
    '''\tconst repository = normalizeGitHubRepository(a.repository);\n\treturn (\n\t\trepository !== undefined &&\n\t\trepository === normalizeGitHubRepository(b.repository) &&\n\t\ta.number === b.number &&\n\t\ta.url === b.url &&\n\t\ta.base === b.base &&\n\t\ta.head === b.head\n\t);\n''',
)

# Public exports for the review contract.
replace_once(
    "src/index.ts",
    'export { parseWorkflowJob, WorkflowJobStore, WorkflowJobStoreError } from "#internet/workflow/job-store";\n',
    'export { parseWorkflowJob, WorkflowJobStore, WorkflowJobStoreError } from "#internet/workflow/job-store";\nexport type { WorkflowReviewResult, WorkflowReviewVerdict } from "#internet/workflow/review-result";\nexport { parseWorkflowReviewResult, WORKFLOW_REVIEW_VERDICTS } from "#internet/workflow/review-result";\n',
)
replace_once(
    "src/index.ts",
    '\t"Scoped Website confirmation classification is fail-closed and auto-confirms only exact in-scope writer actions; merge is explicitly excluded. Review-loop driving, Local events, and merge binding remain later workflow phases.",\n',
    '\t"Scoped Website confirmation classification is fail-closed and auto-confirms only exact in-scope writer actions; merge is explicitly excluded. Actual PR review now runs two independent exact-head reviewer lanes, delivers both finals verbatim to the persistent writer, applies remediation to the same PR, and re-reviews changed heads for up to three cycles. Local event injection and explicit merge binding remain later workflow phases.",\n',
)

# README: describe P7 as implemented, leaving only later Local-event and merge-gate work outstanding.
replace_once(
    "README.md",
    '''`/workflow` itself is currently the admission/thin-adapter surface. Scoped Website confirmation handling\nis now fail-closed: only a recognized GitHub confirmation that matches the active writer session, repository,\nworkflow state, allowlisted action, and expected workflow branch/PR identity can be auto-confirmed. Unknown or\nambiguous confirmations become `UNKNOWN_CONFIRMATION`; merge is never auto-authorized by this policy.\nAutomatic PR review/remediation, compact Local events, and the explicit head-SHA-bound merge gate remain later\nphases. The workflow is registered only when both thinker accounts are enabled; the writer path additionally\nrequires a ready `chatgpt-writer` account when implementation is driven.\n''',
    '''After the PR opens, the engine runs two independent review lanes against the actual PR and exact persisted\nhead SHA. Each reviewer must return one strict JSON result containing `PASS` or `CHANGES_REQUIRED` plus the exact\n`reviewedHeadSha`; a malformed or wrong-head result fails that lane instead of being guessed through. Review A\nand B are stored and delivered verbatim to the same persistent writer conversation. If both pass the same head,\nthe job enters `READY_FOR_MERGE_AUTHORIZATION`. Otherwise the engine sends a separate `APPLY_REVIEWS` control,\nrequires the writer to update that same PR with a new head SHA, resets only the review-run state, and reviews the\nnew head again. The default review limit is three cycles; exhaustion becomes `REVIEW_LIMIT_REACHED`.\n\nScoped Website confirmation handling remains fail-closed throughout implementation and remediation: only a\nrecognized GitHub confirmation matching the active writer session, repository, workflow state, allowlisted\naction, and expected branch/PR identity can be auto-confirmed. Unknown or ambiguous confirmations become\n`UNKNOWN_CONFIRMATION`; merge is never auto-authorized. Compact Local event injection and the explicit\nhead-SHA-bound merge gate remain later phases. The workflow is registered only when both thinker accounts are\nenabled; the writer path additionally requires a ready `chatgpt-writer` account when implementation is driven.\n''',
)

# How-it-works package layout and current state-machine description.
replace_once(
    "docs/how-it-works.md",
    '- `src/workflow/team-runner.ts` and `team-prompt-builder.ts` — direct lower-level team execution and deterministic research/review tasks.\n',
    '- `src/workflow/team-runner.ts` and `team-prompt-builder.ts` — direct lower-level team execution and deterministic research/review tasks.\n- `src/workflow/review-result.ts` — strict reviewer verdict and reviewer-asserted PR-head binding.\n',
)
replace_once(
    "docs/how-it-works.md",
    '''The implemented engine path through P6 is:\n\n```text\nCREATED\n  -> RESEARCH_RUNNING\n  -> RESEARCH_HANDOFFS_DELIVERING\n  -> WRITER_RUNNING\n  -> PR_OPEN\n```\n''',
    '''The implemented engine path through P7 is:\n\n```text\nCREATED\n  -> RESEARCH_RUNNING\n  -> RESEARCH_HANDOFFS_DELIVERING\n  -> WRITER_RUNNING\n  -> PR_OPEN\n  -> REVIEW_RUNNING\n  -> REVIEW_HANDOFFS_DELIVERING\n  -> READY_FOR_MERGE_AUTHORIZATION              # both reviewers PASS\n  -> WRITER_REMEDIATING -> PR_OPEN -> ...        # otherwise, review the new head again\n```\n''',
)
replace_once(
    "docs/how-it-works.md",
    '''Actual PR review/remediation loops, Local event injection, and the head-SHA-bound user merge authorization gate\nremain later workflow phases and are not implied by the current `/workflow` admission command.\n''',
    '''Once a PR receipt exists, `runReview()` starts the two durable review lanes logically concurrently. Both lanes\nreceive the PR URL, review cycle, objective, and exact current PR head SHA. Their stable per-job conversation IDs\nare reused across cycles, but every final result must be one strict JSON object containing a control-plane verdict\n(`PASS` or `CHANGES_REQUIRED`) and a `reviewedHeadSha` equal to the exact head requested by the engine. The engine\nrejects malformed or wrong-head results rather than stamping its expected SHA onto unverified reviewer output.\nThe complete reviewer JSON remains the exact data-plane payload.\n\nCompleted Review A/B outputs are materialized as cycle-scoped handoffs (`review:<cycle>:A/B`) and delivered\nverbatim, in deterministic order, to the same persistent writer conversation. If both results pass the same head,\nthe job moves directly to `READY_FOR_MERGE_AUTHORIZATION`; no remediation control is sent. If either reviewer\nrequires changes, both handoffs must first be acknowledged, then the engine emits separate `APPLY_REVIEWS` control.\nThe writer must remediate exactly the persisted PR, preserve its repository/number/URL/base/head identity, produce\na different head SHA, and never merge. Repository identity comparison accepts the canonical GitHub URL and\n`owner/repo` forms as the same authority, while every other PR identity field must remain exact. A successful\nremediation resets only review-run results/status and returns to `PR_OPEN`; the same reviewer sessions then inspect\nthe new head. The default maximum is three review cycles. Exhaustion becomes `REVIEW_LIMIT_REACHED`; writer or\nWebsite-confirmation exceptions keep their explicit remediation resume state.\n\nCompact Local event injection and the head-SHA-bound user merge authorization/execution gate remain later workflow\nphases and are not implied by reaching `READY_FOR_MERGE_AUTHORIZATION`.\n''',
)

# TODO: mark the entire P7 phase implemented with the exact final behavior.
replace_once(
    "docs/TODO.md",
    '''## P7 — PR review/remediation\n\n### 26. Run two independent PR review teams directly\n\nReview the actual PR through workflow-owned TeamRunner.\n\n### 27. Deliver review finals verbatim to writer\n\nNo Local summarization.\n\n### 28. Add separate APPLY_REVIEWS control step\n\n### 29. Re-review updated PR\n\nInitial recommended default:\n\n```text\nmax_review_cycles = 3\n```\n\nEscalate material conflict, writer `BLOCKED`, or exhausted review limit.\n''',
    '''## P7 — PR review/remediation\n\n**Status:** implemented as an exact-head, same-PR remediation loop. Reviewer outputs remain data-plane payloads;\ncontrol-plane verdict/head metadata is parsed deterministically without Local summarization.\n\n### 26. ✅ Run two independent PR review teams directly\n\n`WorkflowEngine.runReview()` drives A/B through the workflow-owned TeamRunner against the actual persisted PR. Each\nstrict reviewer JSON result includes `PASS` or `CHANGES_REQUIRED` plus the exact reviewer-asserted `reviewedHeadSha`.\nWrong-head or malformed output fails that lane instead of being treated as a valid review. Stable review session IDs\nare reused across cycles while the exact head SHA and cycle remain authoritative prompt/state inputs.\n\n### 27. ✅ Deliver review finals verbatim to writer\n\nCycle-scoped `review:<cycle>:A/B` handoffs preserve each complete reviewer JSON payload exactly and deliver A then B\nto the same persistent `chatgpt-writer` conversation. Delivery keeps the existing durable hash/receipt semantics and\nnever passes through Local summarization.\n\n### 28. ✅ Add separate APPLY_REVIEWS control step\n\n`APPLY_REVIEWS` is emitted only after both current-cycle review handoffs are delivered and at least one reviewer\nrequires changes. The writer must update exactly the persisted PR, preserve PR identity, validate remediation, return\na new head SHA, and never merge. Material conflict or authority/safety failure returns `BLOCKED`.\n\n### 29. ✅ Re-review updated PR\n\nA successful remediation returns to `PR_OPEN`, resets review run results/status without changing reviewer session\nidentities, then reviews the new exact head. Both reviewers passing the same head moves the job to\n`READY_FOR_MERGE_AUTHORIZATION`. `maxReviewCycles` defaults to `3`; exhaustion becomes `REVIEW_LIMIT_REACHED`.\n''',
)

# Append a compact current implementation note.
update = Path("docs/UPDATE.md")
text = update.read_text()
marker = "## P7 — Exact-head PR review and remediation\n"
if marker not in text:
    text += '''\n\n## P7 — Exact-head PR review and remediation\n\nP7 now drives two independent reviewer lanes against the actual persisted pull request and exact head SHA. Reviewer\nfinals are strict JSON carrying `PASS` / `CHANGES_REQUIRED` plus an asserted `reviewedHeadSha`; malformed or stale-head\nresults fail closed. Both complete reviewer payloads are stored and delivered verbatim to the persistent writer.\n\nIf both reviewers pass, the workflow stops at `READY_FOR_MERGE_AUTHORIZATION`. Otherwise a separate `APPLY_REVIEWS`\ncontrol instructs the writer to remediate the same PR. The engine requires unchanged PR identity and an advanced head\nSHA before starting the next review cycle. Review conversations remain stable per job, the default cycle limit is three,\nand limit exhaustion or writer/confirmation failures surface as explicit action-required states. Website memory remains\na deferred optimization; it is not used for review correctness.\n'''
    update.write_text(text)
