import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import { WORKFLOW_STATES, type WorkflowJob, type WorkflowState } from "#internet/workflow/types";

const JOB_SCHEMA = "@tsuuanmi/internet-workflow-job" as const;

export class WorkflowJobStoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowJobStoreError";
	}
}

/** Durable per-job JSON storage. One job is one private atomic file. */
export class WorkflowJobStore {
	private readonly jobsDir: string;

	constructor(dataDir: string) {
		this.jobsDir = join(dataDir, "workflows", "jobs");
	}

	pathFor(jobId: string): string {
		assertJobId(jobId);
		return join(this.jobsDir, `${jobId}.json`);
	}

	create(job: WorkflowJob): WorkflowJob {
		const path = this.pathFor(job.jobId);
		if (existsSync(path)) throw new WorkflowJobStoreError(`workflow job ${job.jobId} already exists`);
		ensurePrivateDirectory(this.jobsDir);
		writePrivateJson(path, job);
		return job;
	}

	get(jobId: string): WorkflowJob | undefined {
		const path = this.pathFor(jobId);
		if (!existsSync(path)) return undefined;
		const stat = lstatSync(path);
		if (!stat.isFile()) throw new WorkflowJobStoreError(`workflow job ${jobId} is not a regular file`);
		if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
			throw new WorkflowJobStoreError(`workflow job ${jobId} permissions must be 0600`);
		}
		try {
			return parseWorkflowJob(JSON.parse(readFileSync(path, "utf8")));
		} catch (error) {
			throw new WorkflowJobStoreError(
				`workflow job ${jobId} is invalid: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	update(jobId: string, mutate: (current: WorkflowJob) => WorkflowJob): WorkflowJob {
		const current = this.get(jobId);
		if (current === undefined) throw new WorkflowJobStoreError(`workflow job ${jobId} does not exist`);
		const next = mutate(current);
		if (next.jobId !== current.jobId) throw new WorkflowJobStoreError("workflow job id cannot change");
		if (next.revision !== current.revision + 1) {
			throw new WorkflowJobStoreError("workflow job revision must increment by exactly one");
		}
		writePrivateJson(this.pathFor(jobId), next);
		return next;
	}
}

function assertJobId(jobId: string): void {
	if (!/^[0-9a-f]{32}$/u.test(jobId))
		throw new WorkflowJobStoreError("workflow job id must be 32 lowercase hex characters");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
	return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isState(value: unknown): value is WorkflowState {
	return typeof value === "string" && (WORKFLOW_STATES as readonly string[]).includes(value);
}

function isFullSha(value: unknown): value is string {
	return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function assertMergeAuthorization(value: unknown): void {
	if (value === undefined) return;
	if (!isRecord(value)) throw new Error("invalid merge authorization");
	if (typeof value.repository !== "string" || value.repository.trim() === "")
		throw new Error("invalid merge authorization repository");
	if (!isPositiveInteger(value.number)) throw new Error("invalid merge authorization PR number");
	if (typeof value.url !== "string" || !/^https:\/\/github\.com\//u.test(value.url))
		throw new Error("invalid merge authorization URL");
	if (typeof value.head !== "string" || value.head.trim() === "") throw new Error("invalid merge authorization head");
	if (!isFullSha(value.headSha)) throw new Error("invalid merge authorization head SHA");
	if (typeof value.reviewCycle !== "number" || !Number.isSafeInteger(value.reviewCycle) || value.reviewCycle < 1)
		throw new Error("invalid merge authorization review cycle");
	if (!isTimestamp(value.authorizedAt)) throw new Error("invalid merge authorization timestamp");
	if (typeof value.authorizedByOwnerSessionId !== "string" || value.authorizedByOwnerSessionId.trim() === "")
		throw new Error("invalid merge authorization owner");
}

function assertMergeReceipt(value: unknown): void {
	if (value === undefined) return;
	if (!isRecord(value)) throw new Error("invalid merge receipt");
	if (typeof value.repository !== "string" || value.repository.trim() === "")
		throw new Error("invalid merge receipt repository");
	if (!isPositiveInteger(value.number)) throw new Error("invalid merge receipt PR number");
	if (typeof value.url !== "string" || !/^https:\/\/github\.com\//u.test(value.url))
		throw new Error("invalid merge receipt URL");
	if (!isFullSha(value.headSha) || !isFullSha(value.mergedSha)) throw new Error("invalid merge receipt SHA");
	if (value.executorAccountId !== "chatgpt-writer") throw new Error("invalid merge receipt executor");
	if (!isTimestamp(value.mergedAt)) throw new Error("invalid merge receipt timestamp");
}

export function parseWorkflowJob(value: unknown): WorkflowJob {
	if (!isRecord(value)) throw new Error("job must be an object");
	if (value.schema !== JOB_SCHEMA || value.version !== 1) throw new Error("unsupported workflow job schema");
	if (typeof value.jobId !== "string") throw new Error("invalid job id");
	assertJobId(value.jobId);
	if (typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1) {
		throw new Error("invalid job revision");
	}
	if (typeof value.ownerSessionId !== "string" || value.ownerSessionId.trim() === "")
		throw new Error("invalid owner session id");
	if (typeof value.objective !== "string" || value.objective.trim() === "") throw new Error("invalid objective");
	if (typeof value.repository !== "string" || value.repository.trim() === "") throw new Error("invalid repository");
	if (typeof value.baseRevision !== "string" || !/^[0-9a-f]{40}$/u.test(value.baseRevision)) {
		throw new Error("invalid base revision");
	}
	if (!isState(value.state)) throw new Error("invalid workflow state");
	if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) throw new Error("invalid timestamps");
	if (!isRecord(value.teamRuns) || !Array.isArray(value.teamRuns.research) || !Array.isArray(value.teamRuns.review)) {
		throw new Error("invalid team run state");
	}
	if (!isRecord(value.accountRouting) || !isRecord(value.writerConversation))
		throw new Error("invalid account routing");
	if (!Array.isArray(value.handoffReceipts)) throw new Error("invalid handoff receipts");
	if (typeof value.reviewCycle !== "number" || !Number.isSafeInteger(value.reviewCycle) || value.reviewCycle < 0) {
		throw new Error("invalid review cycle");
	}
	assertMergeAuthorization(value.mergeAuthorization);
	assertMergeReceipt(value.mergeReceipt);
	if (value.mergeReceipt !== undefined && value.state !== "DONE") throw new Error("merge receipt requires DONE state");
	return value as unknown as WorkflowJob;
}
