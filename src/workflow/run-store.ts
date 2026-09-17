import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import type { WorkflowRun } from "#internet/workflow/kernel/types";
import { parseWorkflowRun } from "#internet/workflow/kernel/validation";

export class WorkflowRunStoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowRunStoreError";
	}
}

function assertRunId(runId: string): void {
	if (!/^[0-9a-f]{32}$/u.test(runId)) throw new WorkflowRunStoreError("workflow run id must be 32 lowercase hex characters");
}

function assertPrivateFile(path: string, label: string): void {
	const stat = lstatSync(path);
	if (!stat.isFile()) throw new WorkflowRunStoreError(`${label} is not a regular file`);
	if (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
		throw new WorkflowRunStoreError(`${label} permissions must be 0600`);
}

export class WorkflowRunStore {
	private readonly runsDir: string;

	constructor(dataDir: string) {
		this.runsDir = join(dataDir, "workflows", "runs");
	}

	pathFor(runId: string): string {
		assertRunId(runId);
		return join(this.runsDir, `${runId}.json`);
	}

	create(run: WorkflowRun): WorkflowRun {
		parseWorkflowRun(run);
		const path = this.pathFor(run.runId);
		if (existsSync(path)) throw new WorkflowRunStoreError(`workflow run ${run.runId} already exists`);
		ensurePrivateDirectory(this.runsDir);
		writePrivateJson(path, run);
		return run;
	}

	get(runId: string): WorkflowRun | undefined {
		const path = this.pathFor(runId);
		if (!existsSync(path)) return undefined;
		assertPrivateFile(path, `workflow run ${runId}`);
		try {
			return parseWorkflowRun(JSON.parse(readFileSync(path, "utf8")));
		} catch (error) {
			throw new WorkflowRunStoreError(
				`workflow run ${runId} is invalid: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	list(): readonly WorkflowRun[] {
		if (!existsSync(this.runsDir)) return [];
		if (!lstatSync(this.runsDir).isDirectory()) throw new WorkflowRunStoreError("workflow runs path is not a directory");
		return readdirSync(this.runsDir)
			.filter((name) => /^[0-9a-f]{32}\.json$/u.test(name))
			.sort()
			.map((name) => {
				const run = this.get(name.slice(0, -5));
				if (run === undefined) throw new WorkflowRunStoreError(`workflow run ${name} disappeared during enumeration`);
				return run;
			});
	}

	update(runId: string, expectedRevision: number, mutate: (current: WorkflowRun) => WorkflowRun): WorkflowRun {
		const current = this.get(runId);
		if (current === undefined) throw new WorkflowRunStoreError(`workflow run ${runId} does not exist`);
		if (current.revision !== expectedRevision) {
			throw new WorkflowRunStoreError(
				`workflow run ${runId} revision conflict: expected ${expectedRevision}, current ${current.revision}`,
			);
		}
		const next = mutate(current);
		if (next.runId !== current.runId) throw new WorkflowRunStoreError("workflow run id cannot change");
		if (next.admissionId !== current.admissionId) throw new WorkflowRunStoreError("workflow run admission id cannot change");
		if (next.revision !== current.revision + 1)
			throw new WorkflowRunStoreError("workflow run revision must increment by one");
		parseWorkflowRun(next);
		writePrivateJson(this.pathFor(runId), next);
		return next;
	}
}
