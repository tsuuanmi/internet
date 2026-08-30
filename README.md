# @tsuuanmi/internet

Browser-backed ChatGPT Web and Gemini Web tools for the DeepSeek Harness (DSH).

The plugin drives the providers' real websites through isolated Chrome contexts. It adds direct web-model
chat, multi-model debate, local or SSH-forwarded login, portable account snapshots, durable native
conversations, and visible browser inspection without running a separate daemon.

## Features

- **`internet_chat`** — ask ChatGPT or Gemini through the authenticated website.
- **`internet_team`** — run an ordered ChatGPT/Gemini debate and optional final synthesis.
- **`internet_research`** — run provider-native Deep Research in one or both providers.
- **`internet_browser`** — sign in, inspect account state, or stop a provider browser.
- **`/internet <question>`** — ask ChatGPT directly from the conversation UI without an agent model turn.
- **Portable accounts** — copy only `~/.dsh/internet/accounts/` to move authenticated state.
- **Durable conversations** — each DSH session resumes one native conversation per provider.
- **Visible or hidden automation** — hidden managed Xvfb by default; opt into a user-visible window per call.
- **Zero-install remote login on supported Linux x64/glibc systems** — bundled Xvfb, x11vnc, and noVNC,
  exposed only through a tokenized loopback URL intended for SSH forwarding.
- **Explicit ChatGPT reasoning control** — `instant`, `medium`, or `high`, with `medium` as the default.

This is a standalone DSH-native plugin. It does not wrap `@tsuuanmi/pi-internet`, does not require Bun,
and does not replace DSH's existing `web_search` or `web_fetch` tools.

## Tools

### `internet_chat`

```text
internet_chat {
  model: "chatgpt-web" | "gemini-web",
  prompt: string,
  visible?: boolean
}
```

The browser is hidden by default. Set `visible: true` only when the user wants to watch the automated
window. Visible and hidden calls execute the same provider interaction code; only the display target
changes.

Each provider owns one durable native conversation for the current DSH session. A later call from the
same session navigates back to that provider's bound ChatGPT `/c/<id>` or Gemini `/app/<id>` URL.
ChatGPT and Gemini bindings are independent.

ChatGPT turns select and verify `chatgptThinkingLevel` before every prompt. The current ChatGPT picker
contains both a reasoning slider and nested model choices; the driver operates only the slider and never
uses model radio items as reasoning levels. Prompt text is inserted through the live editor input path,
read back exactly, and submitted only after the semantic **Send prompt** action replaces Start Voice.

### `internet_research`

```text
internet_research {
  query: string,
  providers?: ["chatgpt-web", "gemini-web"],
  name?: string,
  visible?: boolean
}
```

This enables the provider-native Deep Research mode before submitting the query. It may run for up to
`researchTimeoutMs` (30 minutes by default) and returns one independent result per provider; one provider
failure preserves the other as `partial_success`. Research threads use an isolated durable owner key based
on `name`, so they never share a normal `internet_chat` conversation. Deep Research availability depends on
the signed-in provider account; the tool fails explicitly rather than downgrading to ordinary chat.

### `internet_team`

```text
internet_team {
  task: string,
  team?: string,
  rounds?: number,
  synthesize?: boolean,
  includeTranscript?: boolean,
  providers?: ["chatgpt-web", "gemini-web"],
  visible?: boolean
}
```

`internet_team` is registered only when at least two providers are enabled. Defaults:

- providers: `chatgpt-web`, then `gemini-web`
- rounds: `2`
- synthesis: enabled
- transcript: omitted
- browser visibility: hidden

Providers speak sequentially in the requested order. During each round, a provider sees the task and
each other provider's latest contribution. When synthesis is enabled, the final provider receives the
full current-call transcript and produces the final answer. The DSH agent coordinates the debate but
does not add its own debate turn.

A team uses a derived session namespace (`<session>:team:<name>`), so team conversations are isolated
from direct `internet_chat` conversations while remaining durable across repeated calls with the same
team name. Different `team` values create separate native threads.

