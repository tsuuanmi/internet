import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
export type { TeamInput } from "#internet/tools/args";
export { parseTeamArgs } from "#internet/tools/args";
type BrowserTeamManager = Pick<BrowserManager, "chat">;
/** Render opt-in transcript data into model-visible tool content, not only UI metadata. */
export declare function renderBrowserTeamResult(value: unknown): string;
/**
 * Define the `browser_team` model tool: run a multi-model debate between the
 * configured web providers on a task and return the final "best of both"
 * answer, optionally accompanied by a bounded current-call transcript. The DSH
 * agent is the team lead and does not participate in the debate.
 */
export declare function defineBrowserTeamTool(manager: BrowserTeamManager, config: BrowserConfig, allowed: ReadonlySet<WebProvider>): ReturnType<typeof defineTool>;
//# sourceMappingURL=browser-team.d.ts.map