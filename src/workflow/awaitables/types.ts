import type { WorkflowArtifactRef, WorkflowVersionRef } from "#internet/workflow/kernel/types";

export const WORKFLOW_TIMER_SCHEMA = "@tsuuanmi/internet-workflow-timer" as const;
export const WORKFLOW_EXTERNAL_EVENT_SCHEMA = "@tsuuanmi/internet-workflow-external-event" as const;
export const WORKFLOW_EXTERNAL_EVENT_WAIT_SCHEMA = "@tsuuanmi/internet-workflow-external-event-wait" as const;

export const WORKFLOW_TIMER_STATES = ["PENDING", "FIRED", "CANCELLED"] as const;
export type WorkflowTimerState = (typeof WORKFLOW_TIMER_STATES)[number];

export const WORKFLOW_EXTERNAL_EVENT_WAIT_STATES = ["WAITING", "MATCHED", "CANCELLED"] as const;
export type WorkflowExternalEventWaitState = (typeof WORKFLOW_EXTERNAL_EVENT_WAIT_STATES)[number];

export interface WorkflowTimerContract {
	readonly timerType: string;
	readonly deadline: string;
}

export interface WorkflowTimer {
	readonly schema: typeof WORKFLOW_TIMER_SCHEMA;
	readonly version: 1;
	readonly revision: number;
	readonly timerId: string;
	readonly runId: string;
	readonly causedBy: WorkflowArtifactRef;
	readonly timerType: string;
	readonly deadline: string;
	readonly state: WorkflowTimerState;
	readonly firedAt?: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface WorkflowExternalEventWaitContract {
	readonly eventType: string;
	readonly correlationKey: string;
	readonly payloadSchema?: WorkflowVersionRef;
}

export interface WorkflowExternalEventWait {
	readonly schema: typeof WORKFLOW_EXTERNAL_EVENT_WAIT_SCHEMA;
	readonly version: 1;
	readonly revision: number;
	readonly waitId: string;
	readonly runId: string;
	readonly causedBy: WorkflowArtifactRef;
	readonly eventType: string;
	readonly correlationKey: string;
	readonly payloadSchema?: WorkflowVersionRef;
	readonly state: WorkflowExternalEventWaitState;
	readonly matchedEventId?: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface WorkflowExternalEventInput {
	readonly runId: string;
	readonly source: string;
	readonly sourceEventId: string;
	readonly eventType: string;
	readonly correlationKey: string;
	readonly payloadSchema: WorkflowVersionRef;
	readonly payload: unknown;
	readonly occurredAt: string;
}

export interface WorkflowExternalEvent {
	readonly schema: typeof WORKFLOW_EXTERNAL_EVENT_SCHEMA;
	readonly version: 1;
	readonly eventId: string;
	readonly runId: string;
	readonly source: string;
	readonly sourceEventId: string;
	readonly eventType: string;
	readonly correlationKey: string;
	readonly payloadSchema: WorkflowVersionRef;
	readonly payload: unknown;
	readonly payloadHash: string;
	readonly occurredAt: string;
	readonly receivedAt: string;
}
