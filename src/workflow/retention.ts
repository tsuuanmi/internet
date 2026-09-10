import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import { TERMINAL_WORKFLOW_STATES, type WorkflowJob, type WorkflowState } from "#internet/workflow/types";

export const WORKFLOW_RETENTION_AUDIT_SCHEMA = "@tsuuanmi/internet-workflow-retention-audit" as const;

export interface WorkflowRetentionPolicy {
	readonly doneDays: number;
	readonly cancelledDays: number;
}

export const DEFAULT_WORKFLOW_RETENTION_POLICY: WorkflowRetentionPolicy = {
	doneDays: 30,
	cancelledDays: 14,
};

export interface WorkflowCleanupCandidate {
	readonly jobId: string;
	readonly state: "DONE" | "CANCELLED";
	readonly repository: string;
	readonly updatedAt: string;
	readonly retentionDays: number;
	readonly eligibleAt: string;
}

export interface WorkflowCleanupAudit {
	readonly schema: typeof WORKFLOW_RETENTION_AUDIT_SCHEMA;
	readonly version: 1;
	readonly auditId: string;
	readonly jobId: string;
	readonly state: "DONE" | "CANCELLED";
	readonly repository: string;
	readonly jobUpdatedAt: string;
	readonly retentionDays: number;
	readonly eligibleAt: string;
	readonly operatorSessionId: string;
	readonly requestedAt: string;
	readonly status: "STARTED" | "COMPLETED" | "FAILED";
	readonly deletedHandoffFiles: number;
	readonly completedAt?: string;
	readonly error?: string;
}

export interface WorkflowDeletionReceipt {
	readonly jobId: string;
	readonly state: WorkflowState;
	readonly repository: string;
	readonly operatorSessionId: string;
	readonly deletedHandoffFiles: number;
	readonly deletedTrace: boolean;
	readonly deletedAt: string;
}

export class WorkflowRetentionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowRetentionError";
	}
}

function retentionDaysFor(state: WorkflowState, policy: WorkflowRetentionPolicy): number | undefined {
	if (state === "DONE") return policy.doneDays;
	if (state === "CANCELLED") return policy.cancelledDays;
	return undefined;
}

function assertPolicy(policy: WorkflowRetentionPolicy): void {
	for (const [name, value] of Object.entries(policy)) {
		if (!Number.isSafeInteger(value) || value < 1)
			throw new WorkflowRetentionError(`${name} must be a positive integer`);
	}
}

function candidateFor(
	job: WorkflowJob,
	nowMs: number,
	policy: WorkflowRetentionPolicy,
): WorkflowCleanupCandidate | undefined {
	const retentionDays = retentionDaysFor(job.state, policy);
	if (retentionDays === undefined) return undefined;
	const updatedMs = Date.parse(job.updatedAt);
	const eligibleMs = updatedMs + retentionDays * 24 * 60 * 60 * 1000;
	if (!Number.isFinite(updatedMs) || nowMs < eligibleMs) return undefined;
	return {
		jobId: job.jobId,
		state: job.state as "DONE" | "CANCELLED",
		repository: job.repository,
		updatedAt: job.updatedAt,
		retentionDays,
		eligibleAt: new Date(eligibleMs).toISOString(),
	};
}

