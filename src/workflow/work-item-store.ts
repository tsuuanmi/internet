import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import type { WorkflowWorkItem } from "#internet/workflow/kernel/types";
import { parseWorkflowWorkItem } from "#internet/workflow/kernel/validation";

export class WorkflowWorkItemStoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowWorkItemStoreError";
	}
}

function assertHex(value: string, length: number, label: string): void {
	if (!new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value)) {
		throw new WorkflowWorkItemStoreError(`${label} must be ${String(length)} lowercase hex characters`);
	}
}

function assertPrivateFile(path: string, label: string): void {
	const stat = lstatSync(path);
	if (!stat.isFile()) throw new WorkflowWorkItemStoreError(`${label} is not a regular file`);
	if (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
		throw new WorkflowWorkItemStoreError(`${label} permissions must be 0600`);
}

export class WorkflowWorkItemStore {
	private readonly root: string;

	constructor(dataDir: string) {
		this.root = join(dataDir, "workflows", "work-items");
	}

	private runDir(runId: string): string {
		assertHex(runId, 32, "workflow run id");
		return join(this.root, runId);
	}

	pathFor(runId: string, workItemId: string): string {
		assertHex(workItemId, 32, "workflow work item id");
		return join(this.runDir(runId), `${workItemId}.json`);
	}

	create(item: WorkflowWorkItem): WorkflowWorkItem {
		parseWorkflowWorkItem(item);
		const path = this.pathFor(item.runId, item.workItemId);
		if (existsSync(path)) throw new WorkflowWorkItemStoreError(`workflow work item ${item.workItemId} already exists`);
		ensurePrivateDirectory(this.runDir(item.runId));
		writePrivateJson(path, item);
		return item;
	}

	get(runId: string, workItemId: string): WorkflowWorkItem | undefined {
		const path = this.pathFor(runId, workItemId);
		if (!existsSync(path)) return undefined;
		assertPrivateFile(path, `workflow work item ${workItemId}`);
		try {
			return parseWorkflowWorkItem(JSON.parse(readFileSync(path, "utf8")));
		} catch (error) {
			throw new WorkflowWorkItemStoreError(
				`workflow work item ${workItemId} is invalid: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	list(runId: string): readonly WorkflowWorkItem[] {
		const directory = this.runDir(runId);
		if (!existsSync(directory)) return [];
		if (!lstatSync(directory).isDirectory())
			throw new WorkflowWorkItemStoreError(`workflow work items path for run ${runId} is not a directory`);
		return readdirSync(directory)
			.filter((name) => /^[0-9a-f]{32}\.json$/u.test(name))
			.sort()
			.map((name) => {
				const item = this.get(runId, name.slice(0, -5));
				if (item === undefined)
					throw new WorkflowWorkItemStoreError(`workflow work item ${name} disappeared during enumeration`);
				return item;
			});
	}

	update(
		runId: string,
		workItemId: string,
		expectedRevision: number,
		mutate: (current: WorkflowWorkItem) => WorkflowWorkItem,
	): WorkflowWorkItem {
		const current = this.get(runId, workItemId);
		if (current === undefined) throw new WorkflowWorkItemStoreError(`workflow work item ${workItemId} does not exist`);
		if (current.revision !== expectedRevision) {
			throw new WorkflowWorkItemStoreError(
				`workflow work item ${workItemId} revision conflict: expected ${expectedRevision}, current ${current.revision}`,
			);
		}
		const next = mutate(current);
		if (next.runId !== current.runId) throw new WorkflowWorkItemStoreError("workflow work item run id cannot change");
		if (next.workItemId !== current.workItemId) throw new WorkflowWorkItemStoreError("workflow work item id cannot change");
		if (next.needId !== current.needId) throw new WorkflowWorkItemStoreError("workflow work item need id cannot change");
		if (next.revision !== current.revision + 1)
			throw new WorkflowWorkItemStoreError("workflow work item revision must increment by one");
		parseWorkflowWorkItem(next);
		writePrivateJson(this.pathFor(runId, workItemId), next);
		return next;
	}
}
