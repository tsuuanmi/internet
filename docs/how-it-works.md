# How the internet plugin works

## Layout

- `src/browser/` — Chrome discovery, managed Xvfb/x11vnc and remote-login lifecycle, the shared
  completion poller, provider drivers (`chatgpt.ts`, `gemini.ts`), and the `BrowserManager` runtime.
- `src/core/` — plugin `Config` and validation, the error taxonomy, markdown conversion, and a
  small abort-aware sleep helper.
- `src/tools/` — the model-facing `browser_chat` tool and the `internet_browser` lifecycle tool.
  `args.ts` is the DSH-free argument parser so it is unit-testable without harness packages.
- `src/commands/` — the human-facing `/internet` command that asks ChatGPT without a model turn.
- `src/client.ts` — the browser-side `/internet` renderer. `src/remote-login-client.ts` is the isolated,
  bundled noVNC client with Save/Cancel controls; it is not part of the DSH application shell.
- `src/types/dsh.d.ts` — minimal ambient declarations for the `@deepseek-ai/*` peer packages, so the
  package builds and type-checks standalone without installing them.
- `src/index.ts` — the Cordis plugin entry exporting `{ name, inject, apply, Config }`.

## Request flow

```text
internet_browser { action: "login", model }
  -> local DISPLAY: open dedicated normal Chrome and wait for the user to close it
  -> displayless Linux: start dedicated Xvfb + loopback x11vnc + tokenized noVNC server
  -> return loopback URL/port/SSH command immediately; user signs in and presses Save account
  -> stop Chrome, VNC, and the dedicated Xvfb; wait for the profile lock
  -> export bootstrap cookies/local storage from the unlocked profile
  -> verify in a fresh non-persistent context and capture current IndexedDB
  -> atomically write dataDir/accounts/<provider>.json (mode 0600)
  -> retain the machine-local login profile for account recovery

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

Login uses a persistent, provider-isolated normal-Chrome profile without debugging or
browser-automation flags in the OAuth flow. A user-managed display opens Chrome directly. Without one
on Linux, `RemoteLoginSession` owns a dedicated `BrowserDisplayManager`, bundled-first x11vnc process,
loopback Node HTTP/WebSocket bridge, noVNC page, normal Chrome process, timeout, and cleanup. The tool
returns immediately while provider serialization is free; Save re-enters the provider queue for the
single authoritative finalization path. HTTP/WebSocket and VNC bind to `127.0.0.1`; a 256-bit path token,
independent temporary VNC password, same-origin checks, strict routes, no-store/CSP headers, and SSH
forwarding define the security boundary. Public binding and proxy trust are intentionally absent.

After Chrome exits and releases its profile lock, patchright opens the profile and exports bootstrap
cookies/local storage. Patchright cannot call `storageState()` on this native-keyring persistent
context, so a fresh non-persistent context verifies the bootstrap, captures current IndexedDB, and
atomically writes the canonical `dataDir/accounts/<provider>.json` file. A failed, cancelled, or expired
remote login never replaces an existing ready account.

The `accounts/` directory is the only portable authentication boundary. Full Chrome profiles are
machine-local because their encrypted data depends on OS keyrings and Chrome internals. Conversations
remain outside the account artifact because they are DSH-session bindings, not credentials. Account
files are plaintext bearer secrets and must be copied only through a secure channel while DSH is
stopped. Provider expiry, revocation, risk checks, MFA, or CAPTCHA can still require a new login.

For automated headed launches on Linux, `BrowserDisplayManager` starts one shared
`Xvfb -displayfd` server at `1920x1080x24`. `-displayfd` lets Xorg choose a free display without a
`:99` race. Linux x64 glibc 2.35+ uses the package's measured Xvfb runtime closure first (private
binary, shared libraries, `xkbcomp`, and XKB data); other targets skip it. A system `Xvfb` is the next
candidate, followed by an inherited `$DISPLAY`. The same supported bundle includes x11vnc and its
measured library closure for remote login, with system `x11vnc` as the unsupported-target fallback.
Without a usable candidate, launch fails explicitly.
Native-headless mode bypasses display discovery. Managed-Xvfb contexts use the normal browser window
viewport; system-display and native-headless contexts retain their deterministic `1280x900` viewport.

Inference uses separate non-persistent contexts restored only from the canonical account file,
avoiding Chrome profile singleton locks. Successful turns recapture cookies, local storage, and
IndexedDB before atomically refreshing that file. Both providers use the configured idle close TTL.
`internet_browser stop` closes a provider's inference browser and cancels a waiting remote login. The shared
inference Xvfb remains until `BrowserManager.dispose()` closes all sessions and terminates the display;
a remote login's dedicated Xvfb always closes with that login.

## Error taxonomy

Failures are surfaced as `InternetError` with a `kind` the tool reports to the model:
`browser_unavailable`, `login_required`, `login_failed`, `timeout`, `aborted`, `provider_error`, and
`config_error`.
