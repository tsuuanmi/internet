import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "#internet/core/canonical-json";
import { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import { LocalWorkflowArtifactBlobStore, type WorkflowArtifactBlobStorePort } from "#internet/workflow/components";

const runId = "11111111111111111111111111111111";
const producerId = "33333333333333333333333333333333";

function stores(root: string) {
	const blobs = new LocalWorkflowArtifactBlobStore(root);
	return { artifacts: new WorkflowArtifactStore(root, blobs), blobs };
}

describe("workflow artifact store", () => {
	it("persists immutable content-addressed metadata and payload blobs idempotently", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-artifact-"));
		const { artifacts, blobs } = stores(root);
		const input = {
			runId,
			type: "evidence",
			schemaRef: { id: "evidence", version: "1" },
			producer: { kind: "work_item" as const, id: producerId },
			payload: { claim: "exact", confidence: 0.8 },
		};
		const first = artifacts.create(input);
		const repeated = artifacts.create(input);
		expect(repeated).toEqual(first);
		expect(first.artifactId).toMatch(/^[0-9a-f]{64}$/u);
		expect(first.payloadHash).toMatch(/^[0-9a-f]{64}$/u);
		expect(blobs.exists(first.payloadHash)).toBe(true);
		expect(artifacts.list(runId)).toEqual([first]);

		const persisted = JSON.parse(readFileSync(artifacts.pathFor(runId, first.artifactId), "utf8")) as Record<
			string,
			unknown
		>;
		expect(persisted).not.toHaveProperty("payload");
		expect(persisted).toMatchObject({
			schema: "@tsuuanmi/internet-workflow-artifact-metadata",
			version: 1,
			artifactId: first.artifactId,
			payloadHash: first.payloadHash,
			payloadMediaType: "application/json",
		});
	});

	it("stores the canonical JSON bytes under the existing payload hash", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-artifact-canonical-"));
		const { artifacts, blobs } = stores(root);
		const payload = { z: 1, a: { d: 2, b: 3 } };
		const artifact = artifacts.create({
			runId,
			type: "evidence",
			schemaRef: { id: "evidence", version: "1" },
			producer: { kind: "runtime", id: "canonical-test" },
			payload,
		});
		const blob = blobs.get(artifact.payloadHash);
		expect(blob?.mediaType).toBe("application/json");
		expect(new TextDecoder().decode(blob?.bytes)).toBe(canonicalJson(payload));
	});

	it("normalizes lineage order into one content identity", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-artifact-lineage-"));
		const { artifacts } = stores(root);
		const a = { runId, artifactId: "a".repeat(64) };
		const b = { runId, artifactId: "b".repeat(64) };
		const common = {
			runId,
			type: "report",
			schemaRef: { id: "report", version: "1" },
			producer: { kind: "runtime" as const, id: "synthesis" },
			payload: { text: "report" },
		};
		const first = artifacts.create({
			...common,
			lineage: [
				{ relation: "supports" as const, artifact: b },
				{ relation: "derived_from" as const, artifact: a },
			],
		});
		const repeated = artifacts.create({
			...common,
			lineage: [
				{ relation: "derived_from" as const, artifact: a },
				{ relation: "supports" as const, artifact: b },
			],
		});
		expect(repeated.artifactId).toBe(first.artifactId);
	});

	it("fails closed when authoritative metadata points to a missing payload blob", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-artifact-missing-blob-"));
		const { artifacts } = stores(root);
		const artifact = artifacts.create({
			runId,
			type: "evidence",
			schemaRef: { id: "evidence", version: "1" },
			producer: { kind: "runtime", id: "test" },
			payload: { value: 1 },
		});
		const path = artifacts.pathFor(runId, artifact.artifactId);
		const metadata = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
		metadata.payloadHash = "f".repeat(64);
		writeFileSync(path, JSON.stringify(metadata), { mode: 0o600 });
		if (process.platform !== "win32") chmodSync(path, 0o600);
		expect(() => artifacts.get(runId, artifact.artifactId)).toThrow("payload blob");
	});

	it("rejects a blob implementation that returns a digest different from the canonical payload hash", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-artifact-bad-blob-"));
		const blobs: WorkflowArtifactBlobStorePort = {
			put: (bytes, mediaType) => ({ digest: "f".repeat(64), size: bytes.byteLength, mediaType }),
			get: () => undefined,
			exists: () => false,
		};
		const artifacts = new WorkflowArtifactStore(root, blobs);
		expect(() =>
			artifacts.create({
				runId,
				type: "evidence",
				schemaRef: { id: "evidence", version: "1" },
				producer: { kind: "runtime", id: "test" },
				payload: { value: 1 },
			}),
		).toThrow("payload blob digest mismatch");
	});
});
