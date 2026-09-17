import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkflowArtifactStore } from "#internet/workflow/artifact-store";

const runId = "11111111111111111111111111111111";
const producerId = "33333333333333333333333333333333";

describe("workflow artifact store", () => {
	it("persists immutable content-addressed artifacts idempotently", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-artifact-"));
		const store = new WorkflowArtifactStore(root);
		const input = {
			runId,
			type: "evidence",
			schemaRef: { id: "evidence", version: "1" },
			producer: { kind: "work_item" as const, id: producerId },
			payload: { claim: "exact", confidence: 0.8 },
		};
		const first = store.create(input);
		const repeated = store.create(input);
		expect(repeated).toEqual(first);
		expect(first.artifactId).toMatch(/^[0-9a-f]{64}$/u);
		expect(first.payloadHash).toMatch(/^[0-9a-f]{64}$/u);
		expect(store.list(runId)).toEqual([first]);
	});

	it("normalizes lineage order into one content identity", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-artifact-lineage-"));
		const store = new WorkflowArtifactStore(root);
		const a = { runId, artifactId: "a".repeat(64) };
		const b = { runId, artifactId: "b".repeat(64) };
		const common = {
			runId,
			type: "report",
			schemaRef: { id: "report", version: "1" },
			producer: { kind: "runtime" as const, id: "synthesis" },
			payload: { text: "report" },
		};
		const first = store.create({
			...common,
			lineage: [
				{ relation: "supports" as const, artifact: b },
				{ relation: "derived_from" as const, artifact: a },
			],
		});
		const repeated = store.create({
			...common,
			lineage: [
				{ relation: "derived_from" as const, artifact: a },
				{ relation: "supports" as const, artifact: b },
			],
		});
		expect(repeated.artifactId).toBe(first.artifactId);
	});

	it("detects payload corruption on read", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-artifact-corrupt-"));
		const store = new WorkflowArtifactStore(root);
		const artifact = store.create({
			runId,
			type: "evidence",
			schemaRef: { id: "evidence", version: "1" },
			producer: { kind: "runtime", id: "test" },
			payload: { value: 1 },
		});
		const path = store.pathFor(runId, artifact.artifactId);
		const json = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
		json.payload = { value: 2 };
		writeFileSync(path, JSON.stringify(json), { mode: 0o600 });
		if (process.platform !== "win32") chmodSync(path, 0o600);
		expect(() => store.get(runId, artifact.artifactId)).toThrow("payload hash mismatch");
	});
});
