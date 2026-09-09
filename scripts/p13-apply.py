from pathlib import Path

root = Path('.')

retention = r'''import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import { type WorkflowJob, type WorkflowState } from "#internet/workflow/types";
import { WorkflowJobStore } from "#internet/workflow/job-store";

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
		if (!Number.isSafeInteger(value) || value < 1) throw new WorkflowRetentionError(`${name} must be a positive integer`);
	}
}

function candidateFor(job: WorkflowJob, nowMs: number, policy: WorkflowRetentionPolicy): WorkflowCleanupCandidate | undefined {
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

	constructor(
		private readonly dataDir: string,
		private readonly jobs: WorkflowJobStore,
		private readonly policy: WorkflowRetentionPolicy = DEFAULT_WORKFLOW_RETENTION_POLICY,
		private readonly now: () => Date = () => new Date(),
	) {
		assertPolicy(policy);
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
				for (const name of readdirSync(jobHandoffDir).sort()) {
					if (!/^[0-9a-f]{64}\.json$/u.test(name))
						throw new WorkflowRetentionError(`unexpected file in workflow handoff directory: ${name}`);
					const path = join(jobHandoffDir, name);
					const file = lstatSync(path);
					if (!file.isFile()) throw new WorkflowRetentionError(`handoff cleanup target is not a regular file: ${name}`);
					if (process.platform !== "win32" && (file.mode & 0o077) !== 0)
						throw new WorkflowRetentionError(`handoff cleanup target permissions must be 0600: ${name}`);
					unlinkSync(path);
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
'''
(root / 'src/workflow/retention.ts').write_text(retention)

maintenance = r'''import { defineTool } from "@deepseek-ai/dsh-tools";
import { WorkflowRetentionError, type WorkflowRetentionManager } from "#internet/workflow/retention";

export const WORKFLOW_MAINTENANCE_OPERATIONS = ["preview", "cleanup"] as const;
export type WorkflowMaintenanceOperation = (typeof WORKFLOW_MAINTENANCE_OPERATIONS)[number];

/** Explicit operator-facing workflow retention surface. No automatic deletion is performed. */
export function defineInternetWorkflowMaintenanceTool(manager: WorkflowRetentionManager): ReturnType<typeof defineTool> {
	return defineTool({
		name: "internet_workflow_maintenance",
		description:
			"Preview retention-eligible terminal workflow jobs or explicitly clean one exact unchanged job. Cleanup is never automatic.",
		parameters: {
			operation: {
				type: "string",
				required: true,
				enum: [...WORKFLOW_MAINTENANCE_OPERATIONS],
				description: "Maintenance operation.",
			},
			jobId: { type: "string", description: "Exact workflow job ID for cleanup." },
			expectedUpdatedAt: {
				type: "string",
				description: "Exact updatedAt returned by preview. Cleanup fails if the job changed afterward.",
			},
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					ok: { type: "boolean", required: true },
					operation: { type: "string", required: true },
					eligibleCount: { type: "number" },
					candidates: { type: "string" },
					jobId: { type: "string" },
					auditId: { type: "string" },
					status: { type: "string" },
					deletedHandoffFiles: { type: "number" },
					completedAt: { type: "string" },
					message: { type: "string" },
				},
			},
			render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
			presentationMeta: (_args, value) => value,
		},
		isConcurrencySafe: () => false,
		execute(args, exec) {
			const operation = args.operation as WorkflowMaintenanceOperation;
			try {
				if (operation === "preview") {
					const candidates = manager.preview();
					return {
						ok: true,
						operation,
						eligibleCount: candidates.length,
						candidates: candidates
							.map(
								(item) =>
									`${item.jobId} state=${item.state} updatedAt=${item.updatedAt} eligibleAt=${item.eligibleAt} retentionDays=${item.retentionDays} repo=${item.repository}`,
							)
							.join("\n"),
					};
				}
				if (typeof args.jobId !== "string" || typeof args.expectedUpdatedAt !== "string") {
					return { ok: false, operation, message: "cleanup requires jobId and expectedUpdatedAt from preview" };
				}
				const audit = manager.cleanup({
					jobId: args.jobId,
					expectedUpdatedAt: args.expectedUpdatedAt,
					operatorSessionId: String(exec.agent?.id ?? ""),
				});
				return {
					ok: true,
					operation,
					jobId: audit.jobId,
					auditId: audit.auditId,
					status: audit.status,
					deletedHandoffFiles: audit.deletedHandoffFiles,
					...(audit.completedAt === undefined ? {} : { completedAt: audit.completedAt }),
				};
			} catch (error) {
				if (error instanceof WorkflowRetentionError) return { ok: false, operation, message: error.message };
				return { ok: false, operation, message: error instanceof Error ? error.message : String(error) };
			}
		},
		presentCall: (args) => ({
			card: "generic",
			title: `internet_workflow_maintenance ${String(args.operation)}`,
			kind: "other",
		}),
	});
}
'''
(root / 'src/tools/internet-workflow-maintenance.ts').write_text(maintenance)

