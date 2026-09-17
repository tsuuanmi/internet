import type { CommandDefinition } from "@deepseek-ai/dsh-commands";
import type { WorkflowAdmissionDraftInput } from "#internet/workflow/admission/types";
import { type WorkflowAuthorizationContext } from "#internet/workflow/authorization";
import { type GitRunner } from "#internet/workflow/repository-context";
import type { WorkflowJob } from "#internet/workflow/types";
export type { GitRunner } from "#internet/workflow/repository-context";
export { normalizeRepositoryUrl } from "#internet/workflow/repository-context";
export interface WorkflowCommandService {
    start(context: WorkflowAuthorizationContext, input: WorkflowAdmissionDraftInput): WorkflowJob;
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
export declare function defineWorkflowCommand(dependencies: WorkflowCommandDependencies): CommandDefinition;
//# sourceMappingURL=workflow.d.ts.map