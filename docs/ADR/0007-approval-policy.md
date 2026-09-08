# ADR-0007 — Auto-Approve Scoped Writer Actions, Require User Merge Authorization

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The connected ChatGPT Website writer may still show an `Allow` confirmation for GitHub actions even when the plugin is configured permissively.

The desired user experience is not to stop for every repository mutation. Routine implementation work should proceed automatically inside the explicit `/workflow` job scope, while merge should remain a deliberate user-owned checkpoint.

## Decision

The workflow has two authorization classes.

### Class A — Scoped implementation actions

The controller may automatically confirm eligible Website/GitHub approval prompts for actions that are already authorized by the active workflow and are required to produce or update the reviewable PR.

Examples include:

- create workflow branch;
- create/update files;
- create commit;
- push/update the workflow branch;
- create pull request;
- update the existing workflow pull request;
- add remediation commits to that PR.

These actions do not require a separate user interruption when the confirmation can be identified reliably and all scope checks pass.

### Class B — Merge

Merge requires an explicit user decision.

The workflow must stop at:

```text
READY_FOR_MERGE_AUTHORIZATION
```

Local presents the concrete PR and merge-relevant state to the user.

Only after the user authorizes merge may the controller proceed to the Website merge action and confirm its `Allow` prompt if one appears.

## Auto-approval safety conditions

An approval prompt may be auto-confirmed only if the controller can establish all of the following:

```text
active job matches the writer session
repository == job.authoritative_repository
action is permitted in current workflow state
action belongs to the implementation/PR allowlist
known PR/branch identity matches the job when applicable
confirmation UI is recognized with high confidence
```

Unknown or ambiguous confirmation prompts must not be auto-clicked.

They transition to an action-required exception such as:

```text
UNKNOWN_CONFIRMATION
```

and notify Local.

## Merge binding

User merge authorization should be bound to concrete state where possible:

```text
job_id
repository
PR number
expected head SHA
```

The engine must re-check the PR head before merge. If the head changed after authorization/review, the authorization is stale and the workflow returns to review/authorization rather than merging silently.

## Why PR creation is auto-approved

Creating a PR produces a reviewable artifact and does not make the change part of the target branch. Requiring a user interruption before every branch/commit/PR action would reduce the value of a long-running workflow while adding little authority protection.

Merge is qualitatively different because it accepts the implementation into the target branch.

## Consequences

- The standard workflow can run unattended until a reviewed PR is ready.
- User authority is concentrated at the meaningful commit point: merge.
- The controller must implement careful UI/action recognition and scope validation.
- Ambiguous confirmations remain fail-closed.

## Invariant

> The workflow may automatically perform and confirm scoped actions needed to create a reviewable PR; only the user authorizes accepting that PR into the target branch.
