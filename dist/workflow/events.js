export function formatWorkflowEvent(job, event) {
    const lines = [
        "[internet workflow event]",
        `job=${job.jobId}`,
        `class=${event.class}`,
        `event=${event.type}`,
        `state=${job.state}`,
        `repository=${job.repository}`,
        `review_cycle=${job.reviewCycle}`,
    ];
    if (job.pullRequest !== undefined) {
        lines.push(`pr=${job.pullRequest.url}`, `head_sha=${job.pullRequest.headSha}`);
    }
    if (job.pendingAction !== undefined)
        lines.push(`pending_action=${job.pendingAction.kind}`);
    if (event.message !== undefined && event.message.trim() !== "")
        lines.push(`message=${event.message}`);
    lines.push("This is compact workflow control-plane context. It intentionally excludes research and review payloads.");
    return lines.join("\n");
}
/** Best-effort host-native Local notification. INTERNAL events remain engine-only. */
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
            // Parent agent disposal must never change workflow correctness or state.
        }
    }
}
//# sourceMappingURL=events.js.map