import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import { normalizeArtifactLineage, workflowArtifactId, workflowArtifactPayloadHash, } from "#internet/workflow/kernel/identity";
import { WORKFLOW_ARTIFACT_SCHEMA, } from "#internet/workflow/kernel/types";
import { parseWorkflowArtifact } from "#internet/workflow/kernel/validation";
export class WorkflowArtifactStoreError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowArtifactStoreError";
    }
}
function assertHex(value, length, label) {
    if (!new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value)) {
        throw new WorkflowArtifactStoreError(`${label} must be ${String(length)} lowercase hex characters`);
    }
}
function assertPrivateFile(path, label) {
    const stat = lstatSync(path);
    if (!stat.isFile())
        throw new WorkflowArtifactStoreError(`${label} is not a regular file`);
    if (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
        throw new WorkflowArtifactStoreError(`${label} permissions must be 0600`);
}
export class WorkflowArtifactStore {
    constructor(dataDir) {
        this.root = join(dataDir, "workflows", "artifacts");
    }
    runDir(runId) {
        assertHex(runId, 32, "workflow run id");
        return join(this.root, runId);
    }
    pathFor(runId, artifactId) {
        assertHex(artifactId, 64, "workflow artifact id");
        return join(this.runDir(runId), `${artifactId}.json`);
    }
    create(input) {
        const lineage = normalizeArtifactLineage(input.lineage ?? []);
        const payloadHash = workflowArtifactPayloadHash(input.payload);
        const artifactId = workflowArtifactId({
            runId: input.runId,
            type: input.type,
            schemaRef: input.schemaRef,
            producer: input.producer,
            inputBundleId: input.inputBundleId,
            lineage,
            payloadHash,
        });
        const path = this.pathFor(input.runId, artifactId);
        if (existsSync(path)) {
            const current = this.get(input.runId, artifactId);
            if (current === undefined)
                throw new WorkflowArtifactStoreError(`workflow artifact ${artifactId} disappeared`);
            return current;
        }
        const artifact = {
            schema: WORKFLOW_ARTIFACT_SCHEMA,
            version: 1,
            artifactId,
            runId: input.runId,
            type: input.type,
            schemaRef: input.schemaRef,
            producer: input.producer,
            inputBundleId: input.inputBundleId,
            lineage,
            payload: input.payload,
            payloadHash,
            createdAt: new Date().toISOString(),
        };
        parseWorkflowArtifact(artifact);
        ensurePrivateDirectory(this.runDir(input.runId));
        writePrivateJson(path, artifact);
        return artifact;
    }
    get(runId, artifactId) {
        const path = this.pathFor(runId, artifactId);
        if (!existsSync(path))
            return undefined;
        assertPrivateFile(path, `workflow artifact ${artifactId}`);
        try {
            return parseWorkflowArtifact(JSON.parse(readFileSync(path, "utf8")));
        }
        catch (error) {
            throw new WorkflowArtifactStoreError(`workflow artifact ${artifactId} is invalid: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    list(runId) {
        const directory = this.runDir(runId);
        if (!existsSync(directory))
            return [];
        if (!lstatSync(directory).isDirectory())
            throw new WorkflowArtifactStoreError(`workflow artifacts path for run ${runId} is not a directory`);
        return readdirSync(directory)
            .filter((name) => /^[0-9a-f]{64}\.json$/u.test(name))
            .sort()
            .map((name) => {
            const artifact = this.get(runId, name.slice(0, -5));
            if (artifact === undefined)
                throw new WorkflowArtifactStoreError(`workflow artifact ${name} disappeared during enumeration`);
            return artifact;
        });
    }
}
//# sourceMappingURL=artifact-store.js.map