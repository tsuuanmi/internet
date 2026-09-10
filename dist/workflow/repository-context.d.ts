export interface WorkflowRepositoryContext {
    readonly url: string;
    readonly revision: string;
}
export type GitRunner = (cwd: string, args: readonly string[], signal: AbortSignal) => Promise<string>;
export declare class WorkflowRepositoryError extends Error {
}
export declare const WORKFLOW_BASE_BRANCH: "main";
/** Run Git without a shell so branch and remote names are never interpolated. */
export declare function runGitCommand(cwd: string, args: readonly string[], signal: AbortSignal): Promise<string>;
/** Convert a standard public Git remote into a credential-free HTTPS repository URL. */
export declare function normalizeRepositoryUrl(remote: string): string | undefined;
/** Resolve a session worktree to one public upstream repository and fresh upstream main HEAD. */
export declare function resolveWorkflowRepository(cwd: string, signal: AbortSignal, runGit?: GitRunner, source?: string): Promise<WorkflowRepositoryContext>;
//# sourceMappingURL=repository-context.d.ts.map