import { defineTool } from "@deepseek-ai/dsh-tools";
import type { BrowserManager } from "#internet/browser/runtime";
import { type AccountId } from "#internet/core/accounts";
import type { BrowserConfig } from "#internet/core/config";
export type { TeamInput } from "#internet/tools/args";
export { parseTeamArgs } from "#internet/tools/args";
type InternetTeamManager = Pick<BrowserManager, "chat">;
/** Render opt-in transcript data using provider-agnostic member identities. */
export declare function renderInternetTeamResult(value: unknown): string;
/** Define the provider-agnostic `internet_team` tool over authenticated thinker members. */
export declare function defineInternetTeamTool(manager: InternetTeamManager, config: BrowserConfig, allowed: ReadonlySet<AccountId>): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-team.d.ts.map