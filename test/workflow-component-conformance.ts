import { expect, it } from "vitest";
import type {
	WorkflowArtifactBlobStorePort,
	WorkflowGraphModelPort,
} from "#internet/workflow/components";

export function graphModelConformance(factory: () => WorkflowGraphModelPort): void {
	it("analyzes a deterministic dependency DAG", () => {
		const result = factory().analyze({
			schema: "@tsuuanmi/internet-workflow-dependency-graph",
			version: 1,
			graphId: "graph-1",
			revision: 1,
			nodes: [
				{ id: "b", kind: "work" },
				{ id: "c", kind: "work" },
				{ id: "a", kind: "work" },
			],
			edges: [
				{ from: "b", to: "c" },
				{ from: "a", to: "c" },
			],
		});
		expect(result).toMatchObject({
			schema: "@tsuuanmi/internet-workflow-graph-analysis",
			version: 1,
			graphId: "graph-1",
			revision: 1,
			acyclic: true,
			topologicalOrder: ["a", "b", "c"],
			topologicalLayers: [["a", "b"], ["c"]],
			readyNodes: ["a", "b"],
			cycles: [],
		});
	});

	it("reports cycles without changing semantic node identities", () => {
		const result = factory().analyze({
			schema: "@tsuuanmi/internet-workflow-dependency-graph",
			version: 1,
			graphId: "graph-cycle",
			revision: 2,
			nodes: [
				{ id: "a", kind: "work" },
				{ id: "b", kind: "work" },
			],
			edges: [
				{ from: "a", to: "b" },
				{ from: "b", to: "a" },
			],
		});
		expect(result.acyclic).toBe(false);
		expect(result.topologicalOrder).toEqual([]);
		expect(result.topologicalLayers).toEqual([]);
		expect(result.readyNodes).toEqual([]);
		expect(result.cycles.length).toBeGreaterThan(0);
		expect(new Set(result.cycles.flat())).toEqual(new Set(["a", "b"]));
	});

	it("rejects edges that reference unknown nodes", () => {
		expect(() =>
			factory().analyze({
				schema: "@tsuuanmi/internet-workflow-dependency-graph",
				version: 1,
				graphId: "graph-invalid",
				revision: 1,
				nodes: [{ id: "a", kind: "work" }],
				edges: [{ from: "a", to: "missing" }],
			}),
		).toThrow("unknown graph node");
	});
}

export function artifactBlobStoreConformance(factory: () => WorkflowArtifactBlobStorePort): void {
	it("stores immutable content-addressed blobs idempotently", () => {
		const store = factory();
		const bytes = new TextEncoder().encode('{"claim":"exact"}');
		const first = store.put(bytes, "application/json");
		const repeated = store.put(bytes, "application/json");
		expect(first).toEqual(repeated);
		expect(first.digest).toMatch(/^[0-9a-f]{64}$/u);
		expect(first.size).toBe(bytes.byteLength);
		expect(store.exists(first.digest)).toBe(true);
		const loaded = store.get(first.digest);
		expect(loaded?.mediaType).toBe("application/json");
		expect(Array.from(loaded?.bytes ?? [])).toEqual(Array.from(bytes));
	});

	it("keeps distinct content under distinct digests", () => {
		const store = factory();
		const first = store.put(new TextEncoder().encode("first"), "text/plain");
		const second = store.put(new TextEncoder().encode("second"), "text/plain");
		expect(second.digest).not.toBe(first.digest);
		expect(Array.from(store.get(first.digest)?.bytes ?? [])).toEqual(Array.from(new TextEncoder().encode("first")));
	});

	it("returns undefined for a missing digest", () => {
		expect(factory().get("a".repeat(64))).toBeUndefined();
	});
}
