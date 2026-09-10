import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";

export const WORKFLOW_NODE_RESULT_SCHEMA = "@tsuuanmi/internet-workflow-node-result" as const;

export interface WorkflowNodeResult {
	readonly schema: typeof WORKFLOW_NODE_RESULT_SCHEMA;
	readonly version: 1;
	readonly resultId: string;
	readonly jobId: string;
	readonly nodeId: string;
	readonly inputHash: string;
	readonly payload: string;
	readonly outputHash: string;
	readonly completedAt: string;
}

export interface CreateWorkflowNodeResultInput {
	readonly jobId: string;
	readonly nodeId: string;
	readonly inputHash: string;
	readonly payload: string;
}

export class WorkflowNodeResultStoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowNodeResultStoreError";
	}
}

export function hashWorkflowNodePayload(payload: string): string {
	return createHash("sha256").update(payload, "utf8").digest("hex");
}

function deterministicResultId(input: Omit<CreateWorkflowNodeResultInput, "payload">): string {
	return createHash("sha256")
		.update(`${input.jobId}\0${input.nodeId}\0${input.inputHash}`, "utf8")
		.digest("hex");
}

function assertHex(value: string, length: number, name: string): void {
	if (!new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value)) {
		throw new WorkflowNodeResultStoreError(`${name} must be ${String(length)} lowercase hex characters`);
	}
}

function assertNodeId(nodeId: string): void {
	if (nodeId.trim() === "" || nodeId.includes("\0")) throw new WorkflowNodeResultStoreError("workflow node id is invalid");
}

function assertInput(input: CreateWorkflowNodeResultInput): void {
	assertHex(input.jobId, 32, "workflow job id");
	assertNodeId(input.nodeId);
	assertHex(input.inputHash, 64, "workflow node input hash");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseWorkflowNodeResult(value: unknown): WorkflowNodeResult {
	if (!isRecord(value) || value.schema !== WORKFLOW_NODE_RESULT_SCHEMA || value.version !== 1) {
		throw new Error("unsupported workflow node result schema");
	}
	if (typeof value.resultId !== "string" || !/^[0-9a-f]{64}$/u.test(value.resultId))
		throw new Error("invalid workflow node result id");
	if (typeof value.jobId !== "string" || !/^[0-9a-f]{32}$/u.test(value.jobId)) throw new Error("invalid workflow job id");
	if (typeof value.nodeId !== "string" || value.nodeId.trim() === "" || value.nodeId.includes("\0"))
		throw new Error("invalid workflow node id");
	if (typeof value.inputHash !== "string" || !/^[0-9a-f]{64}$/u.test(value.inputHash))
		throw new Error("invalid workflow node input hash");
	if (typeof value.payload !== "string") throw new Error("invalid workflow node result payload");
	if (typeof value.outputHash !== "string" || !/^[0-9a-f]{64}$/u.test(value.outputHash))
		throw new Error("invalid workflow node output hash");
	if (hashWorkflowNodePayload(value.payload) !== value.outputHash) throw new Error("workflow node result hash mismatch");
	if (typeof value.completedAt !== "string" || !Number.isFinite(Date.parse(value.completedAt)))
		throw new Error("invalid workflow node completion timestamp");
	const expectedId = deterministicResultId({ jobId: value.jobId, nodeId: value.nodeId, inputHash: value.inputHash });
	if (value.resultId !== expectedId) throw new Error("workflow node result id does not match logical identity");
	return value as unknown as WorkflowNodeResult;
}

/** Private immutable storage for exact graph-node outputs required by downstream retries/resume. */
export class WorkflowNodeResultStore {
	private readonly root: string;

	constructor(dataDir: string) {
		this.root = join(dataDir, "workflows", "node-results");
	}

	private jobDir(jobId: string): string {
		assertHex(jobId, 32, "workflow job id");
		return join(this.root, jobId);
	}

	pathFor(jobId: string, resultId: string): string {
		assertHex(resultId, 64, "workflow node result id");
		return join(this.jobDir(jobId), `${resultId}.json`);
	}

	create(input: CreateWorkflowNodeResultInput): WorkflowNodeResult {
		assertInput(input);
		const resultId = deterministicResultId(input);
		const outputHash = hashWorkflowNodePayload(input.payload);
		const path = this.pathFor(input.jobId, resultId);
		if (existsSync(path)) {
			const current = this.get(input.jobId, resultId);
			if (
				current === undefined ||
				current.nodeId !== input.nodeId ||
				current.inputHash !== input.inputHash ||
				current.outputHash !== outputHash ||
				current.payload !== input.payload
			) {
				throw new WorkflowNodeResultStoreError(`workflow node result ${resultId} already exists with different content`);
			}
			return current;
		}
		const result: WorkflowNodeResult = {
			schema: WORKFLOW_NODE_RESULT_SCHEMA,
			version: 1,
			resultId,
			jobId: input.jobId,
			nodeId: input.nodeId,
			inputHash: input.inputHash,
			payload: input.payload,
			outputHash,
			completedAt: new Date().toISOString(),
		};
		ensurePrivateDirectory(this.root);
		ensurePrivateDirectory(this.jobDir(input.jobId));
		writePrivateJson(path, result);
		return result;
	}

	get(jobId: string, resultId: string): WorkflowNodeResult | undefined {
		const path = this.pathFor(jobId, resultId);
		if (!existsSync(path)) return undefined;
		const stat = lstatSync(path);
		if (!stat.isFile()) throw new WorkflowNodeResultStoreError(`workflow node result ${resultId} is not a regular file`);
		if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
			throw new WorkflowNodeResultStoreError(`workflow node result ${resultId} permissions must be 0600`);
		}
		try {
			return parseWorkflowNodeResult(JSON.parse(readFileSync(path, "utf8")));
		} catch (error) {
			throw new WorkflowNodeResultStoreError(
				`workflow node result ${resultId} is invalid: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}
