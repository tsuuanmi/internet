import { defineTool } from "@deepseek-ai/dsh-tools";
import { type WorkflowRetentionManager } from "#internet/workflow/retention";
export declare const WORKFLOW_MAINTENANCE_OPERATIONS: readonly ["preview", "cleanup"];
export type WorkflowMaintenanceOperation = (typeof WORKFLOW_MAINTENANCE_OPERATIONS)[number];
export declare function defineInternetWorkflowMaintenanceTool(manager: WorkflowRetentionManager): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-workflow-maintenance.d.ts.map