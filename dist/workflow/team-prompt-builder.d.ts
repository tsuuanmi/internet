import type { WorkflowJob } from "#internet/workflow/types";
export type WorkflowTeamPhase = "research" | "review";
export type WorkflowTeamLane = "A" | "B";
/** Build authoritative, deterministic workflow team tasks without an intermediary LLM. */
export declare class WorkflowTeamPromptBuilder {
    research(job: WorkflowJob, lane: WorkflowTeamLane): string;
    review(job: WorkflowJob, lane: WorkflowTeamLane): string;
}
//# sourceMappingURL=team-prompt-builder.d.ts.map