import type { BrowserManager } from "#internet/browser/runtime";
import type { AccountId } from "#internet/core/accounts";
import { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import { createResearchWorkflowActivationHandler } from "#internet/workflow/profiles/research/activation";
import { type WorkflowResearchPolicyOptions } from "#internet/workflow/profiles/research/policy";
import { WorkflowRunStore } from "#internet/workflow/run-store";
import { WorkflowRunDriver } from "#internet/workflow/runtime/driver";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
import { WorkflowWakeupScheduler } from "#internet/workflow/wakeup-scheduler";
export interface WorkflowResearchRuntimeOptions extends WorkflowResearchPolicyOptions {
    readonly researchAccountId?: AccountId;
}
export interface WorkflowResearchRuntime {
    readonly runs: WorkflowRunStore;
    readonly artifacts: WorkflowArtifactStore;
    readonly driver: WorkflowRunDriver;
    readonly wakeups: WorkflowWakeupScheduler;
    readonly activationHandler: ReturnType<typeof createResearchWorkflowActivationHandler>;
    dispose(): Promise<void>;
}
export declare function createWorkflowResearchRuntime(dataDir: string, browser: Pick<BrowserManager, "research">, teamRunner: WorkflowTeamRunner, options?: WorkflowResearchRuntimeOptions): WorkflowResearchRuntime;
//# sourceMappingURL=runtime.d.ts.map