By default the tool returns only `finalAnswer` and `finalProvider`. `includeTranscript: true` adds the
bounded transcript to both the structured result and model-visible rendered output. The newest content is retained within
`teamTranscriptMaxChars`; `transcriptTruncated: true` reports omitted older content, and
`textTruncation: "prefix"` marks a boundary turn whose beginning was removed. Returning the transcript
also consumes more agent context.

`visible: true` shows both providers as their turns execute. Hidden mode uses the same debate and browser
automation flow on the managed display. Both accounts must be ready before a complete two-provider run.
Provider output remains model-generated: exact-string or adversarially worded tasks can be refused even
when browser orchestration itself is healthy.

### `internet_browser`

```text
internet_browser {
  action: "login" | "status" | "stop",
  model: "chatgpt-web" | "gemini-web",
  remote?: boolean
}
```

- **`login`** opens dedicated normal Chrome on an interactive desktop. On displayless Linux, or when
  `remote: true`, it first returns the SSH-forwarding command and tokenized loopback URL, then starts the
  noVNC Chrome session.
- **`status`** reports the local account state and any active remote-login state.
- **`stop`** closes the provider's inference browser and cancels a waiting remote login.

Account states are `ready`, `reauth-required`, `invalid`, and `missing`. A `ready` result means a
previously verified portable account exists locally; it is not a live guarantee that the provider will
accept the next request.

### `/internet`

```text
/internet Explain the difference between Raft and Paxos.
```

The command asks ChatGPT directly and renders its markdown response without first invoking the agent's
configured model. It shares the current DSH session's durable ChatGPT conversation with `internet_chat`.
The command is available when `enableChatgpt` is true.

## Install

```bash
npm install @tsuuanmi/internet
```

The package must be installed in the DSH profile/plugin environment. It declares DSH packages as peer
dependencies and ships built ESM, the DSH client command renderer, the noVNC client bundle, and supported
private Linux browser-display runtimes.

## Enable in a DSH profile

Add the plugin to the profile's Cordis composition:

```yaml
plugins:
  - name: internet
    package: "@tsuuanmi/internet"
    config:
      dataDir: "~/.dsh/internet"
      headless: false
      loginTimeoutMs: 180000
      remoteLoginPort: 39000
      turnTimeoutMs: 300000
      researchTimeoutMs: 1800000
      maxConcurrentTurnsPerProvider: 1
      chatgptThinkingLevel: medium
      teamRounds: 2
      teamMaxRounds: 4
```

Restart the existing DSH host after installing or updating the package so the server-side plugin loads
the new build. Starting a second web server does not update an already running DSH GUI.

## Configuration

| Field | Default | Meaning |
| --- | ---: | --- |
| `chromePath` | auto-discovered | Explicit Google Chrome executable path. |
| `dataDir` | `~/.dsh/internet` | Accounts, local login recovery profiles, conversations, and remote-login state. |
| `headless` | `false` | Use native Chrome headless when true. Otherwise use headed Chrome on managed Xvfb by default. |
| `loginTimeoutMs` | `180000` | Interactive login expiry, in milliseconds (3 minutes). |
| `remoteLoginPort` | `39000` | ChatGPT loopback noVNC port; Gemini uses the next port (`39001`). |
| `turnTimeoutMs` | `300000` | Maximum duration of one ordinary ChatGPT or Gemini provider turn (5 minutes). |
| `researchTimeoutMs` | `1800000` | Maximum duration of one provider-native Deep Research run (30 minutes). |
| `pollMs` | `200` | Response completion polling interval. |
| `stableMs` | `1500` | Required unchanged, non-running response interval. |
| `closeAfterMs` | `1800000` | Idle delay before closing an idle provider browser pool. |
| `maxConcurrentTurnsPerProvider` | `1` | Maximum simultaneous hidden turns per provider from different DSH sessions; increase only after confirming provider account-state acceptance. |
| `maxOutputChars` | `200000` | Maximum returned response characters. |
| `teamRounds` | `2` | Default debate rounds; every provider speaks once per round. |
| `teamMaxRounds` | `4` | Maximum accepted per-call `rounds`. |
| `teamTranscriptMaxChars` | `50000` | Unicode code-point budget for an opt-in transcript. |
| `teamSynthesis` | `true` | Append a final synthesis turn by default. |
| `enableChatgpt` | `true` | Register ChatGPT Web and `/internet`. |
| `enableGemini` | `true` | Register Gemini Web. |
| `chatgptThinkingLevel` | `medium` | ChatGPT reasoning level: `instant`, `medium`, or `high`. |

