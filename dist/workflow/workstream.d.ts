import { type WorkflowPrincipal } from "#internet/workflow/authorization";
import type { WorkflowArtifactRef, WorkflowVersionRef } from "#internet/workflow/kernel/types";
export declare const WORKFLOW_WORKSTREAM_SCHEMA: "@tsuuanmi/internet-workflow-workstream";
export interface WorkflowImportedArtifactRef {
    readonly source: WorkflowArtifactRef;
    readonly sourcePayloadHash: string;
    readonly sourceSchemaRef: WorkflowVersionRef;
    readonly imported: WorkflowArtifactRef;
}
export interface WorkflowContinuationLink {
    readonly sourceRunId: string;
    readonly childRunId: string;
    readonly childAdmissionId: string;
    readonly imports: readonly WorkflowImportedArtifactRef[];
    readonly createdAt: string;
}
export interface WorkflowWorkstream {
    readonly schema: typeof WORKFLOW_WORKSTREAM_SCHEMA;
    readonly version: 1;
    readonly revision: number;
    readonly workstreamId: string;
    readonly owner: WorkflowPrincipal;
    readonly title?: string;
    readonly runIds: readonly string[];
    readonly continuations: readonly WorkflowContinuationLink[];
    readonly createdAt: string;
    readonly updatedAt: string;
}
export declare function parseWorkflowWorkstream(value: unknown): WorkflowWorkstream;
//# sourceMappingURL=workstream.d.ts.map