import { type InternetApplicationRequestContext } from "#internet/application/context";
import type { WebsiteParticipantArtifactStore } from "#internet/participant/artifact-store";
export interface InternetArtifactReadInput {
    readonly artifactId: string;
    readonly offset?: number;
    readonly maxChars?: number;
}
export interface InternetArtifactReadResult {
    readonly text: string;
    readonly artifactId: string;
    readonly offset: number;
    readonly totalChars: number;
    readonly nextOffset?: number;
}
export declare function parseInternetArtifactReadInput(input: {
    readonly artifactId: unknown;
    readonly offset?: unknown;
    readonly maxChars?: unknown;
}): InternetArtifactReadInput;
export declare class InternetArtifactApplicationService {
    private readonly artifacts;
    constructor(artifacts: Pick<WebsiteParticipantArtifactStore, "readText">);
    read(context: InternetApplicationRequestContext, input: InternetArtifactReadInput): InternetArtifactReadResult;
}
//# sourceMappingURL=artifact.d.ts.map