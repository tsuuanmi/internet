import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import type { WorkflowDriver } from "#internet/workflow/driver";
import type { WorkflowEngine } from "#internet/workflow/engine";
import type { GitRunner } from "#internet/workflow/repository-context";
export declare const WORKFLOW_OPERATIONS: readonly ["start", "test", "status", "authorize_merge", "cancel", "continue"];
export type WorkflowOperation = (typeof WORKFLOW_OPERATIONS)[number];
export interface WorkflowTestDependencies {
    readonly browser?: Pick<BrowserManager, "status">;
    readonly runGit?: GitRunner;
    readonly timeoutMs?: number;
    readonly pollMs?: number;
}
export declare function defineInternetWorkflowTool(engine: WorkflowEngine, driver: Pick<WorkflowDriver, "enqueue" | "cancel">, testDependencies?: WorkflowTestDependencies): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-workflow.d.ts.map