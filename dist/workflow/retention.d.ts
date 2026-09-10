import type { WorkflowJobStore } from "#internet/workflow/job-store";
import { type WorkflowState } from "#internet/workflow/types";
export declare const WORKFLOW_RETENTION_AUDIT_SCHEMA: "@tsuuanmi/internet-workflow-retention-audit";
export interface WorkflowRetentionPolicy {
    readonly doneDays: number;
    readonly cancelledDays: number;
}
export declare const DEFAULT_WORKFLOW_RETENTION_POLICY: WorkflowRetentionPolicy;
export interface WorkflowCleanupCandidate {
    readonly jobId: string;
    readonly state: "DONE" | "CANCELLED";
    readonly repository: string;
    readonly updatedAt: string;
    readonly retentionDays: number;
    readonly eligibleAt: string;
}
export interface WorkflowCleanupAudit {
    readonly schema: typeof WORKFLOW_RETENTION_AUDIT_SCHEMA;
    readonly version: 1;
    readonly auditId: string;
    readonly jobId: string;
    readonly state: "DONE" | "CANCELLED";
    readonly repository: string;
    readonly jobUpdatedAt: string;
    readonly retentionDays: number;
    readonly eligibleAt: string;
    readonly operatorSessionId: string;
    readonly requestedAt: string;
    readonly status: "STARTED" | "COMPLETED" | "FAILED";
    readonly deletedHandoffFiles: number;
    readonly completedAt?: string;
    readonly error?: string;
}
export interface WorkflowDeletionReceipt {
    readonly jobId: string;
    readonly state: WorkflowState;
    readonly repository: string;
    readonly operatorSessionId: string;
    readonly deletedHandoffFiles: number;
    readonly deletedTrace: boolean;
    readonly deletedAt: string;
}
export declare class WorkflowRetentionError extends Error {
    constructor(message: string);
}
/** Explicit operator-only retention manager. It never schedules or performs automatic deletion. */
export declare class WorkflowRetentionManager {
    private readonly auditDir;
    private readonly handoffRoot;
    private readonly traceRoot;
    private readonly jobs;
    private readonly policy;
    private readonly now;
    constructor(dataDir: string, jobs: WorkflowJobStore, policy?: WorkflowRetentionPolicy, now?: () => Date);
    preview(): readonly WorkflowCleanupCandidate[];
    deleteNow(input: {
        jobId: string;
        expectedUpdatedAt: string;
        operatorSessionId: string;
    }): WorkflowDeletionReceipt;
    cleanup(input: {
        jobId: string;
        expectedUpdatedAt: string;
        operatorSessionId: string;
    }): WorkflowCleanupAudit;
}
//# sourceMappingURL=retention.d.ts.map