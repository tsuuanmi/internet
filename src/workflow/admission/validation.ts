import {
	type AcceptedAdmissionSpec,
	type AdmissionActivationReceipt,
	type AdmissionConfirmationReceipt,
	type AdmissionPreview,
	type ProvenancedValue,
	WORKFLOW_ADMISSION_CONFIRMATION_LEVELS,
	WORKFLOW_ADMISSION_PROVENANCE,
	WORKFLOW_ADMISSION_SOURCE_KINDS,
	WORKFLOW_ADMISSION_STATES,
	type WorkflowAdmissionDraft,
	type WorkflowAdmissionRecord,
} from "#internet/workflow/admission/types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
	return typeof value === "string" && /^[0-9a-f]{32}$/u.test(value);
}

function isHash(value: unknown): value is string {
	return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isTimestamp(value: unknown): value is string {
	return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function assertProvenance(value: unknown): void {
	if (typeof value !== "string" || !(WORKFLOW_ADMISSION_PROVENANCE as readonly string[]).includes(value)) {
		throw new Error("invalid admission provenance");
	}
}

function assertProvenancedValue(value: unknown, kind: "string" | "boolean" | "number"): void {
	if (!isRecord(value) || typeof value.value !== kind) throw new Error("invalid provenanced admission value");
	assertProvenance(value.provenance);
	if (value.uncertainty !== undefined && (typeof value.uncertainty !== "string" || value.uncertainty.trim() === "")) {
		throw new Error("invalid admission uncertainty");
	}
}

function assertStringValues(value: unknown): void {
	if (value === undefined) return;
	if (!Array.isArray(value)) throw new Error("invalid admission string values");
	for (const item of value) assertProvenancedValue(item, "string");
}

export function parseWorkflowAdmissionDraft(value: unknown): WorkflowAdmissionDraft {
	if (
		!isRecord(value) ||
		value.schema !== "@tsuuanmi/internet-workflow-admission-draft" ||
		value.version !== 1 ||
		!isId(value.requestId)
	) {
		throw new Error("unsupported workflow admission draft schema");
	}
	if (!isRecord(value.source)) throw new Error("invalid admission source");
	if (
		typeof value.source.kind !== "string" ||
		!(WORKFLOW_ADMISSION_SOURCE_KINDS as readonly string[]).includes(value.source.kind)
	) {
		throw new Error("invalid admission source kind");
	}
	if (typeof value.source.rawText !== "string" || value.source.rawText.trim() === "") {
		throw new Error("admission source text is required");
	}
	if (value.source.provenance !== "user_explicit" && value.source.provenance !== "local_interpreted") {
		throw new Error("invalid admission source provenance");
	}
	if (value.profileHint !== undefined) assertProvenancedValue(value.profileHint, "string");
	if (value.target !== undefined) {
		if (!isRecord(value.target)) throw new Error("invalid admission target");
		if (value.target.repository !== undefined) assertProvenancedValue(value.target.repository, "string");
		if (value.target.baseRevision !== undefined) assertProvenancedValue(value.target.baseRevision, "string");
	}
	assertStringValues(value.constraints);
	assertStringValues(value.deliverables);
	if (value.authority !== undefined) {
		if (!isRecord(value.authority)) throw new Error("invalid admission authority");
		if (value.authority.repositoryMutation !== undefined)
			assertProvenancedValue(value.authority.repositoryMutation, "boolean");
		if (value.authority.externalPublication !== undefined)
			assertProvenancedValue(value.authority.externalPublication, "boolean");
	}
	if (value.autonomy !== undefined) {
		assertProvenancedValue(value.autonomy, "string");
		const autonomy = (value.autonomy as ProvenancedValue<string>).value;
		if (autonomy !== "autonomous_until_external_dependency" && autonomy !== "interactive") {
			throw new Error("invalid admission autonomy");
		}
	}
	if (value.temporal !== undefined) {
		if (!isRecord(value.temporal)) throw new Error("invalid admission temporal hints");
		if (value.temporal.deadline !== undefined) assertProvenancedValue(value.temporal.deadline, "string");
		if (value.temporal.duration !== undefined) assertProvenancedValue(value.temporal.duration, "string");
	}
	if (value.budget !== undefined) {
		if (!isRecord(value.budget)) throw new Error("invalid admission budget hints");
		if (value.budget.maxWallClockMs !== undefined) assertProvenancedValue(value.budget.maxWallClockMs, "number");
		if (value.budget.maxCostUsd !== undefined) assertProvenancedValue(value.budget.maxCostUsd, "number");
	}
	if (value.uncertainties !== undefined) {
		if (!Array.isArray(value.uncertainties)) throw new Error("invalid admission uncertainties");
		for (const item of value.uncertainties) {
			if (
				!isRecord(item) ||
				typeof item.field !== "string" ||
				item.field.trim() === "" ||
				typeof item.description !== "string" ||
				item.description.trim() === ""
			) {
				throw new Error("invalid admission uncertainty marker");
			}
		}
	}
	return value as unknown as WorkflowAdmissionDraft;
}

function assertPreview(value: unknown, admissionId: string, draftHash: string): asserts value is AdmissionPreview {
	if (!isRecord(value)) throw new Error("invalid admission preview");
	if (
		value.schema !== "@tsuuanmi/internet-workflow-admission-preview" ||
		value.version !== 1 ||
		value.admissionId !== admissionId ||
		value.draftHash !== draftHash
	) {
		throw new Error("admission preview identity mismatch");
	}
	if (value.status !== "READY" && value.status !== "CONFIRMATION_REQUIRED")
		throw new Error("invalid admission preview status");
	if (!isRecord(value.profile) || typeof value.profile.id !== "string" || typeof value.profile.version !== "string")
		throw new Error("invalid admission preview profile");
	if (!Array.isArray(value.defaults) || !Array.isArray(value.unresolved) || !Array.isArray(value.warnings))
		throw new Error("invalid admission preview collections");
	if (!isRecord(value.confirmation)) throw new Error("invalid admission confirmation preview");
	if (
		typeof value.confirmation.level !== "string" ||
		!(WORKFLOW_ADMISSION_CONFIRMATION_LEVELS as readonly string[]).includes(value.confirmation.level) ||
		!Array.isArray(value.confirmation.reasons)
	) {
		throw new Error("invalid admission confirmation policy");
	}
}

function assertConfirmation(value: unknown, draftHash: string): asserts value is AdmissionConfirmationReceipt {
	if (!isRecord(value)) throw new Error("invalid admission confirmation receipt");
	if (
		value.schema !== "@tsuuanmi/internet-workflow-admission-confirmation" ||
		value.version !== 1 ||
		value.draftHash !== draftHash ||
		!isTimestamp(value.confirmedAt)
	) {
		throw new Error("invalid admission confirmation receipt");
	}
	if (
		typeof value.level !== "string" ||
		!(WORKFLOW_ADMISSION_CONFIRMATION_LEVELS as readonly string[]).includes(value.level)
	) {
		throw new Error("invalid admission confirmation level");
	}
	if (!isRecord(value.principal) || typeof value.principal.kind !== "string" || typeof value.principal.id !== "string")
		throw new Error("invalid admission confirmation principal");
	if (
		value.provenance !== "user_explicit" &&
		value.provenance !== "local_interpreted" &&
		value.provenance !== "policy_default"
	) {
		throw new Error("invalid admission confirmation provenance");
	}
}

function assertAcceptedSpec(
	value: unknown,
	admissionId: string,
	draftHash: string,
): asserts value is AcceptedAdmissionSpec {
	if (!isRecord(value)) throw new Error("invalid accepted admission spec");
	if (
		value.schema !== "@tsuuanmi/internet-workflow-admission-spec" ||
		value.version !== 1 ||
		value.admissionId !== admissionId ||
		value.draftHash !== draftHash ||
		!isTimestamp(value.acceptedAt)
	) {
		throw new Error("accepted admission spec identity mismatch");
	}
	if (!isRecord(value.profile) || typeof value.profile.id !== "string" || typeof value.profile.version !== "string")
		throw new Error("invalid accepted admission profile");
	parseWorkflowAdmissionDraft(value.draft);
}

function assertActivation(value: unknown, acceptedSpecHash: string): asserts value is AdmissionActivationReceipt {
	if (!isRecord(value)) throw new Error("invalid admission activation receipt");
	if (
		value.schema !== "@tsuuanmi/internet-workflow-admission-activation" ||
		value.version !== 1 ||
		value.acceptedSpecHash !== acceptedSpecHash ||
		(value.targetKind !== "legacy_v3_job" && value.targetKind !== "workflow_run") ||
		typeof value.targetId !== "string" ||
		value.targetId.trim() === "" ||
		!isTimestamp(value.activatedAt)
	) {
		throw new Error("invalid admission activation receipt");
	}
}

export function parseWorkflowAdmissionRecord(value: unknown): WorkflowAdmissionRecord {
	if (
		!isRecord(value) ||
		value.schema !== "@tsuuanmi/internet-workflow-admission" ||
		value.version !== 1 ||
		!Number.isSafeInteger(value.revision) ||
		(value.revision as number) < 1 ||
		!isId(value.admissionId)
	) {
		throw new Error("unsupported workflow admission record schema");
	}
	if (
		!isRecord(value.owner) ||
		typeof value.owner.kind !== "string" ||
		typeof value.owner.id !== "string" ||
		value.owner.id.trim() === ""
	)
		throw new Error("invalid admission owner");
	if (typeof value.state !== "string" || !(WORKFLOW_ADMISSION_STATES as readonly string[]).includes(value.state))
		throw new Error("invalid admission state");
	const draft = parseWorkflowAdmissionDraft(value.draft);
	if (!isHash(value.draftHash)) throw new Error("invalid admission draft hash");
	if (value.preview !== undefined) assertPreview(value.preview, value.admissionId, value.draftHash);
	if (value.confirmation !== undefined) assertConfirmation(value.confirmation, value.draftHash);
	if (value.acceptedSpec !== undefined) assertAcceptedSpec(value.acceptedSpec, value.admissionId, value.draftHash);
	if (value.acceptedSpecHash !== undefined && !isHash(value.acceptedSpecHash))
		throw new Error("invalid accepted admission spec hash");
	if ((value.acceptedSpec === undefined) !== (value.acceptedSpecHash === undefined))
		throw new Error("accepted admission spec and hash must coexist");
	if (value.activation !== undefined) {
		if (value.acceptedSpecHash === undefined) throw new Error("activation requires accepted admission spec");
		assertActivation(value.activation, value.acceptedSpecHash);
	}
	if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) throw new Error("invalid admission timestamps");
	return { ...value, draft } as unknown as WorkflowAdmissionRecord;
}
