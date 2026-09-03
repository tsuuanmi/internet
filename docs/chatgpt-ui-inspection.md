# ChatGPT UI inspection contract

Follow the shared [provider UI inspection guide](./provider-ui-inspection.md) before changing this contract. These observations are entitlement- and locale-sensitive, not a public provider API. Missing controls or confirmations must fail with `provider_error`; never use blind text clicking or a standard-chat fallback.

## Deep Research

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
