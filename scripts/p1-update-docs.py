from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing expected text in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new))

# TODO status: P1 #4-#7 land together as one coherent account-identity refactor.
replace("docs/TODO.md", "### 4. Refactor account storage from provider-keyed to account-keyed", "### 4. ✅ Refactor account storage from provider-keyed to account-keyed")
replace("docs/TODO.md", "### 5. Refactor BrowserManager maps to account identity", "### 5. ✅ Refactor BrowserManager maps to account identity")
replace("docs/TODO.md", "### 6. Make conversation stores account-aware", "### 6. ✅ Make conversation stores account-aware")
replace("docs/TODO.md", "### 7. Make scheduler serialization account-aware", "### 7. ✅ Make scheduler serialization account-aware")
replace(
    "docs/TODO.md",
    "## P1 — Multi-account foundation\n\n### 4.",
    "## P1 — Multi-account foundation\n\n**Status:** implemented as one clean-break refactor. Authenticated runtime boundaries now require explicit `accountId`; provider remains website implementation metadata only. No legacy account migration or provider-to-account fallback is included.\n\n### 4.",
)

# Architecture update: P1 is no longer future work.
replace(
    "docs/UPDATE.md",
    "- first-class semantic account identities now exist for `chatgpt-thinker`, `chatgpt-writer`, and `gemini-thinker`; provider-keyed browser/storage state is the next migration step;\n- team synthesis is explicitly routed through a configured provider; ChatGPT is the default synthesizer;",
    "- first-class semantic account identities now exist for `chatgpt-thinker`, `chatgpt-writer`, and `gemini-thinker`; portable account state, login profiles, BrowserManager maps, durable conversations, and scheduler locks are all account-scoped;\n- authenticated runtime APIs require explicit `accountId`; provider is derived from the account catalog and is never used as an implicit account selector;\n- portable account files use schema version 2 with both `accountId` and provider identity, and version-1 provider-keyed files are intentionally not migrated or read as fallback;\n- team synthesis is explicitly routed through the configured `chatgpt-thinker` account, independent of speaking order;",
)
replace(
    "docs/UPDATE.md",
    "## Existing architecture points retained",
    "## Multi-account foundation implemented\n\nP1 TODO #4–#7 are implemented together as a coherent identity-boundary change:\n\n```text\naccounts/chatgpt-thinker.json\naccounts/chatgpt-writer.json\naccounts/gemini-thinker.json\n\nchatgpt-thinker/login-profile\nchatgpt-writer/login-profile\ngemini-thinker/login-profile\n\n<accountId>/conversations/<sha256(sessionId)>.json\n```\n\n`BrowserManager` browser pools, launches, schedulers, remote logins, active contexts, delayed closes, and account commit queues are keyed by `accountId`. `chatgpt-thinker` and `chatgpt-writer` therefore have independent authentication state and independent scheduler locks even though both use the ChatGPT Web implementation.\n\n## Existing architecture points retained",
)

