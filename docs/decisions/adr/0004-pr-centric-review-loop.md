# ADR-0004 — Use the Pull Request as the Shared Review Artifact

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The earlier workflow often required Local to make or push an implementation before Website reviewers could inspect it. That creates avoidable transport work and can produce extra commits whose only purpose is making code visible to reviewers.

The validated writer account can create the implementation branch and pull request itself. Once the PR exists, all reviewers can work against one exact shared artifact.

## Decision

The coding workflow becomes PR-centric immediately after implementation.

```text
Writer
  -> branch
  -> commit
  -> pull request
  -> review teams
  -> writer remediation
  -> repeat review as needed
  -> authorization
  -> merge
```

Local does not need to push code merely so Website reviewers can inspect it.

## Review fan-out

After PR creation, Local/runtime should spawn at least two independent review teams where the task justifies the cost.

Each review team receives the PR identity and its authoritative task context. Teams should inspect the actual PR/base/head rather than a Local reconstruction of the changes.

Each review team produces its own final result.

Those outputs are delivered verbatim to the writer according to ADR-0002.

## Remediation loop

If material findings exist:

```text
PR
  -> Review A
  -> Review B
  -> exact findings to Writer
  -> Writer updates same PR branch
  -> review again as required
```

The writer should update the existing PR rather than create a new PR for ordinary remediation.

A second commit is acceptable when it represents real remediation. The architecture should avoid extra commits caused only by moving code from Local into GitHub for visibility.

## Reviewer independence

At least one reviewer should be fresh enough to avoid inheriting the writer's reasoning path.

The writer must not count its own self-review as independent validation.

## Review result contract

A compact result should prefer:

```text
PASS | NEEDS_FIX | BLOCKED

Critical
Major
Minor
Unverified
Test gaps
References
```

The detailed result remains in Website context or the handoff artifact. Local receives only the workflow-relevant state unless it needs to inspect the details.

## Merge

When all configured gates pass:

```text
READY_FOR_MERGE_AUTHORIZATION
```

Local/user policy decides whether merge is authorized.

The actual merge may be executed by:

- Local; or
- the merge-capable writer account.

The executor is not the authority source.

## Consequences

- Reviewers inspect the exact implementation, not a summary.
- Local is removed from routine code transport.
- PR comments, commits, CI, and remediation history become durable shared evidence.
- Commit history better reflects real implementation/remediation rather than orchestration mechanics.

## Invariant

> Once a PR exists, the PR is the canonical shared artifact for code review and remediation.
