import { canonicalJson } from "#internet/core/canonical-json";
import type { WorkflowAdmissionActivator } from "#internet/workflow/admission/activation";
import type { WorkflowAdmissionActivationHandler } from "#internet/workflow/admission/activation-registry";
import type {
	AcceptedAdmissionSpec,
	AdmissionActivationTarget,
} from "#internet/workflow/admission/types";
import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowPrincipal } from "#internet/workflow/authorization";
import {
	WORKFLOW_RUN_SCHEMA,
	type WorkflowRun,
} from "#internet/workflow/kernel/types";
import { RESEARCH_ASSESSMENT_CAPABILITY } from "#internet/workflow/profiles/research/assessment-capability";
import { EXTERNAL_DEEP_RESEARCH_CAPABILITY } from "#internet/workflow/profiles/research/deep-research-capability";
import { RESEARCH_WORKFLOW_PROFILE_ID } from "#internet/workflow/profiles/research/profile";
import { RESEARCH_SYNTHESIS_CAPABILITY } from "#internet/workflow/profiles/research/synthesis-capability";
import type { WorkflowRunStore } from "#internet/workflow/run-store";
import {
	WORKFLOW_SEMANTIC_ARTIFACT_TYPES,
	WORKFLOW_SEMANTIC_SCHEMA_REFS,
} from "#internet/workflow/semantic/index";

export interface ResearchWorkflowActivationDriver {
	enqueue(runId: string): void;
	isActive(runId: string): boolean;
}

function runFor(spec: AcceptedAdmissionSpec, owner: WorkflowPrincipal): WorkflowRun {
	if (spec.profile.id !== RESEARCH_WORKFLOW_PROFILE_ID) {
		throw new Error(`research workflow activator does not support profile ${spec.profile.id}`);
	}
	const at = spec.acceptedAt;
	return {
		schema: WORKFLOW_RUN_SCHEMA,
		version: 1,
		revision: 1,
		runId: spec.admissionId,
		admissionId: spec.admissionId,
		owner,
		lifecycle: "CREATED",
		definitions: {
			profile: spec.profile,
			policy: { id: "research.multi_round", version: "1" },
			capabilities: [
				{ id: EXTERNAL_DEEP_RESEARCH_CAPABILITY.id, version: EXTERNAL_DEEP_RESEARCH_CAPABILITY.version },
				{ id: RESEARCH_SYNTHESIS_CAPABILITY.id, version: RESEARCH_SYNTHESIS_CAPABILITY.version },
				{ id: RESEARCH_ASSESSMENT_CAPABILITY.id, version: RESEARCH_ASSESSMENT_CAPABILITY.version },
			],
			schemas: [
				WORKFLOW_SEMANTIC_SCHEMA_REFS.objective,
				WORKFLOW_SEMANTIC_SCHEMA_REFS.acceptanceCriteria,
				WORKFLOW_SEMANTIC_SCHEMA_REFS.need,
				WORKFLOW_SEMANTIC_SCHEMA_REFS.evidence,
				WORKFLOW_SEMANTIC_SCHEMA_REFS.report,
				WORKFLOW_SEMANTIC_SCHEMA_REFS.criterionAssessment,
			],
			projection: { id: "research.default", version: "1" },
		},
		createdAt: at,
		updatedAt: at,
	};
}

function assertExactRun(current: WorkflowRun, expected: WorkflowRun): void {
	if (
		current.runId !== expected.runId ||
		current.admissionId !== expected.admissionId ||
		canonicalJson(current.owner) !== canonicalJson(expected.owner) ||
		canonicalJson(current.definitions) !== canonicalJson(expected.definitions) ||
		current.createdAt !== expected.createdAt
	) {
		throw new Error(`workflow run ${current.runId} conflicts with accepted research admission identity`);
	}
}

export function createResearchWorkflowActivator(
	runs: WorkflowRunStore,
	artifacts: WorkflowArtifactStore,
	driver: ResearchWorkflowActivationDriver,
	owner: WorkflowPrincipal,
): WorkflowAdmissionActivator {
	return {
		target(spec): AdmissionActivationTarget {
			if (spec.profile.id !== RESEARCH_WORKFLOW_PROFILE_ID) {
				throw new Error(`research workflow activator does not support profile ${spec.profile.id}`);
			}
			return { targetKind: "workflow_run", targetId: spec.admissionId };
		},
		ensure(spec, target) {
			if (target.targetKind !== "workflow_run" || target.targetId !== spec.admissionId) {
				throw new Error("research workflow activation target does not match accepted admission identity");
			}
			const expected = runFor(spec, owner);
			const current = runs.get(expected.runId);
			if (current === undefined) runs.create(expected);
			else assertExactRun(current, expected);

			const objective = artifacts.create({
				runId: expected.runId,
				type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.objective,
				schemaRef: WORKFLOW_SEMANTIC_SCHEMA_REFS.objective,
				producer: { kind: "runtime", id: "research-admission" },
				payload: {
					objectiveId: `research:${spec.admissionId}`,
					version: "1",
					admissionId: spec.admissionId,
					statement: spec.draft.source.rawText,
					constraints: [],
				},
			});
			const criteria = artifacts.create({
				runId: expected.runId,
				type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.acceptanceCriteria,
				schemaRef: WORKFLOW_SEMANTIC_SCHEMA_REFS.acceptanceCriteria,
				producer: { kind: "runtime", id: "research-admission" },
				payload: {
					criteriaSetId: `research:${spec.admissionId}`,
					version: "1",
					objective: { runId: objective.runId, artifactId: objective.artifactId },
					criteria: [
						{
							criterionId: "research-report",
							version: "1",
							statement: "Produce a reviewed current research report addressing the admitted objective.",
							provenance: "policy",
							required: true,
							assessmentPolicy: { requiredMethods: ["reviewer"] },
						},
					],
				},
			});
			artifacts.create({
				runId: expected.runId,
				type: WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need,
				schemaRef: WORKFLOW_SEMANTIC_SCHEMA_REFS.need,
				producer: { kind: "runtime", id: "research-admission" },
				payload: {
					needId: "research-round:1",
					type: "execution",
					requestOwner: { kind: "research_round", id: "1" },
					requestedCapability: EXTERNAL_DEEP_RESEARCH_CAPABILITY.id,
					question: spec.draft.source.rawText,
					subjects: [{ kind: "workflow_run", id: expected.runId }],
					relatedArtifacts: [
						{ runId: objective.runId, artifactId: objective.artifactId },
						{ runId: criteria.runId, artifactId: criteria.artifactId },
					],
				},
			});
			const latest = runs.get(expected.runId);
			if (latest !== undefined && !["COMPLETED", "CANCELLED"].includes(latest.lifecycle) && !driver.isActive(latest.runId)) {
				driver.enqueue(latest.runId);
			}
		},
	};
}


export function createResearchWorkflowActivationHandler(
	runs: WorkflowRunStore,
	artifacts: WorkflowArtifactStore,
	driver: ResearchWorkflowActivationDriver,
): WorkflowAdmissionActivationHandler {
	return {
		profileId: RESEARCH_WORKFLOW_PROFILE_ID,
		activator(context) {
			return createResearchWorkflowActivator(runs, artifacts, driver, context.principal);
		},
		resolve(target) {
			if (target.targetKind !== "workflow_run") {
				throw new Error("research workflow activation target is not a WorkflowRun");
			}
			const run = runs.get(target.targetId);
			if (run === undefined) throw new Error(`activated workflow run ${target.targetId} does not exist`);
			return { kind: "workflow_run", run };
		},
	};
}
