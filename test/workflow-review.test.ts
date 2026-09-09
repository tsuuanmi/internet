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
import type { WorkflowWriterRunner } from "#internet/workflow/writer-runner";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function setup(reviewAnswers: string[], writer: WorkflowWriterRunner, maxReviewCycles = 3) {
	const root = mkdtempSync(join(tmpdir(), "internet-workflow-review-"));
	roots.push(root);
	let reviewIndex = 0;
	const team: WorkflowTeamRunner = {
		async run(request) {
			const review = request.sessionId.includes(":review:");
			return {
				ok: true,
				finalAnswer: review
					? (reviewAnswers[reviewIndex++] ??
						'{"verdict":"PASS","reviewedHeadSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","summary":"clean"}')
					: "research",
				finalAccountId: "chatgpt-thinker",
				finalProvider: "chatgpt-web",
			};
		},
	};
	const jobs = new WorkflowJobStore(root);
	const engine = new WorkflowEngine(
		jobs,
		team,
		new WorkflowTeamPromptBuilder(),
		new WorkflowHandoffStore(root),
		writer,
		maxReviewCycles,
	);
	const started = engine.start({
		objective: "Fix it.",
		repository: "https://github.com/example/repo",
		baseRevision: "0123456789abcdef0123456789abcdef01234567",
		ownerSessionId: "agent",
	});
	jobs.update(started.jobId, (job) => ({
		...job,
		revision: job.revision + 1,
		state: "PR_OPEN",
		pullRequest: {
			repository: "example/repo",
			number: 7,
			url: "https://github.com/example/repo/pull/7",
			base: "main",
			head: "internet-workflow/x",
			headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		},
	}));
	return { engine, jobId: started.jobId };
}

describe("workflow PR review/remediation", () => {
	it("binds independent review finals to one exact head and passes when both reviewers PASS", async () => {
		const delivered: string[] = [];
		const writer: WorkflowWriterRunner = {
			async deliverExact(request) {
				delivered.push(request.payload);
			},
			async runControl() {
				throw new Error("control should not run on PASS");
			},
		};
		const a = '{"verdict":"PASS","reviewedHeadSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","summary":"A clean"}';
		const b = '{"verdict":"PASS","reviewedHeadSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","summary":"B clean"}';
		const { engine, jobId } = setup([a, b], writer);
		const reviewed = await engine.runReview(jobId);
		expect(reviewed.state).toBe("REVIEW_HANDOFFS_DELIVERING");
		expect(reviewed.reviewCycle).toBe(1);
		expect(reviewed.teamRuns.review.map((run) => run.result?.reviewedHeadSha)).toEqual([
			"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		]);
		const ready = await engine.runWriterRemediation(jobId);
		expect(delivered).toEqual([a, b]);
		expect(ready.state).toBe("READY_FOR_MERGE_AUTHORIZATION");
	});

	it("delivers CHANGES_REQUIRED verbatim, applies reviews on the same PR, and re-reviews the new head", async () => {
		const delivered: string[] = [];
		const controls: string[] = [];
		const writer: WorkflowWriterRunner = {
			async deliverExact(request) {
				delivered.push(request.payload);
			},
			async runControl(request) {
				controls.push(request.control.kind);
				return {
					status: "PR_OPEN",
					pullRequest: {
						repository: "example/repo",
						number: 7,
						url: "https://github.com/example/repo/pull/7",
						base: "main",
						head: "internet-workflow/x",
						headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
					},
				};
			},
		};
		const change =
			'{"verdict":"CHANGES_REQUIRED","reviewedHeadSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","findings":[{"severity":"high","location":"x","issue":"bug","remediation":"fix"}]}';
		const pass = '{"verdict":"PASS","reviewedHeadSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","summary":"clean"}';
		const passNewHead =
			'{"verdict":"PASS","reviewedHeadSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","summary":"clean"}';
		const { engine, jobId } = setup([change, pass, passNewHead, passNewHead], writer);
		await engine.runReview(jobId);
		const remediated = await engine.runWriterRemediation(jobId);
		expect(delivered).toEqual([change, pass]);
		expect(controls).toEqual(["APPLY_REVIEWS"]);
		expect(remediated.state).toBe("PR_OPEN");
		expect(remediated.pullRequest?.headSha).toBe("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
		const reviewedAgain = await engine.runReview(jobId);
		expect(reviewedAgain.reviewCycle).toBe(2);
		expect(
			reviewedAgain.teamRuns.review.every(
				(run) => run.result?.reviewedHeadSha === "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			),
		).toBe(true);
		const ready = await engine.runWriterRemediation(jobId);
		expect(ready.state).toBe("READY_FOR_MERGE_AUTHORIZATION");
	});

	it("fails review lanes on malformed reviewer output instead of guessing a verdict", async () => {
		const writer: WorkflowWriterRunner = {
			async deliverExact() {},
			async runControl() {
				return { status: "BLOCKED", message: "unused" };
			},
		};
		const { engine, jobId } = setup(
			["PASS", '{"verdict":"PASS","reviewedHeadSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","summary":"ok"}'],
			writer,
		);
		const reviewed = await engine.runReview(jobId);
		expect(reviewed.state).toBe("REVIEW_RUNNING");
		expect(reviewed.teamRuns.review.some((run) => run.status === "failed")).toBe(true);
	});

	it("blocks when remediation changes PR identity or does not advance the head", async () => {
		const writer: WorkflowWriterRunner = {
			async deliverExact() {},
			async runControl() {
				return {
					status: "PR_OPEN",
					pullRequest: {
						repository: "example/repo",
						number: 8,
						url: "https://github.com/example/repo/pull/8",
						base: "main",
						head: "other",
						headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
					},
				};
			},
		};
		const change =
			'{"verdict":"CHANGES_REQUIRED","reviewedHeadSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","findings":[]}';
		const { engine, jobId } = setup([change, change], writer);
		await engine.runReview(jobId);
		const blocked = await engine.runWriterRemediation(jobId);
		expect(blocked.state).toBe("BLOCKED");
		expect(blocked.pendingAction?.kind).toBe("WRITER_BLOCKED");
	});

	it("stops after the configured review-cycle limit", async () => {
		const writer: WorkflowWriterRunner = {
			async deliverExact() {},
			async runControl() {
				throw new Error("review limit should stop before writer control");
			},
		};
		const change =
			'{"verdict":"CHANGES_REQUIRED","reviewedHeadSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","findings":[]}';
		const { engine, jobId } = setup([change, change], writer, 1);
		await engine.runReview(jobId);
		const blocked = await engine.runWriterRemediation(jobId);
		expect(blocked.state).toBe("BLOCKED");
		expect(blocked.pendingAction?.kind).toBe("REVIEW_LIMIT_REACHED");
	});
});
