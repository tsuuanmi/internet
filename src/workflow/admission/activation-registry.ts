import type { WorkflowAdmissionActivator } from "#internet/workflow/admission/activation";
import type { AdmissionActivationTarget } from "#internet/workflow/admission/types";
import type { WorkflowAuthorizationContext } from "#internet/workflow/authorization";
import type { WorkflowRun } from "#internet/workflow/kernel/types";
import type { WorkflowJob } from "#internet/workflow/types";

export type WorkflowActivationResource =
	| { readonly kind: "workflow_job"; readonly job: WorkflowJob }
	| { readonly kind: "workflow_run"; readonly run: WorkflowRun };

export interface WorkflowAdmissionActivationHandler {
	readonly profileId: string;
	activator(context: WorkflowAuthorizationContext): WorkflowAdmissionActivator;
	resolve(target: AdmissionActivationTarget): WorkflowActivationResource;
}

export class WorkflowAdmissionActivationRegistryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowAdmissionActivationRegistryError";
	}
}

export class WorkflowAdmissionActivationRegistry {
	private readonly handlers: ReadonlyMap<string, WorkflowAdmissionActivationHandler>;

	constructor(handlers: readonly WorkflowAdmissionActivationHandler[]) {
		const byProfile = new Map<string, WorkflowAdmissionActivationHandler>();
		for (const handler of handlers) {
			if (handler.profileId.trim() === "") {
				throw new WorkflowAdmissionActivationRegistryError("workflow activation profile id is required");
			}
			if (byProfile.has(handler.profileId)) {
				throw new WorkflowAdmissionActivationRegistryError(
					`duplicate workflow activation handler ${handler.profileId}`,
				);
			}
			byProfile.set(handler.profileId, handler);
		}
		this.handlers = byProfile;
	}

	resolve(profileId: string): WorkflowAdmissionActivationHandler {
		const handler = this.handlers.get(profileId);
		if (handler === undefined) {
			throw new WorkflowAdmissionActivationRegistryError(
				`workflow activation handler ${profileId} is not available`,
			);
		}
		return handler;
	}
}
