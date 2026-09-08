# Coding Workflow — Internet Team v3

- **Status:** Target workflow
- **Date:** 2026-09-08

## 1. Happy path

```text
USER
  |
  v
LOCAL
  understand task
  establish constraints / target repo / base revision
  create coding job
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
LOCAL/RUNTIME CONTROL MESSAGE
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
LOCAL/RUNTIME CONTROL MESSAGE
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
LOCAL / USER AUTHORIZE
                |
         +------+------+
         |             |
         v             v
   WRITER MERGE     LOCAL MERGE
         |
         v
        DONE
```

## 2. Team behavior

The default coding job creates two independent teams.

A team may internally use multiple rounds, roles, research, plugins, or provider-specific capabilities.

Each team ultimately emits exactly one `final_output` for the implementation handoff.

The default final synthesizer is `chatgpt-thinker`, not whichever provider happened to speak last.

## 3. Pre-implementation handoff

The runtime creates one handoff per team result.

Example:

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

The writer must receive both payloads unchanged.

Local must not summarize them before delivery.

## 4. Implementation start gate

Receiving one team result is not permission to start implementation.

Writer start condition:

```text
required_handoffs == delivered_handoffs
```

Then the runtime sends a separate control message such as:

```text
All required reasoning-team handoffs have been delivered.
Begin implementation now.

Target repository: owner/repo
Base revision: abc123

Use the delivered team outputs as the implementation plan.
Inspect current code as needed, resolve only local implementation details,
validate the result, and create or update the pull request.
Do not expand scope or silently override authoritative requirements.
```

## 5. Writer behavior

The writer should:

1. confirm the exact target repository;
2. confirm the expected base revision or detect a meaningful mismatch;
3. inspect current repository state;
4. use the delivered team outputs directly;
5. resolve small implementation details without reopening settled intent;
6. create/update an implementation branch;
7. validate where possible;
8. create/update one PR;
9. return a compact PR receipt.

The writer should return `BLOCKED` instead of inventing a new authoritative decision when the handoff no longer matches repository reality.

## 6. PR receipt

A compact receipt should include:

```text
repository
base
head
PR number
PR URL
changed files
validation performed
CI state if available
writer status
```

Local should not require the full implementation transcript.

## 7. Post-review fan-out

Once a PR exists, review jobs use the PR as the shared source of truth.

Each team receives:

```text
objective / task context
repository
PR number
expected base/head when known
review role
```

Teams inspect the PR directly.

No Local code push or code-paste step is required.

## 8. Review result delivery

Each review team produces a final result such as:

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

After all review handoffs are delivered, Local/runtime sends a separate control message:

```text
All required review results have been delivered.
Apply all material findings to the existing PR.
Do not expand scope.
If reviewers conflict with authoritative requirements or cannot be reconciled safely, return BLOCKED.
```

## 9. Review loop

The loop is:

```text
PR_OPEN
  -> reviews
  -> review handoffs
  -> remediation
  -> PR_UPDATED
  -> reviews if required
```

A workflow may configure:

- maximum remediation cycles;
- whether only changed areas are re-reviewed;
- whether one or both teams must re-review;
- whether a fresh auditor is mandatory for high-risk changes.

## 10. Local interaction with code

Default:

```text
Local does not perform broad source exploration.
Local does not implement routine changes.
Local does not summarize normal team/review handoffs.
```

Local may inspect code/diff when:

- a writer blocks;
- reviewers disagree materially;
- CI/runtime evidence is inadequate;
- risk is high;
- authoritative intent may need revision;
- user asks for direct inspection.

## 11. Approval checkpoints

If the Website/GitHub UI requests approval, the job enters:

```text
AWAITING_EXTERNAL_APPROVAL
```

The job retains all durable state.

If GitHub for the writer account is configured as `Allow all actions`, the happy path may not require these pauses. The state remains supported because platform/workspace safety rules may still require confirmation for some actions.

## 12. Merge

After review gates pass:

```text
READY_FOR_MERGE_AUTHORIZATION
```

The merge is not executed until the configured authority approves it.

Once approved, the writer may execute the merge directly if permitted.

Recommended safety check:

```text
expected_head_sha == current_pr_head_sha
```

before merge.

## 13. Failure and escalation

### BLOCKED

Use when technical reality conflicts with authoritative intent.

### FAILED_RETRYABLE

Examples:

- provider timeout;
- temporary browser failure;
- temporary GitHub error.

### FAILED_TERMINAL

Examples:

- account unavailable with no recovery path;
- repository inaccessible;
- invalid job configuration.

### Authority escalation

If Task/Decision state must change:

```text
Team or Writer
  -> Request
  -> Local
  -> accept / reject / modify
  -> resume job
```

## 14. Key invariants

1. Team final payloads reach the writer unchanged.
2. Review final payloads reach the writer unchanged.
3. Control messages are separate from reasoning payloads.
4. Writer waits for all required handoffs before starting a phase.
5. PR is the canonical code-review artifact after creation.
6. Local is the authority/control plane, not routine code transport.
7. Merge capability does not equal merge authorization.
8. Long-running progress is represented by durable job state.
