import { type WorkflowArtifact, type WorkflowArtifactLineage, type WorkflowArtifactProducer, type WorkflowVersionRef } from "#internet/workflow/kernel/types";
export interface CreateWorkflowArtifactInput {
    readonly runId: string;
    readonly type: string;
    readonly schemaRef: WorkflowVersionRef;
    readonly producer: WorkflowArtifactProducer;
    readonly inputBundleId?: string;
    readonly lineage?: readonly WorkflowArtifactLineage[];
    readonly payload: unknown;
}
export declare class WorkflowArtifactStoreError extends Error {
    constructor(message: string);
}
export declare class WorkflowArtifactStore {
    private readonly root;
    constructor(dataDir: string);
    private runDir;
    pathFor(runId: string, artifactId: string): string;
    create(input: CreateWorkflowArtifactInput): WorkflowArtifact;
    get(runId: string, artifactId: string): WorkflowArtifact | undefined;
    list(runId: string): readonly WorkflowArtifact[];
}
//# sourceMappingURL=artifact-store.d.ts.map