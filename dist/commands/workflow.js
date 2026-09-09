import { resolveWorkflowRepository, runGitCommand, WorkflowRepositoryError, } from "#internet/workflow/repository-context";
const USAGE = "Usage: /workflow <objective>";
export { normalizeRepositoryUrl } from "#internet/workflow/repository-context";
/** Define the Git-aware `/workflow <objective>` command as a thin engine adapter. */
export function defineWorkflowCommand(dependencies) {
    const runGit = dependencies.runGit ?? runGitCommand;
    return {
        name: "workflow",
        description: "start an automatically driven durable reviewed implementation workflow",
        input: { hint: "<objective>" },
        async handler(invocation) {
            const objective = invocation.rawInput.trim();
            if (objective === "")
                return { kind: "error", text: `An objective is required. ${USAGE}` };
            const cwd = invocation.agent.session.header.cwd;
            if (cwd === undefined)
                return { kind: "error", text: "/workflow requires a session working directory." };
            try {
                const repository = await resolveWorkflowRepository(cwd, invocation.signal, runGit, "/workflow");
                const job = dependencies.engine.start({
                    objective,
                    repository: repository.url,
                    baseRevision: repository.revision,
                    ownerSessionId: String(invocation.agent.id),
                });
                dependencies.driver.enqueue(job.jobId);
                return {
                    kind: "success",
                    text: `Workflow ${job.jobId} started for ${repository.url} at ${repository.revision.slice(0, 12)}.`,
                };
            }
            catch (error) {
                if (invocation.signal.aborted)
                    throw error;
                if (error instanceof WorkflowRepositoryError)
                    return { kind: "error", text: error.message };
                throw error;
            }
        },
    };
}
//# sourceMappingURL=workflow.js.map