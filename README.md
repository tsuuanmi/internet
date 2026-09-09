# @tsuuanmi/internet

Browser-backed ChatGPT Web and Gemini Web tools for the DeepSeek Harness (DSH).

The plugin drives the providers' real websites through isolated Chrome contexts. It adds direct web-model
chat, multi-model debate, local or SSH-forwarded login, portable account snapshots, durable native
conversations, and visible browser inspection without running a separate daemon.

## Features

- **`internet_chat`** — ask an explicit authenticated thinker account (`chatgpt-thinker` or `gemini-thinker`).
- **`internet_team`** — run an ordered ChatGPT/Gemini debate and optional final synthesis.
- **`internet_research`** — run provider-native Deep Research through one or both thinker accounts.
- **`internet_browser`** — sign in, inspect account state, or stop an exact semantic account, including `chatgpt-writer`.
- **`/internet <question>`** — ask ChatGPT directly from the conversation UI without an agent model turn.
- **`/workflow <objective>`** — queue a Git-aware, reviewed implementation workflow for the current session.
- **Portable accounts** — copy only `~/.dsh/internet/accounts/` to move authenticated state.
- **Durable conversations** — each DSH session resumes one native conversation per account identity.
- **Visible or hidden automation** — hidden managed Xvfb by default; opt into a user-visible window per call.
- **Zero-install VNC on Linux x64/glibc 2.31+** — bundled x11vnc and noVNC,
  exposed only through a tokenized loopback URL intended for SSH forwarding.
- **Explicit ChatGPT reasoning control** — `instant`, `medium`, or `high`, with `high` as the default.
- **Explicit Gemini mode control** — the observed latest Flash model with Extended thinking before every ordinary turn.

This is a standalone DSH-native plugin. It does not wrap `@tsuuanmi/pi-internet`, does not require Bun,
and does not replace DSH's existing `web_search` or `web_fetch` tools.

## Tools

### `internet_chat`

```text
internet_chat {
  account: "chatgpt-thinker" | "gemini-thinker",
  prompt: string,
  visible?: boolean
}
```

The browser is hidden by default. Set `visible: true` only when the user wants to watch the automated
window. Visible and hidden calls execute the same provider interaction code; only the display target
changes.

Each account owns one durable native conversation for the current DSH session. A later call from the same session navigates back to that account's bound ChatGPT `/c/<id>` or Gemini `/app/<id>` URL. `chatgpt-thinker`, `chatgpt-writer`, and `gemini-thinker` never share durable binding state.

ChatGPT turns select and verify `chatgptThinkingLevel` before every prompt. The current ChatGPT picker
contains both a reasoning slider and nested model choices; the driver operates only the slider and never
uses model radio items as reasoning levels. Ordinary Gemini turns select and verify the observed latest
Flash model plus Extended thinking before every prompt; provider-native Deep Research uses its own mode
instead. A missing Gemini entitlement or a changed picker fails explicitly rather than choosing a different
model. For ChatGPT, prompt text is inserted through the live editor input path, read back exactly, and
submitted only after the semantic **Send prompt** action replaces Start Voice.

### `internet_research`

```text
internet_research {
  query: string,
  accounts?: ["chatgpt-thinker", "gemini-thinker"],
  name?: string,
  visible?: boolean
}
```

