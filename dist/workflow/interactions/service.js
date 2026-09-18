import { hashCanonicalJson } from "#internet/core/canonical-json";
import { assertWorkflowPrincipal } from "#internet/workflow/authorization";
import { workflowResponseProvenanceAllowed } from "#internet/workflow/interactions/response-policy";
import { WORKFLOW_PENDING_ACTION_RESPONSE_SCHEMA, } from "#internet/workflow/interactions/types";
import { currentWorkflowArtifactIds } from "#internet/workflow/runtime/invalidation";
export class WorkflowInteractionServiceError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowInteractionServiceError";
    }
}
function sameSchema(left, right) {
    return left.id === right.id && left.version === right.version;
}
function sameResponse(action, caller, input) {
    const resolution = action.resolution;
    return (resolution !== undefined &&
        resolution.requestId === input.requestId &&
        resolution.principal.kind === caller.kind &&
        resolution.principal.id === caller.id &&
        resolution.provenance === input.provenance &&
        sameSchema(resolution.responseSchema, input.responseSchema) &&
        resolution.payloadHash === hashCanonicalJson(input.payload));
}
export class WorkflowInteractionService {
    constructor(dependencies) {
        this.dependencies = dependencies;
        this.now = dependencies.now ?? Date.now;
    }
    signals(context, runId) {
        const run = this.requireAuthorizedRun(context, runId);
        return this.dependencies.signals.list(run.runId);
    }
    signal(context, input) {
        const run = this.requireAuthorizedRun(context, input.runId);
        if (run.revision !== input.expectedRunRevision) {
            throw new WorkflowInteractionServiceError(`workflow run ${run.runId} revision conflict: expected ${input.expectedRunRevision}, current ${run.revision}`);
        }
        if (!this.dependencies.authority.authorizeSignal(run.runId, run.owner, context.principal, input.provenance, input.signalType)) {
            throw new WorkflowInteractionServiceError("workflow external signal caller/provenance is not authorized");
        }
        this.dependencies.schemas.validate(input.payloadSchema, input.payload);
        const signal = this.dependencies.signals.create(input, context.principal, this.now);
        this.dependencies.onSignal?.(signal);
        return signal;
    }
    list(context, runId) {
        const run = this.requireAuthorizedRun(context, runId);
        return this.dependencies.actions.list(run.runId);
    }
    get(context, runId, actionId) {
        const run = this.requireAuthorizedRun(context, runId);
        const action = this.dependencies.actions.get(run.runId, actionId);
        if (action === undefined)
            throw new WorkflowInteractionServiceError(`workflow PendingAction ${actionId} does not exist`);
        return action;
    }
    respond(context, input) {
        const run = this.requireAuthorizedRun(context, input.runId);
        const action = this.dependencies.actions.get(input.runId, input.actionId);
        if (action === undefined) {
            throw new WorkflowInteractionServiceError(`workflow PendingAction ${input.actionId} does not exist`);
        }
        if (action.state === "RESOLVED") {
            if (sameResponse(action, context.principal, input)) {
                this.dependencies.onResolved?.(action);
                return action;
            }
            throw new WorkflowInteractionServiceError(`workflow PendingAction ${input.actionId} is already resolved with a different response`);
        }
        if (action.state !== "PENDING") {
            throw new WorkflowInteractionServiceError(`workflow PendingAction ${input.actionId} is stale (${action.state})`);
        }
        if (action.revision !== input.expectedRevision) {
            throw new WorkflowInteractionServiceError(`workflow PendingAction ${input.actionId} revision conflict: expected ${input.expectedRevision}, current ${action.revision}`);
        }
        if (!sameSchema(action.responseSchema, input.responseSchema)) {
            throw new WorkflowInteractionServiceError("workflow PendingAction response schema does not match action contract");
        }
        if (!workflowResponseProvenanceAllowed(action.responderPolicy, input.provenance)) {
            throw new WorkflowInteractionServiceError(`workflow PendingAction ${input.actionId} responder provenance does not satisfy ${action.responderPolicy}`);
        }
        if (!this.dependencies.authority.authorizeResponse(run.runId, run.owner, context.principal, input.provenance)) {
            throw new WorkflowInteractionServiceError("workflow PendingAction caller/provenance is not authorized");
        }
        this.dependencies.schemas.validate(input.responseSchema, input.payload);
        if (!this.actionContextIsCurrent(action)) {
            this.dependencies.actions.update(run.runId, action.actionId, action.revision, (current) => ({
                ...current,
                revision: current.revision + 1,
                state: "SUPERSEDED",
                updatedAt: new Date(this.now()).toISOString(),
            }));
            throw new WorkflowInteractionServiceError(`workflow PendingAction ${input.actionId} exact context is stale`);
        }
        const at = new Date(this.now()).toISOString();
        const resolved = this.dependencies.actions.update(run.runId, action.actionId, action.revision, (current) => ({
            ...current,
            revision: current.revision + 1,
            state: "RESOLVED",
            resolution: {
                schema: WORKFLOW_PENDING_ACTION_RESPONSE_SCHEMA,
                version: 1,
                requestId: input.requestId,
                principal: context.principal,
                provenance: input.provenance,
                responseSchema: input.responseSchema,
                payload: input.payload,
                payloadHash: hashCanonicalJson(input.payload),
                respondedAt: at,
            },
            updatedAt: at,
        }));
        this.dependencies.onResolved?.(resolved);
        return resolved;
    }
    supersedeStale(runId) {
        const superseded = [];
        for (const action of this.dependencies.actions.list(runId)) {
            if (action.state !== "PENDING" || this.actionContextIsCurrent(action))
                continue;
            superseded.push(this.dependencies.actions.update(runId, action.actionId, action.revision, (current) => ({
                ...current,
                revision: current.revision + 1,
                state: "SUPERSEDED",
                updatedAt: new Date(this.now()).toISOString(),
            })));
        }
        return superseded;
    }
    actionContextIsCurrent(action) {
        const artifacts = this.dependencies.artifacts.list(action.runId);
        const current = currentWorkflowArtifactIds(artifacts, this.dependencies.inputBundles.list(action.runId));
        if (action.artifactBindings.some((ref) => ref.runId !== action.runId || !current.has(ref.artifactId))) {
            return false;
        }
        return action.subjectBindings.every((binding) => this.dependencies.subjects.isCurrent(action.runId, binding.subject.kind, binding.subject.id, binding.version));
    }
    requireAuthorizedRun(context, runId) {
        assertWorkflowPrincipal(context.principal);
        const run = this.dependencies.runs.get(runId);
        if (run === undefined)
            throw new WorkflowInteractionServiceError(`workflow run ${runId} does not exist`);
        if (!this.dependencies.authority.canAccess(runId, run.owner, context.principal)) {
            throw new WorkflowInteractionServiceError(`workflow run ${runId} is not authorized for this caller`);
        }
        return run;
    }
}
//# sourceMappingURL=service.js.map