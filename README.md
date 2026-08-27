# @tsuuanmi/internet

Browser-backed web providers (ChatGPT Web, Gemini Web) for the DeepSeek Harness.

`packages/internet` (the pi monorepo) pioneered driving the real ChatGPT and Gemini web UIs through an
isolated Chrome browser. This package re-architects that capability as a **standalone, DSH-native
plugin**: it is not a wrapper over `@tsuuanmi/pi-internet`, it has no Bun daemon, and it speaks only to
DSH seams (`ctx.tools`, `ctx.commands`, `ctx.systemPrompt`, and a client command renderer). It adds the one thing DSH lacks — a controllable browser —
without re-implementing the `web_search` / `web_fetch` tools DSH already ships.

## MVP scope

This is an MVP delivering a model tool (`browser_chat`) and a human slash command (`/internet`), not
a provider model. The agent stays on its configured model and calls `browser_chat` when it wants a
ChatGPT or Gemini answer. A human can use `/internet <question>` to ask ChatGPT directly without a
model turn. A `ctx.llm` provider adapter can be layered on later reusing the same `BrowserManager`.

## Tools

- `browser_chat` — ask `chatgpt-web` or `gemini-web` a question through a real, logged-in browser and
  return the rendered answer as markdown. Both ChatGPT and Gemini bind one native conversation to the
  current DSH session and durably resume it on later calls.
- `browser_team` — run an ordered debate among the configured web providers on a task. Each model
  speaks for `teamRounds` rounds, critiquing and refining the others' latest messages, then produces
  a single final "best of both" answer. It returns only that answer by default; an opt-in,
  character-bounded current-call transcript is available with `includeTranscript: true`. The DSH agent
  is the team lead and does not participate. The team's conversations are isolated from the agent's
  own `browser_chat` threads (keyed by a derived `:team:` session id) yet durable across repeated calls.
- `internet_browser` — lifecycle: `login` (opens dedicated normal Chrome; sign in and close it
  completely), `status`, `stop`.

## Slash command

- `/internet <question>` — ask ChatGPT directly. It uses the same durable DSH-session-to-ChatGPT
  conversation as `browser_chat` and renders the returned markdown directly in the conversation UI.
- `/internet` without a question returns usage help. The command is available when `enableChatgpt`
  is true.

## Architecture

- **No daemon.** The plugin drives Chrome directly inside the DSH Node host.
- **No reuse of the DSH GUI browser.** DSH has no browser-automation seam and the GUI browser cannot
  be automated safely.
- **Login** spawns dedicated normal Chrome without debugging or browser-automation flags. After
  the user signs in and closes Chrome, the plugin waits for the profile lock to release, manually
  exports and verifies private storage state, and removes the temporary profile.
- **Inference** launches a non-persistent patchright context from verified `storage-state.json`; no
  persistent Chrome profile is shared, so there are no profile singleton-lock conflicts. With
  `headless: false`, Linux uses one plugin-managed Xvfb display by default and falls back to an
  existing `$DISPLAY` only when Xvfb cannot start. ChatGPT's browser is kept open through a long idle
  TTL (`closeAfterMs`, default 30 min); Gemini's browser stays open because its session and
  conversations live in IndexedDB, which is not persisted across a browser restart.
- **Durable conversations** use `String(exec.agent.id)` as the DSH owner. A private file at
  `chatgpt-web/conversations/<sha256(sessionId)>.json` (ChatGPT) or
  `gemini-web/conversations/<sha256(sessionId)>.json` (Gemini) binds that session 1:1 to a canonical
  `/c/<conversationId>` or `/app/<conversationId>` URL without storing the raw DSH session ID or prompt
  text.
- Completion is detected conservatively: a newly appended assistant turn must be present, generation
  must have stopped, and its text must stay unchanged for `stableMs` before it is returned.
- Before each ChatGPT turn the driver opens the model switcher and selects the configured
  `chatgptThinkingLevel` (default `medium`), so turns reason at GPT-5.6-Sol Medium rather than the
  UI's Instant default.

## Install

The package must be installed where the DeepSeek Harness can load it as a plugin (it declares the
`@deepseek-ai/*` harness packages as peer dependencies). It builds, type-checks, and unit-tests
standalone without those peers; the `#internet/*` internal imports resolve at runtime through the
package `imports` field.

```bash
npm install @tsuuanmi/internet
```

## Enable in a DSH profile

Add the plugin to a profile's Cordis composition (an `agent.cordis.yml` or equivalent plugin list):

```yaml
plugins:
  - name: internet
    package: "@tsuuanmi/internet"
    config:
      dataDir: "~/.dsh/internet"
      headless: false
      loginTimeoutMs: 180000
      turnTimeoutMs: 180000
```

The `/internet` command, model tool `browser_chat`, and lifecycle tool `internet_browser` then become available.

## Configuration