This enables the provider-native Deep Research mode before submitting the query. It may run for up to
`researchTimeoutMs` (30 minutes by default) and returns one independent result per selected account; one account failure preserves the other as `partial_success`. Research threads use an isolated durable owner key based
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
  accounts?: ["chatgpt-thinker", "gemini-thinker"],
  visible?: boolean
}
```

`internet_team` is registered when both thinker accounts are enabled. Defaults:

- accounts: `chatgpt-thinker`, then `gemini-thinker`
- rounds: `2`
- synthesis: enabled
- transcript: omitted
- browser visibility: hidden

Thinker accounts speak sequentially in the requested order. During each round, a provider sees the task and
each other provider's latest contribution. When synthesis is enabled, the configured `teamSynthesizer` receives the full current-call transcript and produces the final answer. `chatgpt-thinker` is the default synthesizer, independent of speaking order. The DSH agent coordinates the debate but
does not add its own debate turn.

A team uses a derived session namespace (`<session>:team:<name>`), so team conversations are isolated
from direct `internet_chat` conversations while remaining durable across repeated calls with the same
team name. Different `team` values create separate native threads.

By default the tool returns `finalAnswer`, `finalAccountId`, and `finalProvider`. `includeTranscript: true` adds the
bounded transcript to both the structured result and model-visible rendered output. The newest content is retained within
`teamTranscriptMaxChars`; `transcriptTruncated: true` reports omitted older content, and
`textTruncation: "prefix"` marks a boundary turn whose beginning was removed. Returning the transcript
also consumes more agent context.

`visible: true` shows both providers as their turns execute. Hidden mode uses the same debate and browser
automation flow on the managed display. Both thinker accounts must be ready before a complete two-account run.
Provider output remains model-generated: exact-string or adversarially worded tasks can be refused even
when browser orchestration itself is healthy.

### `internet_browser`

```text
internet_browser {
  action: "login" | "status" | "stop",
  account: "chatgpt-thinker" | "chatgpt-writer" | "gemini-thinker",
  remote?: boolean
}
```

- **`login`** opens dedicated normal Chrome on an interactive desktop. On displayless Linux, or when
  `remote: true`, it first returns the SSH-forwarding command and tokenized loopback URL, then starts the
  noVNC Chrome session.
- **`status`** reports the local account state and any active remote-login state.
- **`stop`** closes that account's inference browser and cancels its waiting remote login.

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

### `/workflow`

```text
/workflow Correct the login redirect after a cancelled sign-in.
```

`/workflow` reads the current DSH session's Git worktree and selects its upstream remote in this order:
the checked-out branch's configured remote, `origin`, then the only configured remote. Standard SSH and
HTTPS remotes are converted to a credential-free HTTPS repository URL. A missing session directory,
non-Git worktree, ambiguous remote, or local/private-network remote returns a direct error and queues
nothing.

On success, the command creates a durable `WorkflowEngine` job and returns its job ID. It does not inject
a giant multi-phase prompt into the Local conversation. The engine owns deterministic state, account routing,
team lanes, exact handoff receipts, the persistent writer conversation, and the PR receipt outside model
context.

The implemented path currently runs Research A and Research B directly through the lower-level team runtime,
materializes each final answer as a SHA-256-bound verbatim handoff, delivers A then B to the same
`chatgpt-writer` conversation, and only then sends a separate trusted `START_IMPLEMENTATION` control. The
writer verifies the repository and base revision, inspects and changes the repository, validates the work,
creates or updates exactly one pull request, and returns either a machine-validated PR receipt or `BLOCKED`.
The writer is never authorized to merge during this phase. A transient writer-control retry reuses the same
conversation and does not redeliver handoffs that already have durable delivery receipts.

After the PR opens, the engine runs two independent review lanes against the actual PR and exact persisted
head SHA. Each reviewer must return one strict JSON result containing `PASS` or `CHANGES_REQUIRED` plus the exact
`reviewedHeadSha`; a malformed or wrong-head result fails that lane instead of being guessed through. Review A
and B are stored and delivered verbatim to the same persistent writer conversation. If both pass the same head,
the job enters `READY_FOR_MERGE_AUTHORIZATION`. Otherwise the engine sends a separate `APPLY_REVIEWS` control,
requires the writer to update that same PR with a new head SHA, resets only the review-run state, and reviews the
new head again. The default review limit is three cycles; exhaustion becomes `REVIEW_LIMIT_REACHED`.

Scoped Website confirmation handling remains fail-closed throughout implementation and remediation: only a
recognized GitHub confirmation matching the active writer session, repository, workflow state, allowlisted
action, and expected branch/PR identity can be auto-confirmed. Unknown or ambiguous confirmations become
`UNKNOWN_CONFIRMATION`; merge is never auto-authorized. The engine now publishes compact workflow events: `INTERNAL`
records stay inside the control plane, while `PROGRESS` and `ACTION_REQUIRED` records are injected into the live
owner Agent through DSH's native `agent.inject()` path. This adds durable model-facing context for Local's next
admitted step without waking an idle Local, and never includes research/reviewer payloads. `internet_workflow status`
also exposes payload-free team, handoff, writer, PR, review-cycle, pending-action, last-event, and last-error summaries.
The explicit head-SHA-bound merge gate remains a later phase. The workflow is registered only when both thinker
accounts are enabled; the writer path additionally requires a ready `chatgpt-writer` account when implementation is driven.

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
      maxConcurrentTurnsPerAccount: 1
      chatgptThinkingLevel: high
      teamRounds: 2
      teamMaxRounds: 4
      teamSynthesizer: chatgpt-thinker
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
| `remoteLoginPort` | `39000` | Base loopback noVNC port. Account IDs use stable offsets: ChatGPT thinker `39000`, ChatGPT writer `39001`, Gemini thinker `39002`. |
| `turnTimeoutMs` | `300000` | Maximum duration of one ordinary ChatGPT or Gemini provider turn (5 minutes). |
| `researchTimeoutMs` | `1800000` | Maximum duration of one provider-native Deep Research run (30 minutes). |
| `pollMs` | `200` | Response completion polling interval. |
| `stableMs` | `1500` | Required unchanged, non-running response interval. |
| `closeAfterMs` | `1800000` | Idle delay before closing an idle provider browser pool. |
| `maxConcurrentTurnsPerAccount` | `1` | Maximum simultaneous hidden turns per authenticated account from different DSH sessions. Different account IDs use independent schedulers. |
| `maxOutputChars` | `200000` | Maximum returned response characters. |
| `teamRounds` | `2` | Default debate rounds; every provider speaks once per round. |
| `teamMaxRounds` | `4` | Maximum accepted per-call `rounds`. |
| `teamTranscriptMaxChars` | `50000` | Unicode code-point budget for an opt-in transcript. |
| `teamSynthesis` | `true` | Append a final synthesis turn by default. |
| `teamSynthesizer` | `chatgpt-thinker` | Account that performs final team synthesis, independent of speaking order. |
| `enableChatgpt` | `true` | Register ChatGPT Web and `/internet`. |
| `enableGemini` | `true` | Register Gemini Web. |
| `chatgptThinkingLevel` | `high` | ChatGPT reasoning level: `instant`, `medium`, or `high`. |

Invalid explicit values fail configuration loading. `teamRounds` cannot exceed `teamMaxRounds`, and
`remoteLoginPort` must leave room for all semantic account offsets. Capacity above `1` is an explicit
throughput opt-in for independent child-team work; it does not improve a single team's dependent rounds.

## Login

### Desktop login

```text
internet_browser { action: "login", account: "chatgpt-thinker" }
```

The plugin opens a dedicated normal Chrome profile without browser-automation or remote-debugging flags.
Sign in, then close the dedicated Chrome window completely. The plugin waits for Chrome's profile lock,
exports bootstrap state, verifies it in a fresh inference context, captures IndexedDB, and writes the
canonical portable account file.

### SSH-forwarded noVNC login

Force remote mode when the DSH server has a display but the login should still use port forwarding:

```text
internet_browser { action: "login", account: "gemini-thinker", remote: true }
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
`ready`. With the default configuration, `chatgpt-thinker` uses `39000`, `chatgpt-writer` uses `39001`, and `gemini-thinker` uses `39002`.

