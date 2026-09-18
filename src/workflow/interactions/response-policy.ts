import type { WorkflowResponderPolicy, WorkflowResponseProvenance } from "#internet/workflow/interactions/types";

export function workflowResponseProvenanceAllowed(
	policy: WorkflowResponderPolicy,
	provenance: WorkflowResponseProvenance,
): boolean {
	switch (policy) {
		case "USER_AUTHORITY":
			return provenance === "user_explicit";
		case "LOCAL_AGENT_INPUT":
		case "USER_OR_LOCAL":
			return provenance === "user_explicit" || provenance === "local_agent";
	}
}
