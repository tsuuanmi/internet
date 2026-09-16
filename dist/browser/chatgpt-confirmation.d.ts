import type { Page } from "patchright-core";
import type { AccountId } from "#internet/core/accounts";
import { type WorkflowApprovalScope } from "#internet/workflow/approval-policy";
/** Inspect one workflow-scoped ChatGPT GitHub confirmation and auto-approve only exact in-scope PR preparation actions. */
export declare function chatgptHandleWorkflowConfirmation(page: Page, scope: WorkflowApprovalScope, accountId: AccountId, sessionId: string): Promise<boolean>;
//# sourceMappingURL=chatgpt-confirmation.d.ts.map