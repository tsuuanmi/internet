import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import type { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowJob, WorkflowState } from "#internet/workflow/types";

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

/** Explicit operator-only retention manager. It never schedules or performs automatic deletion. */
export class WorkflowRetentionManager {
	private readonly auditDir: string;
	private readonly handoffRoot: string;
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
	}

	preview(): readonly WorkflowCleanupCandidate[] {
		const nowMs = this.now().getTime();
		return this.jobs
			.list()
			.map((job) => candidateFor(job, nowMs, this.policy))
			.filter((item): item is WorkflowCleanupCandidate => item !== undefined)
			.sort((a, b) => a.eligibleAt.localeCompare(b.eligibleAt) || a.jobId.localeCompare(b.jobId));
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
			const jobHandoffDir = join(this.handoffRoot, job.jobId);
			if (existsSync(jobHandoffDir)) {
				const stat = lstatSync(jobHandoffDir);
				if (!stat.isDirectory()) throw new WorkflowRetentionError("workflow handoff path is not a directory");
				const names = readdirSync(jobHandoffDir).sort();
				for (const name of names) {
					if (!/^[0-9a-f]{64}\.json$/u.test(name))
						throw new WorkflowRetentionError(`unexpected file in workflow handoff directory: ${name}`);
					const path = join(jobHandoffDir, name);
					const file = lstatSync(path);
					if (!file.isFile())
						throw new WorkflowRetentionError(`handoff cleanup target is not a regular file: ${name}`);
					if (process.platform !== "win32" && (file.mode & 0o077) !== 0)
						throw new WorkflowRetentionError(`handoff cleanup target permissions must be 0600: ${name}`);
				}
				for (const name of names) {
					unlinkSync(join(jobHandoffDir, name));
					deletedHandoffFiles += 1;
				}
				rmdirSync(jobHandoffDir);
			}

			const jobPath = this.jobs.pathFor(job.jobId);
			const jobFile = lstatSync(jobPath);
			if (!jobFile.isFile()) throw new WorkflowRetentionError("workflow cleanup target is not a regular job file");
			if (process.platform !== "win32" && (jobFile.mode & 0o077) !== 0)
				throw new WorkflowRetentionError("workflow cleanup target permissions must be 0600");
			unlinkSync(jobPath);

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
