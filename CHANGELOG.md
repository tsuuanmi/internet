# Changelog

## Unreleased

### Added

- **chatgpt**: Select the ChatGPT Web reasoning-effort level before each turn via the new
  `chatgptThinkingLevel` config (default `medium`, i.e. GPT-5.6-Sol Medium). Previously every turn
  ran on the UI default (Instant). Supports `instant | medium | high | extra-high | pro`, and handles
  both the menuitemradio list and the reasoning-effort slider surfaces.
- **browser**: Migrate the automation backend from `playwright-core` to `patchright-core` (a drop-in,
  stealth-patched Playwright fork) and keep the ChatGPT inference browser open through a long idle TTL
  (`closeAfterMs` default `1800000`, 30 min) instead of closing it 10s after each turn.

### Fixed

- **client**: Build the web client entry (`src/client.ts`) as a DeepSeek Harness `__ModuleLoader__.load`
  bundle (via `scripts/build-client.mjs` in `npm run build`) instead of the plain `tsgo` ES-module
  emit. The raw ES-module `dist/client.js` failed to parse/register as the classic script the harness
  loads for a plugin's browser surface, so the `/internet` command view never composed.

## 0.0.1

Initial MVP release: a standalone DeepSeek Harness plugin exposing browser-backed web providers.

### Added

- `browser_chat` model tool: ask ChatGPT Web or Gemini Web a question through a real, logged-in
  browser and return the rendered answer as markdown.
- `internet_browser` lifecycle tool: `login`, `status`, `stop`.
- `/internet <question>` command: bypass the model, ask ChatGPT in the current DSH session's durable
  native conversation, and render the returned markdown directly in the Web conversation UI.
- `BrowserManager`: plain normal-Chrome interactive login, lock-safe manual storage-state export,
  non-persistent Playwright inference contexts, and clean shutdown.
- Private durable 1:1 DSH-session-to-ChatGPT-conversation bindings with canonical conversation-ID
  validation and multi-turn continuation across browser/plugin restarts.
- Conservative new-turn completion detection (present, not running, stable for `stableMs`).
- Plugin `Config` as a Schemastery object schema (DSH validates profile config through it and
  renders the settings UI), plus programmatic exports (`BrowserManager`, `resolveBrowserConfig`,
  `parseChatArgs`, error types).
- Unit tests for config, argument parsing, markdown rendering, storage layout, durable conversation
  bindings, new-turn selection, and completion polling.
