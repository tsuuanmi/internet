export const WORKFLOW_REVIEW_VERDICTS = ["PASS", "CHANGES_REQUIRED"] as const;
export type WorkflowReviewVerdict = (typeof WORKFLOW_REVIEW_VERDICTS)[number];

export interface WorkflowReviewResult {
	readonly verdict: WorkflowReviewVerdict;
	readonly reviewedHeadSha: string;
}

/** Parse control-plane review metadata while the complete reviewer payload remains stored verbatim. */
export function parseWorkflowReviewResult(payload: string): WorkflowReviewResult {
	let value: unknown;
	try {
		value = JSON.parse(payload.trim());
	} catch {
		throw new Error("workflow reviewer must return one JSON object");
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("workflow reviewer result must be an object");
	}
	const record = value as Record<string, unknown>;
	if (record.verdict !== "PASS" && record.verdict !== "CHANGES_REQUIRED") {
		throw new Error("workflow reviewer verdict must be PASS or CHANGES_REQUIRED");
	}
	if (typeof record.reviewedHeadSha !== "string" || !/^[0-9a-f]{40}$/u.test(record.reviewedHeadSha)) {
		throw new Error("workflow reviewer reviewedHeadSha must be a full Git SHA");
	}
	return { verdict: record.verdict, reviewedHeadSha: record.reviewedHeadSha };
}
