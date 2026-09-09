export declare const WORKFLOW_REVIEW_VERDICTS: readonly ["PASS", "CHANGES_REQUIRED"];
export type WorkflowReviewVerdict = (typeof WORKFLOW_REVIEW_VERDICTS)[number];
export interface WorkflowReviewResult {
    readonly verdict: WorkflowReviewVerdict;
    readonly reviewedHeadSha: string;
}
/** Parse control-plane review metadata while the complete reviewer payload remains stored verbatim. */
export declare function parseWorkflowReviewResult(payload: string): WorkflowReviewResult;
//# sourceMappingURL=review-result.d.ts.map