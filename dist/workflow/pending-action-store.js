import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, hashCanonicalJson } from "#internet/core/canonical-json";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import { WORKFLOW_PENDING_ACTION_SCHEMA, } from "#internet/workflow/interactions/types";
import { parseWorkflowPendingAction } from "#internet/workflow/interactions/validation";
export class WorkflowPendingActionStoreError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowPendingActionStoreError";
    }
}
const TRANSITIONS = {
    PENDING: ["RESOLVED", "REJECTED", "EXPIRED", "CANCELLED", "SUPERSEDED"],
    RESOLVED: [],
    REJECTED: [],
    EXPIRED: [],
    CANCELLED: [],
    SUPERSEDED: [],
};
function assertHex(value, length, label) {
    if (!new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value)) {
        throw new WorkflowPendingActionStoreError(`${label} must be ${String(length)} lowercase hex characters`);
    }
}
function assertPrivateFile(path, label) {
    const stat = lstatSync(path);
    if (!stat.isFile())
        throw new WorkflowPendingActionStoreError(`${label} is not a regular file`);
    if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
        throw new WorkflowPendingActionStoreError(`${label} permissions must be 0600`);
    }
}
function uniqueEntities(values) {
    const byKey = new Map();
    for (const value of values)
        byKey.set(`${value.kind}:${value.id}`, value);
    return [...byKey.values()].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}
