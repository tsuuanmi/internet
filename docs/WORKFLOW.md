# Coding Workflow — Internet Team v3

- **Status:** Target workflow
- **Date:** 2026-09-08

This document describes the user-visible coding workflow. Deterministic runtime details live in [`WORKFLOW-ENGINE.md`](./WORKFLOW-ENGINE.md).

## 1. Entry point

The user explicitly starts the workflow with:

```text
/workflow <task>
```

The command resolves the current repository and revision, then starts a durable `internet_workflow` job. It must not expand into one giant prompt that asks Local to simulate the full workflow.

## 2. Happy path

```text
USER
  |
  | /workflow <task>
  v
LOCAL
  resolve objective / repo / revision
  start durable workflow job
  |
  v
WORKFLOW ENGINE
  |
  +---------------------------+
  |                           |
  v                           v
TEAM A                      TEAM B
ChatGPT + Gemini            ChatGPT + Gemini
  |                           |
  v                           v
ChatGPT final synthesis     ChatGPT final synthesis
  |                           |
  | exact final output        | exact final output
  +-------------+-------------+
                |
                v
          WRITER MAILBOX
       H-A + H-B delivered
                |
                v
        START_IMPLEMENTATION
                |
                v
CHATGPT WRITER
  verify repo/base
  inspect code
  branch
  implement
  validate
  commit
  open/update PR
                |
                v
            GITHUB PR
                |
  +-------------+-------------+
  |                           |
  v                           v
REVIEW TEAM A              REVIEW TEAM B
  |                           |
  v                           v
ChatGPT synthesis          ChatGPT synthesis
  |                           |
  | exact review output       | exact review output
  +-------------+-------------+
                |
                v
          WRITER MAILBOX
       R-A + R-B delivered
                |
                v
          APPLY_REVIEWS
                |
                v
CHATGPT WRITER
  remediate existing PR
                |
                +------> review again if required
                |
                v
        REVIEW GATES PASS
                |
                v
READY_FOR_MERGE_AUTHORIZATION
                |
                v
LOCAL PRESENTS MERGE REQUEST
                |
                v
          USER APPROVES?
          /          \
        no            yes
        |              |
      PAUSE            v
                 WRITER MERGES
                      |
                      v
                     DONE
```

## 3. Team behavior

The default coding job creates two independent thinking teams through the workflow runtime.

The engine should run the lower-level team primitive directly rather than using a free-form DSH subagent merely to call `internet_team`.

Each team receives a deterministic task built from:

```text
objective
repository
base revision / PR identity
team role
workflow constraints
output contract
```

Each team ultimately emits exactly one `final_output`.

The default final synthesizer is `chatgpt-thinker`, independent of provider speaking order.

## 4. Pre-implementation handoff

The runtime creates one handoff per team result.

```text
H-A
  source = team-a
  recipient = chatgpt-writer
  sequence = 1
  payload = <exact Team A final_output>

H-B
  source = team-b
  recipient = chatgpt-writer
  sequence = 2
  payload = <exact Team B final_output>
```

The writer receives both payloads unchanged.

Local must not summarize them before delivery.

## 5. Implementation start gate

Writer start condition:

```text
required_handoffs == delivered_handoffs
```

Only then does the runtime send a separate control message telling the writer to begin implementation and create/update the PR.

## 6. Writer behavior

The writer should:

1. confirm the exact target repository;
2. confirm the expected base revision or detect a meaningful mismatch;
3. inspect current repository state;
4. use delivered team outputs directly;
5. resolve small implementation details without reopening settled intent;
6. create/update an implementation branch;
7. validate where possible;
8. create/update one PR;
9. return a compact PR receipt.

The writer should return `BLOCKED` instead of inventing a new authoritative decision when the handoff no longer matches repository reality.

## 7. Scoped approval behavior before merge

Routine implementation and PR actions are part of the authority already granted by starting `/workflow` for the selected repository.

If ChatGPT Website shows a recognized `Allow` confirmation for an in-scope action such as branch/file/commit/PR creation or PR remediation, the workflow controller may auto-confirm it when all scope checks pass.

The controller must fail closed on an unknown or ambiguous confirmation.

```text
recognized in-scope implementation action -> auto allow
unknown/ambiguous action                 -> pause + notify Local
merge                                    -> user authorization required
```

See [`ADR/0007-approval-policy.md`](./ADR/0007-approval-policy.md).

## 8. PR receipt

A compact receipt should include:

```text
repository
base
head
PR number
PR URL
head SHA
validation performed
CI state if available
writer status
```

Local should not require the full implementation transcript.

## 9. Post-review fan-out

Once a PR exists, two independent review teams inspect the actual PR.

No Local code push or code-paste step is required.

Review-team execution follows the same direct runtime model as thinking teams rather than relying on a free-form subagent intermediary.

## 10. Review result delivery

Each review team emits a final result such as:

```text
PASS
```

or:

```text
NEEDS_FIX

Critical:
...
Major:
...
Minor:
...
Unverified:
...
Test gaps:
...
```

These outputs are delivered verbatim to the writer.

After all review handoffs are delivered, the runtime sends a separate `APPLY_REVIEWS` control message.

## 11. Review loop

```text
PR_OPEN
  -> reviews
  -> review handoffs
  -> remediation
  -> PR_UPDATED
  -> reviews if required
```

Recommended initial default:

```text
max_review_cycles = 3
```

Exceeding the limit, material reviewer conflict, or a writer `BLOCKED` state escalates to Local.

## 12. Local interaction with code

Default:

```text
Local does not perform broad source exploration.
Local does not implement routine changes.
Local does not summarize normal team/review handoffs.
Local does not manually track which workflow phase comes next.
```

Local may inspect code/diff when:

- writer blocks;
- reviewers disagree materially;
- CI/runtime evidence is inadequate;
- risk is high;
- authoritative intent may need revision;
- user asks for direct inspection.

## 13. Merge is the normal human gate

After review gates pass:

```text
READY_FOR_MERGE_AUTHORIZATION
```

Local presents the concrete PR to the user.

The user decides whether to merge.

Approval should be bound to the reviewed PR head when possible:

```text
job_id
repository
PR number
expected head SHA
```

After user approval, the workflow re-checks the head SHA and instructs the writer to merge. If Website shows a merge `Allow` confirmation, Local/controller may click it because the user has already authorized that exact merge.

Starting `/workflow` does not authorize merge.

## 14. Event behavior

Full reasoning payloads do not return to Local by default.

The runtime distinguishes:

```text
INTERNAL
  team completed, handoff delivered, receipts updated

PROGRESS
  PR opened, review cycle started, remediation started

ACTION_REQUIRED
  merge authorization, writer blocked, unknown confirmation,
  review limit, account reauthentication
```

Only useful compact events should enter Local context.

## 15. Key invariants

1. `/workflow <task>` explicitly starts a real durable workflow.
2. Workflow phases/transitions are enforced by code, not one giant prompt.
3. Team final payloads reach the writer unchanged.
4. Review final payloads reach the writer unchanged.
5. Control messages are separate from reasoning payloads.
6. Writer waits for all required handoffs before starting a phase.
7. PR is the canonical code-review artifact after creation.
8. Scoped implementation/PR confirmations may auto-allow only when reliably recognized.
9. Merge always requires explicit user authorization in the standard workflow.
10. Local is the user-facing authority broker; WorkflowEngine is the deterministic control plane.
11. Long-running progress is represented by durable job state.