# ADR records implementation and clean-break semantics.
replace(
    "docs/ADR/0003-multi-account-capability-routing.md",
    "## Current implementation impact\n\nThis decision affects at least:",
    "## Implementation status\n\nImplemented for the browser/runtime foundation. Authenticated state is now keyed by `accountId` across portable account files, login profiles, BrowserManager lifecycle maps, durable conversations, and scheduler leases. Tool/runtime boundaries use explicit account identities and derive provider implementation from the account catalog.\n\nThe implementation touched:",
)
replace("docs/ADR/0003-multi-account-capability-routing.md", "- `src/browser/accounts.ts` — account files currently keyed by provider;", "- `src/browser/accounts.ts` — account schema v2 and account-scoped portable state;")
replace("docs/ADR/0003-multi-account-capability-routing.md", "- `src/browser/storage.ts` — login profile/account paths currently keyed by provider;", "- `src/browser/storage.ts` — account-scoped login profiles and portable-account paths;")
replace("docs/ADR/0003-multi-account-capability-routing.md", "- `src/browser/runtime.ts` — browser, scheduler, login, context, and account-commit maps currently keyed by provider;", "- `src/browser/runtime.ts` — browser, scheduler, login, context, and account-commit maps keyed by account;")
replace("docs/ADR/0003-multi-account-capability-routing.md", "- `src/browser/conversations.ts` — ChatGPT/Gemini stores currently use provider-specific directories;", "- `src/browser/conversations.ts` — account-scoped durable conversation directories;")
replace("docs/ADR/0003-multi-account-capability-routing.md", "- `src/browser/provider-scheduler.ts` — scheduling/serialization must become account-aware;", "- `src/browser/provider-scheduler.ts` — one scheduler instance is owned per account identity;")
replace("docs/ADR/0003-multi-account-capability-routing.md", "- tool argument schemas where explicit account selection or role routing is required.", "- tool argument schemas and team orchestration, which now route by explicit account identity.")
replace(
    "docs/ADR/0003-multi-account-capability-routing.md",
    "Runtime identity should move from:\n\n```text\nprovider\n```\n\ntoward:\n\n```text\nprovider + accountId\n```",
    "Runtime identity is:\n\n```text\naccountId\n```\n\n`provider` is derived metadata describing the website implementation behind that authenticated account; it is not an authentication key or fallback selector.",
)

