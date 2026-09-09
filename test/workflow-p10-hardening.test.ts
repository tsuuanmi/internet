import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
const baseSha = "0123456789abcdef0123456789abcdef01234567";
const prHeadSha = "abcdef0123456789abcdef0123456789abcdef01";
const mergedSha = "1111111111111111111111111111111111111111";

function root(): string {
	const value = mkdtempSync(join(tmpdir(), "internet-p10-"));
	roots.push(value);
	return value;
}

function runner(): WorkflowTeamRunner {
	return {
		async run(request) {
			const lane = request.sessionId.endsWith(":A") ? "A" : "B";
			return {
				ok: true,
				finalAnswer: `${lane} exact payload`,
				finalAccountId: "chatgpt-thinker",
				finalProvider: "chatgpt-web",
			};
		},
	};
}

function start(engine: WorkflowEngine) {
	return engine.start({
		objective: "Harden recovery.",
		repository: "https://github.com/example/repo",
		baseRevision: baseSha,
		ownerSessionId: "agent-p10",
	});
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe("P10 durable recovery and transition hardening", () => {
	it("resumes after restart without redelivering an acknowledged exact handoff", async () => {
		const dataDir = root();
		const jobs1 = new WorkflowJobStore(dataDir);
		const handoffs1 = new WorkflowHandoffStore(dataDir);
		const first = new WorkflowEngine(jobs1, runner(), new WorkflowTeamPromptBuilder(), handoffs1);
		const job = start(first);
		await first.runResearch(job.jobId);
		const prepared = first.prepareResearchHandoffs(job.jobId);
		first.markHandoffDelivered(job.jobId, prepared[0]!.handoffId, prepared[0]!.payloadHash);

		const delivered: string[] = [];
		const writer: WorkflowWriterRunner = {
			async deliverExact(request) {
				delivered.push(request.payload);
			},
			async runControl() {
				return {
					status: "PR_OPEN",
					pullRequest: {
						repository: "example/repo",
						number: 9,
						url: "https://github.com/example/repo/pull/9",
						base: "main",
						head: `internet-workflow/${job.jobId}`,
						headSha: prHeadSha,
					},
				};
			},
		};
		const restarted = new WorkflowEngine(
			new WorkflowJobStore(dataDir),
			runner(),
			new WorkflowTeamPromptBuilder(),
			new WorkflowHandoffStore(dataDir),
			writer,
		);
		const completed = await restarted.runWriterImplementation(job.jobId);
		expect(delivered).toEqual(["B exact payload"]);
		expect(completed.state).toBe("PR_OPEN");
		expect(completed.pullRequest?.number).toBe(9);
	});

	it("keeps handoff receipt operations revision-idempotent", async () => {
		const dataDir = root();
		const jobs = new WorkflowJobStore(dataDir);
		const handoffs = new WorkflowHandoffStore(dataDir);
		const engine = new WorkflowEngine(jobs, runner(), new WorkflowTeamPromptBuilder(), handoffs);
		const job = start(engine);
		await engine.runResearch(job.jobId);
		const prepared = engine.prepareResearchHandoffs(job.jobId);
		const afterPrepare = engine.status(job.jobId).revision;
		engine.prepareResearchHandoffs(job.jobId);
		expect(engine.status(job.jobId).revision).toBe(afterPrepare);
		const delivered = engine.markHandoffDelivered(job.jobId, prepared[0]!.handoffId, prepared[0]!.payloadHash);
		const deliveredRevision = delivered.revision;
		expect(engine.markHandoffDelivered(job.jobId, prepared[0]!.handoffId, prepared[0]!.payloadHash).revision).toBe(
			deliveredRevision,
		);
	});

	it("recovers an exact durable merge authorization after process restart", async () => {
		const dataDir = root();
		const jobs = new WorkflowJobStore(dataDir);
		const bootstrap = new WorkflowEngine(jobs);
		const job = start(bootstrap);
		const pr = {
			repository: "example/repo",
			number: 4,
			url: "https://github.com/example/repo/pull/4",
			base: "main",
			head: `internet-workflow/${job.jobId}`,
			headSha: prHeadSha,
		};
		jobs.update(job.jobId, (current) => ({
			...current,
			revision: current.revision + 1,
			state: "MERGING",
			pullRequest: pr,
			prHealth: {
				repository: pr.repository,
				number: pr.number,
				url: pr.url,
				headSha: pr.headSha,
				status: "PASS",
				summary: "all required checks passed before authorization",
				checkedAt: new Date().toISOString(),
			},
			reviewCycle: 1,
			mergeAuthorization: {
				repository: current.repository,
				number: pr.number,
				url: pr.url,
				head: pr.head,
				headSha: pr.headSha,
				reviewCycle: 1,
				authorizedAt: new Date().toISOString(),
				authorizedByOwnerSessionId: current.ownerSessionId,
			},
			updatedAt: new Date().toISOString(),
		}));
		const writer: WorkflowWriterRunner = {
			async deliverExact() {},
			async runControl(request) {
				if (request.control.kind === "CHECK_PR_HEALTH") {
					return {
						status: "PR_HEALTH",
						repository: "example/repo",
						number: 4,
						url: pr.url,
						headSha: prHeadSha,
						health: "PASS",
						summary: "all required checks still pass",
					};
				}
				return {
					status: "MERGED",
					repository: "example/repo",
					number: 4,
					url: pr.url,
					headSha: prHeadSha,
					mergedSha,
				};
			},
		};
		const restarted = new WorkflowEngine(
			new WorkflowJobStore(dataDir),
			undefined,
			new WorkflowTeamPromptBuilder(),
			undefined,
			writer,
		);
		const done = await restarted.runWriterMerge(job.jobId);
		expect(done.state).toBe("DONE");
		expect(done.mergeReceipt).toMatchObject({ headSha: prHeadSha, mergedSha, executorAccountId: "chatgpt-writer" });
	});

	it("never falls back to CREATED when continuing an exception", () => {
		const dataDir = root();
		const jobs = new WorkflowJobStore(dataDir);
		const engine = new WorkflowEngine(jobs);
		const job = start(engine);
		jobs.update(job.jobId, (current) => ({
			...current,
			revision: current.revision + 1,
			state: "BLOCKED",
			pendingAction: { kind: "WRITER_BLOCKED", message: "operator decision required" },
			updatedAt: new Date().toISOString(),
		}));
		expect(() => engine.continue(job.jobId)).toThrow(/no explicit resume state/u);
		expect(engine.status(job.jobId).state).toBe("BLOCKED");
	});

	it("fails closed on corrupted durable account/session authority", () => {
		const dataDir = root();
		const jobs = new WorkflowJobStore(dataDir);
		const engine = new WorkflowEngine(jobs);
		const job = start(engine);
		const path = jobs.pathFor(job.jobId);
		const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
		const writer = raw.writerConversation as Record<string, unknown>;
		writer.sessionId = "other-agent:workflow:wrong:writer";
		writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`, { mode: 0o600 });
		expect(() => new WorkflowJobStore(dataDir).get(job.jobId)).toThrow(/writer conversation identity mismatch/u);
	});
});
