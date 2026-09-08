import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
export const HANDOFF_SCHEMA = "@tsuuanmi/internet-workflow-handoff";
export class WorkflowHandoffStoreError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowHandoffStoreError";
    }
}
export function hashHandoffPayload(payload) {
    return createHash("sha256").update(payload, "utf8").digest("hex");
}
function deterministicHandoffId(input) {
    return createHash("sha256")
        .update(`${input.jobId}\0${input.source}\0${input.recipient}\0${String(input.sequence)}`, "utf8")
        .digest("hex");
}
function assertHex(value, length, name) {
    if (!new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value)) {
        throw new WorkflowHandoffStoreError(`${name} must be ${String(length)} lowercase hex characters`);
    }
}
function assertInput(input) {
    assertHex(input.jobId, 32, "workflow job id");
    if (input.source.trim() === "")
        throw new WorkflowHandoffStoreError("handoff source is required");
    if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) {
        throw new WorkflowHandoffStoreError("handoff sequence must be a positive integer");
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function parseWorkflowHandoff(value) {
    if (!isRecord(value) || value.schema !== HANDOFF_SCHEMA || value.version !== 1) {
        throw new Error("unsupported handoff schema");
    }
    if (typeof value.handoffId !== "string" || !/^[0-9a-f]{64}$/u.test(value.handoffId))
        throw new Error("invalid handoff id");
    if (typeof value.jobId !== "string" || !/^[0-9a-f]{32}$/u.test(value.jobId))
        throw new Error("invalid job id");
    if (typeof value.source !== "string" || value.source.trim() === "")
        throw new Error("invalid handoff source");
    if (typeof value.recipient !== "string")
        throw new Error("invalid handoff recipient");
    if (typeof value.sequence !== "number" || !Number.isSafeInteger(value.sequence) || value.sequence < 1) {
        throw new Error("invalid handoff sequence");
    }
    if (typeof value.payload !== "string")
        throw new Error("invalid handoff payload");
    if (typeof value.payloadHash !== "string" || !/^[0-9a-f]{64}$/u.test(value.payloadHash))
        throw new Error("invalid payload hash");
    if (hashHandoffPayload(value.payload) !== value.payloadHash)
        throw new Error("handoff payload hash mismatch");
    if (value.status !== "pending" && value.status !== "delivered")
        throw new Error("invalid handoff status");
    if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)))
        throw new Error("invalid createdAt");
    if (value.deliveredAt !== undefined &&
        (typeof value.deliveredAt !== "string" || !Number.isFinite(Date.parse(value.deliveredAt)))) {
        throw new Error("invalid deliveredAt");
    }
    return value;
}
/** Private durable store for exact model-to-model data-plane messages. */
export class WorkflowHandoffStore {
    constructor(dataDir) {
        this.root = join(dataDir, "workflows", "handoffs");
    }
    jobDir(jobId) {
        assertHex(jobId, 32, "workflow job id");
        return join(this.root, jobId);
    }
    pathFor(jobId, handoffId) {
        assertHex(handoffId, 64, "workflow handoff id");
        return join(this.jobDir(jobId), `${handoffId}.json`);
    }
    create(input) {
        assertInput(input);
        const handoffId = deterministicHandoffId(input);
        const payloadHash = hashHandoffPayload(input.payload);
        const path = this.pathFor(input.jobId, handoffId);
        if (existsSync(path)) {
            const current = this.get(input.jobId, handoffId);
            if (current === undefined ||
                current.source !== input.source ||
                current.recipient !== input.recipient ||
                current.sequence !== input.sequence ||
                current.payloadHash !== payloadHash ||
                current.payload !== input.payload) {
                throw new WorkflowHandoffStoreError(`handoff ${handoffId} already exists with different content`);
            }
            return current;
        }
        const handoff = {
            schema: HANDOFF_SCHEMA,
            version: 1,
            handoffId,
            jobId: input.jobId,
            source: input.source,
            recipient: input.recipient,
            sequence: input.sequence,
            payload: input.payload,
            payloadHash,
            status: "pending",
            createdAt: new Date().toISOString(),
        };
        ensurePrivateDirectory(this.root);
        ensurePrivateDirectory(this.jobDir(input.jobId));
        writePrivateJson(path, handoff);
        return handoff;
    }
    get(jobId, handoffId) {
        const path = this.pathFor(jobId, handoffId);
        if (!existsSync(path))
            return undefined;
        const stat = lstatSync(path);
        if (!stat.isFile())
            throw new WorkflowHandoffStoreError(`handoff ${handoffId} is not a regular file`);
        if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
            throw new WorkflowHandoffStoreError(`handoff ${handoffId} permissions must be 0600`);
        }
        try {
            return parseWorkflowHandoff(JSON.parse(readFileSync(path, "utf8")));
        }
        catch (error) {
            throw new WorkflowHandoffStoreError(`handoff ${handoffId} is invalid: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    markDelivered(jobId, handoffId, expectedPayloadHash) {
        assertHex(expectedPayloadHash, 64, "expected payload hash");
        const current = this.get(jobId, handoffId);
        if (current === undefined)
            throw new WorkflowHandoffStoreError(`handoff ${handoffId} does not exist`);
        if (current.payloadHash !== expectedPayloadHash)
            throw new WorkflowHandoffStoreError("handoff delivery hash mismatch");
        if (current.status === "delivered")
            return current;
        const next = { ...current, status: "delivered", deliveredAt: new Date().toISOString() };
        writePrivateJson(this.pathFor(jobId, handoffId), next);
        return next;
    }
}
//# sourceMappingURL=handoff-store.js.map