| Field            | Default                    | Meaning                                                          |
| ---------------- | -------------------------- | ---------------------------------------------------------------- |
| `chromePath`     | (auto-discovered)          | Explicit Chrome binary, else system Chrome is found.             |
| `dataDir`        | `~/.dsh/internet`          | Root for provider login state and durable conversation bindings.      |
| `headless`       | `false`                    | Native headless when true; otherwise headed (managed Xvfb first on Linux). |
| `loginTimeoutMs` | `180000`                   | Max time to complete an interactive sign-in.                     |
| `turnTimeoutMs`  | `180000`                   | Max time for one `browser_chat` turn.                            |
| `pollMs`         | `200`                      | Completion-poll interval.                                        |
| `stableMs`       | `1500`                     | How long a response must be unchanged to count as complete.      |
| `closeAfterMs`   | `1800000`                  | Idle delay before ChatGPT's browser is closed after a turn (Gemini stays open). |
| `maxOutputChars` | `200000`                   | Upper bound on returned chat output characters.                  |
| `teamRounds`     | `2`                        | Default debate rounds for `browser_team` (each model speaks once per round). |
| `teamMaxRounds`  | `4`                        | Maximum per-call `rounds`; `teamRounds` must not exceed it.      |
| `teamTranscriptMaxChars` | `50000`            | Aggregate Unicode code-point budget for an opt-in returned transcript. |
| `teamSynthesis`  | `true`                     | Whether `browser_team` appends a final synthesis turn.           |
| `enableChatgpt`  | `true`                     | Register the ChatGPT Web provider.                               |
| `enableGemini`   | `true`                     | Register the Gemini Web provider.                                |
| `chatgptThinkingLevel` | `medium`              | Default ChatGPT Web reasoning-effort level selected before each turn: `instant`, `medium`, `high`, `extra-high`, or `pro`. |

When `includeTranscript` is true, the tool retains the newest debate content within
`teamTranscriptMaxChars`. `transcriptTruncated: true` means older content was omitted;
a boundary turn with `textTruncation: "prefix"` retained only the end of that turn.

**Browser.** Google Chrome Stable is recommended (best compatibility with ChatGPT/Gemini's web APIs).
For headed mode on Linux, install Xvfb once; the plugin starts and shares it automatically, so DSH
must not be wrapped in `xvfb-run`:

```bash
sudo apt install xvfb google-chrome-stable
dsh --profile superman
```

Managed Xvfb is preferred even when `$DISPLAY` exists. If Xvfb cannot start, the plugin falls back to
that system display. Without either, it fails explicitly instead of silently switching to native
headless Chrome. Interactive `internet_browser login` is different: it always requires a visible,
user-managed display (desktop, SSH X11 forwarding, or VNC), because a login window hidden in Xvfb
would be unusable.

## Usage flow

```text
/internet Explain Raft and Paxos.                         # -> direct ChatGPT answer in the UI
/internet What trade-off did you mention for Raft?       # -> same durable ChatGPT conversation

browser_chat { model: "chatgpt-web", prompt: "..." }   # -> login required, or the answer
internet_browser { action: "login", model: "chatgpt-web" }
# Sign in inside dedicated normal Chrome, then close that window completely.
# The plugin exports and verifies ~/.dsh/internet/chatgpt-web/storage-state.json.
browser_chat { model: "chatgpt-web", prompt: "Remember codeword cobalt." }
# Later calls from this same DSH session navigate to the same ChatGPT /c/<id> conversation:
browser_chat { model: "chatgpt-web", prompt: "What codeword did I give you?" }

# Gemini behaves the same way: the first call starts a conversation and binds it to the session,
# and later calls from this same DSH session navigate to the same Gemini /app/<id> conversation:
browser_chat { model: "gemini-web", prompt: "Remember codeword emerald." }
browser_chat { model: "gemini-web", prompt: "What codeword did I give you?" }

# The team debates a task across configured providers and returns only the final answer:
browser_team { task: "Design a resilient retry strategy for a payment API." }
# Optional overrides: ordered providers, rounds, synthesis, and a named team thread:
browser_team { task: "...", rounds: 3, providers: ["gemini-web", "chatgpt-web"], team: "code-review" }
# Return this invocation's bounded debate transcript for audit or review:
browser_team { task: "...", includeTranscript: true }
```

## Development

```bash
npm run build        # tsgo -> dist (ESM) + client bundle -> dist/client.js
npm test             # vitest (pure logic, no browser)
npm run check        # biome + tsgo typecheck
```

`npm run build` also bundles `src/client.ts` into `dist/client.js` in the form the DeepSeek Harness
expects for a plugin's browser surface (a `window.__ModuleLoader__.load` classic-script bundle with
`react` and `@deepseek-ai/*` left external). Keep that step — the plain `tsgo` emit is ES modules and
cannot be loaded by the harness web shell.

The browser drivers (`chatgpt-web`, `gemini-web`) use the current ChatGPT / Gemini DOM selectors.
Real sign-in and inference require a manual acceptance session in a DSH profile, as the harness does
not run in this repo.

## License

MIT
