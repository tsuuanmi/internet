import { randomBytes } from "node:crypto";
import { hashAdmissionValue } from "#internet/workflow/admission/hash";
import { preflightWorkflowAdmission } from "#internet/workflow/admission/preflight";
import type { WorkflowAdmissionStore } from "#internet/workflow/admission/store";
import type {
	AcceptedAdmissionSpec,
	AdmissionActivation,
	AdmissionConfirmationInput,
	WorkflowAdmissionDraft,
	WorkflowAdmissionDraftInput,
	WorkflowAdmissionRecord,
} from "#internet/workflow/admission/types";
import { parseWorkflowAdmissionDraft } from "#internet/workflow/admission/validation";
import type { WorkflowProfileRegistry } from "#internet/workflow/profiles/types";

export interface WorkflowAdmissionOwner {
	readonly kind: string;
	readonly id: string;
}

export interface WorkflowAdmissionLifecycleOptions {
	readonly now?: () => Date;
	readonly createId?: () => string;
}

export class WorkflowAdmissionServiceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowAdmissionServiceError";
	}
}

function defaultId(): string {
	return randomBytes(16).toString("hex");
}

function assertOwner(owner: WorkflowAdmissionOwner): void {
	if (owner.kind.trim() === "" || owner.id.trim() === "")
		throw new WorkflowAdmissionServiceError("admission owner is required");
}

function acceptedSpec(record: WorkflowAdmissionRecord, acceptedAt: string): AcceptedAdmissionSpec {
	if (record.preview === undefined)
		throw new WorkflowAdmissionServiceError("admission must be preflighted before acceptance");
	return {
		schema: "@tsuuanmi/internet-workflow-admission-spec",
		version: 1,
		admissionId: record.admissionId,
		draftHash: record.draftHash,
		profile: record.preview.profile,
		draft: record.draft,
		acceptedAt,
	};
}

export class WorkflowAdmissionService {
	private readonly store: WorkflowAdmissionStore;
	private readonly profiles: WorkflowProfileRegistry;
	private readonly now: () => Date;
	private readonly createId: () => string;

	constructor(
		store: WorkflowAdmissionStore,
		profiles: WorkflowProfileRegistry,
		options: WorkflowAdmissionLifecycleOptions = {},
	) {
		this.store = store;
		this.profiles = profiles;
		this.now = options.now ?? (() => new Date());
		this.createId = options.createId ?? defaultId;
	}

	create(owner: WorkflowAdmissionOwner, input: WorkflowAdmissionDraftInput): WorkflowAdmissionRecord {
		assertOwner(owner);
		const requestId = this.createId();
		const admissionId = this.createId();
		const draft: WorkflowAdmissionDraft = {
			schema: "@tsuuanmi/internet-workflow-admission-draft",
			version: 1,
			requestId,
			...input,
		};
		parseWorkflowAdmissionDraft(draft);
		const draftHash = hashAdmissionValue(draft);
		const at = this.now().toISOString();
		return this.store.create({
			schema: "@tsuuanmi/internet-workflow-admission",
			version: 1,
			revision: 1,
			admissionId,
			owner,
			state: "DRAFT",
			draft,
			draftHash,
			createdAt: at,
			updatedAt: at,
		});
	}

	get(admissionId: string): WorkflowAdmissionRecord | undefined {
		return this.store.get(admissionId);
	}

	list(): readonly WorkflowAdmissionRecord[] {
		return this.store.list();
	}

