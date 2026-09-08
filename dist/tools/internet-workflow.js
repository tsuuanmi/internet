import { defineTool } from "@deepseek-ai/dsh-tools";
import { WorkflowEngineError } from "#internet/workflow/engine";
export const WORKFLOW_OPERATIONS = ["start", "status", "approve", "reject", "cancel", "continue"];
function project(job) {
    return {
        jobId: job.jobId,
        state: job.state,
        repository: job.repository,
        baseRevision: job.baseRevision,
        reviewCycle: job.reviewCycle,
        ...(job.pullRequest === undefined
            ? {}
            : {
                prNumber: job.pullRequest.number,
                prUrl: job.pullRequest.url,
                prHeadSha: job.pullRequest.headSha,
            }),
        ...(job.pendingAction === undefined
            ? {}
            : {
                pendingAction: job.pendingAction.kind,
                pendingMessage: job.pendingAction.message,
            }),
        updatedAt: job.updatedAt,
    };
}
/** Define the deterministic workflow control-plane tool. */
export function defineInternetWorkflowTool(engine) {
    return defineTool({
        name: "internet_workflow",
        description: "Create and control durable deterministic coding workflow jobs. start persists authoritative repository/objective state; status/approve/reject/cancel/continue operate by job ID.",
        parameters: {
            operation: {
                type: "string",
                required: true,
                enum: [...WORKFLOW_OPERATIONS],
                description: "Workflow operation.",
            },
            jobId: { type: "string", description: "32-character workflow job ID for non-start operations." },
            objective: { type: "string", description: "Coding objective for start." },
            repository: { type: "string", description: "Authoritative public repository URL for start." },
            baseRevision: { type: "string", description: "Full 40-character Git SHA for start." },
            expectedHeadSha: { type: "string", description: "Exact PR head SHA when authorizing a head-bound action." },
        },
        output: {
            schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    ok: { type: "boolean", required: true },
                    operation: { type: "string", required: true },
                    jobId: { type: "string" },
                    state: { type: "string" },
                    repository: { type: "string" },
                    baseRevision: { type: "string" },
                    reviewCycle: { type: "number" },
                    prNumber: { type: "number" },
                    prUrl: { type: "string" },
                    prHeadSha: { type: "string" },
                    pendingAction: { type: "string" },
                    pendingMessage: { type: "string" },
                    updatedAt: { type: "string" },
                    message: { type: "string" },
                },
            },
            render: (_args, value) => {
                const result = value;
                const summary = [`ok=${String(result.ok)}`, `operation=${String(result.operation)}`];
                if (result.jobId !== undefined)
                    summary.push(`job=${String(result.jobId)}`);
                if (result.state !== undefined)
                    summary.push(`state=${String(result.state)}`);
                if (result.message !== undefined)
                    summary.push(String(result.message));
                return [{ type: "text", text: summary.join(" · ") }];
            },
            presentationMeta: (_args, value) => value,
        },
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            const operation = args.operation;
            try {
                if (operation === "start") {
                    if (typeof args.objective !== "string" ||
                        typeof args.repository !== "string" ||
                        typeof args.baseRevision !== "string") {
                        return { ok: false, operation, message: "start requires objective, repository, and baseRevision" };
                    }
                    const job = engine.start({
                        objective: args.objective,
                        repository: args.repository,
                        baseRevision: args.baseRevision,
                        ownerSessionId: String(exec.agent?.id ?? ""),
                    });
                    return { ok: true, operation, ...project(job) };
                }
                if (typeof args.jobId !== "string")
                    return { ok: false, operation, message: `${operation} requires jobId` };
                const expectedHeadSha = typeof args.expectedHeadSha === "string" ? args.expectedHeadSha : undefined;
                const job = operation === "status"
                    ? engine.status(args.jobId)
                    : operation === "cancel"
                        ? engine.cancel(args.jobId)
                        : operation === "continue"
                            ? engine.continue(args.jobId)
                            : operation === "approve"
                                ? engine.approve({ jobId: args.jobId, expectedHeadSha })
                                : engine.reject({ jobId: args.jobId, expectedHeadSha });
                return { ok: true, operation, ...project(job) };
            }
            catch (error) {
                if (error instanceof WorkflowEngineError)
                    return { ok: false, operation, message: error.message };
                return { ok: false, operation, message: error instanceof Error ? error.message : String(error) };
            }
        },
        presentCall: (args) => ({
            card: "generic",
            title: `internet_workflow ${String(args.operation)}`,
            kind: "other",
        }),
    });
}
//# sourceMappingURL=internet-workflow.js.map