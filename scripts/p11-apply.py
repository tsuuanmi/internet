from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing expected block in {path}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1))


Path('src/workflow/driver.ts').write_text(r'''import type { WorkflowJobStore } from "#internet/workflow/job-store";
import { TERMINAL_WORKFLOW_STATES, type WorkflowJob, type WorkflowState } from "#internet/workflow/types";

export interface WorkflowDriverEngine {
	status(jobId: string): WorkflowJob;
	runResearch(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
	runWriterImplementation(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
	runReview(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
	runWriterRemediation(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
	requestMergeAuthorization(jobId: string): WorkflowJob;
	runWriterMerge(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;
	markRetryRequired(jobId: string, message: string, resumeState: WorkflowState): WorkflowJob;
	cancel(jobId: string): WorkflowJob;
}

interface ActiveRun {
	readonly controller: AbortController;
	readonly promise: Promise<void>;
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
	return signal.aborted || (error instanceof Error && error.name === "AbortError");
}

function shouldResume(job: WorkflowJob): boolean {
	if (job.state === "READY_FOR_MERGE_AUTHORIZATION") {
		return job.lastEvent?.type !== "MERGE_AUTHORIZATION_REJECTED";
	}
	return new Set<WorkflowState>([
		"CREATED",
		"RESEARCH_RUNNING",
		"RESEARCH_HANDOFFS_DELIVERING",
		"WRITER_RUNNING",
		"PR_OPEN",
		"REVIEW_RUNNING",
		"REVIEW_HANDOFFS_DELIVERING",
		"WRITER_REMEDIATING",
		"MERGING",
	]).has(job.state);
}

/** Deterministic background driver over WorkflowEngine primitives. It never decides implementation content. */
export class WorkflowDriver {
	private readonly engine: WorkflowDriverEngine;
	private readonly jobs: WorkflowJobStore;
	private readonly active = new Map<string, ActiveRun>();
	private disposed = false;

	constructor(engine: WorkflowDriverEngine, jobs: WorkflowJobStore) {
		this.engine = engine;
		this.jobs = jobs;
	}

	isActive(jobId: string): boolean {
		return this.active.has(jobId);
	}

	enqueue(jobId: string): void {
		if (this.disposed || this.active.has(jobId)) return;
		const controller = new AbortController();
		const promise = this.drive(jobId, controller.signal)
			.catch((error: unknown) => {
				if (isAbort(error, controller.signal)) return;
				try {
					const current = this.engine.status(jobId);
					if (TERMINAL_WORKFLOW_STATES.has(current.state)) return;
					this.engine.markRetryRequired(
						jobId,
						`automatic workflow driver failed: ${error instanceof Error ? error.message : String(error)}`,
						current.state,
					);
				} catch {
					// Durable-state failure cannot be repaired safely by the driver itself.
				}
			})
			.finally(() => {
				const current = this.active.get(jobId);
				if (current?.promise === promise) this.active.delete(jobId);
			});
		this.active.set(jobId, { controller, promise });
	}

	resumeActive(): void {
		if (this.disposed) return;
		for (const job of this.jobs.list()) {
			if (shouldResume(job)) this.enqueue(job.jobId);
		}
	}

	async cancel(jobId: string): Promise<WorkflowJob> {
		const run = this.active.get(jobId);
		if (run !== undefined) {
			run.controller.abort();
			await run.promise;
		}
		return this.engine.cancel(jobId);
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		const runs = [...this.active.values()];
		for (const run of runs) run.controller.abort();
		await Promise.allSettled(runs.map((run) => run.promise));
		this.active.clear();
	}

	private async drive(jobId: string, signal: AbortSignal): Promise<void> {
		while (!signal.aborted) {
			const before = this.engine.status(jobId);
			let after: WorkflowJob;
			switch (before.state) {
				case "CREATED":
				case "RESEARCH_RUNNING":
					after = await this.engine.runResearch(jobId, signal);
					break;
				case "RESEARCH_HANDOFFS_DELIVERING":
				case "WRITER_RUNNING":
					after = await this.engine.runWriterImplementation(jobId, signal);
					break;
				case "PR_OPEN":
				case "REVIEW_RUNNING":
					after = await this.engine.runReview(jobId, signal);
					break;
				case "REVIEW_HANDOFFS_DELIVERING":
				case "WRITER_REMEDIATING":
					after = await this.engine.runWriterRemediation(jobId, signal);
					break;
				case "READY_FOR_MERGE_AUTHORIZATION":
					if (before.lastEvent?.type === "MERGE_AUTHORIZATION_REJECTED") return;
					after = this.engine.requestMergeAuthorization(jobId);
					break;
				case "MERGING":
					after = await this.engine.runWriterMerge(jobId, signal);
					break;
				default:
					return;
			}
			if (signal.aborted) return;
			if (after.state === before.state && after.revision <= before.revision) {
				throw new Error(`workflow driver made no durable progress from ${before.state}`);
			}
		}
	}
}
''')

