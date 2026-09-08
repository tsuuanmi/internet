import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowHandoffStore } from "#internet/workflow/handoff-store";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
import { parseWorkflowWriterResult, type WorkflowWriterRunner } from "#internet/workflow/writer-runner";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function setup(writer: WorkflowWriterRunner) {
	const root = mkdtempSync(join(tmpdir(), "internet-workflow-writer-"));
	roots.push(root);
	const team: WorkflowTeamRunner = {
		async run(request) {
			const lane = request.sessionId.endsWith(":A") ? "A" : "B";
			return {
				ok: true,
				finalAnswer: `${lane} exact\n\n  research ✅\n`,
				finalAccountId: "chatgpt-thinker",
				finalProvider: "chatgpt-web",
			};
		},
	};
	const engine = new WorkflowEngine(
		new WorkflowJobStore(root),
		team,
		new WorkflowTeamPromptBuilder(),
		new WorkflowHandoffStore(root),
		writer,
	);
	const job = engine.start({
		objective: "Fix the race.",
		repository: "https://github.com/example/repo",
		baseRevision: "0123456789abcdef0123456789abcdef01234567",
		ownerSessionId: "agent-7",
	});
	return { engine, job };
}

describe("workflow writer path", () => {
	it("delivers Research A/B verbatim to one persistent writer lane before START_IMPLEMENTATION", async () => {
		const delivered: Array<{ sessionId: string; payload: string }> = [];
		const controls: string[] = [];
		const writer: WorkflowWriterRunner = {
			async deliverExact(request) {
				delivered.push({ sessionId: request.sessionId, payload: request.payload });
			},
			async runControl(request) {
				controls.push(request.control.kind);
				return {
					status: "PR_OPEN",
					pullRequest: {
						repository: "example/repo",
						number: 42,
						url: "https://github.com/example/repo/pull/42",
						base: "main",
						head: "workflow/fix-race",
						headSha: "abcdef0123456789abcdef0123456789abcdef01",
					},
				};
			},
		};
		const { engine, job } = setup(writer);
		await engine.runResearch(job.jobId);
		const completed = await engine.runWriterImplementation(job.jobId);
		expect(delivered).toEqual([
			{ sessionId: `agent-7:workflow:${job.jobId}:writer`, payload: "A exact\n\n  research ✅\n" },
			{ sessionId: `agent-7:workflow:${job.jobId}:writer`, payload: "B exact\n\n  research ✅\n" },
		]);
		expect(controls).toEqual(["START_IMPLEMENTATION"]);
		expect(completed.state).toBe("PR_OPEN");
		expect(completed.pullRequest).toMatchObject({ number: 42, headSha: "abcdef0123456789abcdef0123456789abcdef01" });
		expect(completed.handoffReceipts.every((receipt) => receipt.status === "delivered")).toBe(true);
	});

	it("retries writer control on the same conversation without redelivering acknowledged handoffs", async () => {
		const delivered: string[] = [];
		let controls = 0;
		const writer: WorkflowWriterRunner = {
			async deliverExact(request) {
				delivered.push(request.payload);
			},
			async runControl() {
				controls += 1;
				if (controls === 1) throw new Error("temporary writer failure");
				return {
					status: "PR_OPEN",
					pullRequest: {
						repository: "example/repo",
						number: 43,
						url: "https://github.com/example/repo/pull/43",
						base: "main",
						head: "workflow/fix-race",
						headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
					},
				};
			},
		};
		const { engine, job } = setup(writer);
		await engine.runResearch(job.jobId);
		await expect(engine.runWriterImplementation(job.jobId)).rejects.toThrow(/temporary writer failure/u);
		expect(engine.status(job.jobId).state).toBe("WRITER_RUNNING");
		const completed = await engine.runWriterImplementation(job.jobId);
		expect(delivered).toEqual(["A exact\n\n  research ✅\n", "B exact\n\n  research ✅\n"]);
		expect(controls).toBe(2);
		expect(completed.state).toBe("PR_OPEN");
	});

	it("persists writer BLOCKED instead of fabricating a PR receipt", async () => {
		const writer: WorkflowWriterRunner = {
			async deliverExact() {},
			async runControl() {
				return { status: "BLOCKED", message: "Base revision no longer matches." };
			},
		};
		const { engine, job } = setup(writer);
		await engine.runResearch(job.jobId);
		const blocked = await engine.runWriterImplementation(job.jobId);
		expect(blocked.state).toBe("BLOCKED");
		expect(blocked.pullRequest).toBeUndefined();
		expect(blocked.pendingAction).toEqual({ kind: "WRITER_BLOCKED", message: "Base revision no longer matches." });
	});
});

describe("parseWorkflowWriterResult", () => {
	it("accepts one strict PR receipt JSON object", () => {
		expect(
			parseWorkflowWriterResult(
				'{"status":"PR_OPEN","repository":"example/repo","number":7,"url":"https://github.com/example/repo/pull/7","base":"main","head":"workflow/x","headSha":"abcdef0123456789abcdef0123456789abcdef01"}',
			),
		).toMatchObject({ status: "PR_OPEN", pullRequest: { number: 7 } });
	});

	it("rejects prose-wrapped or malformed writer receipts", () => {
		expect(() => parseWorkflowWriterResult('Done {"status":"BLOCKED","message":"x"}')).toThrow(/required JSON/u);
		expect(() => parseWorkflowWriterResult('{"status":"PR_OPEN"}')).toThrow();
	});
});
