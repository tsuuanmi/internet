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
- `internet_browser` — lifecycle: `login`, `status`, `stop`. Login uses dedicated normal Chrome locally,
  or returns a loopback noVNC URL and SSH forwarding command on displayless Linux.

## Slash command

- `/internet <question>` — ask ChatGPT directly. It uses the same durable DSH-session-to-ChatGPT
  conversation as `browser_chat` and renders the returned markdown directly in the conversation UI.
- `/internet` without a question returns usage help. The command is available when `enableChatgpt`
  is true.

## Architecture

- **No daemon.** The plugin drives Chrome directly inside the DSH Node host.
- **No reuse of the DSH GUI browser.** DSH has no browser-automation seam and the GUI browser cannot
  be automated safely.
- **Login** spawns dedicated normal Chrome without debugging or browser-automation flags. ChatGPT and
  Gemini each retain a private machine-local login profile. A desktop shows Chrome directly; a
  displayless Linux host starts a private Xvfb/x11vnc desktop and tokenized noVNC page on loopback for
  SSH forwarding. Closing local Chrome or pressing **Save account** remotely runs the same fresh-context
  verification and writes one canonical portable account file under `~/.dsh/internet/accounts/`.
- **Portable accounts** contain cookies, local storage, and IndexedDB in versioned private JSON. They
  are the only authentication source for automated contexts; login profiles are local recovery
  caches and are never part of the portable contract.
- **Inference** launches a non-persistent patchright context from the canonical account file; no
  persistent Chrome profile is shared, so there are no profile singleton-lock conflicts. With
  `headless: false`, Linux uses one plugin-managed Xvfb display by default and falls back to an
  existing `$DISPLAY` only when Xvfb cannot start. Both provider browsers use the configured idle TTL
  (`closeAfterMs`, default 30 min), and successful turns atomically refresh portable IndexedDB state.
- **Durable conversations** use `String(exec.agent.id)` as the DSH owner. A private file at
  `chatgpt-web/conversations/<sha256(sessionId)>.json` (ChatGPT) or
  `gemini-web/conversations/<sha256(sessionId)>.json` (Gemini) binds that session 1:1 to a canonical
  `/c/<conversationId>` or `/app/<conversationId>` URL without storing the raw DSH session ID or prompt
  text.
- Completion is detected conservatively: a newly appended assistant turn must be present, generation
  must have stopped, and its text must stay unchanged for `stableMs` before it is returned.
- Before each ChatGPT turn the driver selects the configured `chatgptThinkingLevel`. The default is
  `instant`, which is available to every signed-in account; paid levels remain explicit opt-ins.

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
      loginTimeoutMs: 600000
      remoteLoginPort: 39000
      turnTimeoutMs: 180000
