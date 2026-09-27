import { defineTool } from "@deepseek-ai/dsh-tools";
import {
	type InternetArtifactApplicationService,
	parseInternetArtifactReadInput,
} from "#internet/application";

/** Define the DSH adapter for host-neutral `internet_artifact` application behavior. */
export function defineInternetArtifactTool(
	application: Pick<InternetArtifactApplicationService, "read">,
): ReturnType<typeof defineTool> {
	return defineTool({
		name: "internet_artifact",
		description:
			"Read an exact range from a full website result retained by internet_chat or internet_research. Artifacts are scoped to the current DSH session.",
		parameters: {
			artifact_id: {
				type: "string",
				required: true,
				description: "Artifact id returned by internet_chat or internet_research.",
			},
			offset: {
				type: "integer",
				description: "Zero-based character offset. Defaults to 0.",
			},
			max_chars: {
				type: "integer",
				description: "Maximum characters to return, from 1 through 50000. Defaults to 12000.",
			},
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					text: { type: "string", required: true },
					artifactId: { type: "string" },
					offset: { type: "integer" },
					totalChars: { type: "integer" },
					nextOffset: { type: "integer" },
					isError: { type: "boolean" },
				},
			},
			render: (_args, value) => [{ type: "text", text: String((value as { text?: unknown })?.text ?? value) }],
			presentationMeta: (_args, value) => value,
		},
		async execute(args, exec) {
			const ownerSessionId = exec.agent?.id;
			if (ownerSessionId === undefined) {
				return {
					text: "internet_artifact requires an agent-backed DSH session to own the website artifact.",
					isError: true,
				};
			}
			try {
				return application.read(
					{
						ownerSessionId: String(ownerSessionId),
						requestId: String(exec.callId),
						signal: exec.signal,
					},
					parseInternetArtifactReadInput(args),
				);
			} catch (error) {
				return {
					text: `internet_artifact failed: ${error instanceof Error ? error.message : String(error)}`,
					isError: true,
				};
			}
		},
		presentCall: (args) => ({
			card: "generic",
			title: `artifact · ${String(args.artifact_id).slice(0, 12)}`,
			kind: "other",
		}),
	});
}
