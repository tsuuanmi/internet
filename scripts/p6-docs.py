from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"expected text not found in {path}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "README.md",
    '''`/workflow` itself is currently the admission/thin-adapter surface: later orchestration phases add scoped
Website confirmation handling, automatic PR review/remediation, compact Local events, and the explicit
head-SHA-bound merge gate. The workflow is registered only when both thinker accounts are enabled; the writer
path additionally requires a ready `chatgpt-writer` account when implementation is driven.
''',
    '''`/workflow` itself is currently the admission/thin-adapter surface. Scoped Website confirmation handling
is now fail-closed: only a recognized GitHub confirmation that matches the active writer session, repository,
workflow state, allowlisted action, and expected workflow branch/PR identity can be auto-confirmed. Unknown or
ambiguous confirmations become `UNKNOWN_CONFIRMATION`; merge is never auto-authorized by this policy.
Automatic PR review/remediation, compact Local events, and the explicit head-SHA-bound merge gate remain later
phases. The workflow is registered only when both thinker accounts are enabled; the writer path additionally
requires a ready `chatgpt-writer` account when implementation is driven.
''',
)

replace_once(
    "docs/TODO.md",
    '''## P6 — Scoped approval controller

### 22. Detect and classify Website confirmation UI

Do not auto-click based only on visible `Allow` text.

### 23. Auto-confirm recognized in-scope implementation/PR actions

Require exact match against:

```text
active job
writer session
repository
workflow state
action allowlist
branch/PR identity when applicable
```

### 24. Add fail-closed `UNKNOWN_CONFIRMATION`

Ambiguous/unrecognized confirmation pauses and notifies Local.

### 25. Explicitly exclude merge from auto-authorization

Merge confirmation can only be executed after user merge authorization.
''',
    '''## P6 — Scoped approval controller

**Status:** implemented for the Website writer path with conservative fail-closed recognition and exact workflow-scope matching.

### 22. ✅ Detect and classify Website confirmation UI

`chatgpt-confirmation.ts` inspects only narrow confirmation/dialog roots and requires a GitHub-scoped surface with exactly one visible `Allow` action plus an explicit deny/cancel action. The controller parses a supported action, repository, branch/head, and PR number when applicable. Generic tool-call containers, unknown destructive actions, multiple visible confirmations, and ambiguous multi-action text are not guessed through.

Visible `Allow` text alone is never sufficient.

### 23. ✅ Auto-confirm recognized in-scope implementation/PR actions

`approval-policy.ts` requires exact match against:

```text
active workflow job
chatgpt-writer account
current session == job writer session
repository == authoritative job repository
workflow state permits the action
action is on the implementation/remediation allowlist
branch == persisted PR head or internet-workflow/<job_id>
PR number == persisted workflow PR when updating it
```

Initial implementation may auto-confirm branch creation, file writes, commits, branch push, and PR creation. Remediation may auto-confirm file writes, commits, branch push, and update of the exact persisted PR.

### 24. ✅ Add fail-closed `UNKNOWN_CONFIRMATION`

Unknown, ambiguous, incomplete, or scope-mismatched confirmations are never clicked. The writer reports `UNKNOWN_CONFIRMATION`; the engine persists the dedicated state plus an ACTION_REQUIRED event and records `resumeState: WRITER_RUNNING`. After the user/operator handles the exception, `continue(job_id)` resumes the writer phase instead of restarting research.

### 25. ✅ Explicitly exclude merge from auto-authorization

A recognized merge confirmation produces a dedicated blocked result before any `Allow` action is pressed. Merge is not part of the phase-1 action allowlist and can only be executed by the later merge path after explicit user authorization bound to the concrete PR/head state.
''',
)

replace_once(
    "docs/how-it-works.md",
    '''- `src/workflow/writer-runner.ts` — persistent `chatgpt-writer` routing, strict writer result parsing, and implementation/PR control.
''',
    '''- `src/workflow/writer-runner.ts` — persistent `chatgpt-writer` routing, strict writer result parsing, and implementation/PR control.
- `src/workflow/approval-policy.ts` and `src/browser/chatgpt-confirmation.ts` — deterministic writer-action scope checks plus conservative Website confirmation recognition/handling.
''',
)
replace_once(
    "docs/how-it-works.md",
    '''The implemented engine path through P5 is:
''',
    '''The implemented engine path through P6 is:
''',
)
replace_once(
    "docs/how-it-works.md",
    '''Scoped Website confirmation policy, actual PR review/remediation loops, Local event injection, and the
head-SHA-bound merge authorization gate are later workflow phases and are not implied by the current
`/workflow` admission command.
''',
    '''During writer execution, `BrowserManager` may inspect a visible ChatGPT Website GitHub confirmation before
checking completion. Confirmation handling is deliberately separate from model-output parsing. A candidate
must come from a narrow dialog/confirmation root, identify GitHub, expose exactly one semantic `Allow` button
plus a deny/cancel control, and parse to one supported action. `WorkflowApprovalContext` then binds that
observation to the exact `chatgpt-writer` conversation, authoritative repository, current workflow state, and
expected branch/PR identity. The initial branch identity is deterministic as `internet-workflow/<job_id>`;
once a PR exists, its persisted head/number become authoritative.

Only in-scope implementation/remediation actions are auto-confirmed. Missing or mismatched metadata, ambiguous
UI, unsupported actions, multiple candidates, or a confirmation that remains visible after activation fail
closed as `UNKNOWN_CONFIRMATION`. The engine persists an ACTION_REQUIRED exception with the writer phase as
the explicit resume state. A merge confirmation is recognized separately and is never clicked by the scoped
auto-approval policy.

Actual PR review/remediation loops, Local event injection, and the head-SHA-bound user merge authorization gate
remain later workflow phases and are not implied by the current `/workflow` admission command.
''',
)

update = Path("docs/UPDATE.md")
text = update.read_text()
anchor = "## Existing architecture points retained\n"
section = '''## Scoped Website approval controller implemented

P6 TODO #22–#25 now turns the accepted ADR-0007 policy into code. Website GitHub confirmation handling is no longer a generic “click Allow” behavior. The controller first recognizes a narrow confirmation surface, parses one supported action and its repository/branch/PR identity, then evaluates that observation against deterministic workflow context.

The phase-1 auto-approval boundary is:

```text
chatgpt-writer only
+ exact writer conversation
+ exact repository
+ permitted WRITER_RUNNING / WRITER_REMEDIATING state
+ allowlisted implementation/remediation action
+ exact workflow branch / persisted PR identity
=> scoped Allow
```

Everything else fails closed. Unknown or ambiguous confirmations become durable `UNKNOWN_CONFIRMATION` ACTION_REQUIRED state and retain `WRITER_RUNNING` as the explicit resume target. Merge is a separate class: even a perfectly recognized merge confirmation is blocked and never auto-clicked before the later user-owned merge gate.

The deterministic initial workflow branch is `internet-workflow/<job_id>` so branch identity can be checked before a PR receipt exists. Once the writer opens a PR, the persisted PR head and number become the authority for remediation confirmations.

'''
if section not in text:
    if anchor not in text:
        raise SystemExit("UPDATE anchor not found")
    update.write_text(text.replace(anchor, section + anchor, 1))

replace_once(
    "src/index.ts",
    '\t"Approval classification, review-loop driving, Local events, and merge binding remain later workflow phases.",\n',
    '\t"Scoped Website confirmation classification is fail-closed and auto-confirms only exact in-scope writer actions; merge is explicitly excluded. Review-loop driving, Local events, and merge binding remain later workflow phases.",\n',
)
