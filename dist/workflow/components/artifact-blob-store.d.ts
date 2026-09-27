export interface WorkflowArtifactBlobRef {
    readonly digest: string;
    readonly size: number;
    readonly mediaType: string;
}
export interface WorkflowArtifactBlob extends WorkflowArtifactBlobRef {
    readonly bytes: Uint8Array;
}
export interface WorkflowArtifactBlobStorePort {
    put(bytes: Uint8Array, mediaType: string): WorkflowArtifactBlobRef;
    get(digest: string): WorkflowArtifactBlob | undefined;
    exists(digest: string): boolean;
}
export declare class LocalWorkflowArtifactBlobStore implements WorkflowArtifactBlobStorePort {
    private readonly root;
    constructor(dataDir: string);
    private pathFor;
    put(bytes: Uint8Array, mediaType: string): WorkflowArtifactBlobRef;
    get(digest: string): WorkflowArtifactBlob | undefined;
    exists(digest: string): boolean;
}
//# sourceMappingURL=artifact-blob-store.d.ts.map