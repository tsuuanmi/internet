import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, hashCanonicalJson } from "#internet/core/canonical-json";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import { WORKFLOW_EXTERNAL_SIGNAL_SCHEMA, } from "#internet/workflow/interactions/types";
export class WorkflowExternalSignalStoreError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowExternalSignalStoreError";
    }
}
function assertHex(value, length, label) {
    if (!new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value)) {
        throw new WorkflowExternalSignalStoreError(`${label} must be ${String(length)} lowercase hex characters`);
    }
}
function assertPrivateFile(path, label) {
    const stat = lstatSync(path);
    if (!stat.isFile())
        throw new WorkflowExternalSignalStoreError(`${label} is not a regular file`);
    if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
        throw new WorkflowExternalSignalStoreError(`${label} permissions must be 0600`);
    }
}
function parse(value) {
    if (typeof value !== "object" ||
        value === null ||
        Array.isArray(value) ||
        value.schema !== WORKFLOW_EXTERNAL_SIGNAL_SCHEMA ||
        value.version !== 1) {
        throw new WorkflowExternalSignalStoreError("unsupported workflow external signal schema");
    }
    const signal = value;
    assertHex(signal.signalId, 32, "workflow external signal id");
    assertHex(signal.runId, 32, "workflow external signal run id");
    if (signal.requestId.trim() === "" || signal.signalType.trim() === "") {
        throw new WorkflowExternalSignalStoreError("workflow external signal identity is invalid");
    }
    if (!Number.isSafeInteger(signal.expectedRunRevision) || signal.expectedRunRevision < 1) {
        throw new WorkflowExternalSignalStoreError("workflow external signal expected revision is invalid");
    }
    if (signal.payloadHash !== hashCanonicalJson(signal.payload)) {
        throw new WorkflowExternalSignalStoreError("workflow external signal payload hash mismatch");
    }
    if (!Number.isFinite(Date.parse(signal.createdAt))) {
        throw new WorkflowExternalSignalStoreError("workflow external signal timestamp is invalid");
    }
    return signal;
}
export class WorkflowExternalSignalStore {
    constructor(dataDir) {
        this.root = join(dataDir, "workflows", "external-signals");
    }
    runDir(runId) {
        assertHex(runId, 32, "workflow run id");
        return join(this.root, runId);
    }
    pathFor(runId, signalId) {
        assertHex(signalId, 32, "workflow external signal id");
        return join(this.runDir(runId), `${signalId}.json`);
    }
    create(input, principal, now = Date.now) {
        const signalId = hashCanonicalJson({
            runId: input.runId,
            requestId: input.requestId,
            principal,
            signalType: input.signalType,
        }).slice(0, 32);
        const existing = this.get(input.runId, signalId);
        const next = {
            schema: WORKFLOW_EXTERNAL_SIGNAL_SCHEMA,
            version: 1,
            signalId,
            runId: input.runId,
            requestId: input.requestId,
            principal,
            provenance: input.provenance,
            signalType: input.signalType,
            payloadSchema: input.payloadSchema,
            payload: input.payload,
            payloadHash: hashCanonicalJson(input.payload),
            expectedRunRevision: input.expectedRunRevision,
            createdAt: new Date(now()).toISOString(),
        };
        if (existing !== undefined) {
            if (canonicalJson({
                ...existing,
                createdAt: next.createdAt,
            }) !== canonicalJson(next)) {
                throw new WorkflowExternalSignalStoreError(`workflow external signal request ${input.requestId} was replayed with conflicting content`);
            }
            return existing;
        }
        parse(next);
        ensurePrivateDirectory(this.runDir(input.runId));
        writePrivateJson(this.pathFor(input.runId, signalId), next);
        return next;
    }
    get(runId, signalId) {
        const path = this.pathFor(runId, signalId);
        if (!existsSync(path))
            return undefined;
        assertPrivateFile(path, `workflow external signal ${signalId}`);
        try {
            return parse(JSON.parse(readFileSync(path, "utf8")));
        }
        catch (error) {
            throw new WorkflowExternalSignalStoreError(`workflow external signal ${signalId} is invalid: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    list(runId) {
        const directory = this.runDir(runId);
        if (!existsSync(directory))
            return [];
        if (!lstatSync(directory).isDirectory()) {
            throw new WorkflowExternalSignalStoreError(`workflow external signals path for run ${runId} is not a directory`);
        }
        return readdirSync(directory)
            .filter((name) => /^[0-9a-f]{32}\.json$/u.test(name))
            .sort()
            .map((name) => {
            const signal = this.get(runId, name.slice(0, -5));
            if (signal === undefined) {
                throw new WorkflowExternalSignalStoreError(`workflow external signal ${name} disappeared during enumeration`);
            }
            return signal;
        });
    }
}
//# sourceMappingURL=signal-store.js.map