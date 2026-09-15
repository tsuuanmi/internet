import type { ProviderProgressEvent } from "#internet/browser/completion";
import type { ChatRequest, ChatResult } from "#internet/browser/runtime";
import { type AccountId } from "#internet/core/accounts";
import { type TeamPlan, type TeamPlanStep } from "#internet/team/plan";
import type { TeamPromptStrategyId } from "#internet/team/prompt-strategy";
import type { TeamFailureDetail, TeamProgressEvent, TeamTurn } from "#internet/team/types";
export type TeamChatFn = (accountId: AccountId, request: ChatRequest) => Promise<ChatResult>;
export type TeamProgressObserver = (event: TeamProgressEvent) => void;
export interface TeamStepExecutionOptions {
    readonly plan: TeamPlan;
    readonly step: TeamPlanStep;
    readonly task: string;
    readonly transcript: readonly TeamTurn[];
    readonly promptStrategy: TeamPromptStrategyId;
    readonly sessionId: string;
    readonly visible?: boolean;
    readonly timeoutMs?: number;
    readonly stallTimeoutMs?: number;
    readonly signal?: AbortSignal;
    readonly onProgress?: TeamProgressObserver;
    readonly onProviderProgress?: (event: ProviderProgressEvent) => void;
}
export type TeamStepExecutionResult = {
    readonly ok: true;
    readonly step: TeamPlanStep;
    readonly turn?: TeamTurn;
    readonly finalAnswer?: string;
} | {
    readonly ok: false;
    readonly error: TeamFailureDetail;
};
export declare function runTeamStep(chat: TeamChatFn, options: TeamStepExecutionOptions): Promise<TeamStepExecutionResult>;
//# sourceMappingURL=executor.d.ts.map