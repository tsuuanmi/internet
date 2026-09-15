import type { WorkflowEventRecord, WorkflowJob } from "#internet/workflow/types";
export interface WorkflowEventSink {
    publish(job: WorkflowJob, event: WorkflowEventRecord): void;
}
export interface WorkflowGraphEvent extends WorkflowEventRecord {
    readonly schema: "@tsuuanmi/internet-workflow-event";
    readonly version: 1;
    readonly jobId: string;
    readonly eventSeq: number;
    readonly graphRevision: number;
}
export declare class WorkflowEventJournal {
    private readonly root;
    constructor(dataDir: string);
    append(job: WorkflowJob, event: WorkflowEventRecord): WorkflowGraphEvent;
    list(jobId: string, limit?: number): readonly WorkflowGraphEvent[];
}
export declare function parseWorkflowGraphEvent(value: unknown): WorkflowGraphEvent;
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
export declare class DshWorkflowEventSink implements WorkflowEventSink {
    private readonly agents;
    constructor(agents: WorkflowAgentRegistry);
    publish(job: WorkflowJob, event: WorkflowEventRecord): void;
}
//# sourceMappingURL=events.d.ts.map