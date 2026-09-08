import { chmodSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hashHandoffPayload, WorkflowHandoffStore } from "#internet/workflow/handoff-store";

const roots: string[] = [];

function store() {
	const root = mkdtempSync(join(tmpdir(), "internet-handoff-"));
	roots.push(root);
	return new WorkflowHandoffStore(root);
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("WorkflowHandoffStore", () => {
	it("persists the exact payload and stable SHA-256 receipt", () => {
		const handoffs = store();
		const payload = "Line one.\n\n  Preserve whitespace exactly. ✅\n";
		const created = handoffs.create({
			jobId: "0123456789abcdef0123456789abcdef",
			source: "research:A",
			recipient: "chatgpt-writer",
			sequence: 1,
			payload,
		});
		expect(created.payload).toBe(payload);
		expect(created.payloadHash).toBe(hashHandoffPayload(payload));
		expect(handoffs.get(created.jobId, created.handoffId)).toEqual(created);
	});

	it("is idempotent for the same logical handoff but refuses changed content", () => {
		const handoffs = store();
		const input = {
			jobId: "0123456789abcdef0123456789abcdef",
			source: "research:A",
			recipient: "chatgpt-writer" as const,
			sequence: 1,
			payload: "exact answer",
		};
		const first = handoffs.create(input);
		expect(handoffs.create(input)).toEqual(first);
		expect(() => handoffs.create({ ...input, payload: "changed answer" })).toThrow(/different content/u);
	});

	it("marks exact-hash delivery idempotently and rejects a mismatched receipt", () => {
		const handoffs = store();
		const created = handoffs.create({
			jobId: "0123456789abcdef0123456789abcdef",
			source: "research:B",
			recipient: "chatgpt-writer",
			sequence: 2,
			payload: "B final",
		});
		expect(() => handoffs.markDelivered(created.jobId, created.handoffId, "0".repeat(64))).toThrow(/hash mismatch/u);
		const delivered = handoffs.markDelivered(created.jobId, created.handoffId, created.payloadHash);
		expect(delivered.status).toBe("delivered");
		expect(delivered.deliveredAt).toBeDefined();
		expect(handoffs.markDelivered(created.jobId, created.handoffId, created.payloadHash)).toEqual(delivered);
	});

	it("fails closed when file permissions are weakened", () => {
		if (process.platform === "win32") return;
		const handoffs = store();
		const created = handoffs.create({
			jobId: "0123456789abcdef0123456789abcdef",
			source: "research:A",
			recipient: "chatgpt-writer",
			sequence: 1,
			payload: "secret",
		});
		chmodSync(handoffs.pathFor(created.jobId, created.handoffId), 0o644);
		expect(() => handoffs.get(created.jobId, created.handoffId)).toThrow(/permissions must be 0600/u);
	});
});
