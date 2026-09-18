import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import type {
	WorkflowArtifact,
	WorkflowArtifactRef,
	WorkflowRun,
	WorkflowVersionRef,
} from "#internet/workflow/kernel/types";
import { RESEARCH_ASSESSMENT_CAPABILITY } from "#internet/workflow/profiles/research/assessment-capability";
import { EXTERNAL_DEEP_RESEARCH_CAPABILITY } from "#internet/workflow/profiles/research/deep-research-capability";
import { RESEARCH_SYNTHESIS_CAPABILITY } from "#internet/workflow/profiles/research/synthesis-capability";
import { currentWorkflowArtifactIds } from "#internet/workflow/runtime/invalidation";
import type { WorkflowAwaitableRuntime, WorkflowRuntimePolicy } from "#internet/workflow/runtime/types";
import {
	parseWorkflowAcceptanceCriteriaPayload,
	parseWorkflowCriterionAssessmentPayload,
	parseWorkflowFindingPayload,
	WORKFLOW_SEMANTIC_ARTIFACT_TYPES,
} from "#internet/workflow/semantic/index";

export type WorkflowResearchRoundWait =
	| { readonly kind: "timer"; readonly delayMs: number }
	| {
			readonly kind: "external_event";
			readonly eventType: string;
			readonly payloadSchema?: WorkflowVersionRef;
	  };

export interface WorkflowResearchPolicyOptions {
	readonly maxRounds?: number;
	readonly roundWait?: WorkflowResearchRoundWait;
}

function positiveInteger(value: number, label: string): number {
	if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
	return value;
}

function currentArtifacts(
	run: WorkflowRun,
	artifacts: WorkflowArtifactStore,
	inputBundles: WorkflowInputBundleStore,
): readonly WorkflowArtifact[] {
	const all = artifacts.list(run.runId);
	const current = currentWorkflowArtifactIds(all, inputBundles.list(run.runId));
	return all.filter((artifact) => current.has(artifact.artifactId));
}

function refsOf(artifacts: readonly WorkflowArtifact[], types: readonly string[]): readonly WorkflowArtifactRef[] {
	return artifacts
		.filter((artifact) => types.includes(artifact.type))
		.map((artifact) => ({ runId: artifact.runId, artifactId: artifact.artifactId }));
}

function researchRoundId(context: Parameters<WorkflowRuntimePolicy["materializeNeed"]>[0]): number | undefined {
	if (context.need.requestOwner.kind !== "research_round") return undefined;
	const round = Number(context.need.requestOwner.id);
	if (!Number.isSafeInteger(round) || round < 1) throw new Error("research round Need has an invalid round id");
	return round;
}

