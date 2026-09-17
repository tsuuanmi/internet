import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson } from "#internet/core/canonical-json";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import {
	parseWorkflowSemanticExecutionResult,
	type WorkflowSemanticExecutionResult,
} from "#internet/workflow/semantic/index";

export class WorkflowExecutionResultStoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowExecutionResultStoreError";
	}
}

function assertHex(value: string, length: number, label: string): void {
	if (!new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value))
		throw new WorkflowExecutionResultStoreError(`${label} must be ${String(length)} lowercase hex characters`);
}

function assertPrivateFile(path: string, label: string): void {
	const stat = lstatSync(path);
	if (!stat.isFile()) throw new WorkflowExecutionResultStoreError(`${label} is not a regular file`);
	if (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
		throw new WorkflowExecutionResultStoreError(`${label} permissions must be 0600`);
}

export class WorkflowExecutionResultStore {
	private readonly root: string;

	constructor(dataDir: string) {
		this.root = join(dataDir, "workflows", "execution-results");
	}

	private runDir(runId: string): string {
		assertHex(runId, 32, "workflow execution result run id");
		return join(this.root, runId);
	}

	pathFor(runId: string, executionId: string): string {
		assertHex(executionId, 32, "workflow execution result execution id");
		return join(this.runDir(runId), `${executionId}.json`);
	}

	create(runId: string, resultValue: unknown): WorkflowSemanticExecutionResult {
		const result = parseWorkflowSemanticExecutionResult(resultValue);
		assertHex(result.executionId, 32, "workflow execution result execution id");
		const path = this.pathFor(runId, result.executionId);
		if (existsSync(path)) {
			const current = this.get(runId, result.executionId);
			if (current === undefined) throw new WorkflowExecutionResultStoreError(`workflow result ${result.executionId} disappeared`);
			if (canonicalJson(current) !== canonicalJson(result))
				throw new WorkflowExecutionResultStoreError(`workflow result ${result.executionId} conflicts with persisted result`);
			return current;
		}
		ensurePrivateDirectory(this.runDir(runId));
		writePrivateJson(path, result);
		return result;
	}

	get(runId: string, executionId: string): WorkflowSemanticExecutionResult | undefined {
		const path = this.pathFor(runId, executionId);
		if (!existsSync(path)) return undefined;
		assertPrivateFile(path, `workflow execution result ${executionId}`);
		try {
			return parseWorkflowSemanticExecutionResult(JSON.parse(readFileSync(path, "utf8")));
		} catch (error) {
			throw new WorkflowExecutionResultStoreError(
				`workflow execution result ${executionId} is invalid: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	list(runId: string): readonly WorkflowSemanticExecutionResult[] {
		const directory = this.runDir(runId);
		if (!existsSync(directory)) return [];
		if (!lstatSync(directory).isDirectory())
			throw new WorkflowExecutionResultStoreError(`workflow execution results path for run ${runId} is not a directory`);
		return readdirSync(directory)
			.filter((name) => /^[0-9a-f]{32}\.json$/u.test(name))
			.sort()
			.map((name) => {
				const result = this.get(runId, name.slice(0, -5));
				if (result === undefined)
					throw new WorkflowExecutionResultStoreError(`workflow result ${name} disappeared during enumeration`);
				return result;
			});
	}
}
