import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type AccountId, isAccountId } from "#internet/core/accounts";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";

export const HANDOFF_SCHEMA = "@tsuuanmi/internet-workflow-handoff" as const;

export type WorkflowHandoffStatus = "pending" | "delivered";

export interface WorkflowHandoff {
	readonly schema: typeof HANDOFF_SCHEMA;
	readonly version: 1;
	readonly handoffId: string;
	readonly jobId: string;
	readonly source: string;
	readonly recipient: AccountId;
	readonly sequence: number;
	/** Exact data-plane message. Never summarize or normalize this value. */
	readonly payload: string;
	readonly payloadHash: string;
	readonly status: WorkflowHandoffStatus;
	readonly createdAt: string;
	readonly deliveredAt?: string;
}

export interface CreateWorkflowHandoffInput {
	readonly jobId: string;
	readonly source: string;
	readonly recipient: AccountId;
	readonly sequence: number;
	readonly payload: string;
}

export class WorkflowHandoffStoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowHandoffStoreError";
	}
}

export function hashHandoffPayload(payload: string): string {
	return createHash("sha256").update(payload, "utf8").digest("hex");
}

function deterministicHandoffId(input: Omit<CreateWorkflowHandoffInput, "payload">): string {
	return createHash("sha256")
		.update(`${input.jobId}\0${input.source}\0${input.recipient}\0${String(input.sequence)}`, "utf8")
		.digest("hex");
}

function assertHex(value: string, length: number, name: string): void {
	if (!new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value)) {
		throw new WorkflowHandoffStoreError(`${name} must be ${String(length)} lowercase hex characters`);
	}
}

function assertInput(input: CreateWorkflowHandoffInput): void {
	assertHex(input.jobId, 32, "workflow job id");
	if (input.source.trim() === "") throw new WorkflowHandoffStoreError("handoff source is required");
	if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) {
		throw new WorkflowHandoffStoreError("handoff sequence must be a positive integer");
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseWorkflowHandoff(value: unknown): WorkflowHandoff {
	if (!isRecord(value) || value.schema !== HANDOFF_SCHEMA || value.version !== 1) {
		throw new Error("unsupported handoff schema");
	}
	if (typeof value.handoffId !== "string" || !/^[0-9a-f]{64}$/u.test(value.handoffId))
		throw new Error("invalid handoff id");
	if (typeof value.jobId !== "string" || !/^[0-9a-f]{32}$/u.test(value.jobId)) throw new Error("invalid job id");
	if (typeof value.source !== "string" || value.source.trim() === "") throw new Error("invalid handoff source");
	if (!isAccountId(value.recipient)) throw new Error("invalid handoff recipient");
	if (typeof value.sequence !== "number" || !Number.isSafeInteger(value.sequence) || value.sequence < 1) {
		throw new Error("invalid handoff sequence");
	}
	if (typeof value.payload !== "string") throw new Error("invalid handoff payload");
	if (typeof value.payloadHash !== "string" || !/^[0-9a-f]{64}$/u.test(value.payloadHash))
		throw new Error("invalid payload hash");
	if (hashHandoffPayload(value.payload) !== value.payloadHash) throw new Error("handoff payload hash mismatch");
	if (value.status !== "pending" && value.status !== "delivered") throw new Error("invalid handoff status");
	if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)))
		throw new Error("invalid createdAt");
	if (
		value.deliveredAt !== undefined &&
		(typeof value.deliveredAt !== "string" || !Number.isFinite(Date.parse(value.deliveredAt)))
	) {
		throw new Error("invalid deliveredAt");
	}
	if (value.status === "delivered" && value.deliveredAt === undefined)
		throw new Error("delivered handoff requires deliveredAt");
	if (value.status === "pending" && value.deliveredAt !== undefined)
		throw new Error("pending handoff cannot have deliveredAt");
	const expectedId = deterministicHandoffId({
		jobId: value.jobId,
		source: value.source,
		recipient: value.recipient,
		sequence: value.sequence,
	});
	if (value.handoffId !== expectedId) throw new Error("handoff id does not match logical identity");
	return value as unknown as WorkflowHandoff;
}

/** Private durable store for exact model-to-model data-plane messages. */
export class WorkflowHandoffStore {
	private readonly root: string;

	constructor(dataDir: string) {
		this.root = join(dataDir, "workflows", "handoffs");
	}

	private jobDir(jobId: string): string {
		assertHex(jobId, 32, "workflow job id");
		return join(this.root, jobId);
	}

	pathFor(jobId: string, handoffId: string): string {
		assertHex(handoffId, 64, "workflow handoff id");
		return join(this.jobDir(jobId), `${handoffId}.json`);
	}

	create(input: CreateWorkflowHandoffInput): WorkflowHandoff {
		assertInput(input);
		const handoffId = deterministicHandoffId(input);
		const payloadHash = hashHandoffPayload(input.payload);
		const path = this.pathFor(input.jobId, handoffId);
		if (existsSync(path)) {
			const current = this.get(input.jobId, handoffId);
			if (
				current === undefined ||
				current.source !== input.source ||
				current.recipient !== input.recipient ||
				current.sequence !== input.sequence ||
				current.payloadHash !== payloadHash ||
				current.payload !== input.payload
			) {
				throw new WorkflowHandoffStoreError(`handoff ${handoffId} already exists with different content`);
			}
			return current;
		}
		const handoff: WorkflowHandoff = {
			schema: HANDOFF_SCHEMA,
			version: 1,
			handoffId,
			jobId: input.jobId,
			source: input.source,
			recipient: input.recipient,
			sequence: input.sequence,
			payload: input.payload,
			payloadHash,
			status: "pending",
			createdAt: new Date().toISOString(),
		};
		ensurePrivateDirectory(this.root);
		ensurePrivateDirectory(this.jobDir(input.jobId));
		writePrivateJson(path, handoff);
		return handoff;
	}

	get(jobId: string, handoffId: string): WorkflowHandoff | undefined {
		const path = this.pathFor(jobId, handoffId);
		if (!existsSync(path)) return undefined;
		const stat = lstatSync(path);
		if (!stat.isFile()) throw new WorkflowHandoffStoreError(`handoff ${handoffId} is not a regular file`);
		if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
			throw new WorkflowHandoffStoreError(`handoff ${handoffId} permissions must be 0600`);
		}
		try {
			return parseWorkflowHandoff(JSON.parse(readFileSync(path, "utf8")));
		} catch (error) {
			throw new WorkflowHandoffStoreError(
				`handoff ${handoffId} is invalid: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	markDelivered(jobId: string, handoffId: string, expectedPayloadHash: string): WorkflowHandoff {
		assertHex(expectedPayloadHash, 64, "expected payload hash");
		const current = this.get(jobId, handoffId);
		if (current === undefined) throw new WorkflowHandoffStoreError(`handoff ${handoffId} does not exist`);
		if (current.payloadHash !== expectedPayloadHash)
			throw new WorkflowHandoffStoreError("handoff delivery hash mismatch");
		if (current.status === "delivered") return current;
		const next: WorkflowHandoff = { ...current, status: "delivered", deliveredAt: new Date().toISOString() };
		writePrivateJson(this.pathFor(jobId, handoffId), next);
		return next;
	}
}
