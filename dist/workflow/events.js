import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
export class WorkflowEventJournal {
    constructor(dataDir) {
        this.root = join(dataDir, "workflows", "events");
    }
    append(job, event) {
        const entry = {
            schema: "@tsuuanmi/internet-workflow-event",
            version: 1,
            jobId: job.jobId,
            eventSeq: job.graph.eventSeq,
            graphRevision: job.graph.graphRevision,
            ...event,
        };
        const directory = join(this.root, job.jobId);
        const path = join(directory, `${String(entry.eventSeq).padStart(12, "0")}.json`);
        if (existsSync(path)) {
            const current = parseWorkflowGraphEvent(JSON.parse(readFileSync(path, "utf8")));
            if (JSON.stringify(current) !== JSON.stringify(entry))
                throw new Error(`workflow event sequence ${entry.eventSeq} already exists with different content`);
            return current;
        }
        ensurePrivateDirectory(directory);
        writePrivateJson(path, entry);
        return entry;
    }
    list(jobId, limit = 20) {
        const directory = join(this.root, jobId);
        if (!existsSync(directory))
            return [];
        if (!lstatSync(directory).isDirectory())
            throw new Error(`workflow event path for ${jobId} is not a directory`);
        const names = readdirSync(directory)
            .filter((name) => /^\d{12}\.json$/u.test(name))
            .sort()
            .slice(-Math.max(0, limit));
        return names.map((name) => parseWorkflowGraphEvent(JSON.parse(readFileSync(join(directory, name), "utf8"))));
    }
}
export function parseWorkflowGraphEvent(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error("invalid workflow event");
    const event = value;
    if (event.schema !== "@tsuuanmi/internet-workflow-event" || event.version !== 1)
        throw new Error("unsupported workflow event schema");
    if (typeof event.jobId !== "string" || !/^[0-9a-f]{32}$/u.test(event.jobId))
        throw new Error("invalid workflow event job id");
    if (typeof event.eventSeq !== "number" || !Number.isSafeInteger(event.eventSeq) || event.eventSeq < 1)
        throw new Error("invalid workflow event sequence");
    if (typeof event.graphRevision !== "number" || !Number.isSafeInteger(event.graphRevision) || event.graphRevision < 0)
        throw new Error("invalid workflow event graph revision");
    if (typeof event.type !== "string" || typeof event.at !== "string" || !Number.isFinite(Date.parse(event.at)))
        throw new Error("invalid workflow event fields");
    if (!["INTERNAL", "PROGRESS", "ACTION_REQUIRED"].includes(String(event.class)))
        throw new Error("invalid workflow event class");
    return value;
}
export function formatWorkflowEvent(job, event) {
    const lines = [
        "[internet workflow event]",
        `job=${job.jobId}`,
        `class=${event.class}`,
        `event=${event.type}`,
        `phase=${job.graph.phase}`,
        `lifecycle=${job.graph.lifecycle}`,
        `repository=${job.repository}`,
        `review_cycle=${job.reviewCycle}`,
    ];
    if (event.nodeId !== undefined)
        lines.push(`node=${event.nodeId}`);
    if (event.executionId !== undefined)
        lines.push(`execution=${event.executionId}`);
    if (job.pullRequest !== undefined)
        lines.push(`pr=${job.pullRequest.url}`, `head_sha=${job.pullRequest.headSha}`);
    if (job.writerConversation.url !== undefined)
        lines.push(`writer_chat=${job.writerConversation.url}`);
    if (job.pendingAction !== undefined)
        lines.push(`pending_action=${job.pendingAction.kind}`);
    if (event.message !== undefined && event.message.trim() !== "")
        lines.push(`message=${event.message}`);
    if (job.graph.lifecycle === "COMPLETED" && job.pullRequest !== undefined) {
        lines.push("handoff=Open the Writer chat for optional changes or merge. Review coverage ends at head_sha.");
    }
    lines.push("This compact control-plane event intentionally excludes research and review payloads.");
    return lines.join("\n");
}
export class DshWorkflowEventSink {
    constructor(agents) {
        this.agents = agents;
    }
    publish(job, event) {
        if (event.class === "INTERNAL")
            return;
        const agent = this.agents.get(job.ownerSessionId);
        if (agent === undefined)
            return;
        try {
            agent.inject({
                content: [{ type: "text", text: formatWorkflowEvent(job, event) }],
                source: { kind: "plugin", plugin: "internet" },
            });
        }
        catch {
            // Local disposal never changes workflow correctness.
        }
    }
}
//# sourceMappingURL=events.js.map