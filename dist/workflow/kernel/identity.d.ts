import type { WorkflowArtifactLineage, WorkflowArtifactProducer, WorkflowArtifactRef, WorkflowInputFact, WorkflowVersionRef } from "#internet/workflow/kernel/types";
export declare function normalizeArtifactLineage(lineage: readonly WorkflowArtifactLineage[]): readonly WorkflowArtifactLineage[];
export declare function normalizeArtifactRefs(artifacts: readonly WorkflowArtifactRef[]): readonly WorkflowArtifactRef[];
export declare function normalizeInputFacts(facts: readonly WorkflowInputFact[]): readonly WorkflowInputFact[];
export declare function workflowArtifactPayloadHash(payload: unknown): string;
export declare function workflowArtifactId(input: {
    readonly runId: string;
    readonly type: string;
    readonly schemaRef: WorkflowVersionRef;
    readonly producer: WorkflowArtifactProducer;
    readonly inputBundleId?: string;
    readonly lineage: readonly WorkflowArtifactLineage[];
    readonly payloadHash: string;
}): string;
export declare function workflowInputBundleId(input: {
    readonly runId: string;
    readonly workItemId: string;
    readonly capability: WorkflowVersionRef;
    readonly projection: WorkflowVersionRef;
    readonly artifacts: readonly WorkflowArtifactRef[];
    readonly facts: readonly WorkflowInputFact[];
}): string;
//# sourceMappingURL=identity.d.ts.map