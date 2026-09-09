import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkflowEngine } from "#internet/workflow/engine";
import { DshWorkflowEventSink, formatWorkflowEvent, type WorkflowEventSink } from "#internet/workflow/events";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowEventRecord, WorkflowJob } from "#internet/workflow/types";

function minimalJob(): WorkflowJob {
	const engine = new WorkflowEngine(new WorkflowJobStore(mkdtempSync(join(tmpdir(), "internet-events-job-"))));
	return engine.start({
		objective: "test objective",
		repository: "https://github.com/example/repo",
		baseRevision: "0123456789abcdef0123456789abcdef01234567",
		ownerSessionId: "local-agent",
	});
}

describe("workflow Local events", () => {
	it("injects compact PROGRESS context and suppresses INTERNAL events", () => {
		const injected: unknown[] = [];
		const sink = new DshWorkflowEventSink({
			get(id) {
				expect(id).toBe("local-agent");
				return {
					inject(message) {
						injected.push(message);
					},
				};
			},
		});
		const job = minimalJob();
		const internal: WorkflowEventRecord = { type: "TEAM_COMPLETED", class: "INTERNAL", at: new Date().toISOString() };
		sink.publish(job, internal);
		expect(injected).toEqual([]);
		const progress: WorkflowEventRecord = {
			type: "PR_OPENED",
			class: "PROGRESS",
			at: new Date().toISOString(),
			message: "https://github.com/example/repo/pull/7",
		};
		sink.publish(job, progress);
		expect(injected).toHaveLength(1);
		const text = (injected[0] as { content: [{ text: string }] }).content[0].text;
		expect(text).toContain("event=PR_OPENED");
		expect(text).toContain("state=CREATED");
		expect(text).not.toContain("finalAnswer");
	});

	it("formats only control-plane job facts", () => {
		const text = formatWorkflowEvent(minimalJob(), {
			type: "WRITER_BLOCKED",
			class: "ACTION_REQUIRED",
			at: new Date().toISOString(),
			message: "needs user action",
		});
		expect(text).not.toContain("pending_action=");
		expect(text).not.toContain("test objective");
		expect(text).toContain("needs user action");
	});

	it("does not fabricate an event for a mutation that leaves lastEvent unchanged", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-events-engine-"));
		const seen: Array<{ job: string; event: string; klass: string }> = [];
		const events: WorkflowEventSink = {
			publish(job, event) {
				seen.push({ job: job.jobId, event: event.type, klass: event.class });
			},
		};
		const engine = new WorkflowEngine(
			new WorkflowJobStore(root),
			undefined,
			undefined,
			undefined,
			undefined,
			3,
			events,
		);
		const job = engine.start({
			objective: "x",
			repository: "https://github.com/example/repo",
			baseRevision: "0123456789abcdef0123456789abcdef01234567",
			ownerSessionId: "local-agent",
		});
		engine.cancel(job.jobId);
		expect(seen).toEqual([]);
	});

	it("publishes an ACTION_REQUIRED engine event without exposing team output", async () => {
		const root = mkdtempSync(join(tmpdir(), "internet-events-research-"));
		const seen: WorkflowEventRecord[] = [];
		const teams = {
			async run() {
				return {
					ok: false as const,
					error: "provider unavailable",
					failedAccountId: "chatgpt-thinker" as const,
					failedProvider: "chatgpt-web" as const,
				};
			},
		};
		const events: WorkflowEventSink = {
			publish(_job, event) {
				seen.push(event);
			},
		};
		const engine = new WorkflowEngine(new WorkflowJobStore(root), teams, undefined, undefined, undefined, 3, events);
		const job = engine.start({
			objective: "secret team objective",
			repository: "https://github.com/example/repo",
			baseRevision: "0123456789abcdef0123456789abcdef01234567",
			ownerSessionId: "local-agent",
		});
		const result = await engine.runResearch(job.jobId);
		expect(result.state).toBe("FAILED_RETRYABLE");
		expect(seen.some((event) => event.type === "RESEARCH_RETRY_REQUIRED" && event.class === "ACTION_REQUIRED")).toBe(
			true,
		);
		expect(JSON.stringify(seen)).not.toContain("secret team objective");
	});

	it("keeps committed workflow state when an event sink throws", async () => {
		const root = mkdtempSync(join(tmpdir(), "internet-events-throwing-"));
		const teams = {
			async run() {
				return {
					ok: false as const,
					error: "provider unavailable",
					failedAccountId: "chatgpt-thinker" as const,
					failedProvider: "chatgpt-web" as const,
				};
			},
		};
		const events: WorkflowEventSink = {
			publish() {
				throw new Error("notification transport failed");
			},
		};
		const engine = new WorkflowEngine(new WorkflowJobStore(root), teams, undefined, undefined, undefined, 3, events);
		const job = engine.start({
			objective: "x",
			repository: "https://github.com/example/repo",
			baseRevision: "0123456789abcdef0123456789abcdef01234567",
			ownerSessionId: "local-agent",
		});
		const result = await engine.runResearch(job.jobId);
		expect(result.state).toBe("FAILED_RETRYABLE");
		expect(engine.status(job.jobId).state).toBe("FAILED_RETRYABLE");
	});
});
