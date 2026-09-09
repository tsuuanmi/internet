import { defineTool } from "@deepseek-ai/dsh-tools";
import type { WorkflowEngine } from "#internet/workflow/engine";
export declare const WORKFLOW_OPERATIONS: readonly ["start", "status", "request_merge", "approve", "merge", "reject", "cancel", "continue"];
export type WorkflowOperation = (typeof WORKFLOW_OPERATIONS)[number];
/** Define the deterministic workflow control-plane tool. */
export declare function defineInternetWorkflowTool(engine: WorkflowEngine): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-workflow.d.ts.map