export function createWorkflowResearchPolicy(
	artifacts: WorkflowArtifactStore,
	inputBundles: WorkflowInputBundleStore,
	awaitables: WorkflowAwaitableRuntime,
	options: WorkflowResearchPolicyOptions = {},
): WorkflowRuntimePolicy {
	const maxRounds = positiveInteger(options.maxRounds ?? 2, "research maxRounds");
	const roundWait = options.roundWait ?? { kind: "timer" as const, delayMs: 60 * 60_000 };
	if (roundWait.kind === "timer") positiveInteger(roundWait.delayMs, "research round Timer delay");
	else if (roundWait.eventType.trim() === "") throw new Error("research round ExternalEvent type is required");

	return {
		materializeNeed(context) {
			const round = researchRoundId(context);
			if (round !== undefined) {
				if (round > maxRounds) throw new Error("research round exceeds configured maximum");
				if (round > 1 && roundWait.kind === "timer") {
					const timer = awaitables
						.listTimers(context.run.runId)
						.find((candidate) => candidate.causedBy.artifactId === context.needArtifact.artifactId);
					if (timer?.state !== "FIRED") {
						return {
							kind: "timer",
							timerType: "research.refresh",
							deadline: new Date(Date.parse(context.needArtifact.createdAt) + roundWait.delayMs).toISOString(),
						};
					}
				}
				if (round > 1 && roundWait.kind === "external_event") {
					const wait = awaitables
						.listExternalEventWaits(context.run.runId)
						.find((candidate) => candidate.causedBy.artifactId === context.needArtifact.artifactId);
					if (wait?.state !== "MATCHED") {
						return {
							kind: "external_event",
							eventType: roundWait.eventType,
							correlationKey: `research:${context.run.runId}:round:${String(round)}`,
							payloadSchema: roundWait.payloadSchema,
						};
					}
				}
				return {
					kind: "work_item",
					capability: {
						id: EXTERNAL_DEEP_RESEARCH_CAPABILITY.id,
						version: EXTERNAL_DEEP_RESEARCH_CAPABILITY.version,
					},
				};
			}
			if (context.need.requestOwner.kind === "research_synthesis") {
				return {
					kind: "work_item",
					capability: { id: RESEARCH_SYNTHESIS_CAPABILITY.id, version: RESEARCH_SYNTHESIS_CAPABILITY.version },
				};
			}
			if (context.need.requestOwner.kind === "research_report") {
				return {
					kind: "work_item",
					capability: { id: RESEARCH_ASSESSMENT_CAPABILITY.id, version: RESEARCH_ASSESSMENT_CAPABILITY.version },
				};
			}
			throw new Error(`unsupported research Need owner ${context.need.requestOwner.kind}`);
		},

		readiness(context) {
			const current = currentArtifacts(context.run, artifacts, inputBundles);
			const round = researchRoundId(context);
			if (round !== undefined) {
				return {
					ready: true,
					artifacts: refsOf(current, [
						WORKFLOW_SEMANTIC_ARTIFACT_TYPES.objective,
						WORKFLOW_SEMANTIC_ARTIFACT_TYPES.acceptanceCriteria,
						WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence,
					]),
					facts: [
						{ name: "research.round", value: round },
						{ name: "research.maxRounds", value: maxRounds },
					],
					blockers: [],
				};
			}
			if (context.need.requestOwner.kind === "research_synthesis") {
				const evidence = refsOf(current, [WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence]);
				return {
					ready: evidence.length > 0,
					artifacts: evidence,
					facts: [],
					blockers: evidence.length > 0 ? [] : ["research Evidence is missing"],
				};
			}
			if (context.need.requestOwner.kind === "research_report") {
				const required = refsOf(current, [
					WORKFLOW_SEMANTIC_ARTIFACT_TYPES.acceptanceCriteria,
					WORKFLOW_SEMANTIC_ARTIFACT_TYPES.report,
					WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence,
				]);
				const hasCriteria = current.some(
					(artifact) => artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.acceptanceCriteria,
				);
				const hasReport = current.some((artifact) => artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.report);
				const blockers = [
					...(hasCriteria ? [] : ["research AcceptanceCriteria is missing"]),
					...(hasReport ? [] : ["research Report is missing"]),
				];
				return { ready: blockers.length === 0, artifacts: required, facts: [], blockers };
			}
			return { ready: false, artifacts: [], facts: [], blockers: ["unsupported research Need"] };
		},

		convergence(run) {
			const current = currentArtifacts(run, artifacts, inputBundles);
			const criteriaArtifact = current.find(
				(artifact) => artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.acceptanceCriteria,
			);
			if (criteriaArtifact === undefined) {
				return {
					policy: {
						criteria: [],
						requiredDeliverableTypes: [WORKFLOW_SEMANTIC_ARTIFACT_TYPES.report],
						requiredAuthorityGates: [],
						requiredReceiptIds: [],
						requiredDependencyIds: ["research-criteria"],
						requiredPlanTasks: [],
					},
					state: {
						assessments: [],
						findings: [],
						deliverables: [],
						authorityGates: [],
						receiptIds: [],
						dependencies: [{ id: "research-criteria", resolved: false }],
						planTasks: [],
					},
				};
			}
			const criteria = parseWorkflowAcceptanceCriteriaPayload(criteriaArtifact.payload);
			const criterion = criteria.criteria.find((item) => item.criterionId === "research-report");
			if (criterion === undefined) throw new Error("research AcceptanceCriteria is missing research-report");
			const subject = { kind: "workflow_run", id: run.runId, version: run.admissionId };
			return {
				policy: {
					criteria: [
						{
							criterion: {
								criteriaArtifact: { runId: criteriaArtifact.runId, artifactId: criteriaArtifact.artifactId },
								criterionId: criterion.criterionId,
								criterionVersion: criterion.version,
							},
							subject,
							requiredMethods: ["reviewer"],
							policyRef: { id: "research.assessment", version: "1" },
						},
					],
					requiredDeliverableTypes: [WORKFLOW_SEMANTIC_ARTIFACT_TYPES.report],
					requiredAuthorityGates: [],
					requiredReceiptIds: [],
					requiredDependencyIds: [],
					requiredPlanTasks: [],
				},
				state: {
					assessments: current
						.filter((artifact) => artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.criterionAssessment)
						.map((artifact) => ({
							artifactId: artifact.artifactId,
							current: true,
							assessment: parseWorkflowCriterionAssessmentPayload(artifact.payload),
						})),
					findings: current
						.filter((artifact) => artifact.type === WORKFLOW_SEMANTIC_ARTIFACT_TYPES.finding)
						.map((artifact) => ({ finding: parseWorkflowFindingPayload(artifact.payload), resolved: false })),
					deliverables: current.map((artifact) => ({
						artifactId: artifact.artifactId,
						type: artifact.type,
						current: true,
					})),
					authorityGates: [],
					receiptIds: [],
					dependencies: [],
					planTasks: [],
				},
			};
		},
	};
}
