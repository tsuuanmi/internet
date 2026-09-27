import { defineTool } from "@deepseek-ai/dsh-tools";
import { type InternetArtifactApplicationService } from "#internet/application";
/** Define the DSH adapter for host-neutral `internet_artifact` application behavior. */
export declare function defineInternetArtifactTool(application: Pick<InternetArtifactApplicationService, "read">): ReturnType<typeof defineTool>;
//# sourceMappingURL=internet-artifact.d.ts.map