# ADR-0003 — Multi-Account Identity and Capability-Aware Routing

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The current plugin models browser identity primarily by provider:

```text
chatgpt-web
gemini-web
```

Current account storage, browser manager maps, scheduler maps, login profile paths, and conversation stores are also provider-oriented.

The target workflow requires at least two distinct ChatGPT accounts with different capabilities:

1. a thinking/review account that should remain read-only where practical;
2. a terminal writer account connected to GitHub with repository write, PR, and merge capability.

Provider identity alone is therefore insufficient as a security or routing boundary.

## Decision

Introduce a first-class `accountId` separate from `provider`.

Conceptually:

```text
accountId: chatgpt-thinker
provider: chatgpt-web
role: thinker
capabilities:
  - github.read

accountId: chatgpt-writer
provider: chatgpt-web
role: terminal-writer
capabilities:
  - github.read
  - github.write
  - github.pull_request
  - github.merge

accountId: gemini-thinker
provider: gemini-web
role: thinker
capabilities:
  - repository.read where connected/available
```

Implementation and configuration should use semantic aliases such as `chatgpt-thinker` and `chatgpt-writer` rather than `account1` and `account2`.

## Identity key

Runtime identity is:

```text
accountId
```

`provider` is derived metadata describing the website implementation behind that authenticated account; it is not an authentication key or fallback selector.

Conversation identity should include:

```text
accountId + sessionId + namespace
```

so two ChatGPT accounts can never accidentally share cookies, login state, scheduler state, or conversation bindings.

## Capability routing

Jobs should request capabilities rather than hard-code implementation details wherever possible.

Example:

```text
job requires:
  repository.read
  repository.write
  pull_request.create

router selects:
  chatgpt-writer
```

A thinking job can instead request:

```text
repository.read
reasoning.high
```

and be routed to `chatgpt-thinker`.

## GitHub writer permissions

The writer account is intended to use a GitHub plugin/connection configured with `Allow all actions` when that setting is available and intentionally accepted by the user.

The runtime must still maintain its own policy boundary:

```text
technical capability != workflow authority
```

Even if the writer can technically merge, merge should occur only when the active workflow reaches an authorized merge state.

## Implementation status

Implemented for the browser/runtime foundation. Authenticated state is now keyed by `accountId` across portable account files, login profiles, BrowserManager lifecycle maps, durable conversations, and scheduler leases. Tool/runtime boundaries use explicit account identities and derive provider implementation from the account catalog.

The implementation touched:

- `src/core/config.ts` — account definitions and role/capability configuration;
- `src/browser/accounts.ts` — account schema v2 and account-scoped portable state;
- `src/browser/storage.ts` — account-scoped login profiles and portable-account paths;
- `src/browser/runtime.ts` — browser, scheduler, login, context, and account-commit maps keyed by account;
- `src/browser/conversations.ts` — account-scoped durable conversation directories;
- `src/browser/provider-scheduler.ts` — one scheduler instance is owned per account identity;
- tool argument schemas and team orchestration, which now route by explicit account identity.

## Migration principles

- Prefer a clean break to account-scoped state instead of carrying legacy/provider-keyed compatibility code by default.
- Do not introduce implicit provider-to-account aliases; authenticated identity boundaries should require an explicit `accountId`.
- Do not add fallback reads, legacy state import, or automatic migration unless a concrete deployment requirement proves it necessary.
- Account files remain private and must never be mixed across aliases.
- A stale snapshot from one account must never overwrite another account's canonical state.

## Consequences

### Positive

- Separate security boundaries for thinker and writer.
- Multiple accounts from the same provider become possible.
- Future account pools and role-specific accounts become straightforward.
- Routing can be based on capability rather than provider name.
- The implementation avoids long-lived compatibility branches that obscure account authority.

### Cost

- This is a cross-cutting storage/runtime refactor.
- Existing provider-keyed local account state may need to be recreated manually when the account-scoped runtime lands.
- Tests must cover account isolation, scheduler isolation, login, and conversation persistence.

## Invariant

> Provider identifies the website implementation; accountId identifies the authenticated capability boundary.