Invalid explicit values fail configuration loading. `teamRounds` cannot exceed `teamMaxRounds`, and
`remoteLoginPort` must leave room for Gemini on the next TCP port. Capacity above `1` is an explicit
throughput opt-in for independent child-team work; it does not improve a single team's dependent rounds.

## Login

### Desktop login

```text
internet_browser { action: "login", model: "chatgpt-web" }
```

The plugin opens a dedicated normal Chrome profile without browser-automation or remote-debugging flags.
Sign in, then close the dedicated Chrome window completely. The plugin waits for Chrome's profile lock,
exports bootstrap state, verifies it in a fresh inference context, captures IndexedDB, and writes the
canonical portable account file.

### SSH-forwarded noVNC login

Force remote mode when the DSH server has a display but the login should still use port forwarding:

```text
internet_browser { action: "login", model: "gemini-web", remote: true }
```

The result contains a command and tokenized URL similar to:

```bash
ssh -N -L 39001:127.0.0.1:39001 <user>@<server>
```

```text
http://127.0.0.1:39001/<secret-token>/
```

Run the SSH command on the local computer, open the complete localhost URL, sign in through noVNC, and
press **Save account**. Then call `status` until the remote state is `complete` and the account state is
`ready`. ChatGPT uses port `39000`; Gemini uses `39001` with the default configuration.

The HTTP/WebSocket and VNC listeners bind only to `127.0.0.1`. The URL token and temporary VNC password
are bearer credentials. Do not publish the endpoint or put it behind a public reverse proxy. A remote
session expires after `loginTimeoutMs` and cleans up Chrome, VNC, Xvfb, sockets, and temporary secrets.

## Portable accounts

The portable boundary is exactly:

```text
~/.dsh/internet/accounts/
  chatgpt-web.json
  gemini-web.json
```

Each versioned JSON file contains cookies, local storage, and IndexedDB. It is a plaintext bearer secret
equivalent to an authenticated browser session.

To move accounts:

1. Stop DSH on the source and destination computers.
2. Securely copy only the `accounts/` directory into the destination's configured `dataDir`.
3. Preserve private permissions (`0700` directory and `0600` files on POSIX).
4. Restart DSH and check each provider with `internet_browser status`.

Do not copy provider `login-profile/` directories or `conversations/`. Chrome profiles depend on machine
keyrings and platform details. Conversation files bind DSH session identities to native conversation
URLs and are not authentication state.

Providers can expire or revoke a copied session, challenge a new device/IP, or require MFA/CAPTCHA.
A challenge or temporarily unconfirmed browser surface does not by itself invalidate the local snapshot:
retry it or inspect the provider visibly first. Only positive sign-out evidence marks an account as
`reauth-required`, and `internet_browser status` reports its non-secret reason. When sign-in is actually
required, run `internet_browser login`; successful verification atomically replaces only that provider's
portable account file.

## Browser and display lifecycle

Inference never shares the persistent login profile. It launches an isolated, non-persistent Patchright
context restored from the portable account. Successful turns refresh the account snapshot, including
IndexedDB.

