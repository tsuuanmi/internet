# How the internet plugin works

## Layout

- `src/browser/` — Chrome discovery, managed-display lifecycle, the shared completion poller, the
  per-provider drivers (`chatgpt.ts`, `gemini.ts`), and the `BrowserManager` runtime.
- `src/core/` — plugin `Config` and validation, the error taxonomy, markdown conversion, and a
  small abort-aware sleep helper.
- `src/tools/` — the model-facing `browser_chat` tool and the `internet_browser` lifecycle tool.
  `args.ts` is the DSH-free argument parser so it is unit-testable without harness packages.
- `src/commands/` — the human-facing `/internet` command that asks ChatGPT without a model turn.
- `src/client.ts` — the browser-side `/internet` renderer, which shows successful output as markdown
  instead of placing a multiline answer inside the generic collapsed command card.
- `src/types/dsh.d.ts` — minimal ambient declarations for the `@deepseek-ai/*` peer packages, so the
  package builds and type-checks standalone without installing them.
- `src/index.ts` — the Cordis plugin entry exporting `{ name, inject, apply, Config }`.

## Request flow

```text
internet_browser { action: "login", model }
  -> spawn dedicated normal Chrome using dataDir/<provider>/login-profile
  -> user signs in and closes that Chrome window completely
  -> wait for Chrome to release the profile lock
  -> manually export and verify cookies/local storage
  -> write storage-state.json + storage-state.verified.json (mode 0600)
  -> remove the temporary login profile

/internet <question>
  -> DSH command handler bypasses the model
  -> BrowserManager.chat("chatgpt-web", { prompt, sessionId: String(invocation.agent.id), signal })
  -> return command text; the client command renderer displays it as markdown

browser_chat { model, prompt }
  -> read current DSH identity from String(exec.agent.id)
  -> BrowserManager.chat(provider, { prompt, sessionId, signal })
  -> for ChatGPT, read conversations/<sha256(sessionId)>.json
  -> navigate to the bound /c/<conversationId>, or home for the first turn
  -> ensure authenticated (composer visible)
  -> record the latest assistant text, fill composer, submit
  -> waitForStableCompletion(newTurnSnapshot)   # changed, not running, stable for stableMs
  -> atomically persist/validate the 1:1 conversation binding (mode 0600)
  -> htmlToMarkdown(newResponseHtml) -> { answer, url, conversationId }
```

## Durable provider conversations

Each agent-backed tool execution exposes the live DSH session as `exec.agent.id`. The plugin hashes
that ID and stores one canonical provider conversation URL under
`dataDir/<provider>/conversations/<sessionHash>.json`; raw session IDs and prompts are not persisted.
The directory is mode `0700`, files are mode `0600`, and writes use fsync plus atomic rename. A session
may refresh its existing binding but cannot silently rebind to another native conversation. ChatGPT
and Gemini sessions navigate independently even when calls share one provider browser context.

## Browser lifecycle

Login uses a temporary normal-Chrome profile without debugging or browser-automation flags in the
OAuth flow. On Linux it requires a visible, user-managed `$DISPLAY`; managed Xvfb is deliberately not
used for the interactive window. After Chrome exits and releases its profile lock, patchright opens
the profile and manually exports cookies/local storage without calling the failing persistent-context
`storageState()` path. Only verified state is kept under `dataDir/<provider>/storage-state.json`; the
temporary profile is deleted.

For automated headed launches on Linux, `BrowserDisplayManager` first starts one shared
`Xvfb -displayfd` server at `1920x1080x24`. `-displayfd` lets Xorg choose a free display without a
`:99` race. If startup fails and the process inherited a non-empty `$DISPLAY`, launches fall back to
that system display; without either option they fail explicitly. Native-headless mode bypasses the
display manager. Managed-Xvfb contexts use the normal browser window viewport; existing system-display
and native-headless contexts retain their deterministic `1280x900` viewport.

Inference uses separate non-persistent contexts, avoiding Chrome profile singleton locks.
`internet_browser stop` closes only a provider's inference browser. The Xvfb process remains shared
until `BrowserManager.dispose()` closes all Chrome sessions and then terminates the display.

## Error taxonomy

Failures are surfaced as `InternetError` with a `kind` the tool reports to the model:
`browser_unavailable`, `login_required`, `login_failed`, `timeout`, `aborted`, `provider_error`, and
`config_error`.
