import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, hashCanonicalJson } from "#internet/core/canonical-json";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import { WORKFLOW_TIMER_SCHEMA, } from "#internet/workflow/awaitables/types";
import { parseWorkflowTimer } from "#internet/workflow/awaitables/validation";
export class WorkflowTimerStoreError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowTimerStoreError";
    }
}
function assertHex(value, length, label) {
    if (!new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value)) {
        throw new WorkflowTimerStoreError(`${label} must be ${String(length)} lowercase hex characters`);
    }
}
function assertPrivateFile(path, label) {
    const stat = lstatSync(path);
    if (!stat.isFile())
        throw new WorkflowTimerStoreError(`${label} is not a regular file`);
    if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
        throw new WorkflowTimerStoreError(`${label} permissions must be 0600`);
    }
}
function sameContract(timer, causedBy, contract) {
    return (timer.causedBy.runId === causedBy.runId &&
        timer.causedBy.artifactId === causedBy.artifactId &&
        timer.timerType === contract.timerType &&
        timer.deadline === contract.deadline);
}
export class WorkflowTimerStore {
    constructor(dataDir) {
        this.root = join(dataDir, "workflows", "timers");
    }
    runDir(runId) {
        assertHex(runId, 32, "workflow run id");
        return join(this.root, runId);
    }
    pathFor(runId, timerId) {
        assertHex(timerId, 32, "workflow Timer id");
        return join(this.runDir(runId), `${timerId}.json`);
    }
    ensure(runId, causedBy, contract, now = Date.now) {
        if (causedBy.runId !== runId)
            throw new WorkflowTimerStoreError("workflow Timer cause must belong to the same run");
        if (!Number.isFinite(Date.parse(contract.deadline)))
            throw new WorkflowTimerStoreError("workflow Timer deadline is invalid");
        const conflicting = this.list(runId).find((timer) => timer.causedBy.artifactId === causedBy.artifactId && !sameContract(timer, causedBy, contract));
        if (conflicting !== undefined) {
            throw new WorkflowTimerStoreError(`workflow Need ${causedBy.artifactId} already owns Timer ${conflicting.timerId} with a different contract`);
        }
        const timerId = hashCanonicalJson({ runId, causedBy, contract }).slice(0, 32);
        const existing = this.get(runId, timerId);
        if (existing !== undefined)
            return existing;
        const at = new Date(now()).toISOString();
        const timer = {
            schema: WORKFLOW_TIMER_SCHEMA,
            version: 1,
            revision: 1,
            timerId,
            runId,
            causedBy,
            timerType: contract.timerType,
            deadline: contract.deadline,
            state: "PENDING",
            createdAt: at,
            updatedAt: at,
        };
        parseWorkflowTimer(timer);
        ensurePrivateDirectory(this.runDir(runId));
        writePrivateJson(this.pathFor(runId, timerId), timer);
        return timer;
    }
    get(runId, timerId) {
        const path = this.pathFor(runId, timerId);
        if (!existsSync(path))
            return undefined;
        assertPrivateFile(path, `workflow Timer ${timerId}`);
        try {
            return parseWorkflowTimer(JSON.parse(readFileSync(path, "utf8")));
        }
        catch (error) {
            throw new WorkflowTimerStoreError(`workflow Timer ${timerId} is invalid: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    list(runId) {
        const directory = this.runDir(runId);
        if (!existsSync(directory))
            return [];
        if (!lstatSync(directory).isDirectory())
            throw new WorkflowTimerStoreError("workflow Timer path is not a directory");
        return readdirSync(directory)
            .filter((name) => /^[0-9a-f]{32}\.json$/u.test(name))
            .sort()
            .map((name) => {
            const timer = this.get(runId, name.slice(0, -5));
            if (timer === undefined)
                throw new WorkflowTimerStoreError(`workflow Timer ${name} disappeared`);
            return timer;
        });
    }
    listAll() {
        if (!existsSync(this.root))
            return [];
        if (!lstatSync(this.root).isDirectory())
            throw new WorkflowTimerStoreError("workflow Timer root is not a directory");
        return readdirSync(this.root)
            .filter((name) => /^[0-9a-f]{32}$/u.test(name))
            .sort()
            .flatMap((runId) => this.list(runId));
    }
    update(runId, timerId, expectedRevision, mutate) {
        const current = this.get(runId, timerId);
        if (current === undefined)
            throw new WorkflowTimerStoreError(`workflow Timer ${timerId} does not exist`);
        if (current.revision !== expectedRevision) {
            throw new WorkflowTimerStoreError(`workflow Timer ${timerId} revision conflict: expected ${expectedRevision}, current ${current.revision}`);
        }
        const next = mutate(current);
        if (next.runId !== current.runId ||
            next.timerId !== current.timerId ||
            canonicalJson(next.causedBy) !== canonicalJson(current.causedBy) ||
            next.timerType !== current.timerType ||
            next.deadline !== current.deadline ||
            next.createdAt !== current.createdAt) {
            throw new WorkflowTimerStoreError("workflow Timer identity cannot change");
        }
        if (next.revision !== current.revision + 1) {
            throw new WorkflowTimerStoreError("workflow Timer revision must increment by one");
        }
        if (current.state !== "PENDING")
            throw new WorkflowTimerStoreError("terminal workflow Timer cannot change");
        parseWorkflowTimer(next);
        writePrivateJson(this.pathFor(runId, timerId), next);
        return next;
    }
    cancelPendingExcept(runId, activeNeedArtifactIds, now = Date.now) {
        const cancelled = [];
        const at = new Date(now()).toISOString();
        for (const timer of this.list(runId)) {
            if (timer.state !== "PENDING" || activeNeedArtifactIds.has(timer.causedBy.artifactId))
                continue;
            cancelled.push(this.update(runId, timer.timerId, timer.revision, (current) => ({
                ...current,
                revision: current.revision + 1,
                state: "CANCELLED",
                updatedAt: at,
            })));
        }
        return cancelled;
    }
    reconcile(runId, now = Date.now) {
        const fired = [];
        const atMs = now();
        const at = new Date(atMs).toISOString();
        for (const timer of this.list(runId)) {
            if (timer.state !== "PENDING" || Date.parse(timer.deadline) > atMs)
                continue;
            fired.push(this.update(runId, timer.timerId, timer.revision, (current) => ({
                ...current,
                revision: current.revision + 1,
                state: "FIRED",
                firedAt: at,
                updatedAt: at,
            })));
        }
        return fired;
    }
}
//# sourceMappingURL=timer-store.js.map