	preflight(admissionId: string, expectedRevision: number): WorkflowAdmissionRecord {
		return this.store.update(admissionId, expectedRevision, (current) => {
			if (current.state !== "DRAFT") {
				throw new WorkflowAdmissionServiceError(`admission ${admissionId} cannot preflight from ${current.state}`);
			}
			const preview = preflightWorkflowAdmission(admissionId, current.draft, current.draftHash, this.profiles);
			const at = this.now().toISOString();
			if (preview.confirmation.level !== "AUTO_SUBMIT") {
				return {
					...current,
					revision: current.revision + 1,
					state: "AWAITING_CONFIRMATION",
					preview,
					updatedAt: at,
				};
			}
			const spec = acceptedSpec({ ...current, preview }, at);
			return {
				...current,
				revision: current.revision + 1,
				state: "ACCEPTED",
				preview,
				confirmation: {
					schema: "@tsuuanmi/internet-workflow-admission-confirmation",
					version: 1,
					level: "AUTO_SUBMIT",
					principal: { kind: "service", id: "admission-policy" },
					provenance: "policy_default",
					draftHash: current.draftHash,
					confirmedAt: at,
				},
				acceptedSpec: spec,
				acceptedSpecHash: hashAdmissionValue(spec),
				updatedAt: at,
			};
		});
	}

	confirm(
		owner: WorkflowAdmissionOwner,
		admissionId: string,
		expectedRevision: number,
		input: AdmissionConfirmationInput,
	): WorkflowAdmissionRecord {
		assertOwner(owner);
		return this.store.update(admissionId, expectedRevision, (current) => {
			if (current.owner.kind !== owner.kind || current.owner.id !== owner.id) {
				throw new WorkflowAdmissionServiceError(`admission ${admissionId} does not belong to this principal`);
			}
			if (current.state !== "AWAITING_CONFIRMATION" || current.preview === undefined) {
				throw new WorkflowAdmissionServiceError(`admission ${admissionId} is not awaiting confirmation`);
			}
			if (input.expectedDraftHash !== current.draftHash) {
				throw new WorkflowAdmissionServiceError(
					"admission draft changed before confirmation; re-preflight is required",
				);
			}
			const required = current.preview.confirmation.level;
			if (required === "USER_CONFIRM" && input.provenance !== "user_explicit") {
				throw new WorkflowAdmissionServiceError("admission requires explicit User confirmation");
			}
			const at = this.now().toISOString();
			const spec = acceptedSpec(current, at);
			return {
				...current,
				revision: current.revision + 1,
				state: "ACCEPTED",
				confirmation: {
					schema: "@tsuuanmi/internet-workflow-admission-confirmation",
					version: 1,
					level: required,
					principal: owner,
					provenance: input.provenance,
					draftHash: current.draftHash,
					confirmedAt: at,
				},
				acceptedSpec: spec,
				acceptedSpecHash: hashAdmissionValue(spec),
				updatedAt: at,
			};
		});
	}

	activate<T>(
		owner: WorkflowAdmissionOwner,
		admissionId: string,
		expectedRevision: number,
		expectedAcceptedSpecHash: string,
		activator: (spec: AcceptedAdmissionSpec) => AdmissionActivation<T>,
	): { readonly record: WorkflowAdmissionRecord; readonly result: T } {
		assertOwner(owner);
		let result: T | undefined;
		const record = this.store.update(admissionId, expectedRevision, (current) => {
			if (current.owner.kind !== owner.kind || current.owner.id !== owner.id) {
				throw new WorkflowAdmissionServiceError(`admission ${admissionId} does not belong to this principal`);
			}
			if (
				current.state !== "ACCEPTED" ||
				current.acceptedSpec === undefined ||
				current.acceptedSpecHash === undefined
			) {
				throw new WorkflowAdmissionServiceError(`admission ${admissionId} is not accepted`);
			}
			if (current.acceptedSpecHash !== expectedAcceptedSpecHash) {
				throw new WorkflowAdmissionServiceError("accepted admission identity changed before activation");
			}
			const activation = activator(current.acceptedSpec);
			result = activation.result;
			const at = this.now().toISOString();
			return {
				...current,
				revision: current.revision + 1,
				state: "ACTIVATED",
				activation: {
					schema: "@tsuuanmi/internet-workflow-admission-activation",
					version: 1,
					acceptedSpecHash: current.acceptedSpecHash,
					targetKind: activation.targetKind,
					targetId: activation.targetId,
					activatedAt: at,
				},
				updatedAt: at,
			};
		});
		if (result === undefined) throw new WorkflowAdmissionServiceError("admission activator did not return a result");
		return { record, result };
	}
}