replace(
    'src/workflow/types.ts',
    '\t\t| "ACCOUNT_REAUTH_REQUIRED";\n',
    '\t\t| "ACCOUNT_REAUTH_REQUIRED"\n\t\t| "RETRY_REQUIRED";\n',
)

replace(
    'src/workflow/job-store.ts',
    'import { existsSync, lstatSync, readFileSync } from "node:fs";\n',
    'import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";\n',
)
replace(
    'src/workflow/job-store.ts',
    '''\tget(jobId: string): WorkflowJob | undefined {\n\t\tconst path = this.pathFor(jobId);\n''',
    '''\tlist(): readonly WorkflowJob[] {\n\t\tif (!existsSync(this.jobsDir)) return [];\n\t\tconst stat = lstatSync(this.jobsDir);\n\t\tif (!stat.isDirectory()) throw new WorkflowJobStoreError("workflow jobs path is not a directory");\n\t\treturn readdirSync(this.jobsDir)\n\t\t\t.filter((name) => /^[0-9a-f]{32}\\.json$/u.test(name))\n\t\t\t.sort()\n\t\t\t.map((name) => {\n\t\t\t\tconst job = this.get(name.slice(0, -5));\n\t\t\t\tif (job === undefined) throw new WorkflowJobStoreError(`workflow job ${name} disappeared during enumeration`);\n\t\t\t\treturn job;\n\t\t\t});\n\t}\n\n\tget(jobId: string): WorkflowJob | undefined {\n\t\tconst path = this.pathFor(jobId);\n''',
)
replace(
    'src/workflow/job-store.ts',
    '''\t\t\t"ACCOUNT_REAUTH_REQUIRED",\n\t\t].includes(String(value.kind))\n''',
    '''\t\t\t"ACCOUNT_REAUTH_REQUIRED",\n\t\t\t"RETRY_REQUIRED",\n\t\t].includes(String(value.kind))\n''',
)
replace(
    'src/workflow/job-store.ts',
    '''\tassertMergeAuthorization(value.mergeAuthorization);\n\tassertMergeReceipt(value.mergeReceipt);\n''',
    '''\tassertMergeAuthorization(value.mergeAuthorization);\n\tassertMergeReceipt(value.mergeReceipt);\n\tif (value.state === "FAILED_RETRYABLE") {\n\t\tif (\n\t\t\t!isRecord(value.pendingAction) ||\n\t\t\tvalue.pendingAction.kind !== "RETRY_REQUIRED" ||\n\t\t\tvalue.pendingAction.resumeState === undefined\n\t\t) {\n\t\t\tthrow new Error("FAILED_RETRYABLE workflow requires an explicit retry action and resume state");\n\t\t}\n\t}\n''',
)

