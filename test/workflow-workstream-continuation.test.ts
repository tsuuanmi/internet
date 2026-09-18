import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkflowAdmissionService } from "#internet/workflow/admission/service";
import { WorkflowAdmissionStore } from "#internet/workflow/admission/store";
import { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import {
	WorkflowContinuationError,
	WorkflowContinuationService,
	type WorkflowContinuationImportPolicy,
} from "#internet/workflow/continuation";
import { WORKFLOW_RUN_SCHEMA, type WorkflowRun } from "#internet/workflow/kernel/types";
import { WorkflowProfileRegistry } from "#internet/workflow/profiles/registry";
import { WorkflowRunStore } from "#internet/workflow/run-store";
import { WorkflowWorkstreamStore } from "#internet/workflow/workstream-store";

const sourceRunId = "1".repeat(32);
const childRunId = "2".repeat(32);
const sourceAdmissionId = "3".repeat(32);
const childAdmissionId = "4".repeat(32);
const owner = { kind: "session" as const, id: "owner-session" };
const at = "2026-09-18T00:00:00.000Z";

function sourceRun(lifecycle: WorkflowRun["lifecycle"] = "COMPLETED"): WorkflowRun {
	return {
		schema: WORKFLOW_RUN_SCHEMA,
		version: 1,
		revision: 1,
		runId: sourceRunId,
		admissionId: sourceAdmissionId,
		owner,
		lifecycle,
		definitions: {
			profile: { id: "deep_research", version: "1" },
			policy: { id: "research", version: "1" },
			capabilities: [{ id: "research.external_deep_research", version: "1" }],
			schemas: [{ id: "workflow.report", version: "1" }],
			projection: { id: "research", version: "1" },
		},
		createdAt: at,
		updatedAt: at,
	};
}

function childRun(childOwner = owner): WorkflowRun {
	return {
		schema: WORKFLOW_RUN_SCHEMA,
		version: 1,
		revision: 1,
		runId: childRunId,
		admissionId: childAdmissionId,
		owner: childOwner,
		lifecycle: "CREATED",
		definitions: {
			profile: { id: "software_change", version: "1" },
			policy: { id: "software", version: "1" },
			capabilities: [{ id: "planning", version: "1" }],
			schemas: [{ id: "workflow.report", version: "1" }],
			projection: { id: "software", version: "1" },
		},
		createdAt: "2026-09-18T01:00:00.000Z",
		updatedAt: "2026-09-18T01:00:00.000Z",
	};
}

function setup(policy?: WorkflowContinuationImportPolicy, lifecycle: WorkflowRun["lifecycle"] = "COMPLETED") {
	const root = mkdtempSync(join(tmpdir(), "internet-workflow-continuation-"));
	const runs = new WorkflowRunStore(root);
	const artifacts = new WorkflowArtifactStore(root);
	const workstreams = new WorkflowWorkstreamStore(root);
	const admissions = new WorkflowAdmissionStore(root);
	const profiles = new WorkflowProfileRegistry(
		[
			{
				id: "software_change",
				version: "1",
				preflightAdmission: () => ({
					confirmationLevel: "AUTO_SUBMIT",
					confirmationReasons: [],
					defaults: [],
					unresolved: [],
					warnings: [],
					errors: [],
				}),
			},
		],
		"software_change",
	);
	const ids = ["7".repeat(32), childAdmissionId];
	const admissionService = new WorkflowAdmissionService(admissions, profiles, {
		createId: () => ids.shift() ?? "8".repeat(32),
		now: () => new Date("2026-09-18T01:30:00.000Z"),
	});
	runs.create(sourceRun(lifecycle));
	const report = artifacts.create({
		runId: sourceRunId,
		type: "report",
		schemaRef: { id: "workflow.report", version: "1" },
		producer: { kind: "runtime", id: "research-synthesis" },
		payload: {
			title: "Research result",
			body: "Exact source content",
			evidence: [],
		},
	});
	const service = new WorkflowContinuationService(
		workstreams,
		admissions,
		runs,
		artifacts,
		policy ?? { validate: () => undefined },
		{
			createId: () => "5".repeat(32),
			now: () => new Date("2026-09-18T02:00:00.000Z"),
		},
	);
	function acceptContinuation(workstreamId: string) {
		const created = admissionService.create(owner, {
			source: {
				kind: "user",
				rawText: "Implement the selected research report",
				provenance: "user_explicit",
			},
			profileHint: { value: "software_change", provenance: "user_explicit" },
			continuation: {
				workstreamId,
				continuesFromRunId: sourceRunId,
				sourceArtifacts: [
					{
						source: { runId: sourceRunId, artifactId: report.artifactId },
						payloadHash: report.payloadHash,
						schemaRef: report.schemaRef,
					},
				],
			},
		});
		const accepted = admissionService.preflight(owner, created.admissionId, created.revision);
		expect(accepted.state).toBe("ACCEPTED");
		expect(accepted.admissionId).toBe(childAdmissionId);
		return accepted;
	}
	return { root, runs, artifacts, workstreams, admissions, report, service, acceptContinuation };
}

describe("workflow Workstream continuation", () => {
	it("imports exact child-owned snapshots with durable source identity", () => {
		const { artifacts, workstreams, report, service, acceptContinuation } = setup();
		const workstream = service.createWorkstream(sourceRunId, "Research to implementation");
		acceptContinuation(workstream.workstreamId);
		const result = service.continueRun({
			workstreamId: workstream.workstreamId,
			sourceRunId,
			childRun: childRun(),
			sourceArtifacts: [{ runId: sourceRunId, artifactId: report.artifactId }],
		});

		expect(result.childRun.runId).toBe(childRunId);
		expect(result.importedArtifacts).toHaveLength(1);
		const imported = result.importedArtifacts[0]!;
		expect(imported.runId).toBe(childRunId);
		expect(imported.type).toBe(report.type);
		expect(imported.schemaRef).toEqual(report.schemaRef);
		expect(imported.payload).toEqual(report.payload);
		expect(imported.payloadHash).toBe(report.payloadHash);
		expect(imported.producer).toEqual({
			kind: "external_import",
			id: `workstream:${workstream.workstreamId}`,
			source: {
				runId: sourceRunId,
				artifactId: report.artifactId,
				payloadHash: report.payloadHash,
				schemaRef: report.schemaRef,
			},
		});
		expect(imported.lineage).toEqual([
			{
				relation: "imports_from",
				artifact: { runId: sourceRunId, artifactId: report.artifactId },
			},
		]);
		const persisted = workstreams.get(workstream.workstreamId);
		expect(persisted?.runIds).toEqual([sourceRunId, childRunId]);
		expect(persisted?.continuations).toEqual([
			{
				sourceRunId,
				childRunId,
				childAdmissionId,
				imports: [
					{
						source: { runId: sourceRunId, artifactId: report.artifactId },
						sourcePayloadHash: report.payloadHash,
						sourceSchemaRef: report.schemaRef,
						imported: { runId: childRunId, artifactId: imported.artifactId },
					},
				],
				createdAt: "2026-09-18T02:00:00.000Z",
			},
		]);
		expect(artifacts.get(sourceRunId, report.artifactId)).toEqual(report);
	});

	it("is idempotent across retry after child/import/link persistence", () => {
		const { workstreams, report, service, acceptContinuation } = setup();
		const workstream = service.createWorkstream(sourceRunId);
		acceptContinuation(workstream.workstreamId);
		const request = {
			workstreamId: workstream.workstreamId,
			sourceRunId,
			childRun: childRun(),
			sourceArtifacts: [{ runId: sourceRunId, artifactId: report.artifactId }],
		};
		const first = service.continueRun(request);
		const replay = service.continueRun(request);
		expect(replay.childRun).toEqual(first.childRun);
		expect(replay.importedArtifacts).toEqual(first.importedArtifacts);
		expect(replay.workstream).toEqual(first.workstream);
		expect(workstreams.get(workstream.workstreamId)?.revision).toBe(2);
	});

	it("keeps child inputs reproducible after parent run and source Artifact are removed", () => {
		const { runs, artifacts, report, service, acceptContinuation } = setup();
		const workstream = service.createWorkstream(sourceRunId);
		acceptContinuation(workstream.workstreamId);
		const result = service.continueRun({
			workstreamId: workstream.workstreamId,
			sourceRunId,
			childRun: childRun(),
			sourceArtifacts: [{ runId: sourceRunId, artifactId: report.artifactId }],
		});
		const imported = result.importedArtifacts[0]!;
		rmSync(artifacts.pathFor(sourceRunId, report.artifactId));
		rmSync(runs.pathFor(sourceRunId));
		expect(artifacts.get(sourceRunId, report.artifactId)).toBeUndefined();
		expect(runs.get(sourceRunId)).toBeUndefined();
		const retained = artifacts.get(childRunId, imported.artifactId);
		expect(retained?.payload).toEqual(report.payload);
		expect(retained?.payloadHash).toBe(report.payloadHash);
		expect(retained?.producer).toMatchObject({
			kind: "external_import",
			source: {
				runId: sourceRunId,
				artifactId: report.artifactId,
				payloadHash: report.payloadHash,
			},
		});
	});

	it("validates import policy before creating the child run", () => {
		const { runs, report, service, acceptContinuation } = setup({
			validate: () => {
				throw new Error("source schema is not allowed");
			},
		});
		const workstream = service.createWorkstream(sourceRunId);
		acceptContinuation(workstream.workstreamId);
		expect(() =>
			service.continueRun({
				workstreamId: workstream.workstreamId,
				sourceRunId,
				childRun: childRun(),
				sourceArtifacts: [{ runId: sourceRunId, artifactId: report.artifactId }],
			}),
		).toThrow("source schema is not allowed");
		expect(runs.get(childRunId)).toBeUndefined();
	});

	it("requires a terminal source run", () => {
		const { report, service, acceptContinuation } = setup(undefined, "ACTIVE");
		const workstream = service.createWorkstream(sourceRunId);
		expect(() =>
			service.continueRun({
				workstreamId: workstream.workstreamId,
				sourceRunId,
				childRun: childRun(),
				sourceArtifacts: [{ runId: sourceRunId, artifactId: report.artifactId }],
			}),
		).toThrow("source run must be terminal");
	});

	it("rejects cross-owner continuation before creating child state", () => {
		const { runs, report, service, acceptContinuation } = setup();
		const workstream = service.createWorkstream(sourceRunId);
		expect(() =>
			service.continueRun({
				workstreamId: workstream.workstreamId,
				sourceRunId,
				childRun: childRun({ kind: "session", id: "other-session" }),
				sourceArtifacts: [{ runId: sourceRunId, artifactId: report.artifactId }],
			}),
		).toThrow("must share the Workstream owner");
		expect(runs.get(childRunId)).toBeUndefined();
	});

	it("rejects Artifact refs from a different source run", () => {
		const { report, service, acceptContinuation } = setup();
		const workstream = service.createWorkstream(sourceRunId);
		expect(() =>
			service.continueRun({
				workstreamId: workstream.workstreamId,
				sourceRunId,
				childRun: childRun(),
				sourceArtifacts: [{ runId: "6".repeat(32), artifactId: report.artifactId }],
			}),
		).toThrow(WorkflowContinuationError);
	});
});
