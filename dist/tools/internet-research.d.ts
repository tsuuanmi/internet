import { defineTool } from "@deepseek-ai/dsh-tools";
import type { InternetResearchApplicationService } from "#internet/application";
import type { BrowserConfig } from "#internet/core/config";
/** Thin DSH adapter over the host-neutral provider-native research application service. */
export declare function defineInternetResearchTool(research: Pick<InternetResearchApplicationService, "execute">, config: BrowserConfig): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-research.d.ts.map