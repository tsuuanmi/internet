import type { BrowserManager } from "#internet/browser/runtime";
import type { AccountId } from "#internet/core/accounts";
import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityActiveExecutionContext, WorkflowCapabilityExecutor } from "#internet/workflow/runtime/types";
import { type WorkflowSemanticExecutionResult } from "#internet/workflow/semantic/index";
export declare const EXTERNAL_DEEP_RESEARCH_CAPABILITY: {
    readonly id: "research.external_deep_research";
    readonly version: "1";
    readonly acceptedNeedTypes: readonly ["execution"];
    readonly producedArtifactTypes: readonly ["evidence", "need"];
    readonly producedReceiptTypes: readonly [];
    readonly sideEffect: "READ_ONLY";
    readonly requiredAuthority: readonly [];
    readonly executorKinds: readonly ["external_deep_research"];
    readonly inputSchema: {
        readonly id: "workflow.research.deep.input";
        readonly version: "1";
    };
    readonly outputSchema: {
        readonly id: "workflow.research.deep.output";
        readonly version: "1";
    };
    readonly policyHooks: readonly ["research_access"];
};
type DeepResearchBrowser = Pick<BrowserManager, "research">;
export declare class WorkflowExternalDeepResearchAdapter implements WorkflowCapabilityExecutor {
    readonly kind = "external_deep_research";
    private readonly browser;
    private readonly accountId;
    private readonly artifacts;
    constructor(browser: DeepResearchBrowser, accountId: AccountId, artifacts: WorkflowArtifactStore);
    execute(context: WorkflowCapabilityActiveExecutionContext, signal?: AbortSignal): Promise<WorkflowSemanticExecutionResult>;
}
export {};
//# sourceMappingURL=deep-research-capability.d.ts.map