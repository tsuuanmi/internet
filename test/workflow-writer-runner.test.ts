import { describe, expect, it } from "vitest";
import { WorkflowConfirmationError } from "#internet/workflow/approval-policy";
import { createWorkflowControlMessage } from "#internet/workflow/control";
import type { WorkflowJob } from "#internet/workflow/types";
import { BrowserWorkflowWriterRunner, type WorkflowWriterBrowser } from "#internet/workflow/writer-runner";

const jobId = "0123456789abcdef0123456789abcdef";
const writerSessionId = `agent:workflow:${jobId}:writer`;

function job(): WorkflowJob {
	const timestamp = "2026-09-08T00:00:00.000Z";
	return {
		schema: "@tsuuanmi/internet-workflow-job",
		version: 2,
		revision: 1,
		jobId,
		ownerSessionId: "agent",
		objective: "Fix the race.",
		repository: "https://github.com/example/repo",
		baseRevision: "0123456789abcdef0123456789abcdef01234567",
		graph: {
			schema: "@tsuuanmi/internet-workflow-graph",
			version: 1,
			graphRevision: 0,
			eventSeq: 0,
			phase: "WRITER",
			lifecycle: "RUNNING",
			nodes: {},
		},
		accountRouting: {
			thinkerAccounts: ["chatgpt-thinker", "chatgpt-thinker-2"],
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
			authority: "IMPLEMENTATION",
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

	it("makes START_IMPLEMENTATION PR creation retry-safe by exact workflow branch", async () => {
		let prompt = "";
		const browser: WorkflowWriterBrowser = {
			async chat(_accountId, request) {
				prompt = request.prompt;
				return {
					text: '{"status":"PR_OPEN","repository":"example/repo","number":7,"url":"https://github.com/example/repo/pull/7","base":"main","head":"internet-workflow/0123456789abcdef0123456789abcdef","headSha":"abcdef0123456789abcdef0123456789abcdef01"}',
				};
			},
		};
		await new BrowserWorkflowWriterRunner(browser).runControl({
			sessionId: writerSessionId,
			job: job(),
			control: createWorkflowControlMessage("START_IMPLEMENTATION", jobId),
		});
		expect(prompt).toContain("Required base branch: main");
		expect(prompt).toContain("Required base revision");
		expect(prompt).toContain("Reconcile GitHub by the exact workflow branch");
		expect(prompt).toContain("Reuse exactly one matching open PR");
		expect(prompt).toContain("Never create a second workflow PR");
	});
});
