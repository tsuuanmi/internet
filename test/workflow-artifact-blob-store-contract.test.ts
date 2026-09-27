import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe } from "vitest";
import { LocalWorkflowArtifactBlobStore } from "#internet/workflow/components";
import { artifactBlobStoreConformance } from "./workflow-component-conformance";

describe("local workflow artifact blob store", () => {
	artifactBlobStoreConformance(
		() => new LocalWorkflowArtifactBlobStore(mkdtempSync(join(tmpdir(), "internet-workflow-blob-contract-"))),
	);
});
