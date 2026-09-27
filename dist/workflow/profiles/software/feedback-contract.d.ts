export declare const SOFTWARE_USER_FEEDBACK_SCHEMA: {
    readonly id: "workflow.software.user-feedback";
    readonly version: "1";
};
export declare const SOFTWARE_USER_FEEDBACK_VERDICTS: readonly ["ACCEPTED", "CHANGES_REQUESTED"];
export type SoftwareUserFeedbackVerdict = (typeof SOFTWARE_USER_FEEDBACK_VERDICTS)[number];
export interface SoftwareUserFeedbackInput {
    readonly verdict: SoftwareUserFeedbackVerdict;
    readonly raw: string;
    readonly targetDelivery?: {
        readonly runId: string;
        readonly artifactId: string;
    };
    readonly targetVersion?: string;
}
export declare function parseSoftwareUserFeedbackInput(value: unknown): SoftwareUserFeedbackInput;
//# sourceMappingURL=feedback-contract.d.ts.map