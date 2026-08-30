# How `@tsuuanmi/internet` works

This document describes the server-side plugin architecture, authentication boundary, browser lifecycle,
provider interaction contracts, durable conversations, and `internet_team` orchestration.

## Package layout

- `src/index.ts` — Cordis plugin entry, tool registration, command registration, lifecycle disposal, and
  agent-facing system-prompt guidance.
- `src/browser/runtime.ts` — `BrowserManager`, provider serialization, Chrome/context ownership, account
  refresh, durable conversation navigation, and turn execution.
- `src/browser/chatgpt.ts` — ChatGPT authentication, reasoning selection, prompt attachment, semantic
  submission, assistant-turn snapshots, and completion state.
- `src/browser/gemini.ts` — Gemini authentication, prompt submission, response snapshots, and completion
  state.
- `src/browser/chatgpt-research.ts` and `gemini-research.ts` — provider-native Deep Research activation
  contracts and verified composer-mode state.
- `src/browser/accounts.ts` — versioned portable account inspection, private writes, and IndexedDB-aware
  storage-state capture.
- `src/browser/conversations.ts` — private, hashed DSH-session-to-provider-conversation bindings.
- `src/browser/display.ts` — visible display selection and shared hidden inference Xvfb lifecycle.
- `src/browser/remote-login.ts`, `vnc.ts`, and `xvfb.ts` — tokenized loopback noVNC, x11vnc, Xvfb,
  timeout, finalization, and cleanup.
- `src/browser/completion.ts` — conservative provider-independent response stabilization.
- `src/browser/submission.ts` — semantic enabled-state waiting, including `aria-disabled`.
- `src/team/orchestrator.ts` — provider ordering, debate prompts, team session isolation, transcript, and
  synthesis.
- `src/tools/` — DSH definitions for `internet_chat`, `internet_team`, `internet_research`, and
  `internet_browser`.
- `src/commands/internet.ts` — human `/internet` command backed by ChatGPT.
- `src/client.ts` — DSH-side command renderer.
- `src/remote-login-client.ts` — isolated noVNC page with Save and Cancel controls; it is not part of the
  DSH application shell.
- `src/core/` — configuration, errors, markdown conversion, and abort-aware sleep.
- `src/types/dsh.d.ts` — minimal ambient declarations that allow standalone builds without installing
  the DSH peer packages.

## Plugin registration

`apply()` resolves and validates the profile configuration, creates one `BrowserManager`, and registers a
Cordis disposal effect. Chrome is discovered lazily on first browser operation.

Registration depends on enabled providers:

- `internet_chat` and `internet_browser` are available when at least one provider is enabled.
- `/internet` is available only when ChatGPT is enabled.
- `internet_team` is available only when at least two providers are enabled.

The plugin also contributes tool-selection guidance through `ctx.systemPrompt`. Updating the installed
package requires restarting the existing DSH host so its server-side module is reloaded.

## Direct request flow

```text
internet_chat { model, prompt, visible? }
  -> validate model, prompt, and visible
  -> read String(exec.agent.id) as the durable owner
  -> BrowserManager.chat(provider, request)
  -> acquire a provider lease (same session FIFO; default hidden capacity one)
  -> ensure account file is ready
  -> ensure a compatible browser and isolated per-turn context exist
       visible=true  -> headed Chrome on user-managed display
       visible=false + headless=false -> headed Chrome on managed Xvfb
       visible=false + headless=true  -> native Chrome headless
  -> read dataDir/<provider>/conversations/<sha256(sessionId)>.json
  -> navigate to bound URL, or provider home on the first turn
  -> verify authenticated provider surface
  -> capture the previous response identity
  -> perform provider-specific prompt selection/submission
  -> wait for a changed, stopped, stable response
  -> bind or refresh the canonical conversation URL
  -> recapture cookies, local storage, and IndexedDB
  -> atomically refresh the portable account
  -> return markdown, URL, and conversation id
```

`/internet <question>` enters the same ChatGPT path with
`sessionId = String(invocation.agent.id)`, bypasses an agent model turn, and returns markdown to the DSH
client command renderer.

## Deep Research request flow

`internet_research { query, providers?, name?, visible? }` derives a separate owner key:
`<agent-id>:research:<name>`. It invokes selected providers concurrently, while each provider still holds
its ordinary serialized browser lease. Before submission, each adapter enables and verifies its native Deep
Research composer state. The normal five-minute turn deadline is replaced by `researchTimeoutMs` (30 minutes
by default). Every provider result retains its own markdown and native URL; a completed provider is returned
even when the other result fails (`partial_success`). The driver never retries after a verified Send action,
avoiding duplicate costly research runs.

## ChatGPT turn contract

ChatGPT currently exposes a ProseMirror `contenteditable` composer. The provider driver scopes every
control lookup to the visible composer or its ancestor form.

