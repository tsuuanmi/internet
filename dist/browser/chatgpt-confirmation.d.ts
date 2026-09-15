import type { Page } from "patchright-core";
import type { AccountId } from "#internet/core/accounts";
import { type WorkflowApprovalScope } from "#internet/workflow/approval-policy";
/**
 * Inspect one visible ChatGPT Website GitHub confirmation and either approve
 * the exact in-scope action or fail closed. Actual account/session identity is
 * supplied by BrowserManager rather than asserted by the workflow caller.
 */
export declare function chatgptHandleWorkflowConfirmation(page: Page, scope: WorkflowApprovalScope, accountId: AccountId, sessionId: string): Promise<boolean>;
//# sourceMappingURL=chatgpt-confirmation.d.ts.map