import {
	WORKFLOW_SIDE_EFFECT_CLASSES,
	type WorkflowSideEffectClass,
	type WorkflowVersionRef,
} from "#internet/workflow/kernel/types";

export interface WorkflowCapabilityDescriptor {
	readonly id: string;
	readonly version: string;
	readonly acceptedNeedTypes: readonly string[];
	readonly producedArtifactTypes: readonly string[];
	readonly producedReceiptTypes: readonly string[];
	readonly sideEffect: WorkflowSideEffectClass;
	readonly requiredAuthority: readonly string[];
	readonly executorKinds: readonly string[];
	readonly inputSchema: WorkflowVersionRef;
	readonly outputSchema: WorkflowVersionRef;
	readonly policyHooks: readonly string[];
}

export class WorkflowCapabilityRegistryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowCapabilityRegistryError";
	}
}

function assertText(value: string, label: string): void {
	if (value.trim() === "" || value.includes("\0")) throw new WorkflowCapabilityRegistryError(`${label} is required`);
}

function assertUniqueText(values: readonly string[], label: string): void {
	const seen = new Set<string>();
	for (const value of values) {
		assertText(value, label);
		if (seen.has(value)) throw new WorkflowCapabilityRegistryError(`duplicate ${label} ${value}`);
		seen.add(value);
	}
}

function assertVersionRef(value: WorkflowVersionRef, label: string): void {
	assertText(value.id, `${label} id`);
	assertText(value.version, `${label} version`);
}

function assertDescriptor(descriptor: WorkflowCapabilityDescriptor): void {
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

function key(ref: WorkflowVersionRef): string {
	return `${ref.id}\0${ref.version}`;
}

export class WorkflowCapabilityRegistry {
	private readonly capabilities: ReadonlyMap<string, WorkflowCapabilityDescriptor>;

	constructor(descriptors: readonly WorkflowCapabilityDescriptor[]) {
		const capabilities = new Map<string, WorkflowCapabilityDescriptor>();
		for (const descriptor of descriptors) {
			assertDescriptor(descriptor);
			const descriptorKey = key(descriptor);
			if (capabilities.has(descriptorKey)) {
				throw new WorkflowCapabilityRegistryError(
					`duplicate workflow capability ${descriptor.id}@${descriptor.version}`,
				);
			}
			capabilities.set(descriptorKey, descriptor);
		}
		this.capabilities = capabilities;
	}

	resolve(ref: WorkflowVersionRef): WorkflowCapabilityDescriptor {
		assertVersionRef(ref, "workflow capability reference");
		const capability = this.capabilities.get(key(ref));
		if (capability === undefined) {
			throw new WorkflowCapabilityRegistryError(`workflow capability ${ref.id}@${ref.version} is not registered`);
		}
		return capability;
	}

	has(ref: WorkflowVersionRef): boolean {
		return this.capabilities.has(key(ref));
	}

	list(): readonly WorkflowCapabilityDescriptor[] {
		return [...this.capabilities.values()].sort((left, right) => {
			const leftKey = `${left.id}\0${left.version}`;
			const rightKey = `${right.id}\0${right.version}`;
			return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
		});
	}
}
