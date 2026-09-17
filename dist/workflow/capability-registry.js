import { WORKFLOW_SIDE_EFFECT_CLASSES, } from "#internet/workflow/kernel/types";
export class WorkflowCapabilityRegistryError extends Error {
    constructor(message) {
        super(message);
        this.name = "WorkflowCapabilityRegistryError";
    }
}
function assertText(value, label) {
    if (value.trim() === "" || value.includes("\0"))
        throw new WorkflowCapabilityRegistryError(`${label} is required`);
}
function assertUniqueText(values, label) {
    const seen = new Set();
    for (const value of values) {
        assertText(value, label);
        if (seen.has(value))
            throw new WorkflowCapabilityRegistryError(`duplicate ${label} ${value}`);
        seen.add(value);
    }
}
function assertVersionRef(value, label) {
    assertText(value.id, `${label} id`);
    assertText(value.version, `${label} version`);
}
function assertDescriptor(descriptor) {
    assertText(descriptor.id, "workflow capability id");
    assertText(descriptor.version, "workflow capability version");
    if (descriptor.acceptedNeedTypes.length === 0)
        throw new WorkflowCapabilityRegistryError(`workflow capability ${descriptor.id} must accept at least one Need type`);
    assertUniqueText(descriptor.acceptedNeedTypes, "workflow capability Need type");
    assertUniqueText(descriptor.producedArtifactTypes, "workflow capability Artifact type");
    assertUniqueText(descriptor.producedReceiptTypes, "workflow capability Receipt type");
    if (!WORKFLOW_SIDE_EFFECT_CLASSES.includes(descriptor.sideEffect))
        throw new WorkflowCapabilityRegistryError(`workflow capability ${descriptor.id} has an invalid side-effect class`);
    assertUniqueText(descriptor.requiredAuthority, "workflow capability authority");
    if (descriptor.executorKinds.length === 0)
        throw new WorkflowCapabilityRegistryError(`workflow capability ${descriptor.id} must declare an executor kind`);
    assertUniqueText(descriptor.executorKinds, "workflow capability executor kind");
    assertVersionRef(descriptor.inputSchema, "workflow capability input schema");
    assertVersionRef(descriptor.outputSchema, "workflow capability output schema");
    assertUniqueText(descriptor.policyHooks, "workflow capability policy hook");
}
function key(ref) {
    return `${ref.id}\0${ref.version}`;
}
export class WorkflowCapabilityRegistry {
    constructor(descriptors) {
        const capabilities = new Map();
        for (const descriptor of descriptors) {
            assertDescriptor(descriptor);
            const descriptorKey = key(descriptor);
            if (capabilities.has(descriptorKey)) {
                throw new WorkflowCapabilityRegistryError(`duplicate workflow capability ${descriptor.id}@${descriptor.version}`);
            }
            capabilities.set(descriptorKey, descriptor);
        }
        this.capabilities = capabilities;
    }
    resolve(ref) {
        assertVersionRef(ref, "workflow capability reference");
        const capability = this.capabilities.get(key(ref));
        if (capability === undefined) {
            throw new WorkflowCapabilityRegistryError(`workflow capability ${ref.id}@${ref.version} is not registered`);
        }
        return capability;
    }
    has(ref) {
        assertVersionRef(ref, "workflow capability reference");
        return this.capabilities.has(key(ref));
    }
    list() {
        return [...this.capabilities.values()].sort((left, right) => {
            const leftKey = `${left.id}\0${left.version}`;
            const rightKey = `${right.id}\0${right.version}`;
            return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
        });
    }
}
//# sourceMappingURL=capability-registry.js.map