The HTTP/WebSocket and VNC listeners bind only to `127.0.0.1`. The URL token and temporary VNC password
are bearer credentials. Do not publish the endpoint or put it behind a public reverse proxy. A remote
session expires after `loginTimeoutMs` and cleans up Chrome, VNC, Xvfb, sockets, and temporary secrets.

## Portable accounts

The portable boundary is exactly:

```text
~/.dsh/internet/accounts/
  chatgpt-thinker.json
  chatgpt-writer.json
  gemini-thinker.json
```

Each versioned JSON file contains cookies, local storage, and, when Patchright can safely serialize it,
IndexedDB. During login, an oversized IndexedDB value is omitted only after cookie/local-storage state is
independently verified in a fresh browser context. It is a plaintext bearer secret equivalent to an
authenticated browser session.

To move accounts:

1. Stop DSH on the source and destination computers.
2. Securely copy only the `accounts/` directory into the destination's configured `dataDir`.
3. Preserve private permissions (`0700` directory and `0600` files on POSIX).
4. Restart DSH and check each account with `internet_browser status`.

Do not copy account `login-profile/` directories or `conversations/`. Chrome profiles depend on machine
keyrings and platform details. Conversation files bind DSH session identities to native conversation
URLs and are not authentication state.

Providers can expire or revoke a copied session, challenge a new device/IP, or require MFA/CAPTCHA.
A challenge or temporarily unconfirmed browser surface does not by itself invalidate the local snapshot:
retry it or inspect the provider visibly first. Only positive sign-out evidence marks an account as
`reauth-required`, and `internet_browser status` reports its non-secret reason. When sign-in is actually
required, run `internet_browser login`; successful verification atomically replaces only that account's portable account file.

