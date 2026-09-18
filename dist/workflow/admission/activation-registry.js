export class WorkflowAdmissionActivationRegistryError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowAdmissionActivationRegistryError";
    }
}
export class WorkflowAdmissionActivationRegistry {
    constructor(handlers) {
        const byProfile = new Map();
        for (const handler of handlers) {
            if (handler.profileId.trim() === "") {
                throw new WorkflowAdmissionActivationRegistryError("workflow activation profile id is required");
            }
            if (byProfile.has(handler.profileId)) {
                throw new WorkflowAdmissionActivationRegistryError(`duplicate workflow activation handler ${handler.profileId}`);
            }
            byProfile.set(handler.profileId, handler);
        }
        this.handlers = byProfile;
    }
    resolve(profileId) {
        const handler = this.handlers.get(profileId);
        if (handler === undefined) {
            throw new WorkflowAdmissionActivationRegistryError(`workflow activation handler ${profileId} is not available`);
        }
        return handler;
    }
}
//# sourceMappingURL=activation-registry.js.map