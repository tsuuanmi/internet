from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"expected text not found in {path}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "README.md",
    '''On success, the command queues a model-visible seven-phase workflow with your objective, the selected
repository URL, and the checked-out commit. The workflow requires independent upstream review, main-agent
verification and a risk-based approval gate, implementation and validation, push, independent post-commit
review, remediation, and a final report. Every research and post-commit reviewer prompt—and every
reviewer's `internet_team` task—must explicitly repeat the selected repository URL and the relevant revision;
subagents must not rely on inherited conversation context. It requires both browser providers because its
independent reviews use `internet_team`; it is not registered when either provider is disabled. The command
schedules the agent work rather than performing browser work synchronously.
''',
    '''On success, the command creates a durable `WorkflowEngine` job and returns its job ID. It does not inject
a giant multi-phase prompt into the Local conversation. The engine owns deterministic state, account routing,
team lanes, exact handoff receipts, the persistent writer conversation, and the PR receipt outside model
context.

The implemented path currently runs Research A and Research B directly through the lower-level team runtime,
materializes each final answer as a SHA-256-bound verbatim handoff, delivers A then B to the same
`chatgpt-writer` conversation, and only then sends a separate trusted `START_IMPLEMENTATION` control. The
writer verifies the repository and base revision, inspects and changes the repository, validates the work,
creates or updates exactly one pull request, and returns either a machine-validated PR receipt or `BLOCKED`.
The writer is never authorized to merge during this phase. A transient writer-control retry reuses the same
conversation and does not redeliver handoffs that already have durable delivery receipts.

`/workflow` itself is currently the admission/thin-adapter surface: later orchestration phases add scoped
Website confirmation handling, automatic PR review/remediation, compact Local events, and the explicit
head-SHA-bound merge gate. The workflow is registered only when both thinker accounts are enabled; the writer
path additionally requires a ready `chatgpt-writer` account when implementation is driven.
''',
)

replace_once(
    "docs/TODO.md",
    '''## P5 — Writer and PR path

### 19. Add persistent `chatgpt-writer` conversation routing

Writer receives Team A final, Team B final, then separate `START_IMPLEMENTATION`.

The same writer conversation is reused across implementation, PR creation/update, and remediation for one workflow job so the executor retains the context it built while reading and modifying the repository.

### 20. Define writer control contract

Writer must:

- confirm target repo/base;
- inspect current repository;
- implement without needless redesign;
- create/update one PR;
- return `BLOCKED` on authority conflict;
- expose compact PR receipt.

### 21. Persist PR receipt

```text
repository
PR number
URL
base/head
head SHA
```

Use it for retries, review, remediation, and merge binding.
''',
    '''## P5 — Writer and PR path

**Status:** implemented for initial implementation and PR creation. P7 reuses the same writer conversation for review remediation.

### 19. ✅ Add persistent `chatgpt-writer` conversation routing

Research A and Research B are delivered verbatim, in deterministic order, to the job's single dedicated writer conversation:

```text
<local>:workflow:<job>:writer
```

Only after both exact handoffs have durable delivery receipts does the engine send a separate `START_IMPLEMENTATION` control. The same conversation identity is retained for later PR remediation so the executor keeps the tactical context it built while reading and modifying the repository.

Acknowledged research handoffs are not resent when a transient writer-control failure is retried from `WRITER_RUNNING`.

### 20. ✅ Define writer control contract

`BrowserWorkflowWriterRunner` routes exclusively through `chatgpt-writer`. The trusted implementation control requires the writer to:

- confirm target repo/base revision;
- inspect the current repository;
- implement without needless redesign;
- validate the change;
- create/update exactly one PR;
- never merge in this phase;
- return `BLOCKED` on authority conflict or unsafe completion;
- otherwise return exactly one strict JSON `PR_OPEN` result.

Research payloads remain data-plane messages and are never wrapped with control instructions.

### 21. ✅ Persist PR receipt

Successful writer output is parsed and persisted as:

```text
repository
PR number
URL
base/head
head SHA
```

The job transitions to `PR_OPEN` and emits a compact progress event. Malformed writer output is rejected; `BLOCKED` creates an action-required state without fabricating a PR receipt. The persisted receipt becomes the authority input for review, remediation, and later merge binding.
''',
)

replace_once(
    "docs/how-it-works.md",
    '''This document describes the server-side plugin architecture, authentication boundary, browser lifecycle,
provider interaction contracts, durable conversations, and `internet_team` orchestration.
''',
    '''This document describes the server-side plugin architecture, authentication boundary, browser lifecycle,
provider interaction contracts, durable conversations, team orchestration, and the deterministic coding-workflow control plane.
''',
)

