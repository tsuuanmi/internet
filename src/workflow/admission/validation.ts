import { hashAdmissionValue } from "#internet/workflow/admission/hash";
import {
	type AcceptedAdmissionSpec,
	type AdmissionActivationIntent,
	type AdmissionActivationReceipt,
	type AdmissionConfirmationReceipt,
	type AdmissionDefault,
	type AdmissionPreview,
	type ProvenancedValue,
	WORKFLOW_ADMISSION_CONFIRMATION_LEVELS,
	WORKFLOW_ADMISSION_PREVIEW_STATUSES,
	WORKFLOW_ADMISSION_PROVENANCE,
	WORKFLOW_ADMISSION_SOURCE_KINDS,
	WORKFLOW_ADMISSION_STATES,
	WORKFLOW_ADMISSION_TARGET_KINDS,
	type WorkflowAdmissionDraft,
	type WorkflowAdmissionRecord,
} from "#internet/workflow/admission/types";
import { WORKFLOW_PRINCIPAL_KINDS } from "#internet/workflow/authorization";

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

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
	if (typeof value !== "string" || value.trim() === "") throw new Error(`invalid ${label}`);
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
	if (!Array.isArray(value)) throw new Error(`invalid ${label}`);
	for (const item of value) assertNonEmptyString(item, label);
}

function assertProvenance(value: unknown): void {
	if (typeof value !== "string" || !(WORKFLOW_ADMISSION_PROVENANCE as readonly string[]).includes(value)) {
		throw new Error("invalid admission provenance");
	}
}

function assertProvenancedValue(value: unknown, kind: "string" | "boolean" | "number"): void {
	if (!isRecord(value) || typeof value.value !== kind) throw new Error("invalid provenanced admission value");
	assertProvenance(value.provenance);
	if (kind === "string" && (value.value as string).trim() === "") throw new Error("empty provenanced admission value");
	if (kind === "number" && !Number.isFinite(value.value as number)) throw new Error("non-finite admission number");
	if (value.uncertainty !== undefined) assertNonEmptyString(value.uncertainty, "admission uncertainty");
}

function assertContinuation(value: unknown): void {
	if (!isRecord(value) || !isId(value.workstreamId) || !isId(value.continuesFromRunId)) {
		throw new Error("invalid admission continuation identity");
	}
	if (!Array.isArray(value.sourceArtifacts)) throw new Error("invalid admission continuation source Artifacts");
	const seen = new Set<string>();
	for (const item of value.sourceArtifacts) {
		if (!isRecord(item) || !isRecord(item.source)) {
			throw new Error("invalid admission continuation source Artifact");
		}
		if (
			!isId(item.source.runId) ||
			!isHash(item.source.artifactId) ||
			item.source.runId !== value.continuesFromRunId
		) {
			throw new Error("invalid admission continuation source Artifact identity");
		}
		if (!isHash(item.payloadHash)) throw new Error("invalid admission continuation source payload hash");
		if (!isRecord(item.schemaRef)) throw new Error("invalid admission continuation source schema");
		assertNonEmptyString(item.schemaRef.id, "admission continuation source schema id");
		assertNonEmptyString(item.schemaRef.version, "admission continuation source schema version");
		const key = `${item.source.runId}:${item.source.artifactId}`;
		if (seen.has(key)) throw new Error(`duplicate admission continuation source Artifact ${key}`);
		seen.add(key);
	}
}

function assertStringValues(value: unknown): void {
	if (value === undefined) return;
	if (!Array.isArray(value)) throw new Error("invalid admission string values");
	for (const item of value) assertProvenancedValue(item, "string");
}