function normalizedContract(input) {
    const artifactBindings = new Map([
        { runId: input.run.runId, artifactId: input.needArtifact.artifactId },
        ...(input.contract.artifactBindings ?? []),
    ].map((ref) => [`${ref.runId}:${ref.artifactId}`, ref]));
    return {
        actionType: input.contract.actionType,
        prompt: input.need.question,
        responderPolicy: input.contract.responderPolicy,
        responseSchema: input.contract.responseSchema,
        authorityRequirement: input.contract.authorityRequirement,
        blockingScope: uniqueEntities(input.contract.blockingScope),
        artifactBindings: [...artifactBindings.values()].sort((a, b) => `${a.runId}:${a.artifactId}`.localeCompare(`${b.runId}:${b.artifactId}`)),
        subjectBindings: [...(input.contract.subjectBindings ?? [])].sort((a, b) => `${a.subject.kind}:${a.subject.id}`.localeCompare(`${b.subject.kind}:${b.subject.id}`)),
        deadline: input.contract.deadline,
        timeoutPolicy: input.contract.timeoutPolicy ?? "WAIT_INDEFINITELY",
    };
}
function contractOf(action) {
    return {
        actionType: action.actionType,
        prompt: action.prompt,
        responderPolicy: action.responderPolicy,
        responseSchema: action.responseSchema,
        authorityRequirement: action.authorityRequirement,
        blockingScope: action.blockingScope,
        artifactBindings: action.artifactBindings,
        subjectBindings: action.subjectBindings,
        deadline: action.deadline,
        timeoutPolicy: action.timeoutPolicy,
    };
}
export class WorkflowPendingActionStore {
    constructor(dataDir) {
        this.root = join(dataDir, "workflows", "pending-actions");
    }
    runDir(runId) {
        assertHex(runId, 32, "workflow run id");
        return join(this.root, runId);
    }
    pathFor(runId, actionId) {
        assertHex(actionId, 32, "workflow PendingAction id");
        return join(this.runDir(runId), `${actionId}.json`);
    }
    ensure(input) {
        if (input.needArtifact.runId !== input.run.runId) {
            throw new WorkflowPendingActionStoreError("workflow PendingAction Need artifact run mismatch");
        }
        const contract = normalizedContract(input);
        const matching = this.list(input.run.runId).filter((action) => action.causedBy.artifactId === input.needArtifact.artifactId &&
            action.actionType === input.contract.actionType);
        const current = matching.at(-1);
        if (current !== undefined &&
            (current.state === "PENDING" || current.state === "RESOLVED" || current.state === "REJECTED")) {
            if (canonicalJson(contractOf(current)) !== canonicalJson(contract)) {
                throw new WorkflowPendingActionStoreError(`workflow PendingAction contract changed for ${current.actionId} without superseding its cause`);
            }
            return current;
        }
        const generation = matching.length + 1;
        const actionId = hashCanonicalJson({
            runId: input.run.runId,
            causedBy: input.needArtifact.artifactId,
            requestOwner: input.need.requestOwner,
            contract,
            generation,
        }).slice(0, 32);
        const existing = this.get(input.run.runId, actionId);
        if (existing !== undefined)
            return existing;
        const at = new Date((input.now ?? Date.now)()).toISOString();
        const action = {
            schema: WORKFLOW_PENDING_ACTION_SCHEMA,
            version: 1,
            revision: 1,
            actionId,
            runId: input.run.runId,
            causedBy: { runId: input.run.runId, artifactId: input.needArtifact.artifactId },
            requestOwner: input.need.requestOwner,
            actionType: contract.actionType,
            prompt: contract.prompt,
            responderPolicy: contract.responderPolicy,
            responseSchema: contract.responseSchema,
            authorityRequirement: contract.authorityRequirement,
            blockingScope: contract.blockingScope,
            artifactBindings: contract.artifactBindings,
            subjectBindings: contract.subjectBindings,
            deadline: contract.deadline,
            timeoutPolicy: contract.timeoutPolicy,
            state: "PENDING",
            createdAt: at,
            updatedAt: at,
        };
        parseWorkflowPendingAction(action);
        ensurePrivateDirectory(this.runDir(input.run.runId));
        writePrivateJson(this.pathFor(input.run.runId, actionId), action);
        return action;
    }
    get(runId, actionId) {
        const path = this.pathFor(runId, actionId);
        if (!existsSync(path))
            return undefined;
        assertPrivateFile(path, `workflow PendingAction ${actionId}`);
        try {
            return parseWorkflowPendingAction(JSON.parse(readFileSync(path, "utf8")));
        }
        catch (error) {
            throw new WorkflowPendingActionStoreError(`workflow PendingAction ${actionId} is invalid: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    hasOpen(runId, causedByArtifactId) {
        return this.list(runId).some((action) => action.causedBy.artifactId === causedByArtifactId && action.state === "PENDING");
    }
    list(runId) {
        const directory = this.runDir(runId);
        if (!existsSync(directory))
            return [];
        if (!lstatSync(directory).isDirectory()) {
            throw new WorkflowPendingActionStoreError(`workflow PendingActions path for run ${runId} is not a directory`);
        }
        return readdirSync(directory)
            .filter((name) => /^[0-9a-f]{32}\.json$/u.test(name))
            .sort()
            .map((name) => {
            const action = this.get(runId, name.slice(0, -5));
            if (action === undefined) {
                throw new WorkflowPendingActionStoreError(`workflow PendingAction ${name} disappeared during enumeration`);
            }
            return action;
        });
    }
    update(runId, actionId, expectedRevision, mutate) {
        const current = this.get(runId, actionId);
        if (current === undefined)
            throw new WorkflowPendingActionStoreError(`workflow PendingAction ${actionId} does not exist`);
        if (current.revision !== expectedRevision) {
            throw new WorkflowPendingActionStoreError(`workflow PendingAction ${actionId} revision conflict: expected ${expectedRevision}, current ${current.revision}`);
        }
        const next = mutate(current);
        for (const [label, before, after] of [
            ["run id", current.runId, next.runId],
            ["action id", current.actionId, next.actionId],
            ["creation timestamp", current.createdAt, next.createdAt],
        ]) {
            if (before !== after)
                throw new WorkflowPendingActionStoreError(`workflow PendingAction ${label} cannot change`);
        }
        for (const [label, before, after] of [
            ["cause", current.causedBy, next.causedBy],
            ["request owner", current.requestOwner, next.requestOwner],
            ["contract", contractOf(current), contractOf(next)],
        ]) {
            if (canonicalJson(before) !== canonicalJson(after)) {
                throw new WorkflowPendingActionStoreError(`workflow PendingAction ${label} cannot change`);
            }
        }
        if (current.state !== next.state && !TRANSITIONS[current.state].includes(next.state)) {
            throw new WorkflowPendingActionStoreError(`invalid workflow PendingAction state transition ${current.state} -> ${next.state}`);
        }
        if (next.revision !== current.revision + 1) {
            throw new WorkflowPendingActionStoreError("workflow PendingAction revision must increment by one");
        }
        parseWorkflowPendingAction(next);
        writePrivateJson(this.pathFor(runId, actionId), next);
        return next;
    }
}
//# sourceMappingURL=pending-action-store.js.map