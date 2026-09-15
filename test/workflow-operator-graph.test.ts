import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { workflowNodeId } from "#internet/workflow/graph";
import { formatWorkflowStatus } from "#internet/workflow/operator";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
import { createWorkflowTestRuntime } from "./workflow-test-fixture.js";

const roots: string[] = [];

function root(): string {
	const path = mkdtempSync(join(tmpdir(), "internet-workflow-status-"));
	roots.push(path);
	return path;
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("workflow operator graph status", () => {
	it("reports the authoritative failed node, recovery reason, action, and blockers from graph state", async () => {
		const teams: WorkflowTeamRunner = {
			rounds: 1,
			async runStep() {
				throw new Error("InvalidSelectorError: Error while parsing selector");
			},
		};
		const runtime = createWorkflowTestRuntime(root(), { teams });
		const job = runtime.engine.start({
			ownerSessionId: "agent",
			objective: "Exercise graph-derived status.",
			repository: "https://github.com/example/repo",
			baseRevision: "0123456789abcdef0123456789abcdef01234567",
		});
		const failedNodeId = workflowNodeId.researchMember("A", 1, 1);
		const current = await runtime.engine.executeNode(job.jobId, failedNodeId, "driver");
		const status = formatWorkflowStatus(current, runtime.events.list(job.jobId), false);

		expect(status).toContain("Phase: RESEARCH");
		expect(status).toContain("Status: BLOCKED · driver idle");
		expect(status).toContain("Research A · R1 · Member 1 — FAILED");
		expect(status).toContain("AUTOMATION.INVALID_SELECTOR");
		expect(status).toContain("ACTION REQUIRED: CODE_FIX_REQUIRED");
		expect(status).toContain("Writer · Implementation — WAITING");
		expect(status).toContain("blocked by Research · Handoff");
		expect(status).not.toContain("Writer waiting for research");
	});
});