With `headless: false` on Linux, hidden inference starts one plugin-managed Xvfb display. Supported Linux
x64/glibc systems use the bundled Xvfb runtime first, then system `Xvfb`, then an inherited `$DISPLAY` as
a fallback. `visible: true` bypasses managed Xvfb and requires a user-managed display. Set
`headless: true` only when native Chrome headless is explicitly desired; the plugin does not silently
switch to native headless.

By default, one hidden turn runs per provider. Set `maxConcurrentTurnsPerProvider` above `1` only after
confirming provider policy and account-state acceptance. Different DSH sessions may otherwise run in
parallel; turns in one session, visible calls, login, stop, and a single team's dependent rounds remain
ordered. A queued lifecycle operation forms a fence, so later turns wait until it completes. Each active
turn uses an isolated non-persistent browser context restored from the same portable account. Snapshot
commits use the bootstrap account revision: the first current snapshot commits, and stale full snapshots
are discarded rather than unsafely merging cookies or IndexedDB. Recoverable failed turns also attempt a
short authenticated state refresh, so provider token rotation is less likely to be lost. Plugin disposal
closes contexts, Chrome processes, remote logins, and managed displays.

## Durable conversation storage

Bindings are stored privately under:

```text
~/.dsh/internet/chatgpt-web/conversations/<sha256(sessionId)>.json
~/.dsh/internet/gemini-web/conversations/<sha256(sessionId)>.json
```

The raw DSH session ID and prompt text are not stored in binding filenames or files. A binding records
the canonical provider conversation URL and prevents a session from silently switching to another
native conversation.

## Examples

```text
# Hidden direct call (default)
internet_chat { model: "chatgpt-web", prompt: "Remember codeword cobalt." }

# Visible follow-up in the same native conversation
internet_chat {
  model: "chatgpt-web",
  prompt: "What codeword did I give you?",
  visible: true
}

# Gemini owns a separate durable thread
internet_chat { model: "gemini-web", prompt: "Summarize this design tradeoff: ..." }

# Default hidden two-provider debate with synthesis
internet_team { task: "Design a resilient retry strategy for a payment API." }

# Visible one-round review using a named durable team
internet_team {
  task: "Review this API design and identify the three highest risks: ...",
  team: "api-review",
  rounds: 1,
  visible: true
}

# Ordered providers and bounded current-call transcript
internet_team {
  task: "Compare these migration plans: ...",
  providers: ["gemini-web", "chatgpt-web"],
  rounds: 3,
  includeTranscript: true
}
```

`internet_chat` and `internet_team` cannot independently read local files or call DSH web-search tools.
Paste required source material into the prompt/task. Use DSH `web_search` or `web_fetch` first when the
debate requires current information.

## Troubleshooting

- **`login_required` / `reauth-required`** — run `internet_browser login` for that provider. A team run
  needs every selected provider ready.
- **Remote login is `waiting`** — keep the SSH tunnel open, finish sign-in, and press **Save account**.
- **Remote login is `finalizing`** — wait and call `status`; verification is still running.
- **Visible mode fails** — confirm the DSH host has a user-managed `$DISPLAY`. Visible mode never falls
  back to hidden Xvfb.
- **Hidden headed mode fails** — install system Xvfb on unsupported architectures/libcs, or explicitly
  configure native `headless: true` if the provider supports it in that environment.
- **Provider timeout** — inspect with `visible: true`, confirm the account is still accepted, and retry a
  normal task. Model refusal is different from browser failure.
- **Updated package behaves like the old build** — restart the existing DSH host after updating the
  profile dependency.

## Development

```bash
npm run check   # verify vendored browser runtime, Biome, and TypeScript
npm run build   # clean and emit dist plus DSH/noVNC client bundles
npm test        # run Vitest
```

Commit generated `dist/` artifacts with source changes. Real-provider acceptance requires authenticated
accounts and should cover visible direct chat, visible follow-up, hidden managed-Xvfb chat, and both
visible and hidden `internet_team` execution.

See [`docs/how-it-works.md`](docs/how-it-works.md) for internal request flows and security boundaries.

## License

MIT
