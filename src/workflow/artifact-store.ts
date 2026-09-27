import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson } from "#internet/core/canonical-json";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import type { WorkflowArtifactBlobStorePort } from "#internet/workflow/components";
import {
	normalizeArtifactLineage,
	workflowArtifactId,
	workflowArtifactPayloadHash,
} from "#internet/workflow/kernel/identity";
import {
	WORKFLOW_ARTIFACT_SCHEMA,
	type WorkflowArtifact,
	type WorkflowArtifactLineage,
	type WorkflowArtifactProducer,
	type WorkflowVersionRef,
} from "#internet/workflow/kernel/types";
import { parseWorkflowArtifact } from "#internet/workflow/kernel/validation";

const WORKFLOW_ARTIFACT_METADATA_SCHEMA = "@tsuuanmi/internet-workflow-artifact-metadata" as const;
const WORKFLOW_ARTIFACT_PAYLOAD_MEDIA_TYPE = "application/json" as const;

export interface CreateWorkflowArtifactInput {
	readonly runId: string;
	readonly type: string;
	readonly schemaRef: WorkflowVersionRef;
	readonly producer: WorkflowArtifactProducer;
	readonly inputBundleId?: string;
	readonly lineage?: readonly WorkflowArtifactLineage[];
	readonly payload: unknown;
}

interface StoredWorkflowArtifactMetadata {
	readonly schema: typeof WORKFLOW_ARTIFACT_METADATA_SCHEMA;
	readonly version: 1;
	readonly artifactId: string;
	readonly runId: string;
	readonly type: string;
	readonly schemaRef: WorkflowVersionRef;
	readonly producer: WorkflowArtifactProducer;
	readonly inputBundleId?: string;
	readonly lineage: readonly WorkflowArtifactLineage[];
	readonly payloadHash: string;
	readonly payloadMediaType: typeof WORKFLOW_ARTIFACT_PAYLOAD_MEDIA_TYPE;
	readonly createdAt: string;
}

export class WorkflowArtifactStoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowArtifactStoreError";
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertHex(value: string, length: number, label: string): void {
	if (!new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value)) {
		throw new WorkflowArtifactStoreError(`${label} must be ${String(length)} lowercase hex characters`);
	}
}

