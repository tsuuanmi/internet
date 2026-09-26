import { defineTool } from "@deepseek-ai/dsh-tools";
import type { WebsiteParticipantArtifactStore } from "#internet/participant/artifact-store";
/** Define exact owner-scoped reads over durable website participant results. */
export declare function defineInternetArtifactTool(artifacts: Pick<WebsiteParticipantArtifactStore, "readText">): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-artifact.d.ts.map