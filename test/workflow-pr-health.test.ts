import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowJob, WorkflowTeamRun } from "#internet/workflow/types";
import { parseWorkflowWriterResult, type WorkflowWriterRunner } from "#internet/workflow/writer-runner";

const jobId = "0123456789abcdef0123456789abcdef";
const headSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const mergedSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const timestamp = "2026-09-09T00:00:00.000Z";

function readyJob(): WorkflowJob {
	const pending = (lane: "A" | "B", phase: "research" | "review"): WorkflowTeamRun => ({
		lane,
		status: "pending",
		attempts: 0,
		sessionId: `local:workflow:${jobId}:${phase}:${lane}`,
	});
	const review = (lane: "A" | "B"): WorkflowTeamRun => ({
		lane,
		status: "completed",
		attempts: 1,
		sessionId: `local:workflow:${jobId}:review:${lane}`,
		result: {
			finalAnswer: `review-${lane}`,
			finalAccountId: "chatgpt-thinker",
			finalProvider: "chatgpt-web",
			completedAt: timestamp,
			reviewedHeadSha: headSha,
			reviewVerdict: "PASS",
		},
	});
	return {
		schema: "@tsuuanmi/internet-workflow-job",
		version: 1,
		revision: 1,
		jobId,
		ownerSessionId: "local",
		objective: "health gate",
		repository: "https://github.com/example/repo",
		baseRevision: "0123456789abcdef0123456789abcdef01234567",
		state: "READY_FOR_MERGE_AUTHORIZATION",
		teamRuns: { research: [pending("A", "research"), pending("B", "research")], review: [review("A"), review("B")] },
		accountRouting: {
			thinkerAccounts: ["chatgpt-thinker", "gemini-thinker"],
			writerAccount: "chatgpt-writer",
			synthesizerAccount: "chatgpt-thinker",
		},
		handoffReceipts: [],
		writerConversation: { sessionId: `local:workflow:${jobId}:writer`, accountId: "chatgpt-writer" },
		pullRequest: {
			repository: "example/repo",
			number: 7,
			url: "https://github.com/example/repo/pull/7",
			base: "main",
			head: `internet-workflow/${jobId}`,
			headSha,
		},
		reviewCycle: 1,
		createdAt: timestamp,
		updatedAt: timestamp,
	};
}

function setup(writer: WorkflowWriterRunner): WorkflowEngine {
	const jobs = new WorkflowJobStore(mkdtempSync(join(tmpdir(), "internet-pr-health-")));
	jobs.create(readyJob());
	return new WorkflowEngine(jobs, undefined, undefined, undefined, writer);
}

function health(status: "PASS" | "FAIL" | "PENDING" | "NONE" | "UNKNOWN", sha = headSha) {
	return {
		status: "PR_HEALTH" as const,
		repository: "example/repo",
		number: 7,
		url: "https://github.com/example/repo/pull/7",
		headSha: sha,
		health: status,
		summary: `health=${status}`,
	};
}

describe("workflow exact-head PR health gate", () => {
	it("parses strict PR_HEALTH writer results", () => {
		expect(parseWorkflowWriterResult(JSON.stringify(health("PASS")))).toMatchObject({
			status: "PR_HEALTH",
			health: "PASS",
			headSha,
		});
		expect(() => parseWorkflowWriterResult(JSON.stringify({ ...health("PASS"), health: "MAYBE" }))).toThrow(
			/health status/u,
		);
	});

	it.each(["PASS", "NONE"] as const)("allows merge authorization after exact-head %s", async (status) => {
		const engine = setup({
			async deliverExact() {},
			async runControl() {
				return health(status);
			},
		});
		const checked = await engine.runPrHealthGate(jobId);
		expect(checked.state).toBe("READY_FOR_MERGE_AUTHORIZATION");
		expect(checked.prHealth?.status).toBe(status);
		const awaiting = engine.requestMergeAuthorization(jobId);
		expect(awaiting.state).toBe("AWAITING_MERGE_AUTHORIZATION");
		expect(awaiting.pendingAction?.message).toContain(`ci=${status.toLowerCase()}`);
	});

	it.each(["FAIL", "PENDING", "UNKNOWN"] as const)("blocks merge authorization for %s", async (status) => {
		const engine = setup({
			async deliverExact() {},
			async runControl() {
				return health(status);
			},
		});
		const blocked = await engine.runPrHealthGate(jobId);
		expect(blocked.state).toBe("BLOCKED");
		expect(blocked.pendingAction).toMatchObject({
			kind: "PR_HEALTH_REQUIRED",
			resumeState: "READY_FOR_MERGE_AUTHORIZATION",
			expectedHeadSha: headSha,
		});
		expect(blocked.prHealth?.status).toBe(status);
	});

	it("fails closed on a stale health head", async () => {
		const engine = setup({
			async deliverExact() {},
			async runControl() {
				return health("PASS", mergedSha);
			},
		});
		const blocked = await engine.runPrHealthGate(jobId);
		expect(blocked.state).toBe("BLOCKED");
		expect(blocked.mergeAuthorization).toBeUndefined();
	});

	it("re-checks health immediately before merge and invalidates authorization when it becomes pending", async () => {
		let checks = 0;
		const writer: WorkflowWriterRunner = {
			async deliverExact() {},
			async runControl(request) {
				if (request.control.kind === "CHECK_PR_HEALTH") return health(checks++ === 0 ? "PASS" : "PENDING");
				return {
					status: "MERGED",
					repository: "example/repo",
					number: 7,
					url: "https://github.com/example/repo/pull/7",
					headSha,
					mergedSha,
				};
			},
		};
		const engine = setup(writer);
		await engine.runPrHealthGate(jobId);
		engine.requestMergeAuthorization(jobId);
		engine.approve({ jobId, expectedHeadSha: headSha });
		const blocked = await engine.runWriterMerge(jobId);
		expect(blocked.state).toBe("BLOCKED");
		expect(blocked.mergeAuthorization).toBeUndefined();
		expect(blocked.prHealth?.status).toBe("PENDING");
	});
});
