import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
export const WORKFLOW_TEAM_TRACE_SCHEMA = "@tsuuanmi/internet-workflow-team-trace";
export const MAX_WORKFLOW_TEAM_TRACE_EVENTS = 400;
export const MAX_WORKFLOW_TEAM_TRACE_TEXT_CHARS = 12_000;
export class WorkflowTeamTraceStoreError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowTeamTraceStoreError";
    }
}
function assertJobId(jobId) {
    if (!/^[0-9a-f]{32}$/u.test(jobId))
        throw new WorkflowTeamTraceStoreError("workflow trace job id must be 32 lowercase hex characters");
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseRecord(value, jobId) {
    if (!isRecord(value) ||
        value.schema !== WORKFLOW_TEAM_TRACE_SCHEMA ||
        value.version !== 1 ||
        value.jobId !== jobId) {
        throw new WorkflowTeamTraceStoreError(`workflow team trace ${jobId} has an invalid schema`);
    }
    if (typeof value.truncated !== "boolean" || !Array.isArray(value.events)) {
        throw new WorkflowTeamTraceStoreError(`workflow team trace ${jobId} has invalid contents`);
    }
    return value;
}
function boundedText(text) {
    if (text === undefined)
        return {};
    const chars = Array.from(text);
    if (chars.length <= MAX_WORKFLOW_TEAM_TRACE_TEXT_CHARS)
        return { text };
    return { text: chars.slice(-MAX_WORKFLOW_TEAM_TRACE_TEXT_CHARS).join(""), textTruncated: "prefix" };
}
/** Durable bounded per-job team execution evidence, separate from compact workflow job state. */
export class WorkflowTeamTraceStore {
    constructor(dataDir) {
        this.traceDir = join(dataDir, "workflows", "team-traces");
    }
    pathFor(jobId) {
        assertJobId(jobId);
        return join(this.traceDir, `${jobId}.json`);
    }
    list(jobId) {
        return this.read(jobId).events;
    }
    begin(jobId, phase, lane, at) {
        const current = this.read(jobId);
        const attempt = current.events.reduce((max, event) => event.phase === phase && event.lane === lane && event.stage === "team" && event.status === "started"
            ? Math.max(max, event.attempt)
            : max, 0) + 1;
        this.append(jobId, { phase, lane, attempt, at, stage: "team", status: "started" });
        return attempt;
    }
    append(jobId, event) {
        const current = this.read(jobId);
        const normalized = { ...event, ...boundedText(event.text) };
        const combined = [...current.events, normalized];
        const overflow = Math.max(0, combined.length - MAX_WORKFLOW_TEAM_TRACE_EVENTS);
        const next = {
            schema: WORKFLOW_TEAM_TRACE_SCHEMA,
            version: 1,
            jobId,
            truncated: current.truncated || overflow > 0,
            events: overflow === 0 ? combined : combined.slice(overflow),
        };
        ensurePrivateDirectory(this.traceDir);
        writePrivateJson(this.pathFor(jobId), next);
    }
    read(jobId) {
        const path = this.pathFor(jobId);
        if (!existsSync(path)) {
            return { schema: WORKFLOW_TEAM_TRACE_SCHEMA, version: 1, jobId, truncated: false, events: [] };
        }
        const stat = lstatSync(path);
        if (!stat.isFile())
            throw new WorkflowTeamTraceStoreError(`workflow team trace ${jobId} is not a regular file`);
        if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
            throw new WorkflowTeamTraceStoreError(`workflow team trace ${jobId} permissions must be 0600`);
        }
        try {
            return parseRecord(JSON.parse(readFileSync(path, "utf8")), jobId);
        }
        catch (error) {
            if (error instanceof WorkflowTeamTraceStoreError)
                throw error;
            throw new WorkflowTeamTraceStoreError(`workflow team trace ${jobId} is invalid: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
//# sourceMappingURL=team-trace-store.js.map