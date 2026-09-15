import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAccountDefinition } from "#internet/core/accounts";
import { workflowNodeId } from "#internet/workflow/graph";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
import { createWorkflowTestRuntime } from "./workflow-test-fixture.js";

const roots: string[] = [];
const baseRevision = "0123456789abcdef0123456789abcdef01234567";

function root(): string {
	const path = mkdtempSync(join(tmpdir(), "internet-workflow-engine-"));
	roots.push(path);
	return path;
}

function start(engine: ReturnType<typeof createWorkflowTestRuntime>["engine"]) {
	return engine.start({
		ownerSessionId: "agent",
		objective: "Implement the graph recovery contract.",
		repository: "https://github.com/example/repo",
		baseRevision,
	});
}

function successfulStep(request: Parameters<WorkflowTeamRunner["runStep"]>[0]) {
	const provider = getAccountDefinition(request.step.accountId).provider;
	if (request.step.kind === "synthesis") {
		return { ok: true as const, step: request.step, finalAnswer: `${request.sessionId}:synthesized` };
	}
	return {
		ok: true as const,
		step: request.step,
		turn: {
			round: request.step.round,
			accountId: request.step.accountId,
			provider,
			text: `${request.sessionId}:${request.step.stepId}:ok`,
		},
	};
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("WorkflowEngine graph recovery", () => {
	it("retries only the failed logical node with one stable exact request identity", async () => {
		const calls = new Map<string, number>();
		const retryKeys: string[] = [];
		let failedOnce = false;
		const teams: WorkflowTeamRunner = {
			rounds: 1,
			async runStep(request) {
				const key = `${request.sessionId}:${request.step.stepId}`;
				calls.set(key, (calls.get(key) ?? 0) + 1);
				if (request.sessionId.endsWith(":research:A") && request.step.stepId === "round:1:member:2") {
					retryKeys.push(request.requestKey);
					if (!failedOnce) {
						failedOnce = true;
						return {
							ok: false,
							error: {
								accountId: request.step.accountId,
								provider: getAccountDefinition(request.step.accountId).provider,
								stage: "provider_turn",
								round: 1,
								kind: "timeout",
								message: "provider timeout",
								retryable: true,
								failedAt: new Date().toISOString(),
							},
						};
					}
				}
				return successfulStep(request);
			},
		};
		const { engine } = createWorkflowTestRuntime(root(), { teams });
		const job = start(engine);
		const a1 = workflowNodeId.researchMember("A", 1, 1);
		const a2 = workflowNodeId.researchMember("A", 1, 2);
		const b1 = workflowNodeId.researchMember("B", 1, 1);
		const b2 = workflowNodeId.researchMember("B", 1, 2);

		await Promise.all([engine.executeNode(job.jobId, a1, "driver"), engine.executeNode(job.jobId, b1, "driver")]);
		engine.advance(job.jobId);
		await engine.executeNode(job.jobId, a2, "driver");

		let current = engine.status(job.jobId);
		expect(current.graph.nodes[a1]?.state).toBe("COMPLETED");
		expect(current.graph.nodes[b1]?.state).toBe("COMPLETED");
		expect(current.graph.nodes[a2]).toMatchObject({
			state: "RECOVERING",
			recovery: { action: "RECREATE_SESSION", attempt: 2 },
		});
		expect(current.graph.nodes[b2]?.state).toBe("READY");

		await Promise.all([engine.executeNode(job.jobId, a2, "driver"), engine.executeNode(job.jobId, b2, "driver")]);
		current = engine.status(job.jobId);
		expect(current.graph.nodes[a1]?.state).toBe("COMPLETED");
		expect(current.graph.nodes[a2]?.state).toBe("COMPLETED");
		expect(calls.get(`agent:workflow:${job.jobId}:research:A:round:1:member:1`)).toBe(1);
		expect(calls.get(`agent:workflow:${job.jobId}:research:A:round:1:member:2`)).toBe(2);
		expect(retryKeys).toHaveLength(2);
		expect(new Set(retryKeys).size).toBe(1);
		expect(retryKeys[0]).toBe(`${job.jobId}:${a2}:${current.graph.nodes[a2]?.input?.inputHash}`);
	});

	it("reconciles an exact persisted node result without rerunning the provider", async () => {
		let providerCalls = 0;
		const teams: WorkflowTeamRunner = {
			rounds: 1,
			async runStep() {
				providerCalls += 1;
				throw new Error("provider must not run for an exact persisted result");
			},
		};
		const runtime = createWorkflowTestRuntime(root(), { teams });
		const job = start(runtime.engine);
		const nodeId = workflowNodeId.researchMember("A", 1, 1);
		const node = job.graph.nodes[nodeId];
		if (node?.input === undefined) throw new Error("root node input is required");
		const result = runtime.results.create({
			jobId: job.jobId,
			nodeId,
			inputHash: node.input.inputHash,
			payload: "durable exact result",
		});

		const current = await runtime.engine.executeNode(job.jobId, nodeId, "driver");
		expect(providerCalls).toBe(0);
		expect(current.graph.nodes[nodeId]).toMatchObject({
			state: "COMPLETED",
			output: { resultId: result.resultId, outputHash: result.outputHash },
		});
	});

	it("blocks deterministic automation defects instead of scheduling a provider retry", async () => {
		const teams: WorkflowTeamRunner = {
			rounds: 1,
			async runStep() {
				throw new Error("InvalidSelectorError: Error while parsing selector");
			},
		};
		const { engine } = createWorkflowTestRuntime(root(), { teams });
		const job = start(engine);
		const nodeId = workflowNodeId.researchMember("A", 1, 1);
		const current = await engine.executeNode(job.jobId, nodeId, "driver");

		expect(current.graph.lifecycle).toBe("BLOCKED");
		expect(current.graph.nodes[nodeId]).toMatchObject({
			state: "FAILED",
			failure: { class: "AUTOMATION", code: "INVALID_SELECTOR", retry: "CODE_FIX" },
		});
		expect(current.pendingAction).toMatchObject({ kind: "CODE_FIX_REQUIRED", nodeId });
		expect(engine.runnableNodeIds(job.jobId)).not.toContain(nodeId);
	});

	it("fails closed on ambiguous provider reconciliation without blind resubmission", async () => {
		const teams: WorkflowTeamRunner = {
			rounds: 1,
			async runStep(request) {
				return {
					ok: false,
					error: {
						accountId: request.step.accountId,
						provider: getAccountDefinition(request.step.accountId).provider,
						stage: "provider_turn",
						...(request.step.kind === "member" ? { round: request.step.round } : {}),
						kind: "provider_reconciliation_failed",
						message: "provider completion is ambiguous",
						retryable: false,
						failedAt: new Date().toISOString(),
					},
				};
			},
		};
		const { engine } = createWorkflowTestRuntime(root(), { teams });
		const job = start(engine);
		const nodeId = workflowNodeId.researchMember("A", 1, 1);
		const current = await engine.executeNode(job.jobId, nodeId, "driver");

		expect(current.graph.lifecycle).toBe("BLOCKED");
		expect(current.graph.nodes[nodeId]).toMatchObject({
			state: "FAILED",
			failure: { class: "OUTPUT", code: "RESULT_RECONCILIATION_AMBIGUOUS", retry: "USER_ACTION" },
		});
		expect(current.pendingAction).toMatchObject({ kind: "USER_ACTION_REQUIRED", nodeId });
		expect(engine.runnableNodeIds(job.jobId)).not.toContain(nodeId);
	});

	it("requires both research lanes and never degrades to a one-lane quorum", async () => {
		const teams: WorkflowTeamRunner = {
			rounds: 1,
			async runStep(request) {
				if (request.sessionId.endsWith(":research:A")) {
					throw new Error("InvalidSelectorError: deterministic lane failure");
				}
				return successfulStep(request);
			},
		};
		const { engine } = createWorkflowTestRuntime(root(), { teams });
		const job = start(engine);
		const a1 = workflowNodeId.researchMember("A", 1, 1);
		const b1 = workflowNodeId.researchMember("B", 1, 1);

		await Promise.all([engine.executeNode(job.jobId, a1, "driver"), engine.executeNode(job.jobId, b1, "driver")]);
		engine.advance(job.jobId);
		const current = engine.status(job.jobId);

		expect(current.graph.lifecycle).toBe("BLOCKED");
		expect(current.graph.nodes[a1]?.state).toBe("FAILED");
		expect(current.graph.nodes[b1]?.state).toBe("COMPLETED");
		expect(current.graph.nodes[workflowNodeId.writerImplementation()]?.state).toBe("WAITING");
		expect(engine.runnableNodeIds(job.jobId)).not.toContain(workflowNodeId.writerImplementation());
	});

	it("reconciles an orphaned running execution at the exact node boundary", async () => {
		const teams: WorkflowTeamRunner = {
			rounds: 1,
			async runStep(request) {
				return await new Promise((_, reject) => {
					request.signal?.addEventListener("abort", () => reject(new Error("aborted test provider")), {
						once: true,
					});
				});
			},
		};
		const { engine } = createWorkflowTestRuntime(root(), { teams, engine: { executionLeaseMs: 20 } });
		const job = start(engine);
		const nodeId = workflowNodeId.researchMember("A", 1, 1);
		const controller = new AbortController();
		const execution = engine.executeNode(job.jobId, nodeId, "driver-a", controller.signal);
		const running = engine.status(job.jobId).graph.nodes[nodeId];
		if (running?.execution === undefined) throw new Error("execution must be active");

		const reconciled = engine.reconcile(job.jobId, "driver-b", Date.parse(running.execution.leaseUntil) + 1);
		expect(reconciled.graph.nodes[nodeId]).toMatchObject({
			state: "RECOVERING",
			recovery: { action: "RECONCILE", attempt: 2 },
		});
		controller.abort();
		await expect(execution).rejects.toThrow("aborted test provider");
	});

	it("persists scheduler failures through the engine event boundary", () => {
		const { engine, events } = createWorkflowTestRuntime(root());
		const job = start(engine);
		const current = engine.blockSchedulerFailure(job.jobId, new Error("scheduler invariant violated"));

		expect(current.graph.lifecycle).toBe("BLOCKED");
		expect(current.pendingAction).toMatchObject({
			kind: "CODE_FIX_REQUIRED",
			message: expect.stringContaining("scheduler invariant violated"),
		});
		expect(events.list(job.jobId)).toEqual([
			expect.objectContaining({ type: "SCHEDULER_FAILED", class: "ACTION_REQUIRED" }),
		]);
	});
});
