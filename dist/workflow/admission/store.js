import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import { parseWorkflowAdmissionRecord } from "#internet/workflow/admission/validation";
export class WorkflowAdmissionStoreError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowAdmissionStoreError";
    }
}
function assertAdmissionId(admissionId) {
    if (!/^[0-9a-f]{32}$/u.test(admissionId)) {
        throw new WorkflowAdmissionStoreError("workflow admission id must be 32 lowercase hex characters");
    }
}
function assertPrivateFile(path, label) {
    const stat = lstatSync(path);
    if (!stat.isFile())
        throw new WorkflowAdmissionStoreError(`${label} is not a regular file`);
    if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
        throw new WorkflowAdmissionStoreError(`${label} permissions must be 0600`);
    }
}
export class WorkflowAdmissionStore {
    constructor(dataDir) {
        this.admissionsDir = join(dataDir, "workflows", "admissions");
    }
    pathFor(admissionId) {
        assertAdmissionId(admissionId);
        return join(this.admissionsDir, `${admissionId}.json`);
    }
    create(record) {
        parseWorkflowAdmissionRecord(record);
        const path = this.pathFor(record.admissionId);
        if (existsSync(path))
            throw new WorkflowAdmissionStoreError(`workflow admission ${record.admissionId} already exists`);
        ensurePrivateDirectory(this.admissionsDir);
        writePrivateJson(path, record);
        return record;
    }
    get(admissionId) {
        const path = this.pathFor(admissionId);
        if (!existsSync(path))
            return undefined;
        assertPrivateFile(path, `workflow admission ${admissionId}`);
        try {
            return parseWorkflowAdmissionRecord(JSON.parse(readFileSync(path, "utf8")));
        }
        catch (error) {
            throw new WorkflowAdmissionStoreError(`workflow admission ${admissionId} is invalid: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    list() {
        if (!existsSync(this.admissionsDir))
            return [];
        if (!lstatSync(this.admissionsDir).isDirectory()) {
            throw new WorkflowAdmissionStoreError("workflow admissions path is not a directory");
        }
        return readdirSync(this.admissionsDir)
            .filter((name) => /^[0-9a-f]{32}\.json$/u.test(name))
            .sort()
            .map((name) => {
            const record = this.get(name.slice(0, -5));
            if (record === undefined) {
                throw new WorkflowAdmissionStoreError(`workflow admission ${name} disappeared during enumeration`);
            }
            return record;
        });
    }
    update(admissionId, expectedRevision, mutate) {
        const current = this.get(admissionId);
        if (current === undefined)
            throw new WorkflowAdmissionStoreError(`workflow admission ${admissionId} does not exist`);
        if (current.revision !== expectedRevision) {
            throw new WorkflowAdmissionStoreError(`workflow admission ${admissionId} revision conflict: expected ${expectedRevision}, current ${current.revision}`);
        }
        const next = mutate(current);
        if (next.admissionId !== current.admissionId)
            throw new WorkflowAdmissionStoreError("workflow admission id cannot change");
        if (next.revision !== current.revision + 1) {
            throw new WorkflowAdmissionStoreError("workflow admission revision must increment by one");
        }
        parseWorkflowAdmissionRecord(next);
        writePrivateJson(this.pathFor(admissionId), next);
        return next;
    }
}
//# sourceMappingURL=store.js.map