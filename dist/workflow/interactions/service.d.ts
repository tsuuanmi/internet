import type { WorkflowArtifactStore } from "#internet/workflow/artifact-store";
import type { WorkflowAuthorizationContext, WorkflowPrincipal } from "#internet/workflow/authorization";
import type { WorkflowInputBundleStore } from "#internet/workflow/input-bundle-store";
import type { WorkflowExternalSignalStore } from "#internet/workflow/interactions/signal-store";
import type { WorkflowExternalSignal, WorkflowExternalSignalInput } from "#internet/workflow/interactions/types";
import { type WorkflowPendingAction, type WorkflowPendingActionResponseInput, type WorkflowResponseProvenance } from "#internet/workflow/interactions/types";
import type { WorkflowVersionRef } from "#internet/workflow/kernel/types";
import type { WorkflowPendingActionStore } from "#internet/workflow/pending-action-store";
import type { WorkflowRunStore } from "#internet/workflow/run-store";
export interface WorkflowResponseSchemaRegistry {
    validate(schema: WorkflowVersionRef, payload: unknown): void;
}
export interface WorkflowInteractionAuthorityPolicy {
    canAccess(runId: string, owner: WorkflowPrincipal, caller: WorkflowPrincipal): boolean;
    authorizeResponse(runId: string, owner: WorkflowPrincipal, caller: WorkflowPrincipal, provenance: WorkflowResponseProvenance): boolean;
    authorizeSignal(runId: string, owner: WorkflowPrincipal, caller: WorkflowPrincipal, provenance: WorkflowResponseProvenance, signalType: string): boolean;
}
export interface WorkflowPendingActionSubjectResolver {
    isCurrent(runId: string, kind: string, id: string, version: string): boolean;
}
export interface WorkflowInteractionServiceDependencies {
    readonly runs: WorkflowRunStore;
    readonly actions: WorkflowPendingActionStore;
    readonly artifacts: WorkflowArtifactStore;
    readonly inputBundles: WorkflowInputBundleStore;
    readonly schemas: WorkflowResponseSchemaRegistry;
    readonly authority: WorkflowInteractionAuthorityPolicy;
    readonly subjects: WorkflowPendingActionSubjectResolver;
    readonly signals: WorkflowExternalSignalStore;
    readonly onResolved?: (runId: string) => void;
    readonly onSignal?: (signal: WorkflowExternalSignal) => void;
    readonly now?: () => number;
}
export declare class WorkflowInteractionServiceError extends Error {
    constructor(message: string);
}
export declare class WorkflowInteractionService {
    private readonly dependencies;
    private readonly now;
    constructor(dependencies: WorkflowInteractionServiceDependencies);
    signals(context: WorkflowAuthorizationContext, runId: string): readonly WorkflowExternalSignal[];
    signal(context: WorkflowAuthorizationContext, input: WorkflowExternalSignalInput): WorkflowExternalSignal;
    list(context: WorkflowAuthorizationContext, runId: string): readonly WorkflowPendingAction[];
    get(context: WorkflowAuthorizationContext, runId: string, actionId: string): WorkflowPendingAction;
    respond(context: WorkflowAuthorizationContext, input: WorkflowPendingActionResponseInput): WorkflowPendingAction;
    supersedeStale(runId: string): readonly WorkflowPendingAction[];
    private actionContextIsCurrent;
    private requireAuthorizedRun;
}
//# sourceMappingURL=service.d.ts.map