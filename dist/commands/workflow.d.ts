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
export interface WorkflowCommandDependencies {
    readonly engine: WorkflowStarter;
    readonly driver: WorkflowEnqueuer;
    readonly runGit?: GitRunner;
}
/** Define the Git-aware `/workflow <objective>` command as a thin engine adapter. */
export declare function defineWorkflowCommand(dependencies: WorkflowCommandDependencies): CommandDefinition;
//# sourceMappingURL=workflow.d.ts.map