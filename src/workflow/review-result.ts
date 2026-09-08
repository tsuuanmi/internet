export const WORKFLOW_REVIEW_VERDICTS = ["PASS", "CHANGES_REQUIRED"] as const;
export type WorkflowReviewVerdict = (typeof WORKFLOW_REVIEW_VERDICTS)[number];

/** Parse only the control-plane verdict while preserving the original reviewer payload verbatim elsewhere. */
export function parseWorkflowReviewVerdict(payload: string): WorkflowReviewVerdict {
	let value: unknown;
	try {
		value = JSON.parse(payload.trim());
	} catch {
		throw new Error("workflow reviewer must return one JSON object");
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("workflow reviewer result must be an object");
	}
	const verdict = (value as Record<string, unknown>).verdict;
	if (verdict !== "PASS" && verdict !== "CHANGES_REQUIRED") {
		throw new Error("workflow reviewer verdict must be PASS or CHANGES_REQUIRED");
	}
	return verdict;
}