### Reasoning selection

Before every ChatGPT turn:

1. Locate the composer reasoning pill.
2. Open its menu even when the pill already displays the configured value.
3. Prefer the attached reasoning slider.
4. Parse and validate `aria-valuemin`, `aria-valuemax`, and `aria-valuenow` as exactly three supported
   positions.
5. Move one keyboard step at a time until the target index is reached:
   `instant = 0`, `medium = 1`, `high = 2`.
6. Close the menu and verify the pill text (`Instant`, `Medium`, or `High`).

The current picker also contains a nested **Select model** view with `menuitemradio` entries such as
GPT-5.6 and GPT-5.5. Those radio entries are model choices, not reasoning choices. The driver therefore
uses the slider whenever present. A legacy radio-only picker is accepted only when its complete labels
are exactly `Instant`, `Medium`, and `High`; any other radio list fails rather than changing models.

The default is `medium`, and every turn reopens and semantically verifies the picker so provider UI state
cannot leak from a previous call.

### Prompt attachment and Send transition

1. Clear the visible composer and focus it.
2. Insert the complete prompt through Patchright's browser keyboard input path. This updates the live
   ProseMirror component state instead of only changing displayed DOM.
3. Reconstruct the editor text by joining top-level editor blocks with newlines.
4. Require an exact prompt match. On failure, report expected length, actual length, and common-prefix
   length without embedding the prompt in the error.
5. Locate only `button[data-testid="send-button"][aria-label="Send prompt"]` inside the active form.
6. Wait until it is visible, natively enabled, and not `aria-disabled="true"`.
7. Keyboard-activate that semantic Send control once.

An empty composer may show Start Voice, or may expose a visually disabled Send control. Start Voice does
not match the Send locator and is never used as a fallback. This protects against accidental voice-mode
activation and against clicking before the editor component has committed the prompt.

### Completion

The previous newest assistant text is captured before submission. `chatgptSnapshot()` then reports the
newest visible assistant turn, rendered HTML, and whether the stop-generation control is visible.
`waitForStableCompletion()` returns only after a response differs from the prior response, generation is
not running, and text remains unchanged for `stableMs`.

## Gemini turn contract

Gemini uses its visible `rich-textarea` editor. The driver clears and fills the prompt, waits for the
semantic send button to be visible and enabled (including ARIA state), keyboard-activates it, and polls
the newest response container through the same stable-completion policy.

ChatGPT and Gemini use different durable conversation files and can share a DSH session without sharing
native provider history.

## `internet_team` flow

`internet_team` derives a durable team owner:

```text
<dsh-session-id>:team:<team-name-or-default>
```

This isolates team conversations from direct `internet_chat` conversations. All calls using the same DSH
session and team name resume the same ChatGPT and Gemini team threads.

For each round, providers speak sequentially in the requested order:

```text
for round 1..rounds:
  for provider in providers:
    prompt = task + every other provider's latest contribution
    result = BrowserManager.chat(provider, teamSessionId, visible)
    transcript.push(result)
```

The first provider in round one receives an initial-analysis prompt because no teammate has spoken yet.
Later turns receive the task plus each other provider's latest message and are asked to critique, refine,
and improve it. A provider's own prior messages already exist in its native durable conversation, so the
orchestrator injects only teammates' latest messages.

When synthesis is enabled, the last provider receives the full current-call debate transcript and returns
a single final answer. Synthesis is not included in the optional transcript. Without synthesis, the last
debate contribution is the final answer.

The same `visible` flag is passed to every provider turn and synthesis turn. `visible: false` is not a
separate orchestration path: it uses the same prompts and provider drivers on hidden browser displays.

The orchestrator stops at the first provider failure and returns that provider plus all completed current-
call turns. It does not silently continue with a missing teammate. A team's own turns remain sequential and
the DSH tool remains non-concurrency-safe; optional runtime concurrency applies only across independent
hidden child-team session ids.

### Transcript projection

The full current-call transcript exists internally for synthesis. When `includeTranscript: true`, it is
included in both the structured result and the model-visible rendered tool content.

Projection walks backward from the newest turn using a Unicode code-point budget. Newest complete turns
are retained first. If the boundary turn does not fit, only its suffix is retained and marked
`textTruncation: "prefix"`. `transcriptTruncated` is true whenever any earlier content was omitted. The
final synthesis response is returned separately and does not consume transcript budget.

## Durable provider conversations

Every agent-backed tool execution exposes the DSH owner as `exec.agent.id`. The plugin hashes its string
form and stores one binding at:

```text
dataDir/chatgpt-web/conversations/<sha256(sessionId)>.json
dataDir/gemini-web/conversations/<sha256(sessionId)>.json
```

The directory is mode `0700`; files are mode `0600`. Writes use fsync and atomic rename. The raw DSH
session ID and prompts are not persisted. A session may refresh its existing binding but cannot silently
rebind to another conversation id.