```

The `/internet` command, model tool `browser_chat`, and lifecycle tool `internet_browser` then become available.

## Configuration

| Field            | Default                    | Meaning                                                          |
| ---------------- | -------------------------- | ---------------------------------------------------------------- |
| `chromePath`     | (auto-discovered)          | Explicit Chrome binary, else system Chrome is found.             |
| `dataDir`        | `~/.dsh/internet`          | DSH-local root for portable accounts, login profiles, and conversations. |
| `headless`       | `false`                    | Native headless when true; otherwise headed (managed Xvfb first on Linux). |
| `loginTimeoutMs` | `600000`                   | Max time to complete an interactive sign-in (10 min).            |
| `remoteLoginPort` | `39000`                    | Stable ChatGPT noVNC port; Gemini uses the next port (`39001`).  |
| `turnTimeoutMs`  | `180000`                   | Max time for one `browser_chat` turn.                            |
| `pollMs`         | `200`                      | Completion-poll interval.                                        |
| `stableMs`       | `1500`                     | How long a response must be unchanged to count as complete.      |
| `closeAfterMs`   | `1800000`                  | Idle delay before a provider browser is closed after a turn.          |
| `maxOutputChars` | `200000`                   | Upper bound on returned chat output characters.                  |
| `teamRounds`     | `2`                        | Default debate rounds for `browser_team` (each model speaks once per round). |
| `teamMaxRounds`  | `4`                        | Maximum per-call `rounds`; `teamRounds` must not exceed it.      |
| `teamTranscriptMaxChars` | `50000`            | Aggregate Unicode code-point budget for an opt-in returned transcript. |
| `teamSynthesis`  | `true`                     | Whether `browser_team` appends a final synthesis turn.           |
| `enableChatgpt`  | `true`                     | Register the ChatGPT Web provider.                               |
| `enableGemini`   | `true`                     | Register the Gemini Web provider.                                |
| `chatgptThinkingLevel` | `instant`             | Default ChatGPT Web reasoning-effort level selected before each turn: `instant`, `medium`, `high`, `extra-high`, or `pro`. |

When `includeTranscript` is true, the tool retains the newest debate content within
`teamTranscriptMaxChars`. `transcriptTruncated: true` means older content was omitted;
a boundary turn with `textTruncation: "prefix"` retained only the end of that turn.

**Browser.** Google Chrome Stable is recommended (best compatibility with ChatGPT/Gemini's web APIs).
On Linux x64 with glibc 2.35 or newer, the package includes private Xvfb and x11vnc runtimes, so headed
inference and remote interactive login work immediately after installing the plugin—no system display
packages or `xvfb-run` wrapper are needed:

```bash
dsh --profile superman
```

The bundled runtime is tried first, followed by a system `Xvfb` executable and then an inherited
`$DISPLAY`. Unsupported Linux architectures or musl systems skip the bundle; install the distribution's
Xvfb package there if no system display exists. The plugin never silently switches to native headless.
Set `headless: true` explicitly when native Chrome headless is desired; that path does not use Xvfb.

Interactive `internet_browser login` uses a visible user-managed display when one exists. On displayless
Linux it instead returns a tokenized loopback URL, expiry, and copyable SSH command. The stable defaults
are port `39000` for ChatGPT and `39001` for Gemini; only the secret URL token changes. Run the command
on your computer, open the complete localhost URL, sign in through noVNC, and press **Save account**. `remote: true` forces
this mode even when the server has `$DISPLAY`; `status` reports `waiting`, `finalizing`, `complete`, or
`failed`, and `stop` cancels a waiting session. Once Save starts verification, finalization runs to completion.

The HTTP/WebSocket and VNC listeners bind only to `127.0.0.1`. Do not publish or reverse-proxy them: the
URL token and temporary VNC password are bearer credentials intended only for an SSH/VS Code tunnel.
Sessions expire after `loginTimeoutMs` and remove Chrome, VNC, Xvfb, sockets, and temporary credentials.
Unsupported architectures use a system `x11vnc` when available and otherwise fail with an explicit error.

## Portable accounts

The copyable account directory lives inside the DSH home by default:

```text
~/.dsh/internet/accounts/
  chatgpt-web.json
  gemini-web.json
```

Each file is a versioned authentication snapshot containing cookies, local storage, and IndexedDB.
It is a plaintext bearer credential equivalent to an active browser session. Never commit it, attach
it to diagnostics, or transfer it over an insecure channel.

To move accounts, stop DSH on both computers, securely copy only the `accounts/` directory into the
destination's configured `dataDir`, preserve private permissions (`0700` directory and `0600` files on
POSIX), and restart DSH. Do not copy `<provider>/login-profile` or `conversations/`: Chrome profiles are
bound to machine keyrings and browser/platform details, while conversation bindings are keyed to DSH
session identities rather than account authentication.

A copied account remains usable only while ChatGPT or Google accepts its session. Providers may expire
or revoke sessions, react to a new IP/device, or require MFA/CAPTCHA. `internet_browser status` reports
local state (`ready`, `reauth-required`, `invalid`, or `missing`), not a live server guarantee. Run
`internet_browser login` when reauthentication is required; successful login atomically replaces only
that provider's account file.

## Usage flow

```text
/internet Explain Raft and Paxos.                         # -> direct ChatGPT answer in the UI
/internet What trade-off did you mention for Raft?       # -> same durable ChatGPT conversation

browser_chat { model: "chatgpt-web", prompt: "..." }   # -> hidden managed browser by default
browser_chat { model: "chatgpt-web", prompt: "...", visible: true } # -> visible automated browser
internet_browser { action: "login", model: "chatgpt-web" }
# Desktop: sign in inside dedicated normal Chrome, then close it completely.
# Displayless Linux: run the returned ssh -L command, open its localhost URL,
# sign in through noVNC, and press Save account. Check status if finalization is still running.
# Either path verifies and writes ~/.dsh/internet/accounts/chatgpt-web.json.
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
