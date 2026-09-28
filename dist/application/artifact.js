import { assertInternetApplicationRequestContext, } from "#internet/application/context";
const DEFAULT_ARTIFACT_READ_CHARS = 12_000;
const MAX_ARTIFACT_READ_CHARS = 50_000;
function parseArtifactId(value) {
    if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
        throw new Error("internet_artifact artifact_id must be 64 lowercase hex characters");
    }
    return value;
}
function parseOffset(value) {
    if (value === undefined)
        return 0;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        throw new Error("internet_artifact offset must be a non-negative integer");
    }
    return value;
}
function parseMaxChars(value) {
    if (value === undefined)
        return DEFAULT_ARTIFACT_READ_CHARS;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > MAX_ARTIFACT_READ_CHARS) {
        throw new Error(`internet_artifact max_chars must be an integer from 1 through ${MAX_ARTIFACT_READ_CHARS}`);
    }
    return value;
}
export function parseInternetArtifactReadInput(input) {
    return {
        artifactId: parseArtifactId(input.artifactId),
        offset: parseOffset(input.offset),
        maxChars: parseMaxChars(input.maxChars),
    };
}
export class InternetArtifactApplicationService {
    constructor(artifacts) {
        this.artifacts = artifacts;
    }
    read(context, input) {
        assertInternetApplicationRequestContext(context);
        const artifactId = parseArtifactId(input.artifactId);
        const offset = parseOffset(input.offset);
        const maxChars = parseMaxChars(input.maxChars);
        const result = this.artifacts.readText(context.ownerSessionId, artifactId, { offset, maxChars });
        return {
            text: result.text,
            artifactId,
            offset: result.offset,
            totalChars: result.totalChars,
            ...(result.nextOffset === undefined ? {} : { nextOffset: result.nextOffset }),
        };
    }
}
//# sourceMappingURL=artifact.js.map