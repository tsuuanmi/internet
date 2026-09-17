import { describe, expect, it } from "vitest";
import {
	WORKFLOW_ARTIFACT_SCHEMA,
	WORKFLOW_INPUT_BUNDLE_SCHEMA,
	WORKFLOW_RUN_SCHEMA,
	WORKFLOW_WORK_ITEM_SCHEMA,
	WorkflowArtifactStore,
	WorkflowCapabilityRegistry,
	WorkflowInputBundleStore,
	WorkflowRunStore,
	WorkflowWorkItemStore,
} from "#internet/index";

describe("workflow kernel public API", () => {
	it("publishes the Phase 2 kernel contracts and stores from the package root", () => {
		expect(WORKFLOW_RUN_SCHEMA).toBe("@tsuuanmi/internet-workflow-run");
		expect(WORKFLOW_ARTIFACT_SCHEMA).toBe("@tsuuanmi/internet-workflow-artifact");
		expect(WORKFLOW_WORK_ITEM_SCHEMA).toBe("@tsuuanmi/internet-workflow-work-item");
		expect(WORKFLOW_INPUT_BUNDLE_SCHEMA).toBe("@tsuuanmi/internet-workflow-input-bundle");
		expect(WorkflowRunStore).toBeTypeOf("function");
		expect(WorkflowArtifactStore).toBeTypeOf("function");
		expect(WorkflowWorkItemStore).toBeTypeOf("function");
		expect(WorkflowInputBundleStore).toBeTypeOf("function");
		expect(WorkflowCapabilityRegistry).toBeTypeOf("function");
	});
});
