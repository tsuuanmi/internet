import { defineTool } from "@deepseek-ai/dsh-tools";
import { ACCOUNT_IDS } from "#internet/core/accounts";
import { sleep } from "#internet/core/sleep";
import { workflowSessionAuthorizationContext, } from "#internet/workflow/authorization";
import { createResearchAdmissionDraft } from "#internet/workflow/profiles/research/admission";
import { createSoftwareAdmissionDraft } from "#internet/workflow/profiles/software-admission";
import { resolveWorkflowRepository, WorkflowRepositoryError } from "#internet/workflow/repository-context";
import { WorkflowServiceError } from "#internet/workflow/service";
export const WORKFLOW_OPERATIONS = ["admit", "confirm", "activate", "test", "status", "cancel", "continue"];
const CONFIRMATION_PROVENANCE = ["local_interpreted", "user_explicit"];
const DEFAULT_TEST_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_TEST_POLL_MS = 1_000;
function graphSummary(job) {
    const counts = new Map();
    for (const node of Object.values(job.graph.nodes))
        counts.set(node.state, (counts.get(node.state) ?? 0) + 1);
    return [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([state, count]) => `${state}:${count}`)
        .join(", ");
}
function handoffSummary(job) {
    return job.handoffReceipts
        .map((item) => `${item.source}->${item.recipient}:${item.status}:${item.payloadHash}`)
        .join(", ");
}
function project(job) {
    return {
        jobId: job.jobId,
        phase: job.graph.phase,
        lifecycle: job.graph.lifecycle,
        repository: job.repository,
        baseRevision: job.baseRevision,
        graph: graphSummary(job),
        handoffs: handoffSummary(job),
        reviewCycle: job.reviewCycle,
        ...(job.lastEvent === undefined
            ? {}
            : {
                lastEventClass: job.lastEvent.class,
                lastEventType: job.lastEvent.type,
                lastEventMessage: job.lastEvent.message,
            }),
        ...(job.pullRequest === undefined
            ? {}
            : {
                prNumber: job.pullRequest.number,
                prUrl: job.pullRequest.url,
                prHeadSha: job.pullRequest.headSha,
            }),
        ...(job.writerConversation.url === undefined ? {} : { writerChatUrl: job.writerConversation.url }),
        ...(job.pendingAction === undefined
            ? {}
            : {
                pendingAction: job.pendingAction.kind,
                pendingMessage: job.pendingAction.message,
            }),
        updatedAt: job.updatedAt,
    };
}
function activationProject(resource) {
    if (resource.kind === "workflow_job")
        return project(resource.job);
    return {
        runId: resource.run.runId,
        lifecycle: resource.run.lifecycle,
        profile: resource.run.definitions.profile.id,
        updatedAt: resource.run.updatedAt,
    };
}
function admissionProject(record) {
    return {
        admissionId: record.admissionId,
        admissionState: record.state,
        admissionRevision: record.revision,
        draftHash: record.draftHash,
        ...(record.acceptedSpecHash === undefined ? {} : { acceptedSpecHash: record.acceptedSpecHash }),
        ...(record.preview === undefined
            ? {}
            : {
                confirmationLevel: record.preview.confirmation.level,
                confirmationReasons: record.preview.confirmation.reasons
                    .map((reason) => `${reason.field}: ${reason.reason}`)
                    .join("; "),
            }),
    };
}
function workflowTestObjective(marker) {
    return [
        "Run the repository workflow acceptance test with the smallest possible real change.",
        "Create or update docs/.workflow-smoke so its entire UTF-8 contents are exactly:",
        `workflow-acceptance=${marker}`,
        "Change only docs/.workflow-smoke.",
        "Do not modify runtime code, dependencies, configuration, tests, or any other documentation.",
        "Open exactly one pull request for this change and never merge it as part of the workflow.",
    ].join("\n");
}
function testFailure(job, message) {
    return { ok: false, operation: "test", result: "FAIL", ...project(job), message };
}
function completedHandoffIsExact(job) {
    return (job.graph.lifecycle === "COMPLETED" &&
        job.graph.phase === "DONE" &&
        job.pullRequest !== undefined &&
        job.writerConversation.url !== undefined &&
        job.reviewCycle > 0);
}
function acceptedTestAdmission(service, authorization, draft) {
    const admitted = service.admit(authorization, draft);
    if (admitted.state === "ACCEPTED")
        return admitted;
    if (admitted.state !== "AWAITING_CONFIRMATION" || admitted.preview?.confirmation.level !== "LOCAL_CONFIRM") {
        throw new WorkflowServiceError(`workflow acceptance admission ${admitted.admissionId} did not reach a locally confirmable state`);
    }
    return service.confirmAdmission(authorization, admitted.admissionId, admitted.revision, {
        expectedDraftHash: admitted.draftHash,
        provenance: "local_interpreted",
    });
}
async function runAcceptanceTest(service, dependencies, exec) {
    if (dependencies.browser === undefined) {
        return {
            ok: false,
            operation: "test",
            result: "FAIL",
            message: "workflow test requires browser account status access",
        };
    }
    const agent = exec.agent;
    const cwd = agent?.session?.header?.cwd;
    const ownerSessionId = String(agent?.id ?? "");
    if (typeof cwd !== "string" || cwd.trim() === "" || ownerSessionId === "") {
        return {
            ok: false,
            operation: "test",
            result: "FAIL",
            message: "workflow test requires a session working directory and owner session",
        };
    }
    const authorization = workflowSessionAuthorizationContext(ownerSessionId);
    const statuses = await Promise.all(ACCOUNT_IDS.map((accountId) => dependencies.browser.status(accountId)));
    const accountPreflight = statuses.map((status) => `${status.accountId}=${status.state}`).join(", ");
    const unavailable = statuses.filter((status) => status.state !== "ready");
    if (unavailable.length > 0) {
        return {
            ok: false,
            operation: "test",
            result: "FAIL",
            accountPreflight,
            message: `workflow test not started; required accounts are not ready: ${unavailable.map((status) => `${status.accountId}=${status.state}`).join(", ")}`,
        };
    }
    const repository = await resolveWorkflowRepository(cwd, exec.signal, dependencies.runGit, "internet_workflow test");
    const marker = `${new Date().toISOString()}-${Math.random().toString(16).slice(2, 10)}`;
    const objective = workflowTestObjective(marker);
    const accepted = acceptedTestAdmission(service, authorization, createSoftwareAdmissionDraft({
        rawSource: objective,
        sourceProvenance: "local_interpreted",
        repository: repository.url,
        baseRevision: repository.revision,
        targetProvenance: "system_observed",
        authorityProvenance: "local_interpreted",
    }));
    if (accepted.acceptedSpecHash === undefined) {
        throw new WorkflowServiceError(`workflow acceptance admission ${accepted.admissionId} has no accepted spec hash`);
    }
    const job = service.activateAdmission(authorization, accepted.admissionId, accepted.acceptedSpecHash);
    const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS;
    const pollMs = dependencies.pollMs ?? DEFAULT_TEST_POLL_MS;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (exec.signal.aborted)
            throw exec.signal.reason ?? new Error("workflow test aborted");
        const current = service.status(authorization, job.jobId);
        if (current.graph.lifecycle === "COMPLETED") {
            if (!completedHandoffIsExact(current)) {
                return testFailure(current, "workflow completed without an exact reviewed PR and Writer chat handoff");
            }
            return {
                ok: true,
                operation: "test",
                result: "PASS",
                accountPreflight,
                ...project(current),
                message: "full workflow acceptance test completed through exact-head review and Writer handoff",
            };
        }
        if (current.graph.lifecycle === "BLOCKED") {
            return testFailure(current, current.pendingAction?.message ?? "workflow acceptance test blocked");
        }
        if (current.graph.lifecycle === "CANCELLED") {
            return testFailure(current, "workflow acceptance test was cancelled");
        }
        await sleep(pollMs, exec.signal);
    }
    const current = service.status(authorization, job.jobId);
    return {
        ok: false,
        operation: "test",
        result: "TIMEOUT",
        accountPreflight,
        ...project(current),
        message: `workflow acceptance test timed out after ${timeoutMs} ms; durable job and PR were left intact for inspection`,
    };
}
export function defineInternetWorkflowTool(service, dependencies = {}) {
    return defineTool({
        name: "internet_workflow",
        description: "Admit and control durable workflows. Admission/activation are profile-aware; software_change and deep_research use the same durable control boundary. The test operation remains the software end-to-end acceptance test.",
        parameters: {
            operation: {
                type: "string",
                required: true,
                enum: [...WORKFLOW_OPERATIONS],
                description: "Workflow operation.",
            },
            admissionId: { type: "string", description: "Durable workflow admission ID." },
            admissionRevision: { type: "number", description: "Expected admission revision for confirmation." },
            draftHash: { type: "string", description: "Expected admission draft hash for confirmation." },
            acceptedSpecHash: { type: "string", description: "Exact accepted admission spec hash for activation." },
            confirmationProvenance: {
                type: "string",
                enum: [...CONFIRMATION_PROVENANCE],
                description: "Authority provenance for confirm. Use user_explicit only for an explicit User confirmation.",
            },
            jobId: { type: "string", description: "32-character workflow job ID for runtime control operations." },
            objective: { type: "string", description: "Local-Agent interpretation/source for admission." },
            profile: {
                type: "string",
                enum: ["software_change", "deep_research"],
                description: "Workflow profile for admission. Defaults to software_change.",
            },
            repository: { type: "string", description: "Repository URL for software admission." },
            baseRevision: { type: "string", description: "Full 40-character Git SHA for software admission." },
        },
        output: {
            schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    ok: { type: "boolean", required: true },
                    operation: { type: "string", required: true },
                    result: { type: "string", enum: ["PASS", "FAIL", "TIMEOUT"] },
                    accountPreflight: { type: "string" },
                    admissionId: { type: "string" },
                    admissionState: { type: "string" },
                    admissionRevision: { type: "number" },
                    draftHash: { type: "string" },
                    acceptedSpecHash: { type: "string" },
                    confirmationLevel: { type: "string" },
                    confirmationReasons: { type: "string" },
                    jobId: { type: "string" },
                    runId: { type: "string" },
                    profile: { type: "string" },
                    phase: { type: "string" },
                    lifecycle: { type: "string" },
                    repository: { type: "string" },
                    baseRevision: { type: "string" },
                    graph: { type: "string" },
                    handoffs: { type: "string" },
                    reviewCycle: { type: "number" },
                    lastEventClass: { type: "string" },
                    lastEventType: { type: "string" },
                    lastEventMessage: { type: "string" },
                    prNumber: { type: "number" },
                    prUrl: { type: "string" },
                    prHeadSha: { type: "string" },
                    writerChatUrl: { type: "string" },
                    pendingAction: { type: "string" },
                    pendingMessage: { type: "string" },
                    updatedAt: { type: "string" },
                    message: { type: "string" },
                },
            },
            render: (_args, value) => {
                const result = value;
                const summary = [`ok=${String(result.ok)}`, `operation=${String(result.operation)}`];
                if (result.result !== undefined)
                    summary.push(`result=${String(result.result)}`);
                if (result.admissionId !== undefined)
                    summary.push(`admission=${String(result.admissionId)}`);
                if (result.admissionState !== undefined)
                    summary.push(`admission_state=${String(result.admissionState)}`);
                if (result.jobId !== undefined)
                    summary.push(`job=${String(result.jobId)}`);
                if (result.runId !== undefined)
                    summary.push(`run=${String(result.runId)}`);
                if (result.profile !== undefined)
                    summary.push(`profile=${String(result.profile)}`);
                if (result.phase !== undefined)
                    summary.push(`phase=${String(result.phase)}`);
                if (result.lifecycle !== undefined)
                    summary.push(`status=${String(result.lifecycle)}`);
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
                if (operation === "test")
                    return await runAcceptanceTest(service, dependencies, exec);
                const authorization = workflowSessionAuthorizationContext(String(exec.agent?.id ?? ""));
                if (operation === "admit") {
                    if (typeof args.objective !== "string") {
                        return { ok: false, operation, message: "admit requires objective" };
                    }
                    const profile = args.profile === "deep_research" || args.profile === "software_change"
                        ? args.profile
                        : (dependencies.defaultProfile ?? "software_change");
                    const draft = profile === "deep_research"
                        ? createResearchAdmissionDraft({
                            rawSource: args.objective,
                            sourceProvenance: "local_interpreted",
                        })
                        : typeof args.repository === "string" && typeof args.baseRevision === "string"
                            ? createSoftwareAdmissionDraft({
                                rawSource: args.objective,
                                sourceProvenance: "local_interpreted",
                                repository: args.repository,
                                baseRevision: args.baseRevision,
                                targetProvenance: "local_interpreted",
                                authorityProvenance: "local_interpreted",
                            })
                            : undefined;
                    if (draft === undefined) {
                        return {
                            ok: false,
                            operation,
                            message: "software_change admit requires repository and baseRevision",
                        };
                    }
                    const admitted = service.admit(authorization, draft);
                    return { ok: true, operation, ...admissionProject(admitted) };
                }
                if (operation === "confirm") {
                    if (typeof args.admissionId !== "string" ||
                        typeof args.admissionRevision !== "number" ||
                        typeof args.draftHash !== "string" ||
                        !CONFIRMATION_PROVENANCE.includes(args.confirmationProvenance)) {
                        return {
                            ok: false,
                            operation,
                            message: "confirm requires admissionId, admissionRevision, draftHash, and confirmationProvenance",
                        };
                    }
                    const confirmed = service.confirmAdmission(authorization, args.admissionId, args.admissionRevision, {
                        expectedDraftHash: args.draftHash,
                        provenance: args.confirmationProvenance,
                    });
                    return { ok: true, operation, ...admissionProject(confirmed) };
                }
                if (operation === "activate") {
                    if (typeof args.admissionId !== "string" || typeof args.acceptedSpecHash !== "string") {
                        return { ok: false, operation, message: "activate requires admissionId and acceptedSpecHash" };
                    }
                    const resource = service.activateAdmissionTarget(authorization, args.admissionId, args.acceptedSpecHash);
                    return { ok: true, operation, ...activationProject(resource) };
                }
                if (typeof args.jobId !== "string")
                    return { ok: false, operation, message: `${operation} requires jobId` };
                if (operation === "status") {
                    return { ok: true, operation, ...activationProject(service.targetStatus(authorization, args.jobId)) };
                }
                if (operation === "cancel") {
                    return {
                        ok: true,
                        operation,
                        ...activationProject(await service.cancelTarget(authorization, args.jobId)),
                    };
                }
                const job = service.continue(authorization, args.jobId);
                return { ok: true, operation, ...project(job) };
            }
            catch (error) {
                if (error instanceof WorkflowRepositoryError || error instanceof WorkflowServiceError) {
                    return { ok: false, operation, message: error.message };
                }
                return { ok: false, operation, message: error instanceof Error ? error.message : String(error) };
            }
        },
        presentCall: (args) => ({ card: "generic", title: `internet_workflow ${String(args.operation)}`, kind: "other" }),
    });
}
//# sourceMappingURL=internet-workflow.js.map