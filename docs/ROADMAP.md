# Internet Team Runtime Roadmap

- **Status:** Planning
- **Date:** 2026-09-08

This roadmap orders implementation by dependency and expected ROI. It intentionally separates foundational runtime changes from later workflow automation.

## Phase 0 — Documentation split and architecture lock

Goal: stop growing one giant architecture document and establish stable contracts before cross-cutting code changes.

Deliverables:

- modular docs index;
- SRS;
- ADRs;
- coding workflow spec;
- prioritized TODO;
- concise architecture overview;
- explicit distinction between current implementation and target design.

Exit criteria:

- core design choices have explicit documents and stable names;
- future implementation PRs can cite requirements/ADRs instead of repeating architecture rationale.

## Phase 1 — Low-risk behavior fixes

Goal: implement independent changes that do not require multi-account storage refactoring.

Work:

- change default ChatGPT thinking level from `medium` to `high`;
- update configuration docs/tests/system guidance;
- make ChatGPT thinker the explicit default final team synthesizer instead of using `lastProvider`;
- keep speaking order independent from synthesizer selection.

Why first:

- small surface area;
- immediately improves team result quality/consistency;
- removes one known architectural mismatch before larger refactors.

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

Goal: route workflow steps by required capability.

Work:

- model account role/capabilities;
- add routing rules for thinker/reviewer/writer;
- expose explicit account targeting internally where necessary;
- enforce authoritative repository/base target before writer mutation;
- keep GitHub permission level separate from workflow authorization.

Exit criteria:

- reasoning steps select thinker accounts;
- code mutation selects writer account;
- no provider-name-only assumption determines the security boundary.

## Phase 4 — Handoff primitive

Goal: remove Local summarization from the agent-to-agent data path.

Work:

- define durable handoff record;
- preserve final output verbatim;
- attach sequence/source/hash metadata outside payload;
- support deterministic delivery ordering;
- add delivery receipt/idempotency key;
- separate `DATA` handoffs from `CONTROL` messages.

Exit criteria:

- Team A/B outputs can reach writer unchanged;
- Local can trigger writer start without reading or rewriting the payload;
- replay/retry does not duplicate a handoff unexpectedly.

## Phase 5 — Coding job state machine

Goal: make long-running workflows independent from one Local tool call.

Work:

- persistent `job_id`;
- job state store;
- state transitions/events;
- background team execution;
- handoff gates;
- writer start gate;
- external approval wait state;
- PR receipt state;
- failure/retry/cancel semantics;
- compact event injection/notification into Local.

Exit criteria:

- Local can start a job and continue other work;
- a completed/blocked job can re-enter Local later through a compact event;
- user approval pauses do not destroy workflow state.

## Phase 6 — Terminal writer integration

Goal: connect the durable workflow to ChatGPT writer account behavior.

Work:

- persistent writer conversation identity;
- deliver all required pre-implementation handoffs;
- send separate `START_IMPLEMENTATION` control message;
- capture PR receipt;
- support writer `BLOCKED` output;
- support updating an existing PR during remediation;
- support merge execution only from authorized job state.

Exit criteria:

```text
Teams -> verbatim handoffs -> Writer -> PR
```

works without Local implementation/push.

## Phase 7 — PR review/remediation loop

Goal: make Website teams review the real PR directly.

Work:

- spawn two independent review teams after PR creation;
- use explicit ChatGPT final synthesizer in each team;
- deliver review results verbatim to writer;
- send separate `APPLY_REVIEWS` control message;
- loop on the same PR;
- configure re-review policy and maximum cycles;
- support fresh auditor mode for high-risk work.

Exit criteria:

```text
PR -> Review A/B -> Writer fixes -> PR -> review gates
```

works without Local pushing code between stages.

## Phase 8 — Merge/approval policy

Goal: automate the happy path while preserving explicit authority.

Work:

- represent merge authorization state;
- test writer account with GitHub `Allow all actions`;
- detect whether any platform-level approval still appears;
- pause as `AWAITING_EXTERNAL_APPROVAL` when needed;
- verify expected PR head before merge;
- record executor and merged SHA.

Exit criteria:

- happy path can merge without unnecessary repeated prompts when platform permissions allow it;
- workflow cannot merge before authorization state is reached.

## Phase 9 — Hardening and observability

Work:

- restart recovery;
- retries/backoff;
- idempotent PR/merge actions;
- audit trail for state transitions;
- account isolation tests;
- handoff payload/hash tests;
- workflow metrics;
- job inspection/debug command;
- retention/cleanup rules.

## Phase 10 — Generalize beyond coding

After coding is reliable, reuse the same primitives for:

- research report workflows;
- documentation synthesis;
- scientific investigation loops;
- automation/action workflows;
- design review.

Do not generalize prematurely if it weakens the coding workflow implementation.