replace(
    'src/workflow/engine.ts',
    '''\t\treturn this.update(jobId, (current) => {\n\t\t\tconst completed = allCompleted(current.teamRuns.research);\n\t\t\treturn {\n\t\t\t\t...withState(current, completed ? "RESEARCH_HANDOFFS_DELIVERING" : "FAILED_RETRYABLE"),\n\t\t\t\tlastEvent: {\n\t\t\t\t\ttype: completed ? "RESEARCH_COMPLETED" : "RESEARCH_RETRY_REQUIRED",\n\t\t\t\t\tclass: completed ? "INTERNAL" : "ACTION_REQUIRED",\n\t\t\t\t\tat: now(),\n\t\t\t\t\t...(completed\n\t\t\t\t\t\t? {}\n\t\t\t\t\t\t: { message: "One or more research lanes failed; retry runs only incomplete lanes." }),\n\t\t\t\t},\n\t\t\t};\n\t\t});\n''',
    '''\t\treturn this.update(jobId, (current) => {\n\t\t\tconst completed = allCompleted(current.teamRuns.research);\n\t\t\tconst message = "One or more research lanes failed; retry runs only incomplete lanes.";\n\t\t\treturn {\n\t\t\t\t...withState(current, completed ? "RESEARCH_HANDOFFS_DELIVERING" : "FAILED_RETRYABLE"),\n\t\t\t\tpendingAction: completed\n\t\t\t\t\t? undefined\n\t\t\t\t\t: { kind: "RETRY_REQUIRED" as const, message, resumeState: "RESEARCH_RUNNING" as const },\n\t\t\t\tlastEvent: {\n\t\t\t\t\ttype: completed ? "RESEARCH_COMPLETED" : "RESEARCH_RETRY_REQUIRED",\n\t\t\t\t\tclass: completed ? "INTERNAL" : "ACTION_REQUIRED",\n\t\t\t\t\tat: now(),\n\t\t\t\t\t...(completed ? {} : { message }),\n\t\t\t\t},\n\t\t\t};\n\t\t});\n''',
)
replace(
    'src/workflow/engine.ts',
    '''\t\treturn this.update(jobId, (current) => {\n\t\t\tconst completed =\n\t\t\t\tallCompleted(current.teamRuns.review) &&\n\t\t\t\tcurrent.teamRuns.review.every((run) => run.result?.reviewedHeadSha === current.pullRequest?.headSha);\n\t\t\treturn {\n\t\t\t\t...withState(current, completed ? "REVIEW_HANDOFFS_DELIVERING" : "REVIEW_RUNNING"),\n\t\t\t\tlastEvent: {\n\t\t\t\t\ttype: completed ? "REVIEW_COMPLETED" : "REVIEW_RETRY_REQUIRED",\n\t\t\t\t\tclass: completed ? "INTERNAL" : "ACTION_REQUIRED",\n\t\t\t\t\tat: now(),\n\t\t\t\t\t...(completed ? {} : { message: "One or more review lanes failed; rerun only incomplete lanes." }),\n\t\t\t\t},\n\t\t\t};\n\t\t});\n''',
    '''\t\treturn this.update(jobId, (current) => {\n\t\t\tconst completed =\n\t\t\t\tallCompleted(current.teamRuns.review) &&\n\t\t\t\tcurrent.teamRuns.review.every((run) => run.result?.reviewedHeadSha === current.pullRequest?.headSha);\n\t\t\tconst message = "One or more review lanes failed; rerun only incomplete lanes.";\n\t\t\treturn {\n\t\t\t\t...withState(current, completed ? "REVIEW_HANDOFFS_DELIVERING" : "FAILED_RETRYABLE"),\n\t\t\t\tpendingAction: completed\n\t\t\t\t\t? undefined\n\t\t\t\t\t: { kind: "RETRY_REQUIRED" as const, message, resumeState: "REVIEW_RUNNING" as const },\n\t\t\t\tlastEvent: {\n\t\t\t\t\ttype: completed ? "REVIEW_COMPLETED" : "REVIEW_RETRY_REQUIRED",\n\t\t\t\t\tclass: completed ? "INTERNAL" : "ACTION_REQUIRED",\n\t\t\t\t\tat: now(),\n\t\t\t\t\t...(completed ? {} : { message }),\n\t\t\t\t},\n\t\t\t};\n\t\t});\n''',
)
replace(
    'src/workflow/engine.ts',
    '''\tcancel(jobId: string): WorkflowJob {\n''',
    '''\tmarkRetryRequired(jobId: string, message: string, resumeState: WorkflowState): WorkflowJob {\n\t\tif (message.trim() === "") throw new WorkflowEngineError("retry-required message is required");\n\t\treturn this.update(jobId, (current) => ({\n\t\t\t...withState(current, "FAILED_RETRYABLE"),\n\t\t\tpendingAction: { kind: "RETRY_REQUIRED", message, resumeState },\n\t\t\tlastEvent: { type: "DRIVER_RETRY_REQUIRED", class: "ACTION_REQUIRED", at: now(), message },\n\t\t}));\n\t}\n\n\tcancel(jobId: string): WorkflowJob {\n''',
)
replace(
    'src/workflow/engine.ts',
    '''\t\t\tif (current.state === "FAILED_RETRYABLE") {\n\t\t\t\treturn { ...withState(current, "RESEARCH_RUNNING"), pendingAction: undefined };\n\t\t\t}\n\t\t\tconst resumeState = current.pendingAction?.resumeState;\n''',
    '''\t\t\tconst resumeState = current.pendingAction?.resumeState;\n''',
)

