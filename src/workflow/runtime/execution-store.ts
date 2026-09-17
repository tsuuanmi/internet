import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson } from "#internet/core/canonical-json";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import {
	WORKFLOW_EXECUTION_SCHEMA,
	WORKFLOW_EXECUTION_STATES,
	type WorkflowExecution,
	type WorkflowExecutionFailure,
} from "#internet/workflow/runtime/types";

export class WorkflowExecutionStoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowExecutionStoreError";
	}
}

function assertHex(value: unknown, length: number, label: string): asserts value is string {
	if (typeof value !== "string" || !new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value))
		throw new WorkflowExecutionStoreError(`invalid ${label}`);
}

function assertText(value: unknown, label: string): asserts value is string {
	if (typeof value !== "string" || value.trim() === "" || value.includes("\0"))
		throw new WorkflowExecutionStoreError(`invalid ${label}`);
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
	if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
		throw new WorkflowExecutionStoreError(`invalid ${label}`);
}

function assertFailure(value: unknown): asserts value is WorkflowExecutionFailure {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		throw new WorkflowExecutionStoreError("invalid workflow execution failure");
	const failure = value as Record<string, unknown>;
	assertText(failure.code, "workflow execution failure code");
	assertText(failure.message, "workflow execution failure message");
	if (typeof failure.retryable !== "boolean")
		throw new WorkflowExecutionStoreError("invalid workflow execution failure retryable flag");
}

export function parseWorkflowExecution(value: unknown): WorkflowExecution {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		throw new WorkflowExecutionStoreError("invalid workflow execution");
	const execution = value as Record<string, unknown>;
	if (execution.schema !== WORKFLOW_EXECUTION_SCHEMA || execution.version !== 1)
		throw new WorkflowExecutionStoreError("unsupported workflow execution schema");
	if (typeof execution.revision !== "number" || !Number.isSafeInteger(execution.revision) || execution.revision < 1)
		throw new WorkflowExecutionStoreError("invalid workflow execution revision");
	assertHex(execution.executionId, 32, "workflow execution id");
	assertHex(execution.runId, 32, "workflow execution run id");
	assertHex(execution.workItemId, 32, "workflow execution work item id");
	assertHex(execution.inputBundleId, 64, "workflow execution input bundle id");
	if (typeof execution.capability !== "object" || execution.capability === null || Array.isArray(execution.capability))
		throw new WorkflowExecutionStoreError("invalid workflow execution capability");
	const capability = execution.capability as Record<string, unknown>;
	assertText(capability.id, "workflow execution capability id");
	assertText(capability.version, "workflow execution capability version");
	if (typeof execution.attempt !== "number" || !Number.isSafeInteger(execution.attempt) || execution.attempt < 1)
		throw new WorkflowExecutionStoreError("invalid workflow execution attempt");
	assertText(execution.ownerInstanceId, "workflow execution owner");
	if (
		typeof execution.state !== "string" ||
		!WORKFLOW_EXECUTION_STATES.includes(execution.state as WorkflowExecution["state"])
	)
		throw new WorkflowExecutionStoreError("invalid workflow execution state");
	assertTimestamp(execution.startedAt, "workflow execution startedAt");
	assertTimestamp(execution.heartbeatAt, "workflow execution heartbeatAt");
	assertTimestamp(execution.leaseUntil, "workflow execution leaseUntil");
	if (execution.finishedAt !== undefined) assertTimestamp(execution.finishedAt, "workflow execution finishedAt");
	if (execution.failure !== undefined) assertFailure(execution.failure);
	if (execution.state === "FAILED" && execution.failure === undefined)
		throw new WorkflowExecutionStoreError("failed workflow execution requires failure details");
	if (["SUCCEEDED", "FAILED", "FENCED"].includes(execution.state as string) && execution.finishedAt === undefined)
		throw new WorkflowExecutionStoreError("terminal workflow execution requires finishedAt");
	return value as WorkflowExecution;
}

