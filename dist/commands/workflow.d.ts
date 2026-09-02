import type { CommandDefinition } from "@deepseek-ai/dsh-commands";
export type GitRunner = (cwd: string, args: readonly string[], signal: AbortSignal) => Promise<string>;
export interface WorkflowCommandDependencies {
    readonly runGit?: GitRunner;
}
/** Convert a standard public Git remote into a credential-free HTTPS repository URL. */
export declare function normalizeRepositoryUrl(remote: string): string | undefined;
/** Define the Git-aware `/workflow <objective>` command. */
export declare function defineWorkflowCommand(dependencies?: WorkflowCommandDependencies): CommandDefinition;
//# sourceMappingURL=workflow.d.ts.map