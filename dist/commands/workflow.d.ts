import type { CommandDefinition } from "@deepseek-ai/dsh-commands";
import { type GitRunner } from "#internet/workflow/repository-context";
import { type WorkflowAuthorizationContext } from "#internet/workflow/service";
import type { WorkflowJob } from "#internet/workflow/types";
export type { GitRunner } from "#internet/workflow/repository-context";
export { normalizeRepositoryUrl } from "#internet/workflow/repository-context";
export interface WorkflowCommandService {
    start(context: WorkflowAuthorizationContext, input: {
        readonly objective: string;
        readonly repository: string;
        readonly baseRevision: string;
    }): WorkflowJob;
}
export interface WorkflowCommandOperator {
    list(ownerSessionId: string): string;
    status(ownerSessionId: string, jobId?: string): string;
    stop(ownerSessionId: string, jobId?: string): Promise<string>;
    continue(ownerSessionId: string, jobId?: string): string;
    delete(ownerSessionId: string, jobId?: string): Promise<string>;
}
export interface WorkflowCommandDependencies {
    readonly service: WorkflowCommandService;
    readonly operator: WorkflowCommandOperator;
    readonly runGit?: GitRunner;
}
/** Define the normal user-facing durable workflow command family. */
export declare function defineWorkflowCommand(dependencies: WorkflowCommandDependencies): CommandDefinition;
//# sourceMappingURL=workflow.d.ts.map