import { describe, expect, it } from "vitest";
import * as publicApi from "#internet/index";
import {
	WORKFLOW_ARTIFACT_SCHEMA,
	WORKFLOW_EXECUTION_SCHEMA,
	WORKFLOW_EXTERNAL_EVENT_SCHEMA,
	WORKFLOW_INPUT_BUNDLE_SCHEMA,
	WORKFLOW_RUN_SCHEMA,
	WORKFLOW_TIMER_SCHEMA,
	WORKFLOW_WORK_ITEM_SCHEMA,
	WORKFLOW_WORKSTREAM_SCHEMA,
	WorkflowArtifactStore,
	WorkflowCapabilityRegistry,
	WorkflowContinuationService,
	WorkflowExecutionResultStore,
	WorkflowExecutionStore,
	WorkflowExternalEventStore,
	WorkflowInputBundleStore,
	WorkflowRunCoordinator,
	WorkflowRunDriver,
	WorkflowRunStore,
	WorkflowTimerStore,
	WorkflowWakeupScheduler,
	WorkflowWorkItemStore,
	WorkflowWorkstreamStore,
} from "#internet/index";

describe("workflow kernel public API", () => {
	it("publishes the durable kernel and deterministic vNext runtime from the package root", () => {
		expect(WORKFLOW_RUN_SCHEMA).toBe("@tsuuanmi/internet-workflow-run");
		expect(WORKFLOW_ARTIFACT_SCHEMA).toBe("@tsuuanmi/internet-workflow-artifact");
		expect(WORKFLOW_WORK_ITEM_SCHEMA).toBe("@tsuuanmi/internet-workflow-work-item");
		expect(WORKFLOW_INPUT_BUNDLE_SCHEMA).toBe("@tsuuanmi/internet-workflow-input-bundle");
		expect(WORKFLOW_EXECUTION_SCHEMA).toBe("@tsuuanmi/internet-workflow-execution");
		expect(WORKFLOW_TIMER_SCHEMA).toBe("@tsuuanmi/internet-workflow-timer");
		expect(WORKFLOW_EXTERNAL_EVENT_SCHEMA).toBe("@tsuuanmi/internet-workflow-external-event");
		expect(WORKFLOW_WORKSTREAM_SCHEMA).toBe("@tsuuanmi/internet-workflow-workstream");
		expect(WorkflowContinuationService).toBeTypeOf("function");
		expect(WorkflowTimerStore).toBeTypeOf("function");
		expect(WorkflowExternalEventStore).toBeTypeOf("function");
		expect(WorkflowWakeupScheduler).toBeTypeOf("function");
		expect(WorkflowWorkstreamStore).toBeTypeOf("function");
		expect(WorkflowRunStore).toBeTypeOf("function");
		expect(WorkflowArtifactStore).toBeTypeOf("function");
		expect(WorkflowWorkItemStore).toBeTypeOf("function");
		expect(WorkflowInputBundleStore).toBeTypeOf("function");
		expect(WorkflowCapabilityRegistry).toBeTypeOf("function");
		expect(WorkflowExecutionStore).toBeTypeOf("function");
		expect(WorkflowExecutionResultStore).toBeTypeOf("function");
		expect(WorkflowRunCoordinator).toBeTypeOf("function");
		expect(WorkflowRunDriver).toBeTypeOf("function");
	});

	it("keeps canonical JSON hashing internal to persistence identities", () => {
		expect("canonicalJson" in publicApi).toBe(false);
		expect("hashCanonicalJson" in publicApi).toBe(false);
	});
});
