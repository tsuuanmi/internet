export function parseWorkflowTeamSessionId(sessionId) {
    const match = /:workflow:([0-9a-f]{32}):(research|review):([AB])$/u.exec(sessionId);
    if (match === null)
        throw new Error("workflow team session identity is invalid");
    return {
        jobId: match[1],
        phase: match[2],
        lane: match[3],
    };
}
function progressMessage(observation, event) {
    const fields = [
        `${observation.context.phase}:${observation.context.lane}`,
        `attempt=${observation.attempt}`,
        ...(event.round === undefined ? [] : [`round=${event.round}`]),
        `account=${event.accountId}`,
        `stage=${event.stage}`,
        `status=${event.status}`,
    ];
    if (event.kind !== undefined)
        fields.push(`kind=${event.kind}`);
    if (event.message !== undefined && event.message.trim() !== "")
        fields.push(`message=${event.message}`);
    return fields.join(" ");
}
/** Persist team traces first, then emit compact best-effort Local progress notifications. */
export class DurableWorkflowTeamObserver {
    constructor(traces, jobs, events) {
        this.traces = traces;
        this.jobs = jobs;
        this.events = events;
    }
    begin(sessionId) {
        const context = parseWorkflowTeamSessionId(sessionId);
        const attempt = this.traces.begin(context.jobId, context.phase, context.lane, new Date().toISOString());
        return { context, attempt };
    }
    record(observation, event) {
        this.traces.append(observation.context.jobId, {
            phase: observation.context.phase,
            lane: observation.context.lane,
            attempt: observation.attempt,
            ...event,
        });
        this.publish(observation, event);
    }
    complete(observation, at) {
        this.traces.append(observation.context.jobId, {
            phase: observation.context.phase,
            lane: observation.context.lane,
            attempt: observation.attempt,
            at,
            stage: "team",
            status: "completed",
        });
    }
    fail(observation, event) {
        this.traces.append(observation.context.jobId, {
            phase: observation.context.phase,
            lane: observation.context.lane,
            attempt: observation.attempt,
            ...event,
            stage: "team",
            status: "failed",
        });
    }
    publish(observation, event) {
        if (this.events === undefined)
            return;
        const job = this.jobs.get(observation.context.jobId);
        if (job === undefined)
            return;
        try {
            this.events.publish(job, {
                type: "TEAM_PROGRESS",
                class: "PROGRESS",
                at: event.at,
                message: progressMessage(observation, event),
            });
        }
        catch {
            // Notification delivery is not workflow correctness.
        }
    }
}
//# sourceMappingURL=team-observer.js.map