import { type WorkflowSideEffectClass, type WorkflowVersionRef } from "#internet/workflow/kernel/types";
export interface WorkflowCapabilityDescriptor {
    readonly id: string;
    readonly version: string;
    readonly acceptedNeedTypes: readonly string[];
    readonly producedArtifactTypes: readonly string[];
    readonly producedReceiptTypes: readonly string[];
    readonly sideEffect: WorkflowSideEffectClass;
    readonly requiredAuthority: readonly string[];
    readonly executorKinds: readonly string[];
    readonly inputSchema: WorkflowVersionRef;
    readonly outputSchema: WorkflowVersionRef;
    readonly policyHooks: readonly string[];
}
export declare class WorkflowCapabilityRegistryError extends Error {
    constructor(message: string);
}
export declare class WorkflowCapabilityRegistry {
    private readonly capabilities;
    constructor(descriptors: readonly WorkflowCapabilityDescriptor[]);
    resolve(ref: WorkflowVersionRef): WorkflowCapabilityDescriptor;
    has(ref: WorkflowVersionRef): boolean;
    list(): readonly WorkflowCapabilityDescriptor[];
}
//# sourceMappingURL=capability-registry.d.ts.map