function auditId(jobId: string, expectedUpdatedAt: string): string {
	return createHash("sha256").update(`${jobId}\0${expectedUpdatedAt}`, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCompletedAudit(value: unknown): WorkflowCleanupAudit | undefined {
	if (!isRecord(value) || value.schema !== WORKFLOW_RETENTION_AUDIT_SCHEMA || value.version !== 1) return undefined;
	if (value.status !== "COMPLETED") return undefined;
	return value as unknown as WorkflowCleanupAudit;
}

function assertPrivateRegularFile(path: string, label: string): void {
	const file = lstatSync(path);
	if (!file.isFile()) throw new WorkflowRetentionError(`${label} is not a regular file`);
	if (process.platform !== "win32" && (file.mode & 0o077) !== 0)
		throw new WorkflowRetentionError(`${label} permissions must be 0600`);
}

function deleteWorkflowArtifacts(
	jobs: WorkflowJobStore,
	handoffRoot: string,
	traceRoot: string,
	job: WorkflowJob,
): { readonly deletedHandoffFiles: number; readonly deletedTrace: boolean } {
	let deletedHandoffFiles = 0;
	const jobHandoffDir = join(handoffRoot, job.jobId);
	if (existsSync(jobHandoffDir)) {
		const stat = lstatSync(jobHandoffDir);
		if (!stat.isDirectory()) throw new WorkflowRetentionError("workflow handoff path is not a directory");
		const names = readdirSync(jobHandoffDir).sort();
		for (const name of names) {
			if (!/^[0-9a-f]{64}\.json$/u.test(name))
				throw new WorkflowRetentionError(`unexpected file in workflow handoff directory: ${name}`);
			assertPrivateRegularFile(join(jobHandoffDir, name), `handoff cleanup target ${name}`);
		}
		for (const name of names) {
			unlinkSync(join(jobHandoffDir, name));
			deletedHandoffFiles += 1;
		}
		rmdirSync(jobHandoffDir);
	}

	const tracePath = join(traceRoot, `${job.jobId}.json`);
	let deletedTrace = false;
	if (existsSync(tracePath)) {
		assertPrivateRegularFile(tracePath, "workflow team trace cleanup target");
		unlinkSync(tracePath);
		deletedTrace = true;
	}

	const jobPath = jobs.pathFor(job.jobId);
	assertPrivateRegularFile(jobPath, "workflow cleanup target");
	unlinkSync(jobPath);
	return { deletedHandoffFiles, deletedTrace };
}

/** Explicit operator-only retention manager. It never schedules or performs automatic deletion. */
export class WorkflowRetentionManager {
	private readonly auditDir: string;
	private readonly handoffRoot: string;
	private readonly traceRoot: string;
	private readonly jobs: WorkflowJobStore;
	private readonly policy: WorkflowRetentionPolicy;
	private readonly now: () => Date;

	constructor(
		dataDir: string,
		jobs: WorkflowJobStore,
		policy: WorkflowRetentionPolicy = DEFAULT_WORKFLOW_RETENTION_POLICY,
		now: () => Date = () => new Date(),
	) {
		assertPolicy(policy);
		this.jobs = jobs;
		this.policy = policy;
		this.now = now;
		this.auditDir = join(dataDir, "workflows", "cleanup-audit");
		this.handoffRoot = join(dataDir, "workflows", "handoffs");
		this.traceRoot = join(dataDir, "workflows", "team-traces");
	}

	preview(): readonly WorkflowCleanupCandidate[] {
		const nowMs = this.now().getTime();
		return this.jobs
			.list()
			.map((job) => candidateFor(job, nowMs, this.policy))
			.filter((item): item is WorkflowCleanupCandidate => item !== undefined)
			.sort((a, b) => a.eligibleAt.localeCompare(b.eligibleAt) || a.jobId.localeCompare(b.jobId));
	}

	deleteNow(input: { jobId: string; expectedUpdatedAt: string; operatorSessionId: string }): WorkflowDeletionReceipt {
		if (input.operatorSessionId.trim() === "") throw new WorkflowRetentionError("operator session id is required");
		if (!Number.isFinite(Date.parse(input.expectedUpdatedAt)))
			throw new WorkflowRetentionError("expectedUpdatedAt must be an ISO timestamp");
		const job = this.jobs.get(input.jobId);
		if (job === undefined) throw new WorkflowRetentionError(`workflow job ${input.jobId} does not exist`);
		if (job.updatedAt !== input.expectedUpdatedAt)
			throw new WorkflowRetentionError("workflow job changed before deletion; refresh before deleting");
		if (!TERMINAL_WORKFLOW_STATES.has(job.state))
			throw new WorkflowRetentionError("workflow job must be terminal before deletion");
		const deleted = deleteWorkflowArtifacts(this.jobs, this.handoffRoot, this.traceRoot, job);
		return {
			jobId: job.jobId,
			state: job.state,
			repository: job.repository,
			operatorSessionId: input.operatorSessionId,
			...deleted,
			deletedAt: this.now().toISOString(),
		};
	}

	cleanup(input: { jobId: string; expectedUpdatedAt: string; operatorSessionId: string }): WorkflowCleanupAudit {
		if (input.operatorSessionId.trim() === "") throw new WorkflowRetentionError("operator session id is required");
		if (!Number.isFinite(Date.parse(input.expectedUpdatedAt)))
			throw new WorkflowRetentionError("expectedUpdatedAt must be an ISO timestamp");
		const id = auditId(input.jobId, input.expectedUpdatedAt);
		const auditPath = join(this.auditDir, `${id}.json`);
		if (existsSync(auditPath)) {
			const completed = parseCompletedAudit(JSON.parse(readFileSync(auditPath, "utf8")));
			if (completed !== undefined) return completed;
		}

		const job = this.jobs.get(input.jobId);
		if (job === undefined) throw new WorkflowRetentionError(`workflow job ${input.jobId} does not exist`);
		if (job.updatedAt !== input.expectedUpdatedAt)
			throw new WorkflowRetentionError("workflow job changed after cleanup preview; refresh before deleting");
		const candidate = candidateFor(job, this.now().getTime(), this.policy);
		if (candidate === undefined)
			throw new WorkflowRetentionError("workflow job is not an eligible terminal cleanup candidate");

		const requestedAt = this.now().toISOString();
		const base: WorkflowCleanupAudit = {
			schema: WORKFLOW_RETENTION_AUDIT_SCHEMA,
			version: 1,
			auditId: id,
			jobId: job.jobId,
			state: candidate.state,
			repository: job.repository,
			jobUpdatedAt: job.updatedAt,
			retentionDays: candidate.retentionDays,
			eligibleAt: candidate.eligibleAt,
			operatorSessionId: input.operatorSessionId,
			requestedAt,
			status: "STARTED",
			deletedHandoffFiles: 0,
		};
		ensurePrivateDirectory(this.auditDir);
		writePrivateJson(auditPath, base);

		let deletedHandoffFiles = 0;
		try {
			const deleted = deleteWorkflowArtifacts(this.jobs, this.handoffRoot, this.traceRoot, job);
			deletedHandoffFiles = deleted.deletedHandoffFiles;

			const completed: WorkflowCleanupAudit = {
				...base,
				status: "COMPLETED",
				deletedHandoffFiles,
				completedAt: this.now().toISOString(),
			};
			writePrivateJson(auditPath, completed);
			return completed;
		} catch (error) {
			const failed: WorkflowCleanupAudit = {
				...base,
				status: "FAILED",
				deletedHandoffFiles,
				error: error instanceof Error ? error.message : String(error),
			};
			writePrivateJson(auditPath, failed);
			throw error;
		}
	}
}
