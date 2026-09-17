import type { WorkflowCapabilityDescriptor, WorkflowCapabilityRegistry } from "#internet/workflow/capability-registry";
import type { WorkflowRun } from "#internet/workflow/kernel/types";
import type { WorkflowNeedPayload } from "#internet/workflow/semantic/index";
export declare class WorkflowCapabilityRoutingError extends Error {
    constructor(message: string);
}
export declare function routeWorkflowCapability(run: WorkflowRun, need: WorkflowNeedPayload, registry: WorkflowCapabilityRegistry): WorkflowCapabilityDescriptor;
//# sourceMappingURL=routing.d.ts.map