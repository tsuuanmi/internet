import { type WorkflowGraphModelPort } from "#internet/workflow/components";
import { type WorkflowGraphSnapshot } from "#internet/workflow/graph";
export declare class WorkflowGraphValidator {
    private readonly graphModel;
    constructor(graphModel: WorkflowGraphModelPort);
    assert(graphId: string, graph: WorkflowGraphSnapshot): void;
}
//# sourceMappingURL=graph-validator.d.ts.map