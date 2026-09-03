# Gemini UI inspection contract

Follow the shared [provider UI inspection guide](./provider-ui-inspection.md) before changing this contract. These are entitlement- and locale-sensitive Gemini observations, not a public provider API. Missing controls or confirmations must fail with `provider_error`; never select a different model or fall back to standard chat.

## Flash + Extended default

Observed on 2026-09-03 in a fresh, non-persistent authenticated Gemini context. The account exposed **3.8 Flash** as the latest Flash choice and **Extended thinking** as a separate mode action. The implementation applies this contract before every ordinary Gemini turn so an existing native thread cannot silently supply a different mode. Provider-native Deep Research is intentionally excluded because it owns a different composer mode.

1. Wait for the visible composer, then locate:

   ```css
   button[data-test-id="bard-mode-menu-button"]
   ```

   Its accessible name is **Open mode picker, currently ...**. Require `aria-expanded="true"` after activation.
2. Read the generated menu id from the trigger's `aria-controls`; require that exact visible `[id="<aria-controls>"]` element to have `role="menu"`. Do not make a generated `ng-menu-*` id a static selector.
3. Within that menu, select exactly one enabled `[role="menuitem"]` whose normalized complete visible text is **3.8 Flash All-around help**. Do not use a substring match: a duplicate, suffixed, or Flash-Lite action is selector drift and must fail closed. Dynamic `data-test-id="bard-mode-option-*"` values are diagnostic only and are not canonical selectors.
4. Require the closed composer trigger to report **Open mode picker, currently Flash**. This is the provider-owned confirmation of the Flash family; the collapsed control does not repeat the minor model version.
5. Reopen the picker and select exactly one enabled `[role="menuitem"]` whose normalized complete visible text is **Extended thinking Complex problem solving**.
6. Require the closed trigger to report **Open mode picker, currently Flash Extended**. Its visible text is **Flash** and **Extended**. This is the authoritative combined-mode indicator.
7. During discovery, reload the provider home page and require the original Flash-only indicator before closing the non-persistent context. The current picker does not expose a separate deactivation action for Extended thinking. Production intentionally leaves Flash + Extended selected for the pending turn.

The observed menu labels were **3.5 Flash-Lite** (Fastest answers), **3.8 Flash** (All-around help), **3.1 Pro** (Advanced reasoning), and **Extended thinking** (Complex problem solving). Flash-Lite is an observed non-default alternative and is never used as a fallback. If the exact Flash or Extended action, enabled state, menu role, or either confirmation changes, stop and update the fixture and contract.

## Deep Research

Observed on 2026-08-29:

1. Click visible `button[aria-label="Upload & tools"]`.
2. Locate the enabled `button[role="menuitemcheckbox"]` whose visible label is **Deep research**.
3. Activate it and require `aria-checked="true"` before the menu closes, then require the active composer button named **Deselect Deep research** after it closes.
4. Completion is provider-semantic, not a fixed status sentence: require a new visible `#extended-response-markdown-content` within `structured-content-container[data-test-id="message-content"]`, with `aria-busy="false"`, and the sibling `deep-research-source-lists` report source panel. Do not infer completion solely from an absent Stop control or localized assistant text.
