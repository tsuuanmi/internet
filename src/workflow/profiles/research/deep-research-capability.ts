import type { BrowserManager } from "#internet/browser/runtime";
import type { AccountId } from "#internet/core/accounts";
import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowCapabilityDescriptor } from "#internet/workflow/capability-registry";
import {
	loadWorkflowExactCapabilityInput,
	workflowCapabilityInputJson,
} from "#internet/workflow/profiles/capability-context";
import type {
	WorkflowCapabilityActiveExecutionContext,
	WorkflowCapabilityExecutor,
} from "#internet/workflow/runtime/types";
import {
	parseWorkflowNeedPayload,
	WORKFLOW_SEMANTIC_ARTIFACT_TYPES,
	type WorkflowSemanticExecutionResult,
} from "#internet/workflow/semantic/index";

export const EXTERNAL_DEEP_RESEARCH_CAPABILITY = {
	id: "research.external_deep_research",
	version: "1",
	acceptedNeedTypes: ["execution"],
	producedArtifactTypes: [WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence, WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need],
	producedReceiptTypes: [],
	sideEffect: "READ_ONLY",
	requiredAuthority: [],
	executorKinds: ["external_deep_research"],
	inputSchema: { id: "workflow.research.deep.input", version: "1" },
	outputSchema: { id: "workflow.research.deep.output", version: "1" },
	policyHooks: ["research_access"],
} as const satisfies WorkflowCapabilityDescriptor;

type DeepResearchBrowser = Pick<BrowserManager, "research">;

export class WorkflowExternalDeepResearchAdapter implements WorkflowCapabilityExecutor {
	readonly kind = "external_deep_research";
	private readonly browser: DeepResearchBrowser;
	private readonly accountId: AccountId;
	private readonly artifacts: WorkflowArtifactStore;

	constructor(browser: DeepResearchBrowser, accountId: AccountId, artifacts: WorkflowArtifactStore) {
		this.browser = browser;
		this.accountId = accountId;
		this.artifacts = artifacts;
	}

	async execute(
		context: WorkflowCapabilityActiveExecutionContext,
		signal?: AbortSignal,
	): Promise<WorkflowSemanticExecutionResult> {
		const needArtifact = this.artifacts.get(
			context.workItem.needArtifact.runId,
			context.workItem.needArtifact.artifactId,
		);
		if (needArtifact === undefined) throw new Error("deep research Need artifact does not exist");
		const need = parseWorkflowNeedPayload(needArtifact.payload);
		const exactInput = loadWorkflowExactCapabilityInput(this.artifacts, context.inputBundle);
		const result = await this.browser.research(this.accountId, {
			prompt: [
				"Perform deep research for the typed workflow Need below.",
				"Treat the exact InputBundle and Artifact payloads as authoritative scope.",
				"",
				`Need: ${need.question}`,
				"",
				"Exact workflow input:",
				workflowCapabilityInputJson(exactInput),
			].join("\n"),
			sessionId: `workflow:${context.run.runId}:deep-research`,
			responseRepresentation: "text",
			signal,
		});
		const source = { kind: "provider_conversation", id: result.url };
		const round = Number(context.inputBundle.facts.find((fact) => fact.name === "research.round")?.value);
		const maxRounds = Number(context.inputBundle.facts.find((fact) => fact.name === "research.maxRounds")?.value);
		if (!Number.isSafeInteger(round) || round < 1 || !Number.isSafeInteger(maxRounds) || maxRounds < round) {
			throw new Error("deep research capability requires valid round facts");
		}
		const nextNeed =
			round < maxRounds
				? {
						needId: `research-round:${String(round + 1)}`,
						type: "execution" as const,
						requestOwner: { kind: "research_round", id: String(round + 1) },
						requestedCapability: EXTERNAL_DEEP_RESEARCH_CAPABILITY.id,
						question: need.question,
						subjects: need.subjects,
						relatedArtifacts: [],
					}
				: {
						needId: "research-synthesis",
						type: "execution" as const,
						requestOwner: { kind: "research_synthesis", id: context.run.runId },
						requestedCapability: "research.synthesize_report",
						question: "Synthesize the accumulated research Evidence into the final Report.",
						subjects: need.subjects,
						relatedArtifacts: [],
					};
		return {
			executionId: context.execution.executionId,
			workItemId: context.workItem.workItemId,
			inputBundleId: context.inputBundle.bundleId,
			artifacts: [
				{
					type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence,
					payload: {
						evidenceId: `deep-research:${context.execution.executionId}`,
						summary: result.text,
						subjects: need.subjects,
						sourceRefs: [source],
						relatedArtifacts: context.inputBundle.artifacts,
					},
				},
				{ type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need, payload: nextNeed },
			],
			receiptIds: [],
		};
	}
}