replace(
    'src/commands/workflow.ts',
    '''export interface WorkflowCommandDependencies {\n\treadonly engine: WorkflowStarter;\n\treadonly runGit?: GitRunner;\n}\n''',
    '''export interface WorkflowEnqueuer {\n\tenqueue(jobId: string): void;\n}\n\nexport interface WorkflowCommandDependencies {\n\treadonly engine: WorkflowStarter;\n\treadonly driver: WorkflowEnqueuer;\n\treadonly runGit?: GitRunner;\n}\n''',
)
replace(
    'src/commands/workflow.ts',
    '''\t\t\t\tconst job = dependencies.engine.start({\n\t\t\t\t\tobjective,\n\t\t\t\t\trepository: repository.url,\n\t\t\t\t\tbaseRevision: repository.revision,\n\t\t\t\t\townerSessionId: String(invocation.agent.id),\n\t\t\t\t});\n\t\t\t\treturn {\n''',
    '''\t\t\t\tconst job = dependencies.engine.start({\n\t\t\t\t\tobjective,\n\t\t\t\t\trepository: repository.url,\n\t\t\t\t\tbaseRevision: repository.revision,\n\t\t\t\t\townerSessionId: String(invocation.agent.id),\n\t\t\t\t});\n\t\t\t\tdependencies.driver.enqueue(job.jobId);\n\t\t\t\treturn {\n''',
)

