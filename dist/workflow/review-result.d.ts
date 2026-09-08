export declare const WORKFLOW_REVIEW_VERDICTS: readonly ["PASS", "CHANGES_REQUIRED"];
export type WorkflowReviewVerdict = (typeof WORKFLOW_REVIEW_VERDICTS)[number];
/** Parse only the control-plane verdict while preserving the original reviewer payload verbatim elsewhere. */
export declare function parseWorkflowReviewVerdict(payload: string): WorkflowReviewVerdict;
//# sourceMappingURL=review-result.d.ts.map