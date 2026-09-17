import { randomBytes } from "node:crypto";
import { sameAdmissionActivationTarget } from "#internet/workflow/admission/activation";
import { hashAdmissionValue } from "#internet/workflow/admission/hash";
import { preflightWorkflowAdmission } from "#internet/workflow/admission/preflight";
import { parseWorkflowAdmissionDraft } from "#internet/workflow/admission/validation";
import { assertWorkflowPrincipal, workflowPrincipalEquals, } from "#internet/workflow/authorization";
export class WorkflowAdmissionServiceError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowAdmissionServiceError";
    }
}
function defaultId() {
    return randomBytes(16).toString("hex");
}
function acceptedSpec(record, acceptedAt) {
    if (record.preview === undefined) {
        throw new WorkflowAdmissionServiceError("admission must be preflighted before acceptance");
    }
    return {
        schema: "@tsuuanmi/internet-workflow-admission-spec",
        version: 1,
        admissionId: record.admissionId,
        draftHash: record.draftHash,
        profile: record.preview.profile,
        defaults: record.preview.defaults,
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
        assertWorkflowPrincipal(owner);
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
    get(owner, admissionId) {
        assertWorkflowPrincipal(owner);
        const record = this.store.get(admissionId);
        if (record === undefined)
            return undefined;
        this.assertOwner(record, owner);
        return record;
    }
    list(owner) {
        assertWorkflowPrincipal(owner);
        return this.store.list().filter((record) => workflowPrincipalEquals(record.owner, owner));
    }
    preflight(owner, admissionId, expectedRevision) {
        assertWorkflowPrincipal(owner);
        return this.store.update(admissionId, expectedRevision, (current) => {
            this.assertOwner(current, owner);
            if (current.state !== "DRAFT") {
                throw new WorkflowAdmissionServiceError(`admission ${admissionId} cannot preflight from ${current.state}`);
            }
            const preview = preflightWorkflowAdmission(admissionId, current.draft, current.draftHash, this.profiles);
            const at = this.now().toISOString();
            if (preview.status === "INCOMPLETE" || preview.status === "REJECTED") {
                return {
                    ...current,
                    revision: current.revision + 1,
                    state: "PREFLIGHTED",
                    preview,
                    updatedAt: at,
                };
            }
            if (preview.status === "CONFIRMATION_REQUIRED") {
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
        assertWorkflowPrincipal(owner);
        return this.store.update(admissionId, expectedRevision, (current) => {
            this.assertOwner(current, owner);
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
    activate(owner, admissionId, expectedAcceptedSpecHash, activator) {
        assertWorkflowPrincipal(owner);
        let current = this.requireOwned(owner, admissionId);
        this.assertAcceptedIdentity(current, expectedAcceptedSpecHash);
        if (current.acceptedSpec === undefined || current.acceptedSpecHash === undefined) {
            throw new WorkflowAdmissionServiceError(`admission ${admissionId} has no accepted specification`);
        }
        const spec = current.acceptedSpec;
        const target = activator.target(spec);
        if (current.state === "ACTIVATED") {
            if (current.activation === undefined || !sameAdmissionActivationTarget(current.activation, target)) {
                throw new WorkflowAdmissionServiceError("activated admission target does not match the current activator");
            }
            activator.ensure(spec, target);
            return current;
        }
        if (current.state === "ACCEPTED") {
            const at = this.now().toISOString();
            current = this.store.update(admissionId, current.revision, (record) => {
                this.assertOwner(record, owner);
                this.assertAcceptedIdentity(record, expectedAcceptedSpecHash);
                return {
                    ...record,
                    revision: record.revision + 1,
                    state: "ACTIVATING",
                    activationIntent: {
                        schema: "@tsuuanmi/internet-workflow-admission-activation-intent",
                        version: 1,
                        acceptedSpecHash: expectedAcceptedSpecHash,
                        ...target,
                        startedAt: at,
                    },
                    updatedAt: at,
                };
            });
        }
        else if (current.state === "ACTIVATING") {
            if (current.activationIntent === undefined ||
                !sameAdmissionActivationTarget(current.activationIntent, target)) {
                throw new WorkflowAdmissionServiceError("persisted activation target does not match the current activator");
            }
        }
        else {
            throw new WorkflowAdmissionServiceError(`admission ${admissionId} cannot activate from ${current.state}`);
        }
        activator.ensure(spec, target);
        const afterEnsure = this.requireOwned(owner, admissionId);
        this.assertAcceptedIdentity(afterEnsure, expectedAcceptedSpecHash);
        if (afterEnsure.state === "ACTIVATED") {
            if (afterEnsure.activation === undefined || !sameAdmissionActivationTarget(afterEnsure.activation, target)) {
                throw new WorkflowAdmissionServiceError("activated admission target changed during activation");
            }
            return afterEnsure;
        }
        if (afterEnsure.state !== "ACTIVATING" || afterEnsure.activationIntent === undefined) {
            throw new WorkflowAdmissionServiceError(`admission ${admissionId} changed during activation`);
        }
        if (!sameAdmissionActivationTarget(afterEnsure.activationIntent, target)) {
            throw new WorkflowAdmissionServiceError("activation target changed during activation");
        }
        const at = this.now().toISOString();
        return this.store.update(admissionId, afterEnsure.revision, (record) => ({
            ...record,
            revision: record.revision + 1,
            state: "ACTIVATED",
            activation: {
                schema: "@tsuuanmi/internet-workflow-admission-activation",
                version: 1,
                acceptedSpecHash: expectedAcceptedSpecHash,
                ...target,
                activatedAt: at,
            },
            updatedAt: at,
        }));
    }
    requireOwned(owner, admissionId) {
        const record = this.store.get(admissionId);
        if (record === undefined)
            throw new WorkflowAdmissionServiceError(`admission ${admissionId} does not exist`);
        this.assertOwner(record, owner);
        return record;
    }
    assertOwner(record, owner) {
        if (!workflowPrincipalEquals(record.owner, owner)) {
            throw new WorkflowAdmissionServiceError(`admission ${record.admissionId} does not belong to this principal`);
        }
    }
    assertAcceptedIdentity(record, expectedAcceptedSpecHash) {
        if (record.acceptedSpecHash === undefined || record.acceptedSpecHash !== expectedAcceptedSpecHash) {
            throw new WorkflowAdmissionServiceError("accepted admission identity changed before activation");
        }
    }
}
//# sourceMappingURL=service.js.map