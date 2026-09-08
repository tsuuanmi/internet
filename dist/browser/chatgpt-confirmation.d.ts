import type { Page } from "patchright-core";
import { type WorkflowApprovalContext, type WorkflowConfirmationObservation } from "#internet/workflow/approval-policy";
/**
 * Keep confirmation roots deliberately narrow. Generic tool-call containers are
 * not roots: they may wrap the real dialog and would create ambiguous duplicate
 * candidates, which must fail closed rather than be guessed through.
 */
export declare const CHATGPT_CONFIRMATION_ROOT_SELECTOR: string;
export declare class ChatGptUnknownConfirmationError extends Error {
    constructor(message: string);
}
export declare class ChatGptMergeConfirmationError extends Error {
    constructor(message: string);
}
export declare function parseChatGptConfirmationText(text: string): WorkflowConfirmationObservation;
/**
 * Inspect one visible Website confirmation and either safely approve the exact
 * in-scope writer action or fail closed. Returns false when no confirmation is visible.
 */
export declare function chatgptHandleWorkflowConfirmation(page: Page, context: WorkflowApprovalContext): Promise<boolean>;
//# sourceMappingURL=chatgpt-confirmation.d.ts.map