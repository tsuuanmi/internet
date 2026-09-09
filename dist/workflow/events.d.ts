import type { WorkflowEventRecord, WorkflowJob } from "#internet/workflow/types";
export interface WorkflowEventSink {
    publish(job: WorkflowJob, event: WorkflowEventRecord): void;
}
export interface WorkflowLocalAgent {
    inject(message: {
        readonly content: readonly [{
            readonly type: "text";
            readonly text: string;
        }];
        readonly source: {
            readonly kind: "plugin";
            readonly plugin: string;
        };
    }): void;
}
export interface WorkflowAgentRegistry {
    get(id: string): WorkflowLocalAgent | undefined;
}
export declare function formatWorkflowEvent(job: WorkflowJob, event: WorkflowEventRecord): string;
/** Best-effort host-native Local notification. INTERNAL events remain engine-only. */
export declare class DshWorkflowEventSink implements WorkflowEventSink {
    private readonly agents;
    constructor(agents: WorkflowAgentRegistry);
    publish(job: WorkflowJob, event: WorkflowEventRecord): void;
}
//# sourceMappingURL=events.d.ts.map