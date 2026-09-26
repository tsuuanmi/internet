import { describe, expect, it } from "vitest";
import { WorkflowConfirmationError } from "#internet/workflow/approval-policy";
import { createWorkflowControlMessage } from "#internet/workflow/control";
import type { WorkflowJob } from "#internet/workflow/types";
import {
	BrowserWorkflowWriterRunner,
	parseWorkflowWriterResult,
	type WorkflowWriterBrowser,
} from "#internet/workflow/writer-runner";

const jobId = "0123456789abcdef0123456789abcdef";
const writerSessionId = `agent:workflow:${jobId}:writer`;
const conversationUrl = "https://chatgpt.com/c/workflow-writer-test";
const policy = { hardTimeoutMs: 900_000, stallTimeoutMs: 180_000 } as const;

function job(): WorkflowJob {
	const timestamp = "2026-09-08T00:00:00.000Z";
	return {
		schema: "@tsuuanmi/internet-workflow-job",
		version: 3,
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

const prJson =
	'{"status":"PR_OPEN","repository":"example/repo","number":7,"url":"https://github.com/example/repo/pull/7","base":"main","head":"internet-workflow/0123456789abcdef0123456789abcdef","headSha":"abcdef0123456789abcdef0123456789abcdef01"}';

describe("parseWorkflowWriterResult", () => {
	it("accepts exact PR JSON and rejects presentation-prefixed output", () => {
		expect(parseWorkflowWriterResult(prJson)).toMatchObject({ status: "PR_OPEN" });
		expect(() => parseWorkflowWriterResult(`Worked for 2m 51s\n\n${prJson}`)).toThrow(
			"workflow writer did not return the required JSON result",
		);
	});
});

describe("BrowserWorkflowWriterRunner", () => {
	it("returns the persistent Writer URL and exact scoped implementation authority", async () => {
		let observedAccount: string | undefined;
		let observedRequest: Parameters<WorkflowWriterBrowser["chat"]>[1] | undefined;
		const browser: WorkflowWriterBrowser = {
			async chat(accountId, request) {
				observedAccount = accountId;
				observedRequest = request;
				return { text: prJson, url: conversationUrl };
			},
		};
		const current = job();
		const result = await new BrowserWorkflowWriterRunner(browser, policy).runControl({
			sessionId: writerSessionId,
			requestKey: "writer-request",
			job: current,
			control: createWorkflowControlMessage("START_IMPLEMENTATION", jobId),
		});
		expect(result).toMatchObject({ status: "PR_OPEN", conversationUrl });
		expect(observedAccount).toBe("chatgpt-writer");
		expect(observedRequest).toMatchObject({
			requestId: "writer-request",
			timeoutMs: policy.hardTimeoutMs,
			stallTimeoutMs: policy.stallTimeoutMs,
			responseRepresentation: "text",
			confirmation: {
				jobId,
				writerSessionId,
				repository: current.repository,
				authority: "IMPLEMENTATION",
			},
		});
		expect(observedRequest?.confirmation).not.toHaveProperty("accountId");
		expect(observedRequest?.confirmation).not.toHaveProperty("sessionId");
	});

	it("returns Writer URL when delivering exact handoffs", async () => {
		const browser: WorkflowWriterBrowser = {
			async chat() {
				return { text: "ok", url: conversationUrl };
			},
		};
		await expect(
			new BrowserWorkflowWriterRunner(browser, policy).deliverExact({
				sessionId: writerSessionId,
				requestKey: "handoff",
				payload: "review",
			}),
		).resolves.toEqual({ conversationUrl });
	});

	it("maps workflow-scoped confirmation interruptions to fail-closed output", async () => {
		const browser: WorkflowWriterBrowser = {
			async chat() {
				throw new WorkflowConfirmationError("inspect confirmation");
			},
		};
		await expect(
			new BrowserWorkflowWriterRunner(browser, policy).runControl({
				sessionId: writerSessionId,
				requestKey: "writer-confirmation",
				job: job(),
				control: createWorkflowControlMessage("START_IMPLEMENTATION", jobId),
			}),
		).resolves.toEqual({ status: "UNKNOWN_CONFIRMATION", message: "inspect confirmation" });
	});

	it("makes implementation PR creation retry-safe and explicitly forbids merge", async () => {
		let prompt = "";
		const browser: WorkflowWriterBrowser = {
			async chat(_accountId, request) {
				prompt = request.prompt;
				return { text: prJson, url: conversationUrl };
			},
		};
		await new BrowserWorkflowWriterRunner(browser, policy).runControl({
			sessionId: writerSessionId,
			requestKey: "writer-request",
			job: job(),
			control: createWorkflowControlMessage("START_IMPLEMENTATION", jobId),
		});
		expect(prompt).toContain("Required base branch: main");
		expect(prompt).toContain("Required base revision");
		expect(prompt).toContain("reconcile GitHub by the exact workflow branch");
		expect(prompt).toContain("Reuse exactly one matching open PR");
		expect(prompt).toContain("Never create a second workflow PR");
		expect(prompt).toContain("never merge");
	});
});
