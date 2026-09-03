# Provider UI inspection guide

Browser-backed provider UIs change frequently. This guide defines the shared discovery and safety protocol for `@tsuuanmi/internet`; provider-specific contracts live separately:

- [Gemini UI inspection contract](./gemini-ui-inspection.md)
- [ChatGPT UI inspection contract](./chatgpt-ui-inspection.md)

## Safety boundary

- Use a fresh **non-persistent** browser context restored from portable account state. Never inspect a Chrome login profile; it is machine-local and may contain keyring-backed state.
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

   CSS class names, visual coordinates, and an element's sibling index are never canonical selectors.
4. Activate the trigger. Verify its state change (`aria-expanded`, `aria-checked`, or an equivalent provider-owned marker) before looking for menu contents.
5. Capture the action selector, enabled/disabled state, and a *post-action composer indicator*. Clicking a menu entry alone is not proof that a mode is active.
6. Restore the original mode and confirm the post-action indicator disappears. Do not leave inspection state in a portable account snapshot.
7. Add the observed contract, observation date, entitlement constraints, bounded diagnostic data, and (only when explicitly supported) a fallback selector to a provider fixture/test before relying on it in production. When no safe fallback exists, record the fail-closed behavior instead.

## What to record

Record the complete transition, not only an action selector:

- **Precondition:** authenticated provider surface and the visible composer/control that owns the state.
- **Trigger:** canonical selector, accessible name, expected closed state, and the state that proves it opened.
- **Action:** semantic role, stable visible label, enabled state, and whether the provider closes or retains the menu.
- **Confirmation:** a provider-owned composer indicator that proves the requested state after the action. A click alone, styling, or remembered thread state is not confirmation.
- **Restoration:** the exact action and indicator that return the context to its original state. Close the context without persisting its storage state.
- **Failure diagnostics:** current origin/path, bounded visible control labels, and a limited relevant control subtree. Never include account controls, conversation history, page titles that can include user input, prompt text, cookies, or storage.

## Selector-drift handling

When a canonical selector fails, return a `provider_error` containing the provider, action name, current URL origin/path, bounded visible control labels, and a limited relevant control subtree. Do not use an LLM, blind text clicking, or a standard-chat fallback to recover. Re-run the relevant provider contract and update its fixture first.