replace_once(
    "docs/how-it-works.md",
    '''- `src/tools/` — DSH definitions for `internet_chat`, `internet_team`, `internet_research`, and
  `internet_browser`.
- `src/commands/internet.ts` — human `/internet` command backed by ChatGPT.
- `src/commands/workflow.ts` — human `/workflow` command that resolves the session Git upstream and queues the reviewed implementation workflow.
''',
    '''- `src/tools/` — DSH definitions for `internet_chat`, `internet_team`, `internet_research`,
  `internet_browser`, and the `internet_workflow` control surface.
- `src/workflow/types.ts`, `job-store.ts`, and `engine.ts` — authoritative workflow state, private atomic job persistence, and deterministic transitions.
- `src/workflow/team-runner.ts` and `team-prompt-builder.ts` — direct lower-level team execution and deterministic research/review tasks.
- `src/workflow/handoff-store.ts` and `control.ts` — exact SHA-256-bound data-plane handoffs and separate trusted control messages.
- `src/workflow/writer-runner.ts` — persistent `chatgpt-writer` routing, strict writer result parsing, and implementation/PR control.
- `src/commands/internet.ts` — human `/internet` command backed by ChatGPT.
- `src/commands/workflow.ts` — thin `/workflow` admission adapter that resolves Git authority and creates a durable engine job.
''',
)

replace_once(
    "docs/how-it-works.md",
    '''`/workflow <objective>` is a command-plane admission step, not a direct browser request. It reads only the
receiving session's `header.cwd`, invokes Git with argument vectors (never a shell), selects the branch
tracking remote, `origin`, or one unambiguous remote, and converts supported public SSH/HTTPS remote forms
to a credential-free HTTPS URL. It verifies the worktree and `HEAD` first. On any failure it returns a direct
command error and never queues a message. On success it follows up with the objective, selected upstream,
and complete seven-phase workflow; the normal agent loop then owns the asynchronous subagent handoffs,
scope gates, implementation, push, reviews, and final report.
''',
    '''`/workflow <objective>` is a command-plane admission step, not a direct browser request. It reads only the
receiving session's `header.cwd`, invokes Git with argument vectors (never a shell), selects the branch
tracking remote, `origin`, or one unambiguous remote, and converts supported public SSH/HTTPS remote forms
to a credential-free HTTPS URL. It verifies the worktree and exact `HEAD` first. On any failure it returns a
direct command error and creates no job. On success it calls `WorkflowEngine.start(...)` and returns the
durable job ID; no giant workflow prompt is injected into Local.

The implemented engine path through P5 is:

```text
CREATED
  -> RESEARCH_RUNNING
  -> RESEARCH_HANDOFFS_DELIVERING
  -> WRITER_RUNNING
  -> PR_OPEN
```

Research A/B run directly through `BrowserWorkflowTeamRunner` with deterministic per-job lanes. Their final
answers are stored verbatim in `WorkflowHandoffStore`, hashed over exact UTF-8 bytes, and delivered A then B
to the single persistent `<local>:workflow:<job>:writer` conversation. Only after both delivery receipts are
present does the engine send `START_IMPLEMENTATION` as a separate trusted control message.

`BrowserWorkflowWriterRunner` always uses the explicit `chatgpt-writer` account. The writer verifies the
repository and base revision, inspects and modifies the repository, validates the change, creates or updates
exactly one PR, and must not merge. Its final response is parsed as strict `PR_OPEN` JSON and persisted as a
PR receipt (`repository`, PR number/URL, base/head, and exact head SHA), or the job becomes `BLOCKED` without
a fabricated receipt. If a transient control call fails after the research handoffs were acknowledged, the
job remains `WRITER_RUNNING`; retry reuses the same writer conversation and skips already-delivered handoffs.

Scoped Website confirmation policy, actual PR review/remediation loops, Local event injection, and the
head-SHA-bound merge authorization gate are later workflow phases and are not implied by the current
`/workflow` admission command.
''',
)

replace_once(
    "docs/UPDATE.md",
    '''But the command must evolve from the current giant-prompt prototype into a thin adapter over `internet_workflow.start(...)` and a durable `WorkflowEngine`.
''',
    '''The giant-prompt prototype has now been replaced by a thin adapter over a durable `WorkflowEngine`: `/workflow` resolves repository authority and exact `HEAD`, creates a job, and returns the job ID.
''',
)

replace_once(
    "docs/UPDATE.md",
    '''The current prompt asks Local to spawn free-form DSH subagents which then call `internet_team`. That preserves useful background execution, but introduces an avoidable transformation layer because a child agent may inspect code itself or summarize the team result before returning.

Target behavior:
''',
    '''Workflow-owned research now bypasses the old free-form DSH child intermediary and calls the lower-level team runtime directly. This removes an avoidable transformation layer while retaining deterministic independent team lanes.

Implemented behavior:
''',
)

insert_anchor = '''## Existing architecture points retained
'''
insert_text = '''## Writer and PR path implemented

P5 TODO #19–#21 now connects the exact research data plane to the separate Website writer account:

```text
Research A exact final
  -> chatgpt-writer conversation
Research B exact final
  -> same chatgpt-writer conversation
START_IMPLEMENTATION
  -> same conversation
Writer verifies repo/base, implements, validates
  -> create/update exactly one PR
  -> strict PR_OPEN receipt or BLOCKED
```

The writer conversation is stable for the workflow job and is intended to continue through later remediation. Durable delivery receipts prevent acknowledged Research A/B handoffs from being resent when a transient writer-control call is retried. Successful output persists repository, PR number/URL, base/head, and exact head SHA in the job before review begins. Merge remains explicitly outside this phase.

'''
update = Path("docs/UPDATE.md")
text = update.read_text()
if insert_anchor not in text:
    raise SystemExit("UPDATE insertion anchor not found")
update.write_text(text.replace(insert_anchor, insert_text + insert_anchor, 1))