# README user-facing API and storage model.
replace("README.md", "- **`internet_chat`** — ask ChatGPT or Gemini through the authenticated website.", "- **`internet_chat`** — ask an explicit authenticated thinker account (`chatgpt-thinker` or `gemini-thinker`).")
replace("README.md", "- **`internet_research`** — run provider-native Deep Research in one or both providers.", "- **`internet_research`** — run provider-native Deep Research through one or both thinker accounts.")
replace("README.md", "- **`internet_browser`** — sign in, inspect account state, or stop a provider browser.", "- **`internet_browser`** — sign in, inspect account state, or stop an exact semantic account, including `chatgpt-writer`.")
replace("README.md", "- **Durable conversations** — each DSH session resumes one native conversation per provider.", "- **Durable conversations** — each DSH session resumes one native conversation per account identity.")
replace(
    "README.md",
    "internet_chat {\n  model: \"chatgpt-web\" | \"gemini-web\",\n  prompt: string,\n  visible?: boolean\n}",
    "internet_chat {\n  account: \"chatgpt-thinker\" | \"gemini-thinker\",\n  prompt: string,\n  visible?: boolean\n}",
)
replace("README.md", "Each provider owns one durable native conversation for the current DSH session. A later call from the\nsame session navigates back to that provider's bound ChatGPT `/c/<id>` or Gemini `/app/<id>` URL.\nChatGPT and Gemini bindings are independent.", "Each account owns one durable native conversation for the current DSH session. A later call from the same session navigates back to that account's bound ChatGPT `/c/<id>` or Gemini `/app/<id>` URL. `chatgpt-thinker`, `chatgpt-writer`, and `gemini-thinker` never share durable binding state.")
replace(
    "README.md",
    "internet_research {\n  query: string,\n  providers?: [\"chatgpt-web\", \"gemini-web\"],\n  name?: string,\n  visible?: boolean\n}",
    "internet_research {\n  query: string,\n  accounts?: [\"chatgpt-thinker\", \"gemini-thinker\"],\n  name?: string,\n  visible?: boolean\n}",
)
replace("README.md", "returns one independent result per provider; one provider\nfailure preserves the other as `partial_success`.", "returns one independent result per selected account; one account failure preserves the other as `partial_success`.")
replace(
    "README.md",
    "  providers?: [\"chatgpt-web\", \"gemini-web\"],",
    "  accounts?: [\"chatgpt-thinker\", \"gemini-thinker\"],",
)
replace("README.md", "`internet_team` is registered only when at least two providers are enabled. Defaults:", "`internet_team` is registered when both thinker accounts are enabled. Defaults:")
replace("README.md", "- providers: `chatgpt-web`, then `gemini-web`", "- accounts: `chatgpt-thinker`, then `gemini-thinker`")
replace("README.md", "Providers speak sequentially in the requested order.", "Thinker accounts speak sequentially in the requested order.")
replace("README.md", "ChatGPT (`chatgpt-web`) is the default synthesizer", "`chatgpt-thinker` is the default synthesizer")
replace("README.md", "By default the tool returns only `finalAnswer` and `finalProvider`.", "By default the tool returns `finalAnswer`, `finalAccountId`, and `finalProvider`.")
replace("README.md", "Both accounts must be ready before a complete two-provider run.", "Both thinker accounts must be ready before a complete two-account run.")
replace(
    "README.md",
    "internet_browser {\n  action: \"login\" | \"status\" | \"stop\",\n  model: \"chatgpt-web\" | \"gemini-web\",\n  remote?: boolean\n}",
    "internet_browser {\n  action: \"login\" | \"status\" | \"stop\",\n  account: \"chatgpt-thinker\" | \"chatgpt-writer\" | \"gemini-thinker\",\n  remote?: boolean\n}",
)
replace("README.md", "- **`stop`** closes the provider's inference browser and cancels a waiting remote login.", "- **`stop`** closes that account's inference browser and cancels its waiting remote login.")
replace("README.md", "maxConcurrentTurnsPerProvider: 1", "maxConcurrentTurnsPerAccount: 1")
replace("README.md", "teamSynthesizer: chatgpt-web", "teamSynthesizer: chatgpt-thinker")
replace("README.md", "| `remoteLoginPort` | `39000` | ChatGPT loopback noVNC port; Gemini uses the next port (`39001`). |", "| `remoteLoginPort` | `39000` | Base loopback noVNC port. Account IDs use stable offsets: ChatGPT thinker `39000`, ChatGPT writer `39001`, Gemini thinker `39002`. |")
replace("README.md", "| `maxConcurrentTurnsPerProvider` | `1` | Maximum simultaneous hidden turns per provider from different DSH sessions; increase only after confirming provider account-state acceptance. |", "| `maxConcurrentTurnsPerAccount` | `1` | Maximum simultaneous hidden turns per authenticated account from different DSH sessions. Different account IDs use independent schedulers. |")
replace("README.md", "| `teamSynthesizer` | `chatgpt-web` | Provider that performs final team synthesis, independent of speaking order. |", "| `teamSynthesizer` | `chatgpt-thinker` | Account that performs final team synthesis, independent of speaking order. |")
replace("README.md", "`remoteLoginPort` must leave room for Gemini on the next TCP port.", "`remoteLoginPort` must leave room for all semantic account offsets.")
replace("README.md", "internet_browser { action: \"login\", model: \"chatgpt-web\" }", "internet_browser { action: \"login\", account: \"chatgpt-thinker\" }")
replace("README.md", "internet_browser { action: \"login\", model: \"gemini-web\", remote: true }", "internet_browser { action: \"login\", account: \"gemini-thinker\", remote: true }")
replace("README.md", "ChatGPT uses port `39000`; Gemini uses `39001` with the default configuration.", "With the default configuration, `chatgpt-thinker` uses `39000`, `chatgpt-writer` uses `39001`, and `gemini-thinker` uses `39002`.")
replace(
    "README.md",
    "~/.dsh/internet/accounts/\n  chatgpt-web.json\n  gemini-web.json",
    "~/.dsh/internet/accounts/\n  chatgpt-thinker.json\n  chatgpt-writer.json\n  gemini-thinker.json",
)
replace("README.md", "check each provider with `internet_browser status`.", "check each account with `internet_browser status`.")
replace("README.md", "Do not copy provider `login-profile/` directories", "Do not copy account `login-profile/` directories")
replace("README.md", "replaces only that provider's\nportable account file.", "replaces only that account's portable account file.")
replace("README.md", "By default, one hidden turn runs per provider. Set `maxConcurrentTurnsPerProvider` above `1` only after\nconfirming provider policy and account-state acceptance.", "By default, one hidden turn runs per account. Set `maxConcurrentTurnsPerAccount` above `1` only after confirming account-state acceptance. Different account IDs, including the two ChatGPT accounts, have independent scheduler locks.")
replace(
    "README.md",
    "~/.dsh/internet/chatgpt-web/conversations/<sha256(sessionId)>.json\n~/.dsh/internet/gemini-web/conversations/<sha256(sessionId)>.json",
    "~/.dsh/internet/chatgpt-thinker/conversations/<sha256(sessionId)>.json\n~/.dsh/internet/chatgpt-writer/conversations/<sha256(sessionId)>.json\n~/.dsh/internet/gemini-thinker/conversations/<sha256(sessionId)>.json",
)
replace("README.md", "internet_chat { model: \"chatgpt-web\", prompt: \"Remember codeword cobalt.\" }", "internet_chat { account: \"chatgpt-thinker\", prompt: \"Remember codeword cobalt.\" }")
replace("README.md", "  model: \"chatgpt-web\",", "  account: \"chatgpt-thinker\",")
replace("README.md", "internet_chat { model: \"gemini-web\", prompt: \"Summarize this design tradeoff: ...\" }", "internet_chat { account: \"gemini-thinker\", prompt: \"Summarize this design tradeoff: ...\" }")
replace("README.md", "# Ordered providers and bounded current-call transcript", "# Ordered thinker accounts and bounded current-call transcript")
replace("README.md", "  providers: [\"gemini-web\", \"chatgpt-web\"],", "  accounts: [\"gemini-thinker\", \"chatgpt-thinker\"],")
replace("README.md", "run `internet_browser login` for that provider. A team run\n  needs every selected provider ready.", "run `internet_browser login` for that exact account. A team run needs every selected thinker account ready.")