# Tool integration is explicit: all control-plane starts/resumes use the driver.
replace(
    'src/tools/internet-workflow.ts',
    'import type { WorkflowEngine } from "#internet/workflow/engine";\n',
    'import type { WorkflowDriver } from "#internet/workflow/driver";\nimport type { WorkflowEngine } from "#internet/workflow/engine";\n',
)
replace(
    'src/tools/internet-workflow.ts',
    'export function defineInternetWorkflowTool(engine: WorkflowEngine): ReturnType<typeof defineTool> {\n',
    'export function defineInternetWorkflowTool(engine: WorkflowEngine, driver: WorkflowDriver): ReturnType<typeof defineTool> {\n',
)
replace(
    'src/tools/internet-workflow.ts',
    '''\t\t\t\t\tconst job = engine.start({\n\t\t\t\t\t\tobjective: args.objective,\n\t\t\t\t\t\trepository: args.repository,\n\t\t\t\t\t\tbaseRevision: args.baseRevision,\n\t\t\t\t\t\townerSessionId: String(exec.agent?.id ?? ""),\n\t\t\t\t\t});\n\t\t\t\t\treturn { ok: true, operation, ...project(job) };\n''',
    '''\t\t\t\t\tconst job = engine.start({\n\t\t\t\t\t\tobjective: args.objective,\n\t\t\t\t\t\trepository: args.repository,\n\t\t\t\t\t\tbaseRevision: args.baseRevision,\n\t\t\t\t\t\townerSessionId: String(exec.agent?.id ?? ""),\n\t\t\t\t\t});\n\t\t\t\t\tdriver.enqueue(job.jobId);\n\t\t\t\t\treturn { ok: true, operation, ...project(job) };\n''',
)
replace(
    'src/tools/internet-workflow.ts',
    '''\t\t\t\tconst job =\n\t\t\t\t\toperation === "status"\n\t\t\t\t\t\t? engine.status(args.jobId)\n\t\t\t\t\t\t: operation === "request_merge"\n\t\t\t\t\t\t\t? engine.requestMergeAuthorization(args.jobId)\n\t\t\t\t\t\t\t: operation === "merge"\n\t\t\t\t\t\t\t\t? await engine.runWriterMerge(args.jobId, exec.signal)\n\t\t\t\t\t\t\t\t: operation === "cancel"\n\t\t\t\t\t\t\t\t\t? engine.cancel(args.jobId)\n\t\t\t\t\t\t\t\t\t: operation === "continue"\n\t\t\t\t\t\t\t\t\t\t? engine.continue(args.jobId)\n\t\t\t\t\t\t\t\t\t\t: operation === "approve"\n\t\t\t\t\t\t\t\t\t\t\t? engine.approve({ jobId: args.jobId, expectedHeadSha })\n\t\t\t\t\t\t\t\t\t\t\t: engine.reject({ jobId: args.jobId, expectedHeadSha });\n\t\t\t\treturn { ok: true, operation, ...project(job) };\n''',
    '''\t\t\t\tlet job: WorkflowJob;\n\t\t\t\tif (operation === "status") job = engine.status(args.jobId);\n\t\t\t\telse if (operation === "request_merge") job = engine.requestMergeAuthorization(args.jobId);\n\t\t\t\telse if (operation === "merge") job = await engine.runWriterMerge(args.jobId, exec.signal);\n\t\t\t\telse if (operation === "cancel") job = await driver.cancel(args.jobId);\n\t\t\t\telse if (operation === "continue") {\n\t\t\t\t\tjob = engine.continue(args.jobId);\n\t\t\t\t\tdriver.enqueue(job.jobId);\n\t\t\t\t} else if (operation === "approve") {\n\t\t\t\t\tjob = engine.approve({ jobId: args.jobId, expectedHeadSha });\n\t\t\t\t\tdriver.enqueue(job.jobId);\n\t\t\t\t} else job = engine.reject({ jobId: args.jobId, expectedHeadSha });\n\t\t\t\treturn { ok: true, operation, ...project(job) };\n''',
)

replace(
    'src/index.ts',
    'import { WorkflowEngine } from "#internet/workflow/engine";\n',
    'import { WorkflowDriver } from "#internet/workflow/driver";\nimport { WorkflowEngine } from "#internet/workflow/engine";\n',
)
replace(
    'src/index.ts',
    '''\t\tconst workflowEngine = new WorkflowEngine(\n\t\t\tnew WorkflowJobStore(config.dataDir),\n''',
    '''\t\tconst workflowJobs = new WorkflowJobStore(config.dataDir);\n\t\tconst workflowEngine = new WorkflowEngine(\n\t\t\tworkflowJobs,\n''',
)
replace(
    'src/index.ts',
    '''\t\tctx.commands.register(defineWorkflowCommand({ engine: workflowEngine }));\n\t\tctx.tools.register(defineInternetWorkflowTool(workflowEngine));\n''',
    '''\t\tconst workflowDriver = new WorkflowDriver(workflowEngine, workflowJobs);\n\t\tctx.effect(() => () => workflowDriver.dispose());\n\t\tworkflowDriver.resumeActive();\n\t\tctx.commands.register(defineWorkflowCommand({ engine: workflowEngine, driver: workflowDriver }));\n\t\tctx.tools.register(defineInternetWorkflowTool(workflowEngine, workflowDriver));\n''',
)
replace(
    'src/index.ts',
    'export type { WorkflowControlStep } from "#internet/workflow/engine";\n',
    'export type { WorkflowDriverEngine } from "#internet/workflow/driver";\nexport { WorkflowDriver } from "#internet/workflow/driver";\nexport type { WorkflowControlStep } from "#internet/workflow/engine";\n',
)

