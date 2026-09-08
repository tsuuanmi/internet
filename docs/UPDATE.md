# Architecture Update — 2026-09-08

This document records validated discoveries and resulting architecture changes. It is intentionally concise and points to SRS/ADR/WORKFLOW documents for normative detail.

## Validated capabilities

The connected ChatGPT Website GitHub integration has been validated end-to-end against private repositories for:

- repository/file fetch;
- branch creation;
- file creation/update;
- commit creation;
- pull-request creation;
- pull-request merge.

A dedicated ChatGPT Website writer account can therefore serve as a terminal GitHub agent without requiring Local to implement or push the code first.

## GitHub permission configuration

The writer account is intended to use GitHub plugin permission mode `Allow all actions` when the platform exposes that option and the user intentionally accepts it.

This should reduce repeated approval prompts on the happy path. The workflow must still support `AWAITING_EXTERNAL_APPROVAL` because platform/workspace protections may still require explicit confirmation for some actions.

## Architecture changes

### 1. Local becomes primarily a control plane

Earlier design:

```text
Local = UX + orchestration + broad code reading + implementation + review + merge
```

Updated design:

```text
Local = UX + authority + workflow orchestration + approval/exception handling
Website teams = broad cognition/repository analysis/review
Writer account = repository mutation/PR remediation/authorized merge execution
CI/runtime = empirical evidence
```

Local retains the ability to inspect code and diffs when risk or exceptions justify it, but this is not the normal path.

### 2. Two independent thinking teams feed the writer directly

For the standard coding workflow, Local can spawn two independent reasoning teams.

Each team's final result is handed directly and verbatim to the writer account.

Local does not summarize either result before delivery.

After both handoffs are confirmed, Local/runtime sends only the control instruction to begin implementation.

### 3. Review results also bypass Local summarization

After the writer opens a PR, two independent review teams inspect the actual PR.

Their final results are delivered verbatim to the writer.

After all review handoffs arrive, Local/runtime sends only a separate remediation control message.

### 4. PR becomes the shared implementation artifact

The writer opens the PR before post-review.

This removes the previous need for Local to push an intermediate implementation merely so Website reviewers can see it.

Additional commits should represent real remediation, not orchestration transport.

### 5. Multiple ChatGPT accounts become a core requirement

The plugin currently assumes provider-level account identity too strongly.

The target system requires at least:

```text
chatgpt-thinker
chatgpt-writer
gemini-thinker
```

Two ChatGPT accounts must have fully isolated authentication state, login profiles, conversations, scheduler state, and browser contexts.

### 6. ChatGPT is the default team synthesizer

The current team implementation synthesizes with the provider that spoke last.

Target behavior is explicit synthesis routing to the ChatGPT thinker account, independent of debate speaking order.

### 7. ChatGPT browser default reasoning changes to High

Current implementation defaults ordinary ChatGPT turns to `medium`.

Target default is `high`, unless explicitly overridden.

### 8. Long-running workflows become durable jobs

The full coding workflow may span many minutes and may pause for browser/GitHub approval.

The target runtime uses persistent `job_id`, explicit workflow state, durable handoff receipts, and event-driven continuation rather than relying on one long synchronous Local tool call.

## Updated target path

```text
User
  -> Local creates job
  -> Team A + Team B
  -> ChatGPT synthesizes each
  -> exact outputs -> Writer
  -> START_IMPLEMENTATION
  -> Writer creates PR
  -> Review A + Review B inspect PR
  -> exact review outputs -> Writer
  -> APPLY_REVIEWS
  -> Writer updates same PR
  -> review gates pass
  -> Local/user authorizes merge
  -> Writer or Local merges
  -> DONE
```

## Documents

Normative details now live in:

- `SRS.md`
- `WORKFLOW.md`
- `ADR/0001-local-control-plane.md`
- `ADR/0002-verbatim-handoffs.md`
- `ADR/0003-multi-account-capability-routing.md`
- `ADR/0004-pr-centric-review-loop.md`
- `ADR/0005-durable-jobs-and-events.md`
- `ROADMAP.md`
- `TODO.md`

`internet-team-architecture.md` should remain a concise overview and entry point rather than accumulating all detail.