Team-derived session ids pass through the same hashing and binding layer, which is why named team threads
remain private and durable without a separate storage implementation.

## Authentication and login

### Local desktop

`internet_browser login` stops existing provider inference, creates or reuses a provider-isolated login
profile, and launches normal Chrome without browser-automation or remote-debugging flags. The user signs
in and closes Chrome completely.

### Remote noVNC

On displayless Linux, or when `remote: true`, `RemoteLoginSession` owns:

- a dedicated Xvfb display,
- bundled-first x11vnc,
- a loopback HTTP/WebSocket bridge,
- an isolated noVNC page,
- normal Chrome using the provider login profile,
- expiry, finalization, and cleanup.

The stable HTTP ports are `remoteLoginPort` for ChatGPT and `remoteLoginPort + 1` for Gemini. The VNC
upstream is private and ephemeral. All listeners bind to `127.0.0.1`. A 256-bit URL path token, temporary
VNC password, strict same-origin handling, explicit routes, no-store headers, and CSP define the boundary.
Public binding and proxy trust are intentionally absent.

The lifecycle state is `waiting`, `finalizing`, `complete`, or `failed`. The login tool returns immediately
while waiting. Pressing **Save account** re-enters the serialized provider queue and runs the one
authoritative finalization path. Once finalization starts, it runs to completion; `stop` cancels only a
waiting login.

### Portable account creation

After Chrome releases the login profile lock:

1. Patchright opens the persistent profile and captures bootstrap cookies/local storage.
2. A fresh non-persistent context verifies the authenticated provider surface.
3. The context captures current IndexedDB in addition to cookies and local storage.
4. The plugin atomically writes `dataDir/accounts/<provider>.json` with mode `0600`.

A failed, cancelled, expired, or unverified login never replaces an existing ready account.

## Portable security boundary

`dataDir/accounts/` is the only portable authentication boundary. Login profiles are machine-local
recovery caches because Chrome encryption depends on OS keyrings and browser/platform internals.
Conversation files are DSH identity bindings, not credentials.

Account JSON files are plaintext bearer secrets. Copy them only through a secure channel while DSH is
stopped. Provider expiration, revocation, risk checks, MFA, or CAPTCHA can still require a fresh login.
`status=ready` confirms a valid local file, not a live provider session.

## Display and browser lifecycle

Inference uses non-persistent contexts restored only from canonical account files, avoiding profile
singleton locks.

For `headless: false`, hidden Linux inference asks `BrowserDisplayManager` for one shared managed Xvfb:

1. bundled Linux x64/glibc runtime closure,
2. system `Xvfb`,
3. inherited `$DISPLAY` fallback.

`Xvfb -displayfd` lets Xorg select a free display without a fixed-display race. The managed display uses
`1920x1080x24`. Supported bundles include measured Xvfb/x11vnc binaries, libraries, `xkbcomp`, and XKB
data. Unsupported targets skip private binaries and use system executables when available.

`visible: true` requires a user-managed display and never falls back to Xvfb. Native `headless: true`
bypasses display discovery. The plugin does not silently convert a failed headed launch into native
headless mode.

The default allows one hidden turn per provider. Different DSH session ids lease isolated non-persistent
contexts from the same portable account; repeated turns for one session remain FIFO. Set
`maxConcurrentTurnsPerProvider` above `1` only after confirming provider policy and account-state
acceptance. A visible call, login, remote-login finalization, stop, reauthentication, and display loss
are provider-exclusive barriers. Contexts close after their turns; compatible browser processes close
after `closeAfterMs` of pool-wide idleness.

Successful current-generation turns serialize portable-account refreshes. Every context remembers the
canonical account revision used to bootstrap it; a commit advances that revision, and later completions
from the older revision are discarded. The stored account is a bootstrap cache, not a mergeable replica of
arbitrary provider cookies or IndexedDB. Only affirmative sign-out proof marks reauth-required; a
challenge or unconfirmed surface preserves the ready snapshot. Reauthentication invalidates the provider
generation, aborts active leases, and prevents older turns from restoring a `ready` snapshot.
`BrowserManager.dispose()` closes contexts, Chrome, pending remote logins, timers, and the shared
inference display.

## Errors

Expected failures use `InternetError`:

- `browser_unavailable` — Chrome/display/runtime unavailable.
- `login_required` — no accepted portable authentication state.
- `login_failed` — interactive login or verification failed.
- `timeout` — login, provider turn, or completion exceeded its deadline.
- `aborted` — DSH cancelled the operation.
- `provider_error` — provider DOM/state violated the interaction contract.
- `config_error` — explicit plugin configuration is invalid.

Tools convert these into structured error results. `internet_team` additionally reports the provider whose
turn failed and can return already completed transcript turns when transcript output was requested.
