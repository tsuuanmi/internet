import { randomBytes } from "node:crypto";
import { hashAdmissionValue } from "#internet/workflow/admission/hash";
import { preflightWorkflowAdmission } from "#internet/workflow/admission/preflight";
import { parseWorkflowAdmissionDraft } from "#internet/workflow/admission/validation";
export class WorkflowAdmissionServiceError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowAdmissionServiceError";
    }
}
function defaultId() {
    return randomBytes(16).toString("hex");
}
function assertOwner(owner) {
    if (owner.kind.trim() === "" || owner.id.trim() === "")
        throw new WorkflowAdmissionServiceError("admission owner is required");
}
function acceptedSpec(record, acceptedAt) {
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
    constructor(store, profiles, options = {}) {
        this.store = store;
        this.profiles = profiles;
        this.now = options.now ?? (() => new Date());
        this.createId = options.createId ?? defaultId;
    }
    create(owner, input) {
        assertOwner(owner);
        const requestId = this.createId();
        const admissionId = this.createId();
        const draft = {
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
    get(admissionId) {
        return this.store.get(admissionId);
    }
    list() {
        return this.store.list();
    }
    preflight(admissionId, expectedRevision) {
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
    confirm(owner, admissionId, expectedRevision, input) {
        assertOwner(owner);
        return this.store.update(admissionId, expectedRevision, (current) => {
            if (current.owner.kind !== owner.kind || current.owner.id !== owner.id) {
                throw new WorkflowAdmissionServiceError(`admission ${admissionId} does not belong to this principal`);
            }
            if (current.state !== "AWAITING_CONFIRMATION" || current.preview === undefined) {
                throw new WorkflowAdmissionServiceError(`admission ${admissionId} is not awaiting confirmation`);
            }
            if (input.expectedDraftHash !== current.draftHash) {
                throw new WorkflowAdmissionServiceError("admission draft changed before confirmation; re-preflight is required");
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
    activate(owner, admissionId, expectedRevision, expectedAcceptedSpecHash, activator) {
        assertOwner(owner);
        let result;
        const record = this.store.update(admissionId, expectedRevision, (current) => {
            if (current.owner.kind !== owner.kind || current.owner.id !== owner.id) {
                throw new WorkflowAdmissionServiceError(`admission ${admissionId} does not belong to this principal`);
            }
            if (current.state !== "ACCEPTED" ||
                current.acceptedSpec === undefined ||
                current.acceptedSpecHash === undefined) {
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
        if (result === undefined)
            throw new WorkflowAdmissionServiceError("admission activator did not return a result");
        return { record, result };
    }
}
//# sourceMappingURL=service.js.map