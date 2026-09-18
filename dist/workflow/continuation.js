import { randomBytes } from "node:crypto";
import { canonicalJson } from "#internet/core/canonical-json";
import { workflowPrincipalEquals } from "#internet/workflow/authorization";
import { WORKFLOW_WORKSTREAM_SCHEMA, } from "#internet/workflow/workstream";
export class WorkflowContinuationError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowContinuationError";
    }
}
function defaultId() {
    return randomBytes(16).toString("hex");
}
function terminal(run) {
    return run.lifecycle === "COMPLETED" || run.lifecycle === "CANCELLED";
}
function uniqueSourceRefs(refs, sourceRunId) {
    const byId = new Map();
    for (const ref of refs) {
        if (ref.runId !== sourceRunId) {
            throw new WorkflowContinuationError("continuation source Artifact must belong to the selected source run");
        }
        if (byId.has(ref.artifactId)) {
            throw new WorkflowContinuationError(`duplicate continuation source Artifact ${ref.artifactId}`);
        }
        byId.set(ref.artifactId, ref);
    }
    return [...byId.values()].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
}
function sameRun(left, right) {
    return canonicalJson(left) === canonicalJson(right);
}
function sameImports(left, right) {
    return canonicalJson(left) === canonicalJson(right);
}
export class WorkflowContinuationService {
    constructor(workstreams, admissions, runs, artifacts, policy, options = {}) {
        this.workstreams = workstreams;
        this.admissions = admissions;
        this.runs = runs;
        this.artifacts = artifacts;
        this.policy = policy;
        this.now = options.now ?? (() => new Date());
        this.createId = options.createId ?? defaultId;
    }
    createWorkstream(sourceRunId, title) {
        const sourceRun = this.runs.get(sourceRunId);
        if (sourceRun === undefined)
            throw new WorkflowContinuationError(`source workflow run ${sourceRunId} does not exist`);
        const at = this.now().toISOString();
        return this.workstreams.create({
            schema: WORKFLOW_WORKSTREAM_SCHEMA,
            version: 1,
            revision: 1,
            workstreamId: this.createId(),
            owner: sourceRun.owner,
            ...(title === undefined ? {} : { title }),
            runIds: [sourceRun.runId],
            continuations: [],
            createdAt: at,
            updatedAt: at,
        });
    }
    continueRun(input) {
        const workstream = this.workstreams.get(input.workstreamId);
        if (workstream === undefined) {
            throw new WorkflowContinuationError(`workflow Workstream ${input.workstreamId} does not exist`);
        }
        const sourceRun = this.runs.get(input.sourceRunId);
        if (sourceRun === undefined)
            throw new WorkflowContinuationError(`source workflow run ${input.sourceRunId} does not exist`);
        if (!workstream.runIds.includes(sourceRun.runId)) {
            throw new WorkflowContinuationError("continuation source run does not belong to the Workstream");
        }
        if (!terminal(sourceRun)) {
            throw new WorkflowContinuationError("continuation source run must be terminal");
        }
        if (input.childRun.lifecycle !== "CREATED") {
            throw new WorkflowContinuationError("continuation child run must start in CREATED lifecycle");
        }
        if (input.childRun.runId === sourceRun.runId) {
            throw new WorkflowContinuationError("continuation child run must differ from the source run");
        }
        if (!workflowPrincipalEquals(workstream.owner, sourceRun.owner) ||
            !workflowPrincipalEquals(workstream.owner, input.childRun.owner)) {
            throw new WorkflowContinuationError("continuation runs must share the Workstream owner");
        }
        const admission = this.admissions.get(input.childRun.admissionId);
        if (admission === undefined || admission.acceptedSpec === undefined || admission.acceptedSpecHash === undefined) {
            throw new WorkflowContinuationError("continuation child run requires an accepted admission");
        }
        if (!workflowPrincipalEquals(admission.owner, workstream.owner)) {
            throw new WorkflowContinuationError("continuation admission owner does not match the Workstream owner");
        }
        if (admission.acceptedSpec.profile.id !== input.childRun.definitions.profile.id ||
            admission.acceptedSpec.profile.version !== input.childRun.definitions.profile.version) {
            throw new WorkflowContinuationError("continuation child run profile does not match accepted admission");
        }
        const admittedContinuation = admission.acceptedSpec.draft.continuation;
        if (admittedContinuation === undefined ||
            admittedContinuation.workstreamId !== workstream.workstreamId ||
            admittedContinuation.continuesFromRunId !== sourceRun.runId) {
            throw new WorkflowContinuationError("continuation child admission does not match selected source lineage");
        }
        const sourceRefs = uniqueSourceRefs(input.sourceArtifacts, sourceRun.runId);
        const sources = sourceRefs.map((ref) => {
            const artifact = this.artifacts.get(ref.runId, ref.artifactId);
            if (artifact === undefined) {
                throw new WorkflowContinuationError(`continuation source Artifact ${ref.artifactId} does not exist`);
            }
            this.policy.validate({ workstream, sourceRun, childRun: input.childRun, sourceArtifact: artifact });
            return artifact;
        });
        const admittedSources = [...admittedContinuation.sourceArtifacts].sort((left, right) => left.source.artifactId.localeCompare(right.source.artifactId));
        if (admittedSources.length !== sources.length ||
            sources.some((source, index) => {
                const admitted = admittedSources[index];
                return (admitted === undefined ||
                    admitted.source.runId !== source.runId ||
                    admitted.source.artifactId !== source.artifactId ||
                    admitted.payloadHash !== source.payloadHash ||
                    canonicalJson(admitted.schemaRef) !== canonicalJson(source.schemaRef));
            })) {
            throw new WorkflowContinuationError("continuation source Artifacts do not match accepted admission identity");
        }
        const existingChild = this.runs.get(input.childRun.runId);
        if (existingChild === undefined) {
            this.runs.create(input.childRun);
        }
        else if (!sameRun(existingChild, input.childRun)) {
            throw new WorkflowContinuationError(`continuation child run ${input.childRun.runId} conflicts with existing state`);
        }
        const importedArtifacts = sources.map((source) => this.artifacts.create({
            runId: input.childRun.runId,
            type: source.type,
            schemaRef: source.schemaRef,
            producer: {
                kind: "external_import",
                id: `workstream:${workstream.workstreamId}`,
                source: {
                    runId: source.runId,
                    artifactId: source.artifactId,
                    payloadHash: source.payloadHash,
                    schemaRef: source.schemaRef,
                },
            },
            lineage: [
                {
                    relation: "imports_from",
                    artifact: { runId: source.runId, artifactId: source.artifactId },
                },
            ],
            payload: source.payload,
        }));
        const imports = sources.map((source, index) => ({
            source: { runId: source.runId, artifactId: source.artifactId },
            sourcePayloadHash: source.payloadHash,
            sourceSchemaRef: source.schemaRef,
            imported: {
                runId: input.childRun.runId,
                artifactId: importedArtifacts[index].artifactId,
            },
        }));
        const existingLink = workstream.continuations.find((link) => link.childRunId === input.childRun.runId);
        if (existingLink !== undefined) {
            if (existingLink.sourceRunId !== sourceRun.runId ||
                existingLink.childAdmissionId !== input.childRun.admissionId ||
                !sameImports(existingLink.imports, imports)) {
                throw new WorkflowContinuationError(`continuation child run ${input.childRun.runId} conflicts with existing lineage`);
            }
            return { workstream, childRun: existingChild ?? input.childRun, importedArtifacts };
        }
        const at = this.now().toISOString();
        const continuation = {
            sourceRunId: sourceRun.runId,
            childRunId: input.childRun.runId,
            childAdmissionId: input.childRun.admissionId,
            imports,
            createdAt: at,
        };
        const updated = this.workstreams.update(workstream.workstreamId, workstream.revision, (current) => ({
            ...current,
            revision: current.revision + 1,
            runIds: current.runIds.includes(input.childRun.runId)
                ? current.runIds
                : [...current.runIds, input.childRun.runId],
            continuations: [...current.continuations, continuation],
            updatedAt: at,
        }));
        return {
            workstream: updated,
            childRun: this.runs.get(input.childRun.runId) ?? input.childRun,
            importedArtifacts,
        };
    }
}
//# sourceMappingURL=continuation.js.map