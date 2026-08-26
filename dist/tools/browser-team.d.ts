import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import type { BrowserConfig, WebProvider } from "#internet/core/config";
export type { TeamInput } from "#internet/tools/args";
export { parseTeamArgs } from "#internet/tools/args";
/**
 * Define the `browser_team` model tool: run a two-model debate between ChatGPT
 * Web and Gemini Web on a task and return only the final "best of both" answer.
 * The DSH agent is the team lead — it calls this tool and receives the answer
 * without participating in the debate.
 */
export declare function defineBrowserTeamTool(manager: BrowserManager, config: BrowserConfig, allowed: ReadonlySet<WebProvider>): ReturnType<typeof defineTool>;
//# sourceMappingURL=browser-team.d.ts.map