import { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import { WorkflowDurableAwaitableRuntime } from "#internet/workflow/awaitables/runtime";
import { WorkflowCapabilityRegistry } from "#internet/workflow/capability-registry";
import { WorkflowExternalEventStore } from "#internet/workflow/external-event-store";
import { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import { createResearchWorkflowActivationHandler } from "#internet/workflow/profiles/research/activation";
import { RESEARCH_ASSESSMENT_CAPABILITY, WorkflowResearchAssessmentAdapter, } from "#internet/workflow/profiles/research/assessment-capability";
import { EXTERNAL_DEEP_RESEARCH_CAPABILITY, WorkflowExternalDeepResearchAdapter, } from "#internet/workflow/profiles/research/deep-research-capability";
import { createWorkflowResearchPolicy, } from "#internet/workflow/profiles/research/policy";
import { RESEARCH_SYNTHESIS_CAPABILITY, WorkflowResearchSynthesisAdapter, } from "#internet/workflow/profiles/research/synthesis-capability";
import { WorkflowRunStore } from "#internet/workflow/run-store";
import { WorkflowRunCoordinator } from "#internet/workflow/runtime/coordinator";
import { WorkflowRunDriver } from "#internet/workflow/runtime/driver";
import { WorkflowExecutionStore } from "#internet/workflow/runtime/execution-store";
import { WorkflowExecutionResultStore } from "#internet/workflow/runtime/result-store";
import { WorkflowTimerStore } from "#internet/workflow/timer-store";
import { WorkflowWakeupScheduler } from "#internet/workflow/wakeup-scheduler";
import { WorkflowWorkItemStore } from "#internet/workflow/work-item-store";
function noPendingActions() {
    return {
        ensure() {
            throw new Error("deep_research profile does not materialize PendingAction in this runtime");
        },
        list: () => [],
        hasOpen: () => false,
        reconcile: () => undefined,
    };
}
export function createWorkflowResearchRuntime(dataDir, browser, teamRunner, options = {}) {
    const runs = new WorkflowRunStore(dataDir);
    const artifacts = new WorkflowArtifactStore(dataDir);
    const workItems = new WorkflowWorkItemStore(dataDir);
    const inputBundles = new WorkflowInputBundleStore(dataDir);
    const executions = new WorkflowExecutionStore(dataDir);
    const results = new WorkflowExecutionResultStore(dataDir);
    const timers = new WorkflowTimerStore(dataDir);
    const events = new WorkflowExternalEventStore(dataDir);
    let driver;
    let wakeups;
    const awaitables = new WorkflowDurableAwaitableRuntime(timers, events, {
        onTimerChanged: () => wakeups?.refresh(),
        onRunWake: (runId) => driver?.enqueue(runId),
    });
    const policy = createWorkflowResearchPolicy(artifacts, inputBundles, awaitables, options);
    const deep = new WorkflowExternalDeepResearchAdapter(browser, options.researchAccountId ?? "chatgpt-thinker", artifacts);
    const synthesis = new WorkflowResearchSynthesisAdapter(teamRunner, artifacts);
    const assessment = new WorkflowResearchAssessmentAdapter(teamRunner, artifacts);
    const executors = new Map([
        [EXTERNAL_DEEP_RESEARCH_CAPABILITY.id, deep],
        [RESEARCH_SYNTHESIS_CAPABILITY.id, synthesis],
        [RESEARCH_ASSESSMENT_CAPABILITY.id, assessment],
    ]);
    const coordinator = new WorkflowRunCoordinator({
        runs,
        artifacts,
        workItems,
        inputBundles,
        executions,
        results,
        capabilities: new WorkflowCapabilityRegistry([
            EXTERNAL_DEEP_RESEARCH_CAPABILITY,
            RESEARCH_SYNTHESIS_CAPABILITY,
            RESEARCH_ASSESSMENT_CAPABILITY,
        ]),
        executors: {
            resolve(capability) {
                const executor = executors.get(capability.id);
                if (executor === undefined)
                    throw new Error(`research executor ${capability.id} is not registered`);
                return executor;
            },
        },
        pendingActions: noPendingActions(),
        awaitables,
        policy,
    });
    driver = new WorkflowRunDriver(coordinator, runs);
    wakeups = new WorkflowWakeupScheduler(timers, events, runs, driver);
    const activationHandler = createResearchWorkflowActivationHandler(runs, artifacts, driver);
    return {
        runs,
        artifacts,
        driver,
        wakeups,
        activationHandler,
        async dispose() {
            wakeups?.dispose();
            await driver?.dispose();
        },
    };
}
//# sourceMappingURL=runtime.js.map