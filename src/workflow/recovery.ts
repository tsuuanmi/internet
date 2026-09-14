import { isInternetError } from "#internet/core/errors";
import { WorkflowConfirmationError } from "#internet/workflow/approval-policy";
import type {
	WorkflowExecutionRecord,
	WorkflowFailure,
	WorkflowRecoveryPlan,
	WorkflowRetryDisposition,
} from "#internet/workflow/graph";

export interface WorkflowRecoveryPolicy {
	readonly maxAttempts: number;
	readonly backoffMs: number;
}

export const DEFAULT_WORKFLOW_RECOVERY_POLICY: WorkflowRecoveryPolicy = {
	maxAttempts: 3,
	backoffMs: 5_000,
};

export function executionLeaseExpired(execution: WorkflowExecutionRecord, at = Date.now()): boolean {
	return Date.parse(execution.leaseUntil) <= at;
}

export function providerProgressStalled(
	execution: WorkflowExecutionRecord,
	stallTimeoutMs: number,
	at = Date.now(),
): boolean {
	const progressAt = execution.lastMeaningfulProgressAt ?? execution.startedAt;
	return at - Date.parse(progressAt) >= stallTimeoutMs;
}

export function classifyWorkflowFailure(error: unknown, at = new Date().toISOString()): WorkflowFailure {
	const message = error instanceof Error ? error.message : String(error);
	if (error instanceof WorkflowConfirmationError) {
		return {
			class: "USER",
			code: error.kind === "merge-requires-user" ? "MERGE_AUTHORIZATION_REQUIRED" : "UNKNOWN_CONFIRMATION",
			message,
			retry: "USER_ACTION",
			at,
		};
	}
	if (/InvalidSelectorError|Error while parsing selector/iu.test(message)) {
		return { class: "AUTOMATION", code: "INVALID_SELECTOR", message, retry: "CODE_FIX", at };
	}
	if (isInternetError(error)) {
		switch (error.kind) {
			case "timeout":
				return { class: "PROVIDER", code: "HARD_TIMEOUT", message, retry: "RECREATE_SESSION", at };
			case "browser_unavailable":
				return { class: "BROWSER", code: "BROWSER_UNAVAILABLE", message, retry: "RECREATE_SESSION", at };
			case "provider_error":
				return { class: "PROVIDER", code: "PROVIDER_ERROR", message, retry: "IMMEDIATE", at };
			case "login_required":
			case "login_failed":
			case "not_authenticated":
				return { class: "AUTH", code: "AUTH_EXPIRED", message, retry: "USER_ACTION", at };
			case "config_error":
				return { class: "AUTOMATION", code: "CONFIG_ERROR", message, retry: "CODE_FIX", at };
			case "aborted":
				return { class: "TRANSPORT", code: "EXECUTION_ABORTED", message, retry: "NONE", at };
		}
	}
	return { class: "AUTOMATION", code: "UNEXPECTED_ERROR", message, retry: "CODE_FIX", at };
}

export function recoveryPlanForFailure(
	failure: WorkflowFailure,
	currentAttempt: number,
	policy: WorkflowRecoveryPolicy = DEFAULT_WORKFLOW_RECOVERY_POLICY,
	at = Date.now(),
): WorkflowRecoveryPlan | undefined {
	const nextAttempt = currentAttempt + 1;
	if (failure.retry === "NONE" || failure.retry === "CODE_FIX") return undefined;
	if (failure.retry === "USER_ACTION") {
		return { action: "USER_ACTION", attempt: currentAttempt, maxAttempts: policy.maxAttempts };
	}
	if (nextAttempt > policy.maxAttempts) return undefined;
	if (failure.retry === "BACKOFF") {
		return {
			action: "BACKOFF",
			attempt: nextAttempt,
			maxAttempts: policy.maxAttempts,
			notBefore: new Date(at + policy.backoffMs).toISOString(),
		};
	}
	return {
		action: retryAction(failure.retry),
		attempt: nextAttempt,
		maxAttempts: policy.maxAttempts,
	};
}

function retryAction(disposition: WorkflowRetryDisposition): WorkflowRecoveryPlan["action"] {
	if (disposition === "RECREATE_SESSION") return "RECREATE_SESSION";
	if (disposition === "IMMEDIATE") return "RETRY";
	return "RECONCILE";
}
