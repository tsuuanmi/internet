import { describe, expect, it } from "vitest";
import {
	assertWorkflowTaskHandle,
	assertWorkflowTaskStartRequest,
	WORKFLOW_TASK_STATUSES,
} from "#internet/workflow/components";

describe("workflow task lifecycle contract", () => {
	it("uses the MCP Tasks status vocabulary without compatibility states", () => {
		expect(WORKFLOW_TASK_STATUSES).toEqual(["working", "input_required", "completed", "failed", "cancelled"]);
	});

	it("requires explicit operation contract identity and request identity", () => {
		expect(() =>
			assertWorkflowTaskStartRequest({
				schema: "@tsuuanmi/internet-workflow-task-start-request",
				version: 1,
				requestId: "req-1",
				ownerRef: "principal:user-1",
				operation: { id: "workflow.start", version: "1" },
				subjectRef: "workflow:wf-42",
				inputRef: "artifact:input-1",
			}),
		).not.toThrow();

		expect(() =>
			assertWorkflowTaskStartRequest({
				schema: "@tsuuanmi/internet-workflow-task-start-request",
				version: 1,
				requestId: "",
				ownerRef: "principal:user-1",
				operation: { id: "workflow.start", version: "1" },
			}),
		).toThrow("request id");
	});

	it("requires an explicit semantic subject for the task projection", () => {
		expect(() =>
			assertWorkflowTaskStartRequest({
				schema: "@tsuuanmi/internet-workflow-task-start-request",
				version: 1,
				requestId: "req-1",
				ownerRef: "principal:user-1",
				operation: { id: "workflow.start", version: "1" },
				subjectRef: "",
			}),
		).toThrow("subject ref");
	});

	it("keeps transport task identity distinct from semantic subject identity", () => {
		expect(() =>
			assertWorkflowTaskHandle({
				schema: "@tsuuanmi/internet-workflow-task-handle",
				version: 1,
				taskId: "task-1",
				subjectRef: "workflow:wf-42",
				status: "working",
				pollAfterMs: 1000,
			}),
		).not.toThrow();

		expect(() =>
			assertWorkflowTaskHandle({
				schema: "@tsuuanmi/internet-workflow-task-handle",
				version: 1,
				taskId: "workflow:wf-42",
				subjectRef: "workflow:wf-42",
				status: "working",
			}),
		).toThrow("task id must not equal subject ref");
	});

	it("rejects unsupported status and invalid polling interval", () => {
		expect(() =>
			assertWorkflowTaskHandle({
				schema: "@tsuuanmi/internet-workflow-task-handle",
				version: 1,
				taskId: "task-1",
				status: "pending" as never,
			}),
		).toThrow("task status");

		expect(() =>
			assertWorkflowTaskHandle({
				schema: "@tsuuanmi/internet-workflow-task-handle",
				version: 1,
				taskId: "task-1",
				status: "working",
				pollAfterMs: 0,
			}),
		).toThrow("poll interval");
	});
});
