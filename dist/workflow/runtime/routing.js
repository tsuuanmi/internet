export class WorkflowCapabilityRoutingError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowCapabilityRoutingError";
    }
}
function sameRef(left, right) {
    return left.id === right.id && left.version === right.version;
}
function assertCandidate(run, need, registry, ref) {
    if (!run.definitions.capabilities.some((pinned) => sameRef(pinned, ref)))
        throw new WorkflowCapabilityRoutingError(`workflow capability ${ref.id}@${ref.version} is not pinned by the run`);
    const capability = registry.resolve(ref);
    if (!capability.acceptedNeedTypes.includes(need.type))
        throw new WorkflowCapabilityRoutingError(`workflow capability ${capability.id} does not accept Need type ${need.type}`);
    if (need.requestedCapability !== undefined && capability.id !== need.requestedCapability)
        throw new WorkflowCapabilityRoutingError(`workflow capability ${capability.id} conflicts with requested capability ${need.requestedCapability}`);
    return capability;
}
export function routeWorkflowCapability(run, need, registry, selected) {
    if (selected !== undefined)
        return assertCandidate(run, need, registry, selected);
    const candidates = run.definitions.capabilities
        .map((ref) => registry.resolve(ref))
        .filter((capability) => capability.acceptedNeedTypes.includes(need.type));
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
    return candidates[0];
}
//# sourceMappingURL=routing.js.map