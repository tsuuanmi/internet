import type { WorkflowPullRequestReceipt } from "#internet/workflow/types";
export type WorkflowTeamPhase = "research" | "review";
export type WorkflowTeamLane = "A" | "B";
export interface WorkflowPromptContext {
    readonly objective: string;
    readonly repository: string;
    readonly baseRevision: string;
}
export interface WorkflowReviewPromptContext extends WorkflowPromptContext {
    readonly pullRequest: WorkflowPullRequestReceipt;
    readonly reviewCycle: number;
}
export declare class WorkflowTeamPromptBuilder {
    research(context: WorkflowPromptContext, lane: WorkflowTeamLane): string;
    review(context: WorkflowReviewPromptContext, lane: WorkflowTeamLane): string;
}
//# sourceMappingURL=team-prompt-builder.d.ts.map