export class WorkflowCapabilityRoutingError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowCapabilityRoutingError";
    }
}
function sameRef(left, right) {
    return left.id === right.id && left.version === right.version;
}
function pinnedCapabilities(run, registry) {
    return run.definitions.capabilities.map((ref) => registry.resolve(ref));
}
export function routeWorkflowCapability(run, need, registry) {
    const candidates = pinnedCapabilities(run, registry).filter((capability) => capability.acceptedNeedTypes.includes(need.type));
    if (need.requestedCapability !== undefined) {
        const matches = candidates.filter((capability) => capability.id === need.requestedCapability);
        if (matches.length === 0)
            throw new WorkflowCapabilityRoutingError(`requested workflow capability ${need.requestedCapability} is not pinned for Need type ${need.type}`);
        if (matches.length > 1)
            throw new WorkflowCapabilityRoutingError(`requested workflow capability ${need.requestedCapability} is ambiguous across pinned versions`);
        return matches[0];
    }
    if (candidates.length === 0)
        throw new WorkflowCapabilityRoutingError(`no pinned workflow capability accepts Need type ${need.type}`);
    if (candidates.length > 1)
        throw new WorkflowCapabilityRoutingError(`Need type ${need.type} maps to multiple pinned workflow capabilities; requestedCapability or profile policy is required`);
    const capability = candidates[0];
    if (!run.definitions.capabilities.some((ref) => sameRef(ref, capability)))
        throw new WorkflowCapabilityRoutingError("resolved workflow capability is not pinned by the run");
    return capability;
}
//# sourceMappingURL=routing.js.map