# how-it-works: internal identities are account-scoped.
replace("docs/how-it-works.md", "`BrowserManager`, provider serialization, Chrome/context ownership, account", "`BrowserManager`, account serialization, Chrome/context ownership, account")
replace("docs/how-it-works.md", "private, hashed DSH-session-to-provider-conversation bindings.", "private, hashed DSH-session-to-account-conversation bindings.")
replace("docs/how-it-works.md", "`src/team/orchestrator.ts` — provider ordering", "`src/team/orchestrator.ts` — account ordering")
replace("docs/how-it-works.md", "Registration depends on enabled providers:", "Registration derives enabled semantic accounts from the enabled website implementations:")
replace("docs/how-it-works.md", "- `internet_chat` and `internet_browser` are available when at least one provider is enabled.\n- `/internet` is available only when ChatGPT is enabled.\n- `internet_team` and `/workflow` are available only when at least two providers are enabled.", "- `internet_browser` manages every enabled semantic account, including `chatgpt-writer`.\n- `internet_chat` and `internet_research` expose enabled thinker accounts only.\n- `/internet` is available when `chatgpt-thinker` is enabled.\n- `internet_team` and `/workflow` require both `chatgpt-thinker` and `gemini-thinker`.")
replace("docs/how-it-works.md", "internet_chat { model, prompt, visible? }\n  -> validate model, prompt, and visible\n  -> read String(exec.agent.id) as the durable owner\n  -> BrowserManager.chat(provider, request)\n  -> acquire a provider lease (same session FIFO; default hidden capacity one)", "internet_chat { account, prompt, visible? }\n  -> validate explicit accountId, prompt, and visible\n  -> read String(exec.agent.id) as the durable owner\n  -> BrowserManager.chat(accountId, request)\n  -> acquire that account's lease (same session FIFO; default hidden capacity one)")
replace("docs/how-it-works.md", "dataDir/<provider>/conversations/<sha256(sessionId)>.json", "dataDir/<accountId>/conversations/<sha256(sessionId)>.json")
replace("docs/how-it-works.md", "`internet_research { query, providers?, name?, visible? }`", "`internet_research { query, accounts?, name?, visible? }`")
replace("docs/how-it-works.md", "It invokes selected providers concurrently, while each provider still holds\nits ordinary serialized browser lease.", "It invokes selected thinker accounts concurrently, while each account holds its own serialized browser lease.")
replace("docs/how-it-works.md", "For each round, providers speak sequentially in the requested order:", "For each round, thinker accounts speak sequentially in the requested order:")
replace("docs/how-it-works.md", "  for provider in providers:\n    prompt = task + every other provider's latest contribution\n    result = BrowserManager.chat(provider, teamSessionId, visible)", "  for accountId in accounts:\n    prompt = task + every other account's latest contribution\n    result = BrowserManager.chat(accountId, teamSessionId, visible)")
replace("docs/how-it-works.md", "The first provider in round one", "The first account in round one")
replace("docs/how-it-works.md", "The default synthesizer is `chatgpt-web`, independent of provider speaking order.", "The default synthesizer is `chatgpt-thinker`, independent of account speaking order.")
replace("docs/how-it-works.md", "The orchestrator stops at the first provider failure and returns that provider", "The orchestrator stops at the first account failure and returns that account")
replace("docs/how-it-works.md", "## Durable provider conversations", "## Durable account conversations")
replace("docs/how-it-works.md", "dataDir/chatgpt-web/conversations/<sha256(sessionId)>.json\ndataDir/gemini-web/conversations/<sha256(sessionId)>.json", "dataDir/chatgpt-thinker/conversations/<sha256(sessionId)>.json\ndataDir/chatgpt-writer/conversations/<sha256(sessionId)>.json\ndataDir/gemini-thinker/conversations/<sha256(sessionId)>.json")
replace("docs/how-it-works.md", "creates or reuses a provider-isolated login\nprofile", "creates or reuses an account-isolated login profile")
replace("docs/how-it-works.md", "normal Chrome using the provider login profile", "normal Chrome using that account's login profile")
replace("docs/how-it-works.md", "The stable HTTP ports are `remoteLoginPort` for ChatGPT and `remoteLoginPort + 1` for Gemini.", "Stable HTTP ports use `remoteLoginPort + ACCOUNT_IDS.indexOf(accountId)`: by default `39000` for ChatGPT thinker, `39001` for ChatGPT writer, and `39002` for Gemini thinker.")
replace("docs/how-it-works.md", "Pressing **Save account** re-enters the serialized provider queue", "Pressing **Save account** re-enters that account's serialized queue")
replace("docs/how-it-works.md", "The plugin atomically writes `dataDir/accounts/<provider>.json` with mode `0600`.", "The plugin atomically writes schema-v2 `dataDir/accounts/<accountId>.json` with mode `0600`; the file binds both `accountId` and its derived provider implementation. Version-1 provider-keyed files are not imported or used as fallback.")
replace("docs/how-it-works.md", "The default allows one hidden turn per provider.", "The default allows one hidden turn per account.")
replace("docs/how-it-works.md", "Set\n`maxConcurrentTurnsPerProvider` above `1` only after confirming provider policy and account-state\nacceptance.", "Set `maxConcurrentTurnsPerAccount` above `1` only after confirming account-state acceptance. Separate account IDs own separate schedulers, so `chatgpt-thinker` and `chatgpt-writer` do not share a lock.")
replace("docs/how-it-works.md", "are provider-exclusive barriers.", "are account-exclusive barriers.")
replace("docs/how-it-works.md", "Reauthentication invalidates the provider\ngeneration", "Reauthentication invalidates only the affected account generation")
