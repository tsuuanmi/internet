import { describe } from "vitest";
import { TypeScriptWorkflowGraphModel } from "#internet/workflow/components";
import { graphModelConformance } from "./workflow-component-conformance.js";

describe("TypeScript workflow graph model", () => {
	graphModelConformance(() => new TypeScriptWorkflowGraphModel());
});
