import type { WorkflowAdmissionStore } from "#internet/workflow/admission/store";
import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowArtifact, WorkflowArtifactRef, WorkflowRun } from "#internet/workflow/kernel/types";
import type { WorkflowRunStore } from "#internet/workflow/run-store";
import { type WorkflowWorkstream } from "#internet/workflow/workstream";
import type { WorkflowWorkstreamStore } from "#internet/workflow/workstream-store";
export interface WorkflowContinuationImportPolicy {
    validate(input: {
        readonly workstream: WorkflowWorkstream;
        readonly sourceRun: WorkflowRun;
        readonly childRun: WorkflowRun;
        readonly sourceArtifact: WorkflowArtifact;
    }): void;
}
export interface WorkflowContinuationServiceOptions {
    readonly now?: () => Date;
    readonly createId?: () => string;
}
export interface ContinueWorkflowRunInput {
    readonly workstreamId: string;
    readonly sourceRunId: string;
    readonly childRun: WorkflowRun;
    readonly sourceArtifacts: readonly WorkflowArtifactRef[];
}
export interface WorkflowContinuationResult {
    readonly workstream: WorkflowWorkstream;
    readonly childRun: WorkflowRun;
    readonly importedArtifacts: readonly WorkflowArtifact[];
}
export declare class WorkflowContinuationError extends Error {
    constructor(message: string);
}
export declare class WorkflowContinuationService {
    private readonly workstreams;
    private readonly admissions;
    private readonly runs;
    private readonly artifacts;
    private readonly policy;
    private readonly now;
    private readonly createId;
    constructor(workstreams: WorkflowWorkstreamStore, admissions: WorkflowAdmissionStore, runs: WorkflowRunStore, artifacts: WorkflowArtifactStore, policy: WorkflowContinuationImportPolicy, options?: WorkflowContinuationServiceOptions);
    createWorkstream(sourceRunId: string, title?: string): WorkflowWorkstream;
    continueRun(input: ContinueWorkflowRunInput): WorkflowContinuationResult;
}
//# sourceMappingURL=continuation.d.ts.map