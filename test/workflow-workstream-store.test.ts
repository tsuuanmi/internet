import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORKFLOW_WORKSTREAM_SCHEMA, type WorkflowWorkstream } from "#internet/workflow/workstream";
import { WorkflowWorkstreamStore, WorkflowWorkstreamStoreError } from "#internet/workflow/workstream-store";

const workstreamId = "1".repeat(32);
const sourceRunId = "2".repeat(32);
const at = "2026-09-18T00:00:00.000Z";

function workstream(): WorkflowWorkstream {
	return {
		schema: WORKFLOW_WORKSTREAM_SCHEMA,
		version: 1,
		revision: 1,
		workstreamId,
		owner: { kind: "session", id: "owner-session" },
		title: "Project continuity",
		runIds: [sourceRunId],
		continuations: [],
		createdAt: at,
		updatedAt: at,
	};
}

describe("workflow Workstream store", () => {
	it("persists continuity metadata with revision CAS", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workstream-store-"));
		const store = new WorkflowWorkstreamStore(root);
		store.create(workstream());
		const updated = store.update(workstreamId, 1, (current) => ({
			...current,
			revision: 2,
			title: "Updated project title",
			updatedAt: "2026-09-18T00:01:00.000Z",
		}));
		expect(store.get(workstreamId)).toEqual(updated);
		expect(store.list()).toEqual([updated]);
		expect(() => store.update(workstreamId, 1, (current) => current)).toThrow("revision conflict");
	});

	it("does not allow Workstream ownership to change", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-workstream-owner-"));
		const store = new WorkflowWorkstreamStore(root);
		store.create(workstream());
		expect(() =>
			store.update(workstreamId, 1, (current) => ({
				...current,
				revision: 2,
				owner: { kind: "session", id: "other-session" },
				updatedAt: "2026-09-18T00:01:00.000Z",
			})),
		).toThrow(WorkflowWorkstreamStoreError);
	});
});