function assertPrivateFile(path: string, label: string): void {
	const stat = lstatSync(path);
	if (!stat.isFile()) throw new WorkflowArtifactStoreError(`${label} is not a regular file`);
	if (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
		throw new WorkflowArtifactStoreError(`${label} permissions must be 0600`);
}

function assertBlobRef(
	digest: string,
	size: number,
	mediaType: string,
	expectedDigest: string,
	expectedSize: number,
): void {
	if (digest !== expectedDigest)
		throw new WorkflowArtifactStoreError(
			`workflow artifact payload blob digest mismatch: expected ${expectedDigest}, got ${digest}`,
		);
	if (size !== expectedSize)
		throw new WorkflowArtifactStoreError(
			`workflow artifact payload blob size mismatch: expected ${String(expectedSize)}, got ${String(size)}`,
		);
	if (mediaType !== WORKFLOW_ARTIFACT_PAYLOAD_MEDIA_TYPE)
		throw new WorkflowArtifactStoreError(
			`workflow artifact payload blob media type mismatch: expected ${WORKFLOW_ARTIFACT_PAYLOAD_MEDIA_TYPE}, got ${mediaType}`,
		);
}

function parseStoredMetadata(
	value: unknown,
	expectedRunId: string,
	expectedArtifactId: string,
): StoredWorkflowArtifactMetadata {
	if (
		!isRecord(value) ||
		value.schema !== WORKFLOW_ARTIFACT_METADATA_SCHEMA ||
		value.version !== 1 ||
		typeof value.artifactId !== "string" ||
		typeof value.runId !== "string" ||
		typeof value.payloadHash !== "string" ||
		value.payloadMediaType !== WORKFLOW_ARTIFACT_PAYLOAD_MEDIA_TYPE
	) {
		throw new WorkflowArtifactStoreError("unsupported workflow artifact metadata schema");
	}
	assertHex(value.artifactId, 64, "workflow artifact id");
	assertHex(value.runId, 32, "workflow artifact run id");
	assertHex(value.payloadHash, 64, "workflow artifact payload hash");
	if (value.artifactId !== expectedArtifactId)
		throw new WorkflowArtifactStoreError("workflow artifact metadata id does not match requested artifact");
	if (value.runId !== expectedRunId)
		throw new WorkflowArtifactStoreError("workflow artifact metadata run does not match requested run");
	return value as unknown as StoredWorkflowArtifactMetadata;
}

export class WorkflowArtifactStore {
	private readonly root: string;
	private readonly blobs: WorkflowArtifactBlobStorePort;

	constructor(dataDir: string, blobs: WorkflowArtifactBlobStorePort) {
		this.root = join(dataDir, "workflows", "artifacts");
		this.blobs = blobs;
	}

	private runDir(runId: string): string {
		assertHex(runId, 32, "workflow run id");
		return join(this.root, runId);
	}

	pathFor(runId: string, artifactId: string): string {
		assertHex(artifactId, 64, "workflow artifact id");
		return join(this.runDir(runId), `${artifactId}.json`);
	}

	create(input: CreateWorkflowArtifactInput): WorkflowArtifact {
		const lineage = normalizeArtifactLineage(input.lineage ?? []);
		const payloadHash = workflowArtifactPayloadHash(input.payload);
		const artifactId = workflowArtifactId({
			runId: input.runId,
			type: input.type,
			schemaRef: input.schemaRef,
			producer: input.producer,
			inputBundleId: input.inputBundleId,
			lineage,
			payloadHash,
		});
		const path = this.pathFor(input.runId, artifactId);
		if (existsSync(path)) {
			const current = this.get(input.runId, artifactId);
			if (current === undefined) throw new WorkflowArtifactStoreError(`workflow artifact ${artifactId} disappeared`);
			return current;
		}

		const artifact: WorkflowArtifact = {
			schema: WORKFLOW_ARTIFACT_SCHEMA,
			version: 1,
			artifactId,
			runId: input.runId,
			type: input.type,
			schemaRef: input.schemaRef,
			producer: input.producer,
			inputBundleId: input.inputBundleId,
			lineage,
			payload: input.payload,
			payloadHash,
			createdAt: new Date().toISOString(),
		};
		parseWorkflowArtifact(artifact);

		const payloadText = canonicalJson(input.payload);
		const payloadBytes = new TextEncoder().encode(payloadText);
		const blob = this.blobs.put(payloadBytes, WORKFLOW_ARTIFACT_PAYLOAD_MEDIA_TYPE);
		assertBlobRef(blob.digest, blob.size, blob.mediaType, payloadHash, payloadBytes.byteLength);

		const metadata: StoredWorkflowArtifactMetadata = {
			schema: WORKFLOW_ARTIFACT_METADATA_SCHEMA,
			version: 1,
			artifactId,
			runId: artifact.runId,
			type: artifact.type,
			schemaRef: artifact.schemaRef,
			producer: artifact.producer,
			inputBundleId: artifact.inputBundleId,
			lineage: artifact.lineage,
			payloadHash,
			payloadMediaType: WORKFLOW_ARTIFACT_PAYLOAD_MEDIA_TYPE,
			createdAt: artifact.createdAt,
		};
		ensurePrivateDirectory(this.runDir(input.runId));
		writePrivateJson(path, metadata);
		return artifact;
	}

	get(runId: string, artifactId: string): WorkflowArtifact | undefined {
		const path = this.pathFor(runId, artifactId);
		if (!existsSync(path)) return undefined;
		assertPrivateFile(path, `workflow artifact ${artifactId}`);
		try {
			const metadata = parseStoredMetadata(JSON.parse(readFileSync(path, "utf8")), runId, artifactId);
			const blob = this.blobs.get(metadata.payloadHash);
			if (blob === undefined) {
				throw new WorkflowArtifactStoreError(
					`workflow artifact ${artifactId} payload blob ${metadata.payloadHash} does not exist`,
				);
			}
			assertBlobRef(blob.digest, blob.size, blob.mediaType, metadata.payloadHash, blob.bytes.byteLength);
			const payloadText = new TextDecoder("utf-8", { fatal: true }).decode(blob.bytes);
			const payload = JSON.parse(payloadText) as unknown;
			if (canonicalJson(payload) !== payloadText) {
				throw new WorkflowArtifactStoreError(
					`workflow artifact ${artifactId} payload blob ${metadata.payloadHash} is not canonical JSON`,
				);
			}
			return parseWorkflowArtifact({
				schema: WORKFLOW_ARTIFACT_SCHEMA,
				version: 1,
				artifactId: metadata.artifactId,
				runId: metadata.runId,
				type: metadata.type,
				schemaRef: metadata.schemaRef,
				producer: metadata.producer,
				inputBundleId: metadata.inputBundleId,
				lineage: metadata.lineage,
				payload,
				payloadHash: metadata.payloadHash,
				createdAt: metadata.createdAt,
			});
		} catch (error) {
			if (error instanceof WorkflowArtifactStoreError) throw error;
			throw new WorkflowArtifactStoreError(
				`workflow artifact ${artifactId} is invalid: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	list(runId: string): readonly WorkflowArtifact[] {
		const directory = this.runDir(runId);
		if (!existsSync(directory)) return [];
		if (!lstatSync(directory).isDirectory())
			throw new WorkflowArtifactStoreError(`workflow artifacts path for run ${runId} is not a directory`);
		return readdirSync(directory)
			.filter((name) => /^[0-9a-f]{64}\.json$/u.test(name))
			.sort()
			.map((name) => {
				const artifact = this.get(runId, name.slice(0, -5));
				if (artifact === undefined)
					throw new WorkflowArtifactStoreError(`workflow artifact ${name} disappeared during enumeration`);
				return artifact;
			});
	}
}