function assertDefaults(value: unknown): asserts value is AdmissionDefault[] {
	if (!Array.isArray(value)) throw new Error("invalid admission defaults");
	const fields = new Set<string>();
	for (const item of value) {
		if (!isRecord(item)) throw new Error("invalid admission default");
		assertNonEmptyString(item.field, "admission default field");
		if (fields.has(item.field)) throw new Error(`duplicate admission default ${item.field}`);
		fields.add(item.field);
		if (item.provenance !== "policy_default") throw new Error("invalid admission default provenance");
		hashAdmissionValue(item.value);
	}
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
	assertNonEmptyString(value.source.rawText, "admission source text");
	if (value.source.provenance !== "user_explicit" && value.source.provenance !== "local_interpreted") {
		throw new Error("invalid admission source provenance");
	}
	if (
		(value.source.kind === "user" && value.source.provenance !== "user_explicit") ||
		(value.source.kind === "local_agent" && value.source.provenance !== "local_interpreted")
	) {
		throw new Error("admission source kind and provenance disagree");
	}
	if (value.profileHint !== undefined) assertProvenancedValue(value.profileHint, "string");
	if (value.target !== undefined) {
		if (!isRecord(value.target)) throw new Error("invalid admission target");
		if (value.target.repository !== undefined) assertProvenancedValue(value.target.repository, "string");
		if (value.target.baseRevision !== undefined) assertProvenancedValue(value.target.baseRevision, "string");
	}
	assertStringValues(value.constraints);
	assertStringValues(value.deliverables);
	if (value.continuation !== undefined) assertContinuation(value.continuation);
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
		if (value.budget.maxWallClockMs !== undefined) {
			assertProvenancedValue(value.budget.maxWallClockMs, "number");
			if ((value.budget.maxWallClockMs as ProvenancedValue<number>).value < 0)
				throw new Error("admission maxWallClockMs cannot be negative");
		}
		if (value.budget.maxCostUsd !== undefined) {
			assertProvenancedValue(value.budget.maxCostUsd, "number");
			if ((value.budget.maxCostUsd as ProvenancedValue<number>).value < 0)
				throw new Error("admission maxCostUsd cannot be negative");
		}
	}
	if (value.uncertainties !== undefined) {
		if (!Array.isArray(value.uncertainties)) throw new Error("invalid admission uncertainties");
		for (const item of value.uncertainties) {
			if (!isRecord(item)) throw new Error("invalid admission uncertainty marker");
			assertNonEmptyString(item.field, "admission uncertainty field");
			assertNonEmptyString(item.description, "admission uncertainty description");
		}
	}
	hashAdmissionValue(value);
	return value as unknown as WorkflowAdmissionDraft;
}

function assertConfirmationReasons(value: unknown): void {
	if (!Array.isArray(value)) throw new Error("invalid admission confirmation reasons");
	for (const reason of value) {
		if (!isRecord(reason)) throw new Error("invalid admission confirmation reason");
		assertNonEmptyString(reason.field, "admission confirmation field");
		assertNonEmptyString(reason.reason, "admission confirmation reason");
		if (reason.provenance !== undefined) assertProvenance(reason.provenance);
		if (reason.proposedValue !== undefined) hashAdmissionValue(reason.proposedValue);
	}
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
	if (
		typeof value.status !== "string" ||
		!(WORKFLOW_ADMISSION_PREVIEW_STATUSES as readonly string[]).includes(value.status)
	) {
		throw new Error("invalid admission preview status");
	}
	if (!isRecord(value.profile)) throw new Error("invalid admission preview profile");
	assertNonEmptyString(value.profile.id, "admission preview profile id");
	assertNonEmptyString(value.profile.version, "admission preview profile version");
	assertDefaults(value.defaults);
	assertStringArray(value.unresolved, "admission unresolved field");
	assertStringArray(value.warnings, "admission warning");
	assertStringArray(value.errors, "admission error");
	if (!isRecord(value.confirmation)) throw new Error("invalid admission confirmation preview");
	if (
		typeof value.confirmation.level !== "string" ||
		!(WORKFLOW_ADMISSION_CONFIRMATION_LEVELS as readonly string[]).includes(value.confirmation.level)
	) {
		throw new Error("invalid admission confirmation policy");
	}
	assertConfirmationReasons(value.confirmation.reasons);
	const expectedStatus =
		value.errors.length > 0
			? "REJECTED"
			: value.unresolved.length > 0
				? "INCOMPLETE"
				: value.confirmation.level === "AUTO_SUBMIT"
					? "READY"
					: "CONFIRMATION_REQUIRED";
	if (value.status !== expectedStatus) throw new Error("admission preview status does not match preflight result");
}

