import type { CommandDefinition } from "@deepseek-ai/dsh-commands";
import type { StartWorkflowInput, WorkflowJob } from "#internet/workflow/types";
export type GitRunner = (cwd: string, args: readonly string[], signal: AbortSignal) => Promise<string>;
export interface WorkflowStarter {
    start(input: StartWorkflowInput): WorkflowJob;
}
export interface WorkflowCommandDependencies {
    readonly engine: WorkflowStarter;
    readonly runGit?: GitRunner;
}
/** Convert a standard public Git remote into a credential-free HTTPS repository URL. */
export declare function normalizeRepositoryUrl(remote: string): string | undefined;
/** Define the Git-aware `/workflow <objective>` command as a thin engine adapter. */
export declare function defineWorkflowCommand(dependencies: WorkflowCommandDependencies): CommandDefinition;
//# sourceMappingURL=workflow.d.ts.map