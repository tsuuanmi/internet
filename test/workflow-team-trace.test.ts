import { chmodSync, mkdtempSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowTeamTraceStore } from "#internet/workflow/team-trace-store";

const JOB_ID = "0123456789abcdef0123456789abcdef";
const roots: string[] = [];

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "internet-workflow-trace-"));
	roots.push(root);
	return { root, store: new WorkflowTeamTraceStore(root) };
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("WorkflowTeamTraceStore", () => {
	it("persists attempts and structured provider evidence privately", () => {
		const { store } = fixture();
		const first = store.begin(JOB_ID, "research", "A", "2026-09-09T10:00:00.000Z");
		expect(first).toBe(1);
		store.append(JOB_ID, {
			phase: "research",
			lane: "A",
			attempt: first,
			at: "2026-09-09T10:00:01.000Z",
			stage: "provider_turn",
			status: "failed",
			round: 2,
			accountId: "gemini-thinker",
			provider: "gemini-web",
			kind: "provider_error",
			message: "Gemini failed to execute the newest response; retry the provider turn",
			retryable: true,
		});
		const second = store.begin(JOB_ID, "research", "A", "2026-09-09T10:01:00.000Z");
		expect(second).toBe(2);
		const events = store.list(JOB_ID);
		expect(events).toHaveLength(3);
		expect(events[1]).toMatchObject({
			attempt: 1,
			round: 2,
			accountId: "gemini-thinker",
			stage: "provider_turn",
			kind: "provider_error",
			retryable: true,
		});
		if (process.platform !== "win32") expect(statSync(store.pathFor(JOB_ID)).mode & 0o777).toBe(0o600);
	});

	it("bounds completed model text without losing newest evidence", () => {
		const { store } = fixture();
		const attempt = store.begin(JOB_ID, "review", "B", "2026-09-09T10:00:00.000Z");
		store.append(JOB_ID, {
			phase: "review",
			lane: "B",
			attempt,
			at: "2026-09-09T10:00:01.000Z",
			stage: "provider_turn",
			status: "completed",
			round: 1,
			accountId: "chatgpt-thinker",
			provider: "chatgpt-web",
			text: `${"x".repeat(20_000)}TAIL`,
		});
		const event = store.list(JOB_ID).at(-1);
		expect(event?.textTruncated).toBe("prefix");
		expect(event?.text?.endsWith("TAIL")).toBe(true);
		expect(Array.from(event?.text ?? "")).toHaveLength(12_000);
	});

	it("rejects weakened trace permissions", () => {
		const { store } = fixture();
		store.begin(JOB_ID, "research", "A", "2026-09-09T10:00:00.000Z");
		if (process.platform === "win32") return;
		chmodSync(store.pathFor(JOB_ID), 0o644);
		expect(() => store.list(JOB_ID)).toThrow(/permissions must be 0600/u);
	});
});
