import type { WorkflowProfileDescriptor } from "#internet/workflow/profiles/types";
export declare class WorkflowProfileRegistryError extends Error {
    constructor(message: string);
}
export declare class WorkflowProfileRegistry {
    private readonly profiles;
    private readonly defaultProfileId;
    constructor(profiles: readonly WorkflowProfileDescriptor[], defaultProfileId: string);
    resolve(profileHint?: string): WorkflowProfileDescriptor;
}
//# sourceMappingURL=registry.d.ts.map