# Merge execution is restart-idempotent when the Website writer discovers the PR already merged.
replace(
    'src/workflow/writer-runner.ts',
    '''\t\t\t"Immediately before attempting merge, read the actual current pull request from GitHub and verify repository, PR number, head branch, and current head SHA. If the current head SHA is not exactly the authorized SHA, do not open or approve a merge confirmation and return BLOCKED.",\n\t\t\t"Do not modify files, commits, branch contents, PR metadata, or repository settings. Merge exactly this one pull request and nothing else.",\n''',
    '''\t\t\t"Immediately before attempting merge, read the actual current pull request from GitHub and verify repository, PR number, head branch, and current head SHA. If the current head SHA is not exactly the authorized SHA, do not open or approve a merge confirmation and return BLOCKED.",\n\t\t\t"If this exact PR is already merged and its merged head is the authorized SHA, do not attempt another merge; reconcile the existing merge commit SHA and return the normal MERGED result. This makes restart after a completed Website merge idempotent.",\n\t\t\t"Do not modify files, commits, branch contents, PR metadata, or repository settings. Otherwise merge exactly this one pull request and nothing else.",\n''',
)

# Command tests now assert automatic enqueue and require an explicit driver dependency.
replace(
    'test/commands/workflow.test.ts',
    '''function engine() {\n\treturn { start: vi.fn((input: StartWorkflowInput) => fakeJob(input)) };\n}\n''',
    '''function engine() {\n\treturn { start: vi.fn((input: StartWorkflowInput) => fakeJob(input)) };\n}\n\nfunction driver() {\n\treturn { enqueue: vi.fn() };\n}\n''',
)
# Replace every defineWorkflowCommand construction lacking driver.
p = Path('test/commands/workflow.test.ts')
text = p.read_text()
text = text.replace('defineWorkflowCommand({ engine: workflow, runGit })', 'defineWorkflowCommand({ engine: workflow, driver: driver(), runGit })')
text = text.replace('defineWorkflowCommand({\n\t\t\tengine: workflow,', 'defineWorkflowCommand({\n\t\t\tengine: workflow,\n\t\t\tdriver: driver(),')
# First test needs an inspectable enqueuer.
text = text.replace(
    'const workflow = engine();\n\t\tconst command = defineWorkflowCommand({ engine: workflow, driver: driver(), runGit });',
    'const workflow = engine();\n\t\tconst enqueuer = driver();\n\t\tconst command = defineWorkflowCommand({ engine: workflow, driver: enqueuer, runGit });',
    1,
)
text = text.replace(
    '''\t\texpect(workflow.start).toHaveBeenCalledWith({\n\t\t\tobjective: "Correct the login redirect.",\n\t\t\trepository: "https://github.com/example/signal",\n\t\t\tbaseRevision: REVISION,\n\t\t\townerSessionId: "1-1",\n\t\t});\n''',
    '''\t\texpect(workflow.start).toHaveBeenCalledWith({\n\t\t\tobjective: "Correct the login redirect.",\n\t\t\trepository: "https://github.com/example/signal",\n\t\t\tbaseRevision: REVISION,\n\t\t\townerSessionId: "1-1",\n\t\t});\n\t\texpect(enqueuer.enqueue).toHaveBeenCalledWith(JOB_ID);\n''',
    1,
)
p.write_text(text)

# Tool tests use a real driver but intentionally keep it stopped by immediately disposing after start assertions where needed.
p = Path('test/internet-workflow.test.ts')
text = p.read_text()
text = text.replace(
    'import { WorkflowEngine } from "#internet/workflow/engine";\n',
    'import { WorkflowDriver } from "#internet/workflow/driver";\nimport { WorkflowEngine } from "#internet/workflow/engine";\n',
)
text = text.replace(
    '''function tool() {\n\tconst root = mkdtempSync(join(tmpdir(), "internet-workflow-tool-"));\n\troots.push(root);\n\treturn defineInternetWorkflowTool(new WorkflowEngine(new WorkflowJobStore(root)));\n}\n''',
    '''function tool() {\n\tconst root = mkdtempSync(join(tmpdir(), "internet-workflow-tool-"));\n\troots.push(root);\n\tconst jobs = new WorkflowJobStore(root);\n\tconst engine = new WorkflowEngine(jobs);\n\tconst driver = new WorkflowDriver(engine, jobs);\n\treturn defineInternetWorkflowTool(engine, driver);\n}\n''',
)
p.write_text(text)

Path('test/workflow-driver.test.ts').write_text(r'''import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowDriver, type WorkflowDriverEngine } from "#internet/workflow/driver";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowJob, WorkflowState } from "#internet/workflow/types";

const roots: string[] = [];
const sha = "0123456789abcdef0123456789abcdef01234567";

function root(): string {
	const value = mkdtempSync(join(tmpdir(), "internet-driver-"));
	roots.push(value);
	return value;
}

function start(jobs: WorkflowJobStore) {
	return new WorkflowEngine(jobs).start({
		objective: "Drive this workflow",
		repository: "https://github.com/example/repo",
		baseRevision: sha,
		ownerSessionId: "agent-driver",
	});
}

function advance(job: WorkflowJob, state: WorkflowState, event?: string): WorkflowJob {
	return {
		...job,
		revision: job.revision + 1,
		state,
		updatedAt: new Date().toISOString(),
		...(event === undefined ? {} : { lastEvent: { type: event, class: "INTERNAL" as const, at: new Date().toISOString() } }),
	};
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe("WorkflowDriver", () => {
	it("drives deterministic phases to the merge-authorization boundary", async () => {
		const jobs = new WorkflowJobStore(root());
		let current = start(jobs);
		const calls: string[] = [];
		const engine: WorkflowDriverEngine = {
			status: () => current,
			async runResearch() { calls.push("research"); current = advance(current, "RESEARCH_HANDOFFS_DELIVERING"); return current; },
			async runWriterImplementation() { calls.push("writer"); current = advance(current, "PR_OPEN"); return current; },
			async runReview() { calls.push("review"); current = advance(current, "REVIEW_HANDOFFS_DELIVERING"); return current; },
			async runWriterRemediation() { calls.push("gate"); current = advance(current, "READY_FOR_MERGE_AUTHORIZATION", "REVIEW_GATE_PASSED"); return current; },
			requestMergeAuthorization() { calls.push("request-merge"); current = advance(current, "AWAITING_MERGE_AUTHORIZATION"); return current; },
			async runWriterMerge() { throw new Error("unexpected merge"); },
			markRetryRequired() { throw new Error("unexpected retry"); },
			cancel() { current = advance(current, "CANCELLED"); return current; },
		};
		const driver = new WorkflowDriver(engine, jobs);
		driver.enqueue(current.jobId);
		await vi.waitFor(() => expect(driver.isActive(current.jobId)).toBe(false));
		expect(calls).toEqual(["research", "writer", "review", "gate", "request-merge"]);
		expect(current.state).toBe("AWAITING_MERGE_AUTHORIZATION");
	});

	it("deduplicates concurrent enqueue calls by job id", async () => {
		const jobs = new WorkflowJobStore(root());
		let current = start(jobs);
		let release!: () => void;
		const waiting = new Promise<void>((resolve) => { release = resolve; });
		const runResearch = vi.fn(async () => { await waiting; current = advance(current, "FAILED_RETRYABLE"); return current; });
		const engine = {
			status: () => current,
			runResearch,
			markRetryRequired: (_id: string, message: string, resumeState: WorkflowState) => {
				current = { ...advance(current, "FAILED_RETRYABLE"), pendingAction: { kind: "RETRY_REQUIRED" as const, message, resumeState } };
				return current;
			},
			cancel: () => current,
		} as unknown as WorkflowDriverEngine;
		const driver = new WorkflowDriver(engine, jobs);
		driver.enqueue(current.jobId);
		driver.enqueue(current.jobId);
		await vi.waitFor(() => expect(runResearch).toHaveBeenCalledTimes(1));
		release();
		await vi.waitFor(() => expect(driver.isActive(current.jobId)).toBe(false));
		expect(runResearch).toHaveBeenCalledTimes(1);
	});

	it("does not auto-resume a rejected merge request after restart discovery", async () => {
		const jobs = new WorkflowJobStore(root());
		const created = start(jobs);
		jobs.update(created.jobId, (job) => ({
			...job,
			revision: job.revision + 1,
			state: "READY_FOR_MERGE_AUTHORIZATION",
			lastEvent: { type: "MERGE_AUTHORIZATION_REJECTED", class: "INTERNAL", at: new Date().toISOString() },
			updatedAt: new Date().toISOString(),
		}));
		const engine = { status: (id: string) => jobs.get(id)! } as unknown as WorkflowDriverEngine;
		const driver = new WorkflowDriver(engine, jobs);
		driver.resumeActive();
		await Promise.resolve();
		expect(driver.isActive(created.jobId)).toBe(false);
	});

	it("records unexpected execution failure as explicit retry-required state", async () => {
		const jobs = new WorkflowJobStore(root());
		const created = start(jobs);
		const engine = new WorkflowEngine(jobs, { async run() { throw new Error("browser transport failed"); } });
		const driver = new WorkflowDriver(engine, jobs);
		driver.enqueue(created.jobId);
		await vi.waitFor(() => expect(driver.isActive(created.jobId)).toBe(false));
		const failed = engine.status(created.jobId);
		expect(failed.state).toBe("FAILED_RETRYABLE");
		expect(failed.pendingAction).toMatchObject({ kind: "RETRY_REQUIRED", resumeState: "RESEARCH_RUNNING" });
	});

	it("aborts and settles active work before persisting cancellation", async () => {
		const jobs = new WorkflowJobStore(root());
		let current = start(jobs);
		let observedAbort = false;
		const engine: WorkflowDriverEngine = {
			status: () => current,
			async runResearch(_id, signal) {
				await new Promise<void>((resolve) => signal?.addEventListener("abort", () => { observedAbort = true; resolve(); }, { once: true }));
				return current;
			},
			async runWriterImplementation() { return current; }, async runReview() { return current; }, async runWriterRemediation() { return current; },
			requestMergeAuthorization() { return current; }, async runWriterMerge() { return current; },
			markRetryRequired() { return current; },
			cancel() { current = advance(current, "CANCELLED"); return current; },
		};
		const driver = new WorkflowDriver(engine, jobs);
		driver.enqueue(current.jobId);
		await vi.waitFor(() => expect(driver.isActive(current.jobId)).toBe(true));
		const cancelled = await driver.cancel(current.jobId);
		expect(observedAbort).toBe(true);
		expect(cancelled.state).toBe("CANCELLED");
		expect(driver.isActive(current.jobId)).toBe(false);
	});
});
''')

