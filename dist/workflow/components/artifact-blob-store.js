import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import { WorkflowComponentError } from "#internet/workflow/components/contracts";
const WORKFLOW_ARTIFACT_BLOB_SCHEMA = "@tsuuanmi/internet-workflow-artifact-blob";
function assertDigest(digest) {
    if (!/^[0-9a-f]{64}$/u.test(digest))
        throw new WorkflowComponentError("INVALID_INPUT", "workflow artifact blob digest must be 64 lowercase hex characters");
}
function digestBytes(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}
function assertPrivateFile(path) {
    const stat = lstatSync(path);
    if (!stat.isFile())
        throw new WorkflowComponentError("PERMANENT_FAILURE", "workflow artifact blob is not a regular file");
    if (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
        throw new WorkflowComponentError("PERMANENT_FAILURE", "workflow artifact blob permissions must be 0600");
}
export class LocalWorkflowArtifactBlobStore {
    constructor(dataDir) {
        this.root = join(dataDir, "workflows", "blobs");
    }
    pathFor(digest) {
        assertDigest(digest);
        return join(this.root, `${digest}.json`);
    }
    put(bytes, mediaType) {
        if (mediaType.trim() === "")
            throw new WorkflowComponentError("INVALID_INPUT", "workflow artifact blob media type is required");
        const digest = digestBytes(bytes);
        const existing = this.get(digest);
        if (existing !== undefined) {
            if (existing.mediaType !== mediaType)
                throw new WorkflowComponentError("CONFLICT", `workflow artifact blob ${digest} already exists with media type ${existing.mediaType}`);
            return { digest, size: existing.size, mediaType: existing.mediaType };
        }
        const record = {
            schema: WORKFLOW_ARTIFACT_BLOB_SCHEMA,
            version: 1,
            digest,
            size: bytes.byteLength,
            mediaType,
            data: Buffer.from(bytes).toString("base64"),
        };
        ensurePrivateDirectory(this.root);
        writePrivateJson(this.pathFor(digest), record);
        return { digest, size: record.size, mediaType: record.mediaType };
    }
    get(digest) {
        const path = this.pathFor(digest);
        if (!existsSync(path))
            return undefined;
        assertPrivateFile(path);
        let value;
        try {
            value = JSON.parse(readFileSync(path, "utf8"));
        }
        catch (error) {
            throw new WorkflowComponentError("PERMANENT_FAILURE", `workflow artifact blob ${digest} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (typeof value !== "object" || value === null)
            throw new WorkflowComponentError("PERMANENT_FAILURE", `workflow artifact blob ${digest} is invalid`);
        const record = value;
        if (record.schema !== WORKFLOW_ARTIFACT_BLOB_SCHEMA ||
            record.version !== 1 ||
            record.digest !== digest ||
            typeof record.size !== "number" ||
            !Number.isInteger(record.size) ||
            record.size < 0 ||
            typeof record.mediaType !== "string" ||
            record.mediaType.trim() === "" ||
            typeof record.data !== "string") {
            throw new WorkflowComponentError("PERMANENT_FAILURE", `workflow artifact blob ${digest} is invalid`);
        }
        const bytes = new Uint8Array(Buffer.from(record.data, "base64"));
        if (bytes.byteLength !== record.size || digestBytes(bytes) !== digest)
            throw new WorkflowComponentError("PERMANENT_FAILURE", `workflow artifact blob ${digest} digest mismatch`);
        return { digest, size: record.size, mediaType: record.mediaType, bytes };
    }
    exists(digest) {
        return existsSync(this.pathFor(digest));
    }
}
//# sourceMappingURL=artifact-blob-store.js.map