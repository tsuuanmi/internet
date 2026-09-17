import type { WorkflowProfileDescriptor } from "#internet/workflow/profiles/types";

export class WorkflowProfileRegistryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowProfileRegistryError";
	}
}

export class WorkflowProfileRegistry {
	private readonly profiles: ReadonlyMap<string, WorkflowProfileDescriptor>;
	private readonly defaultProfileId: string;

	constructor(profiles: readonly WorkflowProfileDescriptor[], defaultProfileId: string) {
		const byId = new Map<string, WorkflowProfileDescriptor>();
		for (const profile of profiles) {
			if (profile.id.trim() === "" || profile.version.trim() === "") {
				throw new WorkflowProfileRegistryError("workflow profile id and version are required");
			}
			if (byId.has(profile.id)) throw new WorkflowProfileRegistryError(`duplicate workflow profile ${profile.id}`);
			byId.set(profile.id, profile);
		}
		if (!byId.has(defaultProfileId)) {
			throw new WorkflowProfileRegistryError(`default workflow profile ${defaultProfileId} is not registered`);
		}
		this.profiles = byId;
		this.defaultProfileId = defaultProfileId;
	}

	resolve(profileHint?: string): WorkflowProfileDescriptor {
		const id = profileHint ?? this.defaultProfileId;
		const profile = this.profiles.get(id);
		if (profile === undefined) throw new WorkflowProfileRegistryError(`workflow profile ${id} is not available`);
		return profile;
	}
}