## Browser and display lifecycle

Inference never shares the persistent login profile. It launches an isolated, non-persistent Patchright
context restored from the portable account. Successful turns refresh the account snapshot, including
IndexedDB when it can be captured safely.

With `headless: false` on Linux, hidden inference starts one plugin-managed Xvfb display. Supported Linux
x64/glibc 2.35+ systems use the bundled Xvfb runtime first, then system `Xvfb`, then an inherited `$DISPLAY` as
a fallback. `visible: true` bypasses managed Xvfb and requires a user-managed display. Set
`headless: true` only when native Chrome headless is explicitly desired; the plugin does not silently
switch to native headless.

By default, one hidden turn runs per account. Set `maxConcurrentTurnsPerAccount` above `1` only after confirming account-state acceptance. Different account IDs, including the two ChatGPT accounts, have independent scheduler locks. Different DSH sessions may otherwise run in
parallel; turns in one session, visible calls, login, stop, and a single team's dependent rounds remain
ordered. A queued lifecycle operation forms a fence, so later turns wait until it completes. Each active
turn uses an isolated non-persistent browser context restored from the same portable account. Snapshot
commits use the bootstrap account revision: the first current snapshot commits, and stale snapshots are
discarded rather than unsafely merging account state. When an IndexedDB-free fallback refreshes the current
account, same-origin IndexedDB is retained while cookies and local storage update. Recoverable failed turns
also attempt a short authenticated state refresh, so provider token rotation is less likely to be lost.
Plugin disposal closes contexts, Chrome processes, remote logins, and managed displays.

## Durable conversation storage

Bindings are stored privately under:

```text
~/.dsh/internet/chatgpt-thinker/conversations/<sha256(sessionId)>.json
~/.dsh/internet/chatgpt-writer/conversations/<sha256(sessionId)>.json
~/.dsh/internet/gemini-thinker/conversations/<sha256(sessionId)>.json
```

The raw DSH session ID and prompt text are not stored in binding filenames or files. A binding records
the canonical provider conversation URL and prevents a session from silently switching to another
native conversation.

## Examples

```text
# Hidden direct call (default)
internet_chat { account: "chatgpt-thinker", prompt: "Remember codeword cobalt." }

# Visible follow-up in the same native conversation
internet_chat {
  account: "chatgpt-thinker",
  prompt: "What codeword did I give you?",
  visible: true
}

# Gemini owns a separate durable thread
internet_chat { account: "gemini-thinker", prompt: "Summarize this design tradeoff: ..." }

# Default hidden two-provider debate with synthesis
internet_team { task: "Design a resilient retry strategy for a payment API." }

# Visible one-round review using a named durable team
internet_team {
  task: "Review this API design and identify the three highest risks: ...",
  team: "api-review",
  rounds: 1,
  visible: true
}

# Ordered thinker accounts and bounded current-call transcript
internet_team {
  task: "Compare these migration plans: ...",
  accounts: ["gemini-thinker", "chatgpt-thinker"],
  rounds: 3,
  includeTranscript: true
}
```

`internet_chat` and `internet_team` cannot independently read local files or call DSH web-search tools.
Paste required source material into the prompt/task. Use DSH `web_search` or `web_fetch` first when the
debate requires current information.

## Troubleshooting

- **`login_required` / `reauth-required`** — run `internet_browser login` for that exact account. A team run needs every selected thinker account ready.
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
