import { describe, expect, it } from "vitest";
import { InternetError } from "#internet/core/errors";
import { WorkflowConfirmationError } from "#internet/workflow/approval-policy";
import type { WorkflowExecutionRecord } from "#internet/workflow/graph";
import {
	classifyTeamFailure,
	classifyWorkflowFailure,
	executionLeaseExpired,
	providerProgressStalled,
	recoveryPlanForFailure,
} from "#internet/workflow/recovery";

const startedAt = "2026-09-14T10:00:00.000Z";

function execution(overrides: Partial<WorkflowExecutionRecord> = {}): WorkflowExecutionRecord {
	return {
		executionId: "exec-1",
		attempt: 1,
		state: "ACTIVE",
		ownerInstanceId: "driver-1",
		startedAt,
		heartbeatAt: startedAt,
		leaseUntil: "2026-09-14T10:01:00.000Z",
		...overrides,
	};
}

describe("workflow recovery policy", () => {
	it("separates ownership lease expiry from provider progress stalls", () => {
		const active = execution({ lastMeaningfulProgressAt: "2026-09-14T10:00:45.000Z" });
		expect(executionLeaseExpired(active, Date.parse("2026-09-14T10:01:01.000Z"))).toBe(true);
		expect(providerProgressStalled(active, 30_000, Date.parse("2026-09-14T10:01:01.000Z"))).toBe(false);
	});

	it("classifies deterministic selector defects as code-fix failures", () => {
		const failure = classifyWorkflowFailure(
			new Error("InvalidSelectorError: Error while parsing selector"),
			startedAt,
		);
		expect(failure).toMatchObject({ class: "AUTOMATION", code: "INVALID_SELECTOR", retry: "CODE_FIX" });
		expect(recoveryPlanForFailure(failure, 1)).toBeUndefined();
	});

	it("classifies hard timeout for bounded same-node session recreation", () => {
		const failure = classifyWorkflowFailure(new InternetError("timeout", "provider timeout"), startedAt);
		expect(failure).toMatchObject({ class: "PROVIDER", code: "HARD_TIMEOUT", retry: "RECREATE_SESSION" });
		expect(recoveryPlanForFailure(failure, 1)).toEqual({ action: "RECREATE_SESSION", attempt: 2, maxAttempts: 3 });
	});

	it("classifies no-progress stall separately while using the same smallest-node recovery", () => {
		const failure = classifyWorkflowFailure(
			new InternetError("provider_stalled", "provider stopped progressing"),
			startedAt,
		);
		expect(failure).toMatchObject({ class: "PROVIDER", code: "PROVIDER_STALLED", retry: "RECREATE_SESSION" });
		expect(recoveryPlanForFailure(failure, 2)).toEqual({ action: "RECREATE_SESSION", attempt: 3, maxAttempts: 3 });
	});

	it("fails closed on ambiguous provider reconciliation without consuming a retry attempt", () => {
		const failure = classifyWorkflowFailure(
			new InternetError("provider_reconciliation_failed", "provider result identity is ambiguous"),
			startedAt,
		);
		expect(failure).toMatchObject({
			class: "OUTPUT",
			code: "RESULT_RECONCILIATION_AMBIGUOUS",
			retry: "USER_ACTION",
		});
		expect(recoveryPlanForFailure(failure, 2)).toEqual({ action: "USER_ACTION", attempt: 2, maxAttempts: 3 });
	});

	it("classifies ambiguous team provider reconciliation as user-owned output recovery", () => {
		const failure = classifyTeamFailure({
			accountId: "chatgpt-thinker",
			provider: "chatgpt-web",
			stage: "provider_turn",
			round: 1,
			kind: "provider_reconciliation_failed",
			message: "provider response identity is ambiguous",
			retryable: false,
			failedAt: startedAt,
		});
		expect(failure).toMatchObject({
			class: "OUTPUT",
			code: "RESULT_RECONCILIATION_AMBIGUOUS",
			retry: "USER_ACTION",
		});
		expect(recoveryPlanForFailure(failure, 2)).toEqual({ action: "USER_ACTION", attempt: 2, maxAttempts: 3 });
	});

	it("does not consume a new attempt for user-owned confirmation", () => {
		const failure = classifyWorkflowFailure(
			new WorkflowConfirmationError("unknown", "inspect confirmation"),
			startedAt,
		);
		expect(recoveryPlanForFailure(failure, 2)).toEqual({ action: "USER_ACTION", attempt: 2, maxAttempts: 3 });
	});
});
