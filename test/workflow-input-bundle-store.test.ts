import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";

const runId = "11111111111111111111111111111111";
const workItemId = "22222222222222222222222222222222";

describe("workflow input bundle store", () => {
	it("persists one exact content identity independent of input ordering", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-input-bundle-"));
		const store = new WorkflowInputBundleStore(root);
		const a = { runId, artifactId: "a".repeat(64) };
		const b = { runId, artifactId: "b".repeat(64) };
		const common = {
			runId,
			workItemId,
			capability: { id: "repository_research", version: "1" },
			projection: { id: "repository-research-input", version: "1" },
		};
		const first = store.create({
			...common,
			artifacts: [b, a],
			facts: [
				{ name: "repository", value: "https://github.com/example/repo" },
				{ name: "head", value: "c".repeat(40) },
			],
		});
		const repeated = store.create({
			...common,
			artifacts: [a, b],
			facts: [
				{ name: "head", value: "c".repeat(40) },
				{ name: "repository", value: "https://github.com/example/repo" },
			],
		});
		expect(repeated).toEqual(first);
		expect(first.bundleId).toMatch(/^[0-9a-f]{64}$/u);
		expect(first.artifacts).toEqual([a, b]);
		expect(first.facts.map((fact) => fact.name)).toEqual(["head", "repository"]);
		expect(store.list(runId)).toEqual([first]);
	});

	it("rejects duplicate fact names", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workflow-input-bundle-invalid-"));
		const store = new WorkflowInputBundleStore(root);
		expect(() =>
			store.create({
				runId,
				workItemId,
				capability: { id: "repository_research", version: "1" },
				projection: { id: "repository-research-input", version: "1" },
				facts: [
					{ name: "head", value: "a" },
					{ name: "head", value: "b" },
				],
			}),
		).toThrow("duplicate workflow input fact head");
	});
});
