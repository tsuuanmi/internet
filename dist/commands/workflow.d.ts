import type { CommandDefinition } from "@deepseek-ai/dsh-commands";
import { type GitRunner } from "#internet/workflow/repository-context";
import type { StartWorkflowInput, WorkflowJob } from "#internet/workflow/types";
export type { GitRunner } from "#internet/workflow/repository-context";
export { normalizeRepositoryUrl } from "#internet/workflow/repository-context";
export interface WorkflowStarter {
    start(input: StartWorkflowInput): WorkflowJob;
}
export interface WorkflowEnqueuer {
    enqueue(jobId: string): void;
}
export interface WorkflowCommandOperator {
    list(ownerSessionId: string): string;
    status(ownerSessionId: string, jobId?: string): string;
    watch(ownerSessionId: string, jobId?: string): string;
    stop(ownerSessionId: string, jobId?: string): Promise<string>;
    continue(ownerSessionId: string, jobId?: string): string;
    delete(ownerSessionId: string, jobId?: string): Promise<string>;
}
export interface WorkflowCommandDependencies {
    readonly engine: WorkflowStarter;
    readonly driver: WorkflowEnqueuer;
    readonly operator: WorkflowCommandOperator;
    readonly runGit?: GitRunner;
}
/** Define the normal user-facing durable workflow command family. */
export declare function defineWorkflowCommand(dependencies: WorkflowCommandDependencies): CommandDefinition;
//# sourceMappingURL=workflow.d.ts.map