function assertPrivateFile(path: string, label: string): void {
	const stat = lstatSync(path);
	if (!stat.isFile()) throw new WorkflowExecutionStoreError(`${label} is not a regular file`);
	if (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
		throw new WorkflowExecutionStoreError(`${label} permissions must be 0600`);
}

export class WorkflowExecutionStore {
	private readonly root: string;

	constructor(dataDir: string) {
		this.root = join(dataDir, "workflows", "executions");
	}

	private runDir(runId: string): string {
		assertHex(runId, 32, "workflow execution run id");
		return join(this.root, runId);
	}

	pathFor(runId: string, executionId: string): string {
		assertHex(executionId, 32, "workflow execution id");
		return join(this.runDir(runId), `${executionId}.json`);
	}

	create(execution: WorkflowExecution): WorkflowExecution {
		parseWorkflowExecution(execution);
		const path = this.pathFor(execution.runId, execution.executionId);
		if (existsSync(path))
			throw new WorkflowExecutionStoreError(`workflow execution ${execution.executionId} already exists`);
		ensurePrivateDirectory(this.runDir(execution.runId));
		writePrivateJson(path, execution);
		return execution;
	}

	get(runId: string, executionId: string): WorkflowExecution | undefined {
		const path = this.pathFor(runId, executionId);
		if (!existsSync(path)) return undefined;
		assertPrivateFile(path, `workflow execution ${executionId}`);
		try {
			return parseWorkflowExecution(JSON.parse(readFileSync(path, "utf8")));
		} catch (error) {
			throw new WorkflowExecutionStoreError(
				`workflow execution ${executionId} is invalid: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	list(runId: string): readonly WorkflowExecution[] {
		const directory = this.runDir(runId);
		if (!existsSync(directory)) return [];
		if (!lstatSync(directory).isDirectory())
			throw new WorkflowExecutionStoreError(`workflow executions path for run ${runId} is not a directory`);
		return readdirSync(directory)
			.filter((name) => /^[0-9a-f]{32}\.json$/u.test(name))
			.sort()
			.map((name) => {
				const execution = this.get(runId, name.slice(0, -5));
				if (execution === undefined)
					throw new WorkflowExecutionStoreError(`workflow execution ${name} disappeared during enumeration`);
				return execution;
			});
	}

	update(
		runId: string,
		executionId: string,
		expectedRevision: number,
		mutate: (current: WorkflowExecution) => WorkflowExecution,
	): WorkflowExecution {
		const current = this.get(runId, executionId);
		if (current === undefined)
			throw new WorkflowExecutionStoreError(`workflow execution ${executionId} does not exist`);
		if (current.revision !== expectedRevision)
			throw new WorkflowExecutionStoreError(
				`workflow execution ${executionId} revision conflict: expected ${expectedRevision}, current ${current.revision}`,
			);
		const next = mutate(current);
		for (const [label, before, after] of [
			["run id", current.runId, next.runId],
			["execution id", current.executionId, next.executionId],
			["work item id", current.workItemId, next.workItemId],
			["input bundle id", current.inputBundleId, next.inputBundleId],
			["owner", current.ownerInstanceId, next.ownerInstanceId],
			["started timestamp", current.startedAt, next.startedAt],
		] as const) {
			if (before !== after) throw new WorkflowExecutionStoreError(`workflow execution ${label} cannot change`);
		}
		if (canonicalJson(current.capability) !== canonicalJson(next.capability))
			throw new WorkflowExecutionStoreError("workflow execution capability cannot change");
		if (current.attempt !== next.attempt)
			throw new WorkflowExecutionStoreError("workflow execution attempt cannot change");
		if (next.revision !== current.revision + 1)
			throw new WorkflowExecutionStoreError("workflow execution revision must increment by one");
		if (current.state !== "RUNNING")
			throw new WorkflowExecutionStoreError("terminal workflow execution cannot change");
		parseWorkflowExecution(next);
		writePrivateJson(this.pathFor(runId, executionId), next);
		return next;
	}
}
