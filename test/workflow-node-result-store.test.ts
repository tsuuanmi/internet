import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkflowNodeResultStore, WorkflowNodeResultStoreError } from "#internet/workflow/node-result-store";

const jobId = "0123456789abcdef0123456789abcdef";
const inputHash = "a".repeat(64);

describe("workflow node result store", () => {
	it("persists exact immutable payloads with deterministic identity", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-node-results-"));
		const store = new WorkflowNodeResultStore(root);
		const first = store.create({ jobId, nodeId: "research:B:round:2:member:2", inputHash, payload: "exact answer" });
		const repeated = store.create({ jobId, nodeId: "research:B:round:2:member:2", inputHash, payload: "exact answer" });
		expect(repeated).toEqual(first);
		expect(store.get(jobId, first.resultId)?.payload).toBe("exact answer");
		expect(first.outputHash).toMatch(/^[0-9a-f]{64}$/u);
	});

	it("rejects changed content for the same logical node/input identity", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-node-results-conflict-"));
		const store = new WorkflowNodeResultStore(root);
		store.create({ jobId, nodeId: "research:A:round:1:member:1", inputHash, payload: "first" });
		expect(() => store.create({ jobId, nodeId: "research:A:round:1:member:1", inputHash, payload: "different" })).toThrow(
			WorkflowNodeResultStoreError,
		);
	});

	it("detects payload corruption on read", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-node-results-corrupt-"));
		const store = new WorkflowNodeResultStore(root);
		const result = store.create({ jobId, nodeId: "research:A:synthesis", inputHash, payload: "good" });
		const path = store.pathFor(jobId, result.resultId);
		const json = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
		json.payload = "tampered";
		writeFileSync(path, JSON.stringify(json), { mode: 0o600 });
		if (process.platform !== "win32") chmodSync(path, 0o600);
		expect(() => store.get(jobId, result.resultId)).toThrow("hash mismatch");
	});
});
