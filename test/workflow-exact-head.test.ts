import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAccountDefinition } from "#internet/core/accounts";
import { workflowWriterBranch } from "#internet/workflow/approval-policy";
import { workflowNodeId } from "#internet/workflow/graph";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
import type { WorkflowWriterRunner } from "#internet/workflow/writer-runner";
import { createWorkflowTestRuntime } from "./workflow-test-fixture.js";

const roots: string[] = [];
const baseRevision = "0123456789abcdef0123456789abcdef01234567";
const firstHead = "1".repeat(40);
const remediatedHead = "2".repeat(40);

function root(): string {
	const path = mkdtempSync(join(tmpdir(), "internet-workflow-head-"));
	roots.push(path);
	return path;
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function teams(): WorkflowTeamRunner {
	return {
		rounds: 1,
		async runStep(request) {
			if (request.step.kind === "synthesis") {
				return {
					ok: true,
					step: request.step,
					finalAnswer: request.sessionId.includes(":review:")
						? JSON.stringify({ verdict: "CHANGES_REQUIRED", reviewedHeadSha: firstHead })
						: `${request.sessionId}:synthesized`,
				};
			}
			return {
				ok: true,
				step: request.step,
				turn: {
					round: request.step.round,
					accountId: request.step.accountId,
					provider: getAccountDefinition(request.step.accountId).provider,
					text: `${request.sessionId}:${request.step.stepId}:ok`,
				},
			};
		},
	};
}

function writer(): WorkflowWriterRunner {
	return {
		async deliverExact() {},
		async runControl(request) {
			const pullRequest = {
				repository: "example/repo",
				number: 17,
				url: "https://github.com/example/repo/pull/17",
				base: "main",
				head: workflowWriterBranch(request.job.jobId),
				headSha: request.control.kind === "START_IMPLEMENTATION" ? firstHead : remediatedHead,
			};
			if (request.control.kind === "START_IMPLEMENTATION" || request.control.kind === "APPLY_REVIEWS") {
				return { status: "PR_OPEN", pullRequest };
			}
			return { status: "BLOCKED", message: `unexpected control ${request.control.kind}` };
		},
	};
}

async function advanceUntilSecondReview(
	engine: ReturnType<typeof createWorkflowTestRuntime>["engine"],
	jobId: string,
): Promise<void> {
	for (let iteration = 0; iteration < 20; iteration += 1) {
		const current = engine.advance(jobId);
		const secondReviewRoot = current.graph.nodes[workflowNodeId.reviewMember(2, "A", 1, 1)];
		if (current.reviewCycle === 2 && secondReviewRoot?.state === "READY") return;
		const runnable = engine.runnableNodeIds(jobId);
		if (runnable.length === 0) throw new Error("workflow stopped before second review cycle became ready");
		await Promise.all(runnable.map((nodeId) => engine.executeNode(jobId, nodeId, "driver")));
	}
	throw new Error("workflow did not reach second review cycle");
}

describe("WorkflowEngine exact-head review cycles", () => {
	it("invalidates prior review evidence after remediation and binds the next cycle to the new head", async () => {
		const { engine } = createWorkflowTestRuntime(root(), { teams: teams(), writer: writer() });
		const job = engine.start({
			ownerSessionId: "agent",
			objective: "Exercise exact-head remediation.",
			repository: "https://github.com/example/repo",
			baseRevision,
		});

		await advanceUntilSecondReview(engine, job.jobId);
		const current = engine.status(job.jobId);
		const firstReview = current.graph.nodes[workflowNodeId.reviewMember(1, "A", 1, 1)];
		const secondReview = current.graph.nodes[workflowNodeId.reviewMember(2, "A", 1, 1)];
		const remediation = workflowNodeId.writerRemediation(1);

		expect(current.pullRequest?.headSha).toBe(remediatedHead);
		expect(current.reviewCycle).toBe(2);
		expect(firstReview).toMatchObject({
			state: "COMPLETED",
			input: { bindings: { headSha: firstHead, reviewCycle: 1 } },
		});
		expect(secondReview).toMatchObject({
			state: "READY",
			dependencies: [remediation],
			input: { bindings: { headSha: remediatedHead, reviewCycle: 2 } },
		});
		expect(secondReview?.input?.dependencyOutputHashes).toEqual({
			[remediation]: current.graph.nodes[remediation]?.output?.outputHash,
		});
		expect(secondReview?.input?.inputHash).not.toBe(firstReview?.input?.inputHash);
	});
});
