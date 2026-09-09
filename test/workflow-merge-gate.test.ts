import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyWorkflowConfirmation, type WorkflowApprovalContext } from "#internet/workflow/approval-policy";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowJob, WorkflowTeamRun } from "#internet/workflow/types";
import type { WorkflowWriterRunner } from "#internet/workflow/writer-runner";

const headSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const mergedSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const jobId = "0123456789abcdef0123456789abcdef";

function readyJob(): WorkflowJob {
	const timestamp = "2026-09-09T00:00:00.000Z";
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
	const pending = (lane: "A" | "B", phase: "research" | "review"): WorkflowTeamRun => ({
		lane,
		status: "pending",
		attempts: 0,
		sessionId: `local:workflow:${jobId}:${phase}:${lane}`,
	});
	return {
		schema: "@tsuuanmi/internet-workflow-job",
		version: 1,
		revision: 1,
		jobId,
		ownerSessionId: "local",
		objective: "merge tested change",
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
		ciReceipt: {
			repository: "example/repo",
			number: 7,
			url: "https://github.com/example/repo/pull/7",
			headSha,
			status: "PASS",
			checkedAt: timestamp,
		},
		reviewCycle: 1,
		createdAt: timestamp,
		updatedAt: timestamp,
	};
}

function setup(writer?: WorkflowWriterRunner) {
	const root = mkdtempSync(join(tmpdir(), "internet-merge-gate-"));
	const jobs = new WorkflowJobStore(root);
	jobs.create(readyJob());
	return new WorkflowEngine(jobs, undefined, undefined, undefined, writer);
}

describe("workflow merge gate", () => {
	it("binds user authorization to the exact persisted PR head", () => {
		const engine = setup();
		const awaiting = engine.requestMergeAuthorization(jobId);
		expect(awaiting.state).toBe("AWAITING_MERGE_AUTHORIZATION");
		expect(awaiting.pendingAction?.expectedHeadSha).toBe(headSha);
		expect(awaiting.pendingAction?.message).toContain("reviews=PASS/PASS");
		expect(() => engine.approve({ jobId, expectedHeadSha: mergedSha })).toThrow(/exact pending PR head SHA/u);
		const merging = engine.approve({ jobId, expectedHeadSha: headSha });
		expect(merging.state).toBe("MERGING");
		expect(merging.mergeAuthorization).toMatchObject({
			repository: "https://github.com/example/repo",
			number: 7,
			headSha,
		});
	});

	it("allows Website merge confirmation only in MERGING with matching authorization", () => {
		const engine = setup();
		engine.requestMergeAuthorization(jobId);
		const merging = engine.approve({ jobId, expectedHeadSha: headSha });
		const context: WorkflowApprovalContext = {
			jobId,
			writerSessionId: merging.writerConversation.sessionId,
			repository: merging.repository,
			state: merging.state,
			pullRequest: merging.pullRequest,
			mergeAuthorization: merging.mergeAuthorization,
			accountId: "chatgpt-writer",
			sessionId: merging.writerConversation.sessionId,
		};
		expect(
			classifyWorkflowConfirmation(context, {
				action: "merge_pull_request",
				repository: "example/repo",
				branch: `internet-workflow/${jobId}`,
				prNumber: 7,
			}),
		).toEqual({ kind: "auto-approve", action: "merge_pull_request" });
		expect(
			classifyWorkflowConfirmation(
				{ ...context, state: "READY_FOR_MERGE_AUTHORIZATION" },
				{ action: "merge_pull_request", repository: "example/repo", prNumber: 7 },
			).kind,
		).toBe("merge-requires-user");
	});

	it("records a merge receipt only when writer revalidates the authorized head", async () => {
		let calls = 0;
		const writer: WorkflowWriterRunner = {
			async deliverExact() {},
			async runControl(request) {
				calls += 1;
				if (request.control.kind === "CHECK_PR_HEALTH") {
					return {
						status: "PR_HEALTH",
						repository: "example/repo",
						number: 7,
						url: "https://github.com/example/repo/pull/7",
						headSha,
						health: "PASS",
					};
				}
				expect(request.control.kind).toBe("MERGE_AUTHORIZED");
				expect(request.control.expectedHeadSha).toBe(headSha);
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
		engine.requestMergeAuthorization(jobId);
		engine.approve({ jobId, expectedHeadSha: headSha });
		const done = await engine.runWriterMerge(jobId);
		expect(done.state).toBe("DONE");
		expect(calls).toBe(2);
		expect(done.mergeReceipt).toMatchObject({ headSha, mergedSha, executorAccountId: "chatgpt-writer" });
	});

	it("fails closed when writer reports a different pre-merge head", async () => {
		let calls = 0;
		const writer: WorkflowWriterRunner = {
			async deliverExact() {},
			async runControl() {
				calls += 1;
				if (calls === 1)
					return {
						status: "PR_HEALTH",
						repository: "example/repo",
						number: 7,
						url: "https://github.com/example/repo/pull/7",
						headSha,
						health: "PASS",
					};
				return {
					status: "MERGED",
					repository: "example/repo",
					number: 7,
					url: "https://github.com/example/repo/pull/7",
					headSha: mergedSha,
					mergedSha,
				};
			},
		};
		const engine = setup(writer);
		engine.requestMergeAuthorization(jobId);
		engine.approve({ jobId, expectedHeadSha: headSha });
		const blocked = await engine.runWriterMerge(jobId);
		expect(blocked.state).toBe("BLOCKED");
		expect(blocked.mergeReceipt).toBeUndefined();
	});

	it("keeps a denied merge request ready but unauthorized", () => {
		const engine = setup();
		engine.requestMergeAuthorization(jobId);
		const denied = engine.reject({ jobId, expectedHeadSha: headSha });
		expect(denied.state).toBe("READY_FOR_MERGE_AUTHORIZATION");
		expect(denied.pendingAction).toBeUndefined();
		expect(denied.mergeAuthorization).toBeUndefined();
	});
});
