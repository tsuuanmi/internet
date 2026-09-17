import { WORKFLOW_ASSESSMENT_METHODS, WORKFLOW_ASSESSMENT_VERDICTS, WORKFLOW_CRITERION_PROVENANCE, WORKFLOW_FEEDBACK_PROVENANCE, WORKFLOW_FINDING_SEVERITIES, WORKFLOW_NEED_TYPES, WORKFLOW_SEMANTIC_ARTIFACT_TYPES, } from "#internet/workflow/semantic/types";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function assertText(value, label) {
    if (typeof value !== "string" || value.trim() === "" || value.includes("\0"))
        throw new Error(`invalid ${label}`);
}
function assertHex(value, length, label) {
    if (typeof value !== "string" || !new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value)) {
        throw new Error(`invalid ${label}`);
    }
}
function assertBoolean(value, label) {
    if (typeof value !== "boolean")
        throw new Error(`invalid ${label}`);
}
function assertStringList(value, label) {
    if (!Array.isArray(value))
        throw new Error(`invalid ${label}`);
    const seen = new Set();
    for (const item of value) {
        assertText(item, label);
        if (seen.has(item))
            throw new Error(`duplicate ${label} ${item}`);
        seen.add(item);
    }
}
function assertVersionRef(value, label) {
    if (!isRecord(value))
        throw new Error(`invalid ${label}`);
    assertText(value.id, `${label} id`);
    assertText(value.version, `${label} version`);
}
function assertEntityRef(value, label) {
    if (!isRecord(value))
        throw new Error(`invalid ${label}`);
    assertText(value.kind, `${label} kind`);
    assertText(value.id, `${label} id`);
}
function assertEntityRefs(value, label) {
    if (!Array.isArray(value))
        throw new Error(`invalid ${label}`);
    const seen = new Set();
    for (const item of value) {
        assertEntityRef(item, label);
        const key = `${item.kind}\0${item.id}`;
        if (seen.has(key))
            throw new Error(`duplicate ${label} ${item.kind}:${item.id}`);
        seen.add(key);
    }
}
function assertArtifactRef(value, label) {
    if (!isRecord(value))
        throw new Error(`invalid ${label}`);
    assertHex(value.runId, 32, `${label} run id`);
    assertHex(value.artifactId, 64, `${label} artifact id`);
}
function assertArtifactRefs(value, label) {
    if (!Array.isArray(value))
        throw new Error(`invalid ${label}`);
    const seen = new Set();
    for (const item of value) {
        assertArtifactRef(item, label);
        const key = `${item.runId}:${item.artifactId}`;
        if (seen.has(key))
            throw new Error(`duplicate ${label} ${key}`);
        seen.add(key);
    }
}
function assertOptionalArtifactRef(value, label) {
    if (value !== undefined)
        assertArtifactRef(value, label);
}
function assertRecordValue(value, label) {
    if (!isRecord(value))
        throw new Error(`invalid ${label}`);
}
function assertObjectiveConstraints(value) {
    if (!Array.isArray(value))
        throw new Error("invalid workflow objective constraints");
    const ids = new Set();
    for (const item of value) {
        if (!isRecord(item))
            throw new Error("invalid workflow objective constraint");
        assertText(item.id, "workflow objective constraint id");
        assertText(item.statement, "workflow objective constraint statement");
        if (typeof item.provenance !== "string" ||
            !WORKFLOW_CRITERION_PROVENANCE.includes(item.provenance))
            throw new Error("invalid workflow objective constraint provenance");
        if (ids.has(item.id))
            throw new Error(`duplicate workflow objective constraint ${item.id}`);
        ids.add(item.id);
    }
}
function assertAssessmentMethods(value) {
    if (!Array.isArray(value) || value.length === 0)
        throw new Error("invalid workflow criterion assessment methods");
    const seen = new Set();
    for (const method of value) {
        if (typeof method !== "string" ||
            !WORKFLOW_ASSESSMENT_METHODS.includes(method))
            throw new Error("invalid workflow criterion assessment method");
        if (seen.has(method))
            throw new Error(`duplicate workflow criterion assessment method ${method}`);
        seen.add(method);
    }
}
function assertCriterion(value) {
    if (!isRecord(value))
        throw new Error("invalid workflow acceptance criterion");
    assertText(value.criterionId, "workflow acceptance criterion id");
    assertText(value.version, "workflow acceptance criterion version");
    assertText(value.statement, "workflow acceptance criterion statement");
    if (typeof value.provenance !== "string" ||
        !WORKFLOW_CRITERION_PROVENANCE.includes(value.provenance))
        throw new Error("invalid workflow acceptance criterion provenance");
    assertBoolean(value.required, "workflow acceptance criterion required flag");
    if (!isRecord(value.assessmentPolicy))
        throw new Error("invalid workflow acceptance criterion assessment policy");
    assertAssessmentMethods(value.assessmentPolicy.requiredMethods);
}
function assertPlanTask(value) {
    if (!isRecord(value))
        throw new Error("invalid workflow plan task");
    assertText(value.taskId, "workflow plan task id");
    assertText(value.title, "workflow plan task title");
    assertText(value.description, "workflow plan task description");
    assertStringList(value.dependsOn, "workflow plan task dependency");
    if (value.parentTaskId !== undefined)
        assertText(value.parentTaskId, "workflow plan task parent id");
    assertStringList(value.criterionIds, "workflow plan task criterion id");
    assertStringList(value.needIds, "workflow plan task Need id");
    if (value.dependsOn.includes(value.taskId))
        throw new Error(`workflow plan task ${value.taskId} cannot depend on itself`);
    if (value.parentTaskId === value.taskId)
        throw new Error(`workflow plan task ${value.taskId} cannot parent itself`);
}
function assertPlanRevision(value) {
    if (!isRecord(value))
        throw new Error("invalid workflow plan revision");
    assertText(value.reason, "workflow plan revision reason");
    assertStringList(value.addedTaskIds, "workflow plan revision added task id");
    assertStringList(value.removedTaskIds, "workflow plan revision removed task id");
    assertStringList(value.changedTaskIds, "workflow plan revision changed task id");
    assertStringList(value.changedDependencyTaskIds, "workflow plan revision changed dependency task id");
    assertStringList(value.changedAssumptionIds, "workflow plan revision changed assumption id");
    assertEntityRefs(value.affectedRefs, "workflow plan revision affected reference");
}
function assertAcyclicTaskLinks(tasks, links, label) {
    const byId = new Map(tasks.map((task) => [task.taskId, task]));
    const visiting = new Set();
    const visited = new Set();
    const visit = (taskId) => {
        if (visited.has(taskId))
            return;
        if (visiting.has(taskId))
            throw new Error("workflow plan " + label + " cycle includes " + taskId);
        visiting.add(taskId);
        const task = byId.get(taskId);
        if (task !== undefined)
            for (const linkedId of links(task))
                visit(linkedId);
        visiting.delete(taskId);
        visited.add(taskId);
    };
    for (const task of tasks)
        visit(task.taskId);
}
function assertCriterionRef(value) {
    if (!isRecord(value))
        throw new Error("invalid workflow criterion reference");
    assertArtifactRef(value.criteriaArtifact, "workflow criterion reference criteria artifact");
    assertText(value.criterionId, "workflow criterion reference id");
    assertText(value.criterionVersion, "workflow criterion reference version");
}
function assertAssessmentSubject(value) {
    if (!isRecord(value))
        throw new Error("invalid workflow assessment subject");
    assertText(value.kind, "workflow assessment subject kind");
    assertText(value.id, "workflow assessment subject id");
    assertText(value.version, "workflow assessment subject version");
}
export function parseWorkflowObjectivePayload(value) {
    if (!isRecord(value))
        throw new Error("invalid workflow objective payload");
    assertText(value.objectiveId, "workflow objective id");
    assertText(value.version, "workflow objective version");
    assertHex(value.admissionId, 32, "workflow objective admission id");
    assertText(value.statement, "workflow objective statement");
    assertObjectiveConstraints(value.constraints);
    assertOptionalArtifactRef(value.supersedes, "workflow objective supersedes reference");
    return value;
}
export function parseWorkflowAcceptanceCriteriaPayload(value) {
    if (!isRecord(value))
        throw new Error("invalid workflow acceptance criteria payload");
    assertText(value.criteriaSetId, "workflow acceptance criteria set id");
    assertText(value.version, "workflow acceptance criteria version");
    assertArtifactRef(value.objective, "workflow acceptance criteria objective");
    if (!Array.isArray(value.criteria) || value.criteria.length === 0)
        throw new Error("workflow acceptance criteria must include at least one criterion");
    const ids = new Set();
    for (const criterion of value.criteria) {
        assertCriterion(criterion);
        if (ids.has(criterion.criterionId))
            throw new Error(`duplicate workflow acceptance criterion ${criterion.criterionId}`);
        ids.add(criterion.criterionId);
    }
    assertOptionalArtifactRef(value.supersedes, "workflow acceptance criteria supersedes reference");
    return value;
}
export function parseWorkflowPlanPayload(value) {
    if (!isRecord(value))
        throw new Error("invalid workflow plan payload");
    assertText(value.planId, "workflow plan id");
    assertText(value.version, "workflow plan version");
    assertArtifactRef(value.objective, "workflow plan objective");
    assertArtifactRef(value.acceptanceCriteria, "workflow plan acceptance criteria");
    if (!Array.isArray(value.tasks))
        throw new Error("invalid workflow plan tasks");
    const taskIds = new Set();
    for (const task of value.tasks) {
        assertPlanTask(task);
        if (taskIds.has(task.taskId))
            throw new Error(`duplicate workflow plan task ${task.taskId}`);
        taskIds.add(task.taskId);
    }
    const tasks = value.tasks;
    for (const task of tasks) {
        for (const dependency of task.dependsOn) {
            if (!taskIds.has(dependency))
                throw new Error(`workflow plan task ${task.taskId} has unknown dependency ${dependency}`);
        }
        if (task.parentTaskId !== undefined && !taskIds.has(task.parentTaskId))
            throw new Error(`workflow plan task ${task.taskId} has unknown parent ${task.parentTaskId}`);
    }
    assertAcyclicTaskLinks(tasks, (task) => task.dependsOn, "dependency");
    assertAcyclicTaskLinks(tasks, (task) => (task.parentTaskId === undefined ? [] : [task.parentTaskId]), "parent");
    if (!Array.isArray(value.assumptions))
        throw new Error("invalid workflow plan assumptions");
    const assumptionIds = new Set();
    for (const assumption of value.assumptions) {
        if (!isRecord(assumption))
            throw new Error("invalid workflow plan assumption");
        assertText(assumption.assumptionId, "workflow plan assumption id");
        assertText(assumption.statement, "workflow plan assumption statement");
        if (assumptionIds.has(assumption.assumptionId))
            throw new Error(`duplicate workflow plan assumption ${assumption.assumptionId}`);
        assumptionIds.add(assumption.assumptionId);
    }
    assertStringList(value.risks, "workflow plan risk");
    assertOptionalArtifactRef(value.supersedes, "workflow plan supersedes reference");
    if (value.revision !== undefined)
        assertPlanRevision(value.revision);
    if ((value.supersedes === undefined) !== (value.revision === undefined))
        throw new Error("workflow plan revision metadata and supersedes reference must be provided together");
    return value;
}
export function parseWorkflowNeedPayload(value) {
    if (!isRecord(value))
        throw new Error("invalid workflow Need payload");
    assertText(value.needId, "workflow Need id");
    if (typeof value.type !== "string" ||
        !WORKFLOW_NEED_TYPES.includes(value.type))
        throw new Error("invalid workflow Need type");
    assertEntityRef(value.requestOwner, "workflow Need request owner");
    if (value.requestedCapability !== undefined)
        assertText(value.requestedCapability, "workflow Need requested capability");
    assertText(value.question, "workflow Need question");
    assertEntityRefs(value.subjects, "workflow Need subject");
    assertArtifactRefs(value.relatedArtifacts, "workflow Need related artifact");
    if (value.metadata !== undefined)
        assertRecordValue(value.metadata, "workflow Need metadata");
    return value;
}
export function parseWorkflowFindingPayload(value) {
    if (!isRecord(value))
        throw new Error("invalid workflow Finding payload");
    assertText(value.findingId, "workflow Finding id");
    if (typeof value.severity !== "string" ||
        !WORKFLOW_FINDING_SEVERITIES.includes(value.severity))
        throw new Error("invalid workflow Finding severity");
    assertText(value.summary, "workflow Finding summary");
    if (value.details !== undefined)
        assertText(value.details, "workflow Finding details");
    assertEntityRefs(value.subjects, "workflow Finding subject");
    assertArtifactRefs(value.relatedArtifacts, "workflow Finding related artifact");
    assertStringList(value.needIds, "workflow Finding Need id");
    return value;
}
export function parseWorkflowEvidencePayload(value) {
    if (!isRecord(value))
        throw new Error("invalid workflow Evidence payload");
    assertText(value.evidenceId, "workflow Evidence id");
    assertText(value.summary, "workflow Evidence summary");
    assertEntityRefs(value.subjects, "workflow Evidence subject");
    assertEntityRefs(value.sourceRefs, "workflow Evidence source reference");
    assertArtifactRefs(value.relatedArtifacts, "workflow Evidence related artifact");
    return value;
}
export function parseWorkflowCriterionAssessmentPayload(value) {
    if (!isRecord(value))
        throw new Error("invalid workflow criterion assessment payload");
    assertCriterionRef(value.criterion);
    assertAssessmentSubject(value.subject);
    if (typeof value.method !== "string" ||
        !WORKFLOW_ASSESSMENT_METHODS.includes(value.method))
        throw new Error("invalid workflow criterion assessment method");
    if (typeof value.verdict !== "string" ||
        !WORKFLOW_ASSESSMENT_VERDICTS.includes(value.verdict))
        throw new Error("invalid workflow criterion assessment verdict");
    assertVersionRef(value.policyRef, "workflow criterion assessment policy");
    if (value.inputBundleId !== undefined)
        assertHex(value.inputBundleId, 64, "workflow criterion assessment input bundle id");
    assertArtifactRefs(value.evidence, "workflow criterion assessment evidence");
    assertStringList(value.findingIds, "workflow criterion assessment Finding id");
    return value;
}
export function parseWorkflowReportPayload(value) {
    if (!isRecord(value))
        throw new Error("invalid workflow Report payload");
    assertText(value.reportId, "workflow Report id");
    assertText(value.title, "workflow Report title");
    assertText(value.body, "workflow Report body");
    assertArtifactRefs(value.evidence, "workflow Report evidence");
    return value;
}
export function parseWorkflowDeliveryPayload(value) {
    if (!isRecord(value))
        throw new Error("invalid workflow Delivery payload");
    assertText(value.deliveryId, "workflow Delivery id");
    assertText(value.kind, "workflow Delivery kind");
    assertAssessmentSubject(value.subject);
    assertArtifactRefs(value.artifacts, "workflow Delivery artifact");
    if (value.instructions !== undefined)
        assertText(value.instructions, "workflow Delivery instructions");
    assertOptionalArtifactRef(value.supersedes, "workflow Delivery supersedes reference");
    return value;
}
export function parseWorkflowUserFeedbackPayload(value) {
    if (!isRecord(value))
        throw new Error("invalid workflow UserFeedback payload");
    assertText(value.feedbackId, "workflow UserFeedback id");
    if (typeof value.provenance !== "string" ||
        !WORKFLOW_FEEDBACK_PROVENANCE.includes(value.provenance))
        throw new Error("invalid workflow UserFeedback provenance");
    assertText(value.raw, "workflow UserFeedback raw source");
    assertOptionalArtifactRef(value.targetDelivery, "workflow UserFeedback target delivery");
    if (value.targetVersion !== undefined)
        assertText(value.targetVersion, "workflow UserFeedback target version");
    if ((value.targetDelivery === undefined) !== (value.targetVersion === undefined))
        throw new Error("workflow UserFeedback delivery target and version must be provided together");
    assertArtifactRefs(value.attachments, "workflow UserFeedback attachment");
    return value;
}
export function parseWorkflowSemanticPayload(type, value) {
    switch (type) {
        case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.objective:
            return parseWorkflowObjectivePayload(value);
        case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.acceptanceCriteria:
            return parseWorkflowAcceptanceCriteriaPayload(value);
        case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.plan:
            return parseWorkflowPlanPayload(value);
        case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.need:
            return parseWorkflowNeedPayload(value);
        case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.finding:
            return parseWorkflowFindingPayload(value);
        case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.evidence:
            return parseWorkflowEvidencePayload(value);
        case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.criterionAssessment:
            return parseWorkflowCriterionAssessmentPayload(value);
        case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.report:
            return parseWorkflowReportPayload(value);
        case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.delivery:
            return parseWorkflowDeliveryPayload(value);
        case WORKFLOW_SEMANTIC_ARTIFACT_TYPES.userFeedback:
            return parseWorkflowUserFeedbackPayload(value);
    }
}
//# sourceMappingURL=validation.js.map