test = r'''import { existsSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowHandoffStore } from "#internet/workflow/handoff-store";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import { WorkflowRetentionError, WorkflowRetentionManager } from "#internet/workflow/retention";

const roots: string[] = [];

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "internet-retention-"));
	roots.push(root);
	const jobs = new WorkflowJobStore(root);
	const engine = new WorkflowEngine(jobs);
	const handoffs = new WorkflowHandoffStore(root);
	const now = () => new Date("2026-09-09T00:00:00.000Z");
	const retention = new WorkflowRetentionManager(root, jobs, undefined, now);
	return { root, jobs, engine, handoffs, retention };
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("WorkflowRetentionManager", () => {
	it("previews only aged terminal jobs and deletes one exact unchanged job with an audit", () => {
		const { root, jobs, engine, handoffs, retention } = fixture();
		const started = engine.start({
			objective: "old cancelled work",
			repository: "https://github.com/example/repo",
			baseRevision: "0123456789abcdef0123456789abcdef01234567",
			ownerSessionId: "owner",
		});
		const cancelled = engine.cancel(started.jobId);
		const old = jobs.update(cancelled.jobId, (current) => ({
			...current,
			revision: current.revision + 1,
			updatedAt: "2026-08-01T00:00:00.000Z",
		}));
		const handoff = handoffs.create({
			jobId: old.jobId,
			source: "research:A",
			recipient: "chatgpt-writer",
			sequence: 1,
			payload: "exact payload",
		});

		expect(retention.preview()).toEqual([
			expect.objectContaining({ jobId: old.jobId, state: "CANCELLED", updatedAt: old.updatedAt, retentionDays: 14 }),
		]);
		const audit = retention.cleanup({
			jobId: old.jobId,
			expectedUpdatedAt: old.updatedAt,
			operatorSessionId: "operator",
		});
		expect(audit).toMatchObject({ status: "COMPLETED", jobId: old.jobId, deletedHandoffFiles: 1 });
		expect(jobs.get(old.jobId)).toBeUndefined();
		expect(handoffs.get(old.jobId, handoff.handoffId)).toBeUndefined();
		expect(existsSync(join(root, "workflows", "cleanup-audit", `${audit.auditId}.json`))).toBe(true);
		expect(
			retention.cleanup({ jobId: old.jobId, expectedUpdatedAt: old.updatedAt, operatorSessionId: "operator" }),
		).toEqual(audit);
	});

	it("never exposes active jobs as cleanup candidates", () => {
		const { engine, retention } = fixture();
		engine.start({
			objective: "active work",
			repository: "https://github.com/example/repo",
			baseRevision: "0123456789abcdef0123456789abcdef01234567",
			ownerSessionId: "owner",
		});
		expect(retention.preview()).toEqual([]);
	});

	it("fails closed if the job changed after preview", () => {
		const { jobs, engine, retention } = fixture();
		const started = engine.start({
			objective: "stale preview",
			repository: "https://github.com/example/repo",
			baseRevision: "0123456789abcdef0123456789abcdef01234567",
			ownerSessionId: "owner",
		});
		const cancelled = engine.cancel(started.jobId);
		const old = jobs.update(cancelled.jobId, (current) => ({
			...current,
			revision: current.revision + 1,
			updatedAt: "2026-08-01T00:00:00.000Z",
		}));
		jobs.update(old.jobId, (current) => ({ ...current, revision: current.revision + 1, updatedAt: "2026-08-02T00:00:00.000Z" }));
		expect(() =>
			retention.cleanup({ jobId: old.jobId, expectedUpdatedAt: old.updatedAt, operatorSessionId: "operator" }),
		).toThrow(WorkflowRetentionError);
	});
});
'''
(root / 'test/workflow-retention.test.ts').write_text(test)

index = root / 'src/index.ts'
text = index.read_text()
text = text.replace(
    'import { defineInternetWorkflowTool } from "#internet/tools/internet-workflow";\n',
    'import { defineInternetWorkflowTool } from "#internet/tools/internet-workflow";\nimport { defineInternetWorkflowMaintenanceTool } from "#internet/tools/internet-workflow-maintenance";\n',
)
text = text.replace(
    'import { WorkflowJobStore } from "#internet/workflow/job-store";\n',
    'import { WorkflowJobStore } from "#internet/workflow/job-store";\nimport { WorkflowRetentionManager } from "#internet/workflow/retention";\n',
)
text = text.replace(
    '"Scoped Website confirmation classification is fail-closed. Implementation/remediation actions auto-confirm only in exact writer scope. Before merge authorization, the writer performs a read-only live GitHub health check bound to repository + PR + exact head SHA and classifies required-check health as PASS, FAIL, PENDING, NONE, or UNKNOWN; only PASS or verified NONE is merge-eligible. request_merge emits a concrete ACTION_REQUIRED request only after that exact-head health gate, approve binds repository + PR + branch + exact head SHA, and MERGING re-checks live PR health immediately before the writer revalidates and merges the exact authorized head. Successful merge records the merge SHA/executor and completes the job. PROGRESS and ACTION_REQUIRED events remain compact Local context without raw team/reviewer payloads.",\n',
    '"Scoped Website confirmation classification is fail-closed. Implementation/remediation actions auto-confirm only in exact writer scope. Before merge authorization, the writer performs a read-only live GitHub health check bound to repository + PR + exact head SHA and classifies required-check health as PASS, FAIL, PENDING, NONE, or UNKNOWN; only PASS or verified NONE is merge-eligible. request_merge emits a concrete ACTION_REQUIRED request only after that exact-head health gate, approve binds repository + PR + branch + exact head SHA, and MERGING re-checks live PR health immediately before the writer revalidates and merges the exact authorized head. Successful merge records the merge SHA/executor and completes the job. PROGRESS and ACTION_REQUIRED events remain compact Local context without raw team/reviewer payloads.",\n\t"Workflow retention is explicit operator maintenance only: internet_workflow_maintenance preview reports aged terminal candidates, and cleanup requires the exact unchanged updatedAt from preview. DONE jobs retain 30 days, CANCELLED jobs 14 days, cleanup is never automatic, and durable audit receipts remain after job/handoff deletion.",\n',
)
text = text.replace(
    'ctx.tools.register(defineInternetWorkflowTool(workflowEngine, workflowDriver));\n',
    'ctx.tools.register(defineInternetWorkflowTool(workflowEngine, workflowDriver));\n\t\tctx.tools.register(\n\t\t\tdefineInternetWorkflowMaintenanceTool(new WorkflowRetentionManager(config.dataDir, workflowJobs)),\n\t\t);\n',
)
text = text.replace(
    'export { WORKFLOW_OPERATIONS } from "#internet/tools/internet-workflow";\n',
    'export { WORKFLOW_OPERATIONS } from "#internet/tools/internet-workflow";\nexport {\n\tdefineInternetWorkflowMaintenanceTool,\n\tWORKFLOW_MAINTENANCE_OPERATIONS,\n} from "#internet/tools/internet-workflow-maintenance";\n',
)
text = text.replace(
    'export { parseWorkflowJob, WorkflowJobStore, WorkflowJobStoreError } from "#internet/workflow/job-store";\n',
    'export { parseWorkflowJob, WorkflowJobStore, WorkflowJobStoreError } from "#internet/workflow/job-store";\nexport type {\n\tWorkflowCleanupAudit,\n\tWorkflowCleanupCandidate,\n\tWorkflowRetentionPolicy,\n} from "#internet/workflow/retention";\nexport {\n\tDEFAULT_WORKFLOW_RETENTION_POLICY,\n\tWORKFLOW_RETENTION_AUDIT_SCHEMA,\n\tWorkflowRetentionError,\n\tWorkflowRetentionManager,\n} from "#internet/workflow/retention";\n',
)
index.write_text(text)

todo = root / 'docs/TODO.md'
t = todo.read_text()
t = t.replace(
    '## P13 — Operations / retention\n\n### 45. Audit/retention/cleanup policy — ROI: medium\n\nDefine explicit retention windows, audit metadata, safe terminal-job cleanup eligibility, and operator-visible cleanup commands after the automatic driver and CI gate are stable. Start with explicit operator actions only; no implicit automatic deletion.',
    '## P13 — Operations / retention\n\n**Status:** implemented with explicit operator-only cleanup; no background deletion exists.\n\n### 45. ✅ Audit/retention/cleanup policy — ROI: medium\n\nDONE jobs become eligible after 30 days and CANCELLED jobs after 14 days, measured from authoritative `updatedAt`. `internet_workflow_maintenance preview` exposes only aged terminal candidates. `cleanup` requires the exact `jobId` + unchanged `updatedAt` returned by preview, fails closed on unexpected handoff files/permissions, removes only that job and its exact durable handoffs, and leaves a private durable cleanup audit receipt containing repository/state/retention/operator/timestamps/deletion count. Repeating the same exact cleanup is audit-idempotent. There is deliberately no implicit or scheduled deletion.',
)
todo.write_text(t)

readme = root / 'README.md'
r = readme.read_text()
marker = '## Development\n'
section = '''## Workflow retention\n\nWorkflow history is not deleted automatically. `internet_workflow_maintenance` provides an explicit two-step operator path: `preview` lists only terminal jobs that have exceeded the fixed retention window (DONE: 30 days, CANCELLED: 14 days), then `cleanup` requires the exact job ID and unchanged `updatedAt` from that preview. Cleanup removes that job plus its durable handoff payloads and preserves a private audit receipt; active/recent jobs and stale previews fail closed.\n\n'''
if marker in r and '## Workflow retention\n' not in r:
    r = r.replace(marker, section + marker)
readme.write_text(r)