# Add a P11 architecture note, but keep P12/P13 unimplemented.
p = Path('docs/UPDATE.md')
text = p.read_text()
if '## P11 automatic workflow driver' not in text:
    text += '''\n\n## P11 automatic workflow driver\n\nP11 is now the highest-ROI next phase. A deterministic `WorkflowDriver` advances existing engine primitives in the background from job creation through research, writer implementation, PR review/remediation, and the explicit merge-authorization boundary. It is deliberately not another model layer: code owns state transitions and stop conditions, while Website models continue to own reasoning and implementation content.\n\nThe driver deduplicates active work by job ID, resumes safe runnable jobs discovered from durable storage after plugin restart, leaves action-required/human-authority states stopped, and keeps a rejected merge request quiet until explicitly requested again. Unexpected driver errors become durable retry-required actions with an exact resume state. Exact-head approval resumes MERGING automatically; cancellation aborts and settles an active driver turn before persisting CANCELLED.\n'''
    p.write_text(text)

# Mark implementation status only after this patch is applied; final CI will validate before PR.
p = Path('docs/TODO.md')
text = p.read_text()
text = text.replace('## P11 — Automatic workflow driver\n\n**ROI:** critical', '## P11 — Automatic workflow driver\n\n**Status:** implementation in progress on `impl/p11-workflow-driver`.\n\n**ROI:** critical', 1)
p.write_text(text)
