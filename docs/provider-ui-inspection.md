# Provider UI inspection guide

Browser-backed provider UIs change frequently. This guide defines the only supported way to discover or refresh an automation contract for `@tsuuanmi/internet`.

## Safety boundary

- Use a fresh **non-persistent** browser context restored from the portable account state. Never inspect a Chrome login profile; it is machine-local and may contain keyring-backed state.
- Prefer a headed managed display. Use `visible: true` only when a human must confirm a provider surface.
- Do not submit a prompt while discovering a control. Exercise activation and restoration only.
- Capture no cookies, storage state, account email/name, full-page HTML, or user-provided prompt text. Diagnostic HTML must be limited to the relevant control subtree.

## Discovery protocol

1. Navigate to the provider home page and wait for both the authenticated account control and the visible composer.
2. Wait for hydration before inspecting controls. Dismiss only a known, narrowly scoped blocking dialog; record its selector and reason.
3. Discover the trigger using this priority order:
   1. provider `data-testid` or `data-test-id`,
   2. ARIA role, accessible name, and state,
   3. bounded visible text.

   CSS class names, visual coordinates, and an element’s sibling index are never canonical selectors.
4. Activate the trigger. Verify its state change (`aria-expanded`, `aria-checked`, or an equivalent provider-owned marker) before looking for the menu contents.
5. Capture the action selector, the enabled/disabled state, and a *post-action composer indicator*. Clicking a menu entry alone is not sufficient proof that a mode is active.
6. Restore the original mode and confirm the post-action indicator disappears. Do not leave inspection state in a portable account snapshot.
7. Add the observed contract, observation date, entitlement constraints, fallback selector, and bounded diagnostic data to a provider fixture/test before relying on it in production.

## Current observed research-mode contracts

### ChatGPT Deep Research

Observed on 2026-08-29:

1. Wait for `button[data-testid="composer-plus-btn"]` named **Add files and more**.
2. If the known `#modal-subscription-failure` dialog covers the composer, dismiss only its `button[data-testid="close-button"][aria-label="Close"]` control and wait for the dialog to hide.
3. Click the plus button and require `aria-expanded="true"`.
4. Select the visible direct child:

   ```css
   [data-composer-plugin-impression-id="connector_openai_deep_research"] > [tabindex="0"]
   ```

   Its visible label is **Deep research** and subtitle is **Get a detailed report**.
5. Require a non-editable composer pill with both:

   ```css
   [data-inline-selection-pill][data-id="plugin:connector_openai_deep_research"]
   [data-system-hint-type="plugin:connector_openai_deep_research"]
   ```

   The composer fallback textarea changes its placeholder to **Get a detailed report**.

The menu entry is a focusable `div`, not an ARIA menuitem. An inspection that searches only `[role="menuitem"]` will miss it.

Completion is rendered outside the ordinary assistant turn: ChatGPT mounts the report in an internal nested `about:blank` frame. A visible **Export** control in that report frame is the provider-owned report-published affordance; collect the frame body only after it is present and stable. Do not use the absence of a top-level Stop button or a localized completion sentence.

### Gemini Deep research

Observed on 2026-08-29:

1. Click visible `button[aria-label="Upload & tools"]`.
2. Locate the enabled `button[role="menuitemcheckbox"]` whose visible label is **Deep research**.
3. Activate it and require `aria-checked="true"` before the menu closes, then require the active composer button named **Deselect Deep research** after it closes.
4. Completion is provider-semantic, not a fixed status sentence: require a new visible `#extended-response-markdown-content` within `structured-content-container[data-test-id="message-content"]`, with `aria-busy="false"`, and the sibling `deep-research-source-lists` report source panel. Do not infer completion solely from an absent Stop control or localized assistant text.

## Selector-drift handling

When a canonical selector fails, return a `provider_error` containing the provider, action name, current URL origin/path, page title, bounded visible control labels, and a limited relevant HTML subtree. Do not use an LLM, blind text clicking, or a standard-chat fallback to recover from a research-mode selector failure. Re-run this guide and update the fixture first.
