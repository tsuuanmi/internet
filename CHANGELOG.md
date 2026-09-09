# Changelog

## Unreleased

### Added

- **accounts**: First-class semantic authenticated identities for `chatgpt-thinker`, `chatgpt-writer`, and `gemini-thinker`, with account-scoped auth state, login profiles, browser/runtime ownership, schedulers and durable conversations.
- **workflow**: Real durable `/workflow <objective>` runtime backed by `WorkflowEngine`, `WorkflowJobStore`, exact repository/base authority, and a durable job ID instead of one giant Local follow-up prompt.
- **workflow**: Direct workflow-owned Research A/B and Review A/B team execution over the lower-level browser team runtime with deterministic prompts and stable per-job Website sessions.
- **workflow**: SHA-256-bound exact handoffs for research/reviewer finals, deterministic A/B delivery ordering, durable acknowledgement, and separate trusted controls.
- **workflow**: Persistent `chatgpt-writer` Website conversation, deterministic implementation branch, one-PR retry reconciliation, and strict durable PR receipts.
- **workflow**: Conservative scoped Website GitHub confirmation handling with exact account/session/repository/state/branch-or-PR matching and fail-closed `UNKNOWN_CONFIRMATION` state.
- **workflow**: Exact-head independent PR review/remediation loop with strict reviewer verdict/head contracts and a default maximum of three review cycles.
- **workflow**: Durable `INTERNAL`, `PROGRESS`, and `ACTION_REQUIRED` events plus compact best-effort Local `agent.inject()` integration and payload-free workflow status.
- **workflow**: Exact-head merge authorization bound to repository + PR + head SHA, live pre-merge revalidation, authorized Website merge confirmation handling, and durable merge receipt.
- **workflow**: Restart/idempotency hardening, strict nested durable-state validation, explicit retry resume targets, handoff tamper checks, and deterministic PR creation recovery.
- **workflow**: Automatic `WorkflowDriver` that advances safe runnable states, deduplicates active work by job ID, resumes safe jobs after restart, and stops at explicit human/error boundaries.
- **workflow**: Exact-head PR/CI health receipt with `PASS`, `FAIL`, `PENDING`, `NONE`, and `UNKNOWN`, including read-only live health inspection before authorization and immediately before merge.
- **workflow**: `internet_workflow_maintenance` with operator-only terminal-job retention preview/cleanup, 30-day `DONE` and 14-day `CANCELLED` windows, exact `jobId + updatedAt` cleanup guards, scoped handoff deletion, and retained private cleanup audits.
- **commands**: `/workflow <objective>` now creates and automatically enqueues the durable workflow job.
- **chatgpt**: Explicit reasoning-level selection/verification with `high` as the default.
- **team**: Explicit final synthesizer identity, defaulting to `chatgpt-thinker` independently of speaking order.
- **browser**: Patchright-backed browser automation, managed Xvfb support, account-specific browser scheduling, visible/hidden operation, and zero-install loopback noVNC login support on the supported Linux target.
- **research**: Provider-native Deep Research through selected thinker accounts with isolated durable research sessions.

### Changed

- **identity**: Provider name is Website implementation metadata only; authenticated runtime boundaries require explicit semantic account identity. No provider-to-account fallback or legacy provider-keyed state migration is used.
- **tools**: Public model-tool IDs use the `internet_*` naming surface (`internet_chat`, `internet_team`, `internet_research`, `internet_browser`, `internet_workflow`, `internet_workflow_maintenance`). Legacy `browser_chat` / `browser_team` IDs are not registered.
- **workflow**: Local is the user-facing authority broker rather than the workflow state machine. Full research/reviewer payloads stay out of normal Local progress context.
- **workflow**: Website handoff delivery is modeled as at-least-once with durable idempotent acknowledgement rather than claimed exactly-once transport.
- **workflow**: Merge is an explicit exact-head human authority boundary; starting `/workflow` authorizes scoped implementation/PR work but never merge.
- **workflow**: Website cross-conversation/project memory is not part of the correctness or data plane.
- **docs**: Documentation is synchronized to the completed P0-P13 as-built runtime; roadmap numbering no longer implies an automatic P14.

### Fixed

- **workflow**: Retry no longer falls back generically to `CREATED`; explicit resume state is persisted for retryable exceptions.
- **workflow**: PR creation retries reconcile the exact deterministic head branch and refuse duplicate/conflicting PR identity.
- **workflow**: Persisted handoff/job authority is strictly validated and tampered deterministic identity/hash metadata is rejected.
- **workflow**: Stale merge authorization and stale PR health are invalidated when the PR head changes.
- **workflow**: Intentional plugin-shutdown aborts preserve resumable work rather than manufacturing user-facing retry failures.
- **build**: Browser entrypoints have one final JavaScript producer and package verification validates the shipped workflow/maintenance artifacts.
- **browser/login**: Account verification, profile retention, provider send readiness, client bundling and remote-login cleanup paths have been hardened.

## 0.0.1

Initial MVP release: a standalone DeepSeek Harness plugin exposing browser-backed web providers.

### Added

- Browser-backed ChatGPT/Gemini chat through authenticated Website sessions.
- `internet_browser` lifecycle operations for login/status/stop.
- `/internet <question>` direct ChatGPT command.
- Portable authenticated account state and durable provider conversations.
- Conservative completion detection and plugin configuration/runtime exports.
