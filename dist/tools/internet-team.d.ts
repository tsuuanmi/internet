import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
export type { TeamInput } from "#internet/tools/args";
export { parseTeamArgs } from "#internet/tools/args";
type InternetTeamManager = Pick<BrowserManager, "chat">;
/** Render opt-in transcript data into model-visible tool content, not only UI metadata. */
export declare function renderInternetTeamResult(value: unknown): string;
/**
 * Define the `internet_team` model tool: run a multi-model debate between the
 * configured web providers on a task and return the final "best of both"
 * answer, optionally accompanied by a bounded current-call transcript. The DSH
 * agent is the team lead and does not participate in the debate.
 */
export declare function defineInternetTeamTool(manager: InternetTeamManager, config: BrowserConfig, allowed: ReadonlySet<WebProvider>): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-team.d.ts.map