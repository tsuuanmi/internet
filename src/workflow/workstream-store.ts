import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson } from "#internet/core/canonical-json";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import type { WorkflowWorkstream } from "#internet/workflow/workstream";
import { parseWorkflowWorkstream } from "#internet/workflow/workstream";

export class WorkflowWorkstreamStoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowWorkstreamStoreError";
	}
}

function assertId(value: string, label: string): void {
	if (!/^[0-9a-f]{32}$/u.test(value)) throw new WorkflowWorkstreamStoreError(`${label} must be 32 lowercase hex characters`);
}

function assertPrivateFile(path: string, label: string): void {
	const stat = lstatSync(path);
	if (!stat.isFile()) throw new WorkflowWorkstreamStoreError(`${label} is not a regular file`);
	if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
		throw new WorkflowWorkstreamStoreError(`${label} permissions must be 0600`);
	}
}

export class WorkflowWorkstreamStore {
	private readonly directory: string;

	constructor(dataDir: string) {
		this.directory = join(dataDir, "workflows", "workstreams");
	}

	pathFor(workstreamId: string): string {
		assertId(workstreamId, "workflow Workstream id");
		return join(this.directory, `${workstreamId}.json`);
	}

	create(workstream: WorkflowWorkstream): WorkflowWorkstream {
		parseWorkflowWorkstream(workstream);
		const path = this.pathFor(workstream.workstreamId);
		if (existsSync(path)) throw new WorkflowWorkstreamStoreError(`workflow Workstream ${workstream.workstreamId} already exists`);
		ensurePrivateDirectory(this.directory);
		writePrivateJson(path, workstream);
		return workstream;
	}

	get(workstreamId: string): WorkflowWorkstream | undefined {
		const path = this.pathFor(workstreamId);
		if (!existsSync(path)) return undefined;
		assertPrivateFile(path, `workflow Workstream ${workstreamId}`);
		try {
			return parseWorkflowWorkstream(JSON.parse(readFileSync(path, "utf8")));
		} catch (error) {
			throw new WorkflowWorkstreamStoreError(
				`workflow Workstream ${workstreamId} is invalid: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	list(): readonly WorkflowWorkstream[] {
		if (!existsSync(this.directory)) return [];
		if (!lstatSync(this.directory).isDirectory()) {
			throw new WorkflowWorkstreamStoreError("workflow Workstreams path is not a directory");
		}
		return readdirSync(this.directory)
			.filter((name) => /^[0-9a-f]{32}\.json$/u.test(name))
			.sort()
			.map((name) => {
				const workstream = this.get(name.slice(0, -5));
				if (workstream === undefined) {
					throw new WorkflowWorkstreamStoreError(`workflow Workstream ${name} disappeared during enumeration`);
				}
				return workstream;
			});
	}

	update(
		workstreamId: string,
		expectedRevision: number,
		mutate: (current: WorkflowWorkstream) => WorkflowWorkstream,
	): WorkflowWorkstream {
		const current = this.get(workstreamId);
		if (current === undefined) throw new WorkflowWorkstreamStoreError(`workflow Workstream ${workstreamId} does not exist`);
		if (current.revision !== expectedRevision) {
			throw new WorkflowWorkstreamStoreError(
				`workflow Workstream ${workstreamId} revision conflict: expected ${expectedRevision}, current ${current.revision}`,
			);
		}
		const next = mutate(current);
		if (next.workstreamId !== current.workstreamId) throw new WorkflowWorkstreamStoreError("workflow Workstream id cannot change");
		if (canonicalJson(next.owner) !== canonicalJson(current.owner)) {
			throw new WorkflowWorkstreamStoreError("workflow Workstream owner cannot change");
		}
		if (next.createdAt !== current.createdAt) {
			throw new WorkflowWorkstreamStoreError("workflow Workstream creation timestamp cannot change");
		}
		if (next.revision !== current.revision + 1) {
			throw new WorkflowWorkstreamStoreError("workflow Workstream revision must increment by one");
		}
		parseWorkflowWorkstream(next);
		writePrivateJson(this.pathFor(workstreamId), next);
		return next;
	}
}
