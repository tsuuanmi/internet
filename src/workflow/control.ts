export const WORKFLOW_CONTROL_KINDS = [
	"START_IMPLEMENTATION",
	"APPLY_REVIEWS",
	"RETRY",
	"CHECK_PR_HEALTH",
	"MERGE_AUTHORIZED",
] as const;

export type WorkflowControlKind = (typeof WORKFLOW_CONTROL_KINDS)[number];

/** Trusted control-plane message. Never embed model handoff payloads here. */
export interface WorkflowControlMessage {
	readonly kind: WorkflowControlKind;
	readonly jobId: string;
	readonly createdAt: string;
	readonly expectedHeadSha?: string;
}

export function createWorkflowControlMessage(
	kind: WorkflowControlKind,
	jobId: string,
	expectedHeadSha?: string,
): WorkflowControlMessage {
	if (!/^[0-9a-f]{32}$/u.test(jobId)) throw new Error("workflow control message requires a valid job id");
	if (expectedHeadSha !== undefined && !/^[0-9a-f]{40}$/u.test(expectedHeadSha)) {
		throw new Error("workflow control message expectedHeadSha must be a full Git SHA");
	}
	return {
		kind,
		jobId,
		createdAt: new Date().toISOString(),
		...(expectedHeadSha === undefined ? {} : { expectedHeadSha }),
	};
}