function assertPrincipal(value: unknown): void {
	if (!isRecord(value)) throw new Error("invalid admission principal");
	if (
		typeof value.kind !== "string" ||
		!(WORKFLOW_PRINCIPAL_KINDS as readonly string[]).includes(value.kind) ||
		typeof value.id !== "string" ||
		value.id.trim() === ""
	) {
		throw new Error("invalid admission principal");
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
	assertPrincipal(value.principal);
	if (
		value.provenance !== "user_explicit" &&
		value.provenance !== "local_interpreted" &&
		value.provenance !== "policy_default"
	) {
		throw new Error("invalid admission confirmation provenance");
	}
	if (value.level === "AUTO_SUBMIT" && value.provenance !== "policy_default")
		throw new Error("automatic admission confirmation must be policy_default");
	if (value.level === "USER_CONFIRM" && value.provenance !== "user_explicit")
		throw new Error("User confirmation must preserve user_explicit provenance");
	if (value.level !== "AUTO_SUBMIT" && value.provenance === "policy_default")
		throw new Error("explicit admission confirmation cannot be policy_default");
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
	if (!isRecord(value.profile)) throw new Error("invalid accepted admission profile");
	assertNonEmptyString(value.profile.id, "accepted admission profile id");
	assertNonEmptyString(value.profile.version, "accepted admission profile version");
	assertDefaults(value.defaults);
	const draft = parseWorkflowAdmissionDraft(value.draft);
	if (hashAdmissionValue(draft) !== draftHash) throw new Error("accepted admission draft hash mismatch");
}

function assertActivationTarget(value: Record<string, unknown>): void {
	if (
		typeof value.targetKind !== "string" ||
		!(WORKFLOW_ADMISSION_TARGET_KINDS as readonly string[]).includes(value.targetKind) ||
		typeof value.targetId !== "string" ||
		value.targetId.trim() === ""
	) {
		throw new Error("invalid admission activation target");
	}
}

function assertActivationIntent(value: unknown, acceptedSpecHash: string): asserts value is AdmissionActivationIntent {
	if (!isRecord(value)) throw new Error("invalid admission activation intent");
	if (
		value.schema !== "@tsuuanmi/internet-workflow-admission-activation-intent" ||
		value.version !== 1 ||
		value.acceptedSpecHash !== acceptedSpecHash ||
		!isTimestamp(value.startedAt)
	) {
		throw new Error("invalid admission activation intent");
	}
	assertActivationTarget(value);
}

function assertActivation(value: unknown, acceptedSpecHash: string): asserts value is AdmissionActivationReceipt {
	if (!isRecord(value)) throw new Error("invalid admission activation receipt");
	if (
		value.schema !== "@tsuuanmi/internet-workflow-admission-activation" ||
		value.version !== 1 ||
		value.acceptedSpecHash !== acceptedSpecHash ||
		!isTimestamp(value.activatedAt)
	) {
		throw new Error("invalid admission activation receipt");
	}
	assertActivationTarget(value);
}

function assertAcceptedState(record: WorkflowAdmissionRecord): void {
	if (
		record.preview === undefined ||
		record.confirmation === undefined ||
		record.acceptedSpec === undefined ||
		record.acceptedSpecHash === undefined
	) {
		throw new Error(`admission ${record.state} state requires accepted spec and confirmation`);
	}
	if (record.confirmation.level !== record.preview.confirmation.level)
		throw new Error("admission confirmation does not match preflight policy");
	if (
		record.acceptedSpec.profile.id !== record.preview.profile.id ||
		record.acceptedSpec.profile.version !== record.preview.profile.version
	) {
		throw new Error("accepted admission profile does not match preflight profile");
	}
	if (hashAdmissionValue(record.acceptedSpec.defaults) !== hashAdmissionValue(record.preview.defaults))
		throw new Error("accepted admission defaults do not match preflight defaults");
}

function assertStateShape(record: WorkflowAdmissionRecord): void {
	const noAccepted = () => {
		if (
			record.confirmation !== undefined ||
			record.acceptedSpec !== undefined ||
			record.acceptedSpecHash !== undefined ||
			record.activationIntent !== undefined ||
			record.activation !== undefined
		) {
			throw new Error(`admission ${record.state} state contains fields from a later lifecycle stage`);
		}
	};
	if (record.state === "DRAFT") {
		if (record.preview !== undefined) throw new Error("draft admission cannot contain a preflight preview");
		noAccepted();
		return;
	}
	if (record.state === "PREFLIGHTED") {
		if (
			record.preview === undefined ||
			(record.preview.status !== "INCOMPLETE" && record.preview.status !== "REJECTED")
		)
			throw new Error("preflighted admission requires an incomplete or rejected preview");
		noAccepted();
		return;
	}
	if (record.state === "AWAITING_CONFIRMATION") {
		if (record.preview?.status !== "CONFIRMATION_REQUIRED")
			throw new Error("waiting admission requires confirmation-required preview");
		noAccepted();
		return;
	}
	assertAcceptedState(record);
	if (record.state === "ACCEPTED") {
		if (record.activationIntent !== undefined || record.activation !== undefined)
			throw new Error("accepted admission cannot contain activation state");
		return;
	}
	if (record.state === "ACTIVATING") {
		if (record.activationIntent === undefined || record.activation !== undefined)
			throw new Error("activating admission requires only an activation intent");
		return;
	}
	if (record.activationIntent === undefined || record.activation === undefined)
		throw new Error("activated admission requires activation intent and receipt");
	if (
		record.activationIntent.targetKind !== record.activation.targetKind ||
		record.activationIntent.targetId !== record.activation.targetId
	) {
		throw new Error("admission activation receipt does not match activation intent");
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
	assertPrincipal(value.owner);
	if (typeof value.state !== "string" || !(WORKFLOW_ADMISSION_STATES as readonly string[]).includes(value.state))
		throw new Error("invalid admission state");
	const draft = parseWorkflowAdmissionDraft(value.draft);
	if (!isHash(value.draftHash) || value.draftHash !== hashAdmissionValue(draft))
		throw new Error("invalid admission draft hash");
	if (value.preview !== undefined) assertPreview(value.preview, value.admissionId, value.draftHash);
	if (value.confirmation !== undefined) assertConfirmation(value.confirmation, value.draftHash);
	if (value.acceptedSpec !== undefined) assertAcceptedSpec(value.acceptedSpec, value.admissionId, value.draftHash);
	if (value.acceptedSpecHash !== undefined && !isHash(value.acceptedSpecHash))
		throw new Error("invalid accepted admission spec hash");
	if ((value.acceptedSpec === undefined) !== (value.acceptedSpecHash === undefined))
		throw new Error("accepted admission spec and hash must coexist");
	if (
		value.acceptedSpec !== undefined &&
		value.acceptedSpecHash !== undefined &&
		value.acceptedSpecHash !== hashAdmissionValue(value.acceptedSpec)
	) {
		throw new Error("accepted admission spec hash mismatch");
	}
	if (value.activationIntent !== undefined) {
		if (value.acceptedSpecHash === undefined) throw new Error("activation intent requires accepted admission spec");
		assertActivationIntent(value.activationIntent, value.acceptedSpecHash);
	}
	if (value.activation !== undefined) {
		if (value.acceptedSpecHash === undefined) throw new Error("activation requires accepted admission spec");
		assertActivation(value.activation, value.acceptedSpecHash);
	}
	if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) throw new Error("invalid admission timestamps");
	if (Date.parse(value.updatedAt) < Date.parse(value.createdAt))
		throw new Error("admission updatedAt precedes createdAt");
	const record = { ...value, draft } as unknown as WorkflowAdmissionRecord;
	assertStateShape(record);
	return record;
}
