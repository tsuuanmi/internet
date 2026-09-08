# Internet Team Runtime Roadmap

- **Status:** Planning
- **Date:** 2026-09-08

This roadmap orders implementation by dependency and expected ROI. It separates low-risk behavior fixes, identity/routing foundations, and the real `/workflow` runtime.

## Phase 0 — Documentation split and architecture lock

Goal: establish focused contracts before cross-cutting code changes.

Deliverables:

- modular docs index;
- SRS;
- ADRs;
- coding workflow spec;
- workflow-engine design;
- prioritized TODO;
- concise architecture overview;
- explicit distinction between current implementation and target design.

Exit criteria:

- core design choices have explicit documents and stable names;
- future implementation PRs can cite requirements/ADRs instead of repeating rationale.

## Phase 1 — Low-risk behavior fixes

Goal: implement independent changes that do not require multi-account storage refactoring.

Work:

- change default ChatGPT thinking level from `medium` to `high`;
- update configuration docs/tests/system guidance;
- make ChatGPT thinker the explicit default final team synthesizer instead of using `lastProvider`;
- keep speaking order independent from synthesizer selection.

Exit criteria:

- ordinary ChatGPT turns select High by default;
- team synthesis explicitly targets configured ChatGPT thinker identity.

## Phase 2 — First-class account identity

Goal: support two ChatGPT accounts safely.

Work:

- introduce `accountId` separate from `WebProvider`;
- define semantic account aliases and roles;
- make account storage paths account-aware;
- make login profiles account-aware;
- make browser/runtime maps account-aware;
- make scheduler/lease state account-aware;
- make conversation bindings account-aware;
- provide compatibility mapping for existing single-account configs/state.

Suggested initial aliases:

```text
chatgpt-thinker
chatgpt-writer
gemini-thinker
```

Exit criteria:

- thinker and writer ChatGPT accounts can be logged in concurrently;
- their cookies/storage/conversations/schedulers cannot collide;
- existing single-account users have a migration or compatibility path.

## Phase 3 — Account roles and capability routing

Goal: route steps by required capability.

Work:

- model account roles/capabilities;
- add thinker/reviewer/writer routing;
- expose explicit account targeting internally where necessary;
- enforce authoritative repository/base target before writer mutation;
- keep technical GitHub capability separate from workflow authority.

Exit criteria:

- reasoning steps select thinker accounts;
- code mutation selects writer account;
- provider name alone no longer determines the security boundary.

## Phase 4 — Workflow service skeleton

Goal: make `/workflow <task>` start deterministic code instead of injecting one giant prompt.

Work:

- introduce `internet_workflow` service/tool surface;
- add `WorkflowEngine` and `WorkflowJobStore` interfaces;
- convert `/workflow` into a thin adapter that resolves repo/revision and calls `start`;
- return `job_id` and initial state;
- keep current prompt-only implementation behind a temporary compatibility path only if needed during migration.

Exit criteria:

```text
/workflow <task>
  -> internet_workflow.start
  -> persisted job
```

without relying on Local to simulate the workflow protocol.

## Phase 5 — Direct team execution

Goal: preserve the useful background-team behavior without free-form DSH subagent mediation.

Work:

- add workflow-owned `TeamRunner` over the lower-level team runtime;
- add deterministic `TeamPromptBuilder`;
- generate distinct durable session identities per job/team/cycle;
- run two logical thinking teams concurrently;
- make ChatGPT thinker the explicit synthesizer;
- persist team-run status/results;
- retry failed team runs according to job policy.

Exit criteria:

```text
WorkflowEngine
  -> Team A + Team B
  -> exact final results
```

works without a child agent summarizing those results back to Local.

## Phase 6 — Handoff primitive

Goal: remove Local summarization from the agent-to-agent data path.

Work:

- durable handoff record;
- exact payload preservation;
- source/sequence/hash metadata outside payload;
- deterministic delivery ordering;
- delivery receipt/idempotency key;
- separate `DATA` handoffs from `CONTROL` messages.

Exit criteria:

- Team A/B outputs reach writer unchanged;
- Local does not receive full payload by default;
- replay/retry does not unexpectedly duplicate delivery.

## Phase 7 — Terminal writer integration

Goal: connect durable workflow state to `chatgpt-writer`.

Work:

- persistent writer conversation identity;
- deliver all required research handoffs;
- send separate `START_IMPLEMENTATION` control message;
- capture PR receipt;
- support writer `BLOCKED` output;
- support updating an existing PR during remediation;
- enforce target repo/branch/PR scope.

Exit criteria:

```text
Teams -> verbatim handoffs -> Writer -> PR
```

works without Local implementation/push.

## Phase 8 — Scoped approval controller

Goal: allow unattended creation of the reviewable PR while failing closed on ambiguity.

Work:

- detect Website confirmation UI;
- classify recognized implementation/PR actions;
- auto-confirm only when action/job/repository/branch-or-PR/state all match;
- add `UNKNOWN_CONFIRMATION` exception state;
- never treat generic `Allow` text alone as sufficient classification;
- preserve explicit merge gate.

Exit criteria:

- routine branch/file/commit/PR confirmations can proceed automatically;
- ambiguous confirmation stops safely;
- merge remains unauthorized at this phase.

## Phase 9 — PR review/remediation loop

Goal: make Website teams review the real PR directly.

Work:

- start two independent review team runs after PR creation;
- deterministic review prompts;
- explicit ChatGPT synthesizer;
- deliver review results verbatim to writer;
- send separate `APPLY_REVIEWS` control message;
- loop on the same PR;
- configure initial `max_review_cycles` (recommended: 3);
- escalate writer block, material conflict, or exhausted review limit to Local.

Exit criteria:

```text
PR -> Review A/B -> Writer fixes -> PR -> review gates
```

works without Local pushing code between stages.

## Phase 10 — Events and Local integration

Goal: reproduce the best background-subagent UX without injecting raw reasoning into Local.

Work:

- INTERNAL / PROGRESS / ACTION_REQUIRED event classes;
- host-native completion/event injection where DSH supports it;
- compact PR/review progress receipts;
- Local-facing status operation;
- no busy polling as the primary mechanism.

Exit criteria:

- Local can start a job and continue other work;
- completed/blocked/action-required jobs can re-enter Local later through compact events.

## Phase 11 — Merge authorization

Goal: make merge the normal human authority boundary.

Work:

- transition to `READY_FOR_MERGE_AUTHORIZATION` only after review gates pass;
- present PR/head/review/CI state to Local/user;
- persist user authorization bound to PR/head SHA;
- re-check current head before merge;
- after authorization, let writer execute merge and confirm Website merge `Allow` if present;
- record merged SHA/executor.

Exit criteria:

- no merge can occur from the standard workflow without explicit user authorization;
- a changed PR head invalidates stale authorization.

## Phase 12 — Hardening and recovery

Work:

- restart recovery;
- retries/backoff;
- idempotent PR/merge actions;
- account isolation tests;
- handoff payload/hash tests;
- workflow transition tests;
- approval-classification tests;
- audit trail;
- job inspection/debug tooling;
- retention/cleanup rules.

## Phase 13 — Generalize beyond coding

After the coding path is reliable, reuse the same primitives for:

- research report workflows;
- documentation synthesis;
- scientific investigation loops;
- automation/action workflows;
- design review.

Do not generalize prematurely if it weakens the coding workflow.
