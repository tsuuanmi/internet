import { defineTool } from "@deepseek-ai/dsh-tools";
import { WorkflowRetentionError } from "#internet/workflow/retention";
export const WORKFLOW_MAINTENANCE_OPERATIONS = ["preview", "cleanup"];
/** Explicit operator-facing workflow retention surface. No automatic deletion is performed. */
export function defineInternetWorkflowMaintenanceTool(manager) {
    return defineTool({
        name: "internet_workflow_maintenance",
        description: "Preview retention-eligible terminal workflow jobs or explicitly clean one exact unchanged job. Cleanup is never automatic.",
        parameters: {
            operation: {
                type: "string",
                required: true,
                enum: [...WORKFLOW_MAINTENANCE_OPERATIONS],
                description: "Maintenance operation.",
            },
            jobId: { type: "string", description: "Exact workflow job ID for cleanup." },
            expectedUpdatedAt: {
                type: "string",
                description: "Exact updatedAt returned by preview. Cleanup fails if the job changed afterward.",
            },
        },
        output: {
            schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    ok: { type: "boolean", required: true },
                    operation: { type: "string", required: true },
                    eligibleCount: { type: "number" },
                    candidates: { type: "string" },
                    jobId: { type: "string" },
                    auditId: { type: "string" },
                    status: { type: "string" },
                    deletedHandoffFiles: { type: "number" },
                    completedAt: { type: "string" },
                    message: { type: "string" },
                },
            },
            render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
            presentationMeta: (_args, value) => value,
        },
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            const operation = args.operation;
            try {
                if (operation === "preview") {
                    const candidates = manager.preview();
                    return {
                        ok: true,
                        operation,
                        eligibleCount: candidates.length,
                        candidates: candidates
                            .map((item) => `${item.jobId} state=${item.state} updatedAt=${item.updatedAt} eligibleAt=${item.eligibleAt} retentionDays=${item.retentionDays} repo=${item.repository}`)
                            .join("\n"),
                    };
                }
                if (typeof args.jobId !== "string" || typeof args.expectedUpdatedAt !== "string") {
                    return { ok: false, operation, message: "cleanup requires jobId and expectedUpdatedAt from preview" };
                }
                const audit = manager.cleanup({
                    jobId: args.jobId,
                    expectedUpdatedAt: args.expectedUpdatedAt,
                    operatorSessionId: String(exec.agent?.id ?? ""),
                });
                return {
                    ok: true,
                    operation,
                    jobId: audit.jobId,
                    auditId: audit.auditId,
                    status: audit.status,
                    deletedHandoffFiles: audit.deletedHandoffFiles,
                    ...(audit.completedAt === undefined ? {} : { completedAt: audit.completedAt }),
                };
            }
            catch (error) {
                if (error instanceof WorkflowRetentionError)
                    return { ok: false, operation, message: error.message };
                return { ok: false, operation, message: error instanceof Error ? error.message : String(error) };
            }
        },
        presentCall: (args) => ({
            card: "generic",
            title: `internet_workflow_maintenance ${String(args.operation)}`,
            kind: "other",
        }),
    });
}
//# sourceMappingURL=internet-workflow-maintenance.js.map