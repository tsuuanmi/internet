import type { WorkflowVersionRef } from "#internet/workflow/kernel/types";

export const SOFTWARE_USER_FEEDBACK_SCHEMA = {
	id: "workflow.software.user-feedback",
	version: "1",
} as const satisfies WorkflowVersionRef;

export const SOFTWARE_USER_FEEDBACK_VERDICTS = ["ACCEPTED", "CHANGES_REQUESTED"] as const;
export type SoftwareUserFeedbackVerdict = (typeof SOFTWARE_USER_FEEDBACK_VERDICTS)[number];

export interface SoftwareUserFeedbackInput {
	readonly verdict: SoftwareUserFeedbackVerdict;
	readonly raw: string;
	readonly targetDelivery?: {
		readonly runId: string;
		readonly artifactId: string;
	};
	readonly targetVersion?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSoftwareUserFeedbackInput(value: unknown): SoftwareUserFeedbackInput {
	if (!isRecord(value)) throw new Error("invalid software User feedback payload");
	if (
		typeof value.verdict !== "string" ||
		!SOFTWARE_USER_FEEDBACK_VERDICTS.includes(value.verdict as SoftwareUserFeedbackVerdict)
	) {
		throw new Error("invalid software User feedback verdict");
	}
	if (typeof value.raw !== "string" || value.raw.trim() === "" || value.raw.includes("\0")) {
		throw new Error("invalid software User feedback raw source");
	}
	const targetDelivery = value.targetDelivery;
	const targetVersion = value.targetVersion;
	if ((targetDelivery === undefined) !== (targetVersion === undefined)) {
		throw new Error("software User feedback target Delivery and version must be provided together");
	}
	if (targetDelivery !== undefined) {
		if (
			!isRecord(targetDelivery) ||
			typeof targetDelivery.runId !== "string" ||
			!/^[0-9a-f]{32}$/u.test(targetDelivery.runId) ||
			typeof targetDelivery.artifactId !== "string" ||
			!/^[0-9a-f]{64}$/u.test(targetDelivery.artifactId) ||
			typeof targetVersion !== "string" ||
			targetVersion.trim() === ""
		) {
			throw new Error("invalid software User feedback target Delivery");
		}
	}
	return value as unknown as SoftwareUserFeedbackInput;
}
