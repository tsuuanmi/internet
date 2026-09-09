import { describe, expect, it } from "vitest";
import { WorkflowConfirmationError } from "#internet/workflow/approval-policy";
import { createWorkflowControlMessage } from "#internet/workflow/control";
import type { WorkflowJob } from "#internet/workflow/types";
import { BrowserWorkflowWriterRunner, type WorkflowWriterBrowser } from "#internet/workflow/writer-runner";

const jobId = "0123456789abcdef0123456789abcdef";
const writerSessionId = `agent:workflow:${jobId}:writer`;

function job(): WorkflowJob {
	const timestamp = "2026-09-08T00:00:00.000Z";
	const run = (lane: "A" | "B", phase: "research" | "review") => ({
		lane,
		status: "pending" as const,
		attempts: 0,
		sessionId: `agent:workflow:${jobId}:${phase}:${lane}`,
	});
	return {
		schema: "@tsuuanmi/internet-workflow-job",
		version: 1,
		revision: 1,
		jobId,
		ownerSessionId: "agent",
		objective: "Fix the race.",
		repository: "https://github.com/example/repo",
		baseRevision: "0123456789abcdef0123456789abcdef01234567",
		state: "WRITER_RUNNING",
		teamRuns: {
			research: [run("A", "research"), run("B", "research")],
			review: [run("A", "review"), run("B", "review")],
		},
		accountRouting: {
			thinkerAccounts: ["chatgpt-thinker", "gemini-thinker"],
			writerAccount: "chatgpt-writer",
			synthesizerAccount: "chatgpt-thinker",
		},
		handoffReceipts: [],
		writerConversation: { sessionId: writerSessionId, accountId: "chatgpt-writer" },
		reviewCycle: 0,
		createdAt: timestamp,
		updatedAt: timestamp,
	};
}

describe("BrowserWorkflowWriterRunner", () => {
	it("passes expected approval scope without self-asserting runtime account/session", async () => {
		let observedAccount: string | undefined;
		let observedConfirmation: unknown;
		const browser: WorkflowWriterBrowser = {
			async chat(accountId, request) {
				observedAccount = accountId;
				observedConfirmation = request.confirmation;
				return {
					text: '{"status":"PR_OPEN","repository":"example/repo","number":7,"url":"https://github.com/example/repo/pull/7","base":"main","head":"internet-workflow/0123456789abcdef0123456789abcdef","headSha":"abcdef0123456789abcdef0123456789abcdef01"}',
				};
			},
		};
		const runner = new BrowserWorkflowWriterRunner(browser);
		const current = job();
		await runner.runControl({
			sessionId: writerSessionId,
			job: current,
			control: createWorkflowControlMessage("START_IMPLEMENTATION", jobId),
		});
		expect(observedAccount).toBe("chatgpt-writer");
		expect(observedConfirmation).toEqual({
			jobId,
			writerSessionId,
			repository: current.repository,
			state: "WRITER_RUNNING",
		});
		expect(observedConfirmation).not.toHaveProperty("accountId");
		expect(observedConfirmation).not.toHaveProperty("sessionId");
	});

	it("maps domain confirmation interruptions without depending on ChatGPT adapter errors", async () => {
		const current = job();
		for (const [kind, status] of [
			["unknown", "UNKNOWN_CONFIRMATION"],
			["merge-requires-user", "BLOCKED"],
		] as const) {
			const browser: WorkflowWriterBrowser = {
				async chat() {
					throw new WorkflowConfirmationError(kind, `confirmation: ${kind}`);
				},
			};
			const result = await new BrowserWorkflowWriterRunner(browser).runControl({
				sessionId: writerSessionId,
				job: current,
				control: createWorkflowControlMessage("START_IMPLEMENTATION", jobId),
			});
			expect(result).toEqual({ status, message: `confirmation: ${kind}` });
		}
	});
});
