from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise RuntimeError(f"missing patch anchor in {path}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


def sub_once(path: str, pattern: str, replacement: str) -> None:
    file = Path(path)
    text = file.read_text()
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"expected one patch match in {path}, got {count}: {pattern[:100]!r}")
    file.write_text(next_text)


replace_once(
    "src/workflow/engine.ts",
    '''\tclassifyWorkflowFailure,\n\tDEFAULT_WORKFLOW_RECOVERY_POLICY,''',
    '''\tclassifyTeamFailure,\n\tclassifyWorkflowFailure,\n\tDEFAULT_WORKFLOW_RECOVERY_POLICY,''',
)
replace_once(
    "src/workflow/engine.ts",
    '''\t\tconst failure =\n\t\t\terror instanceof TeamStepError ? this.failureFromTeam(error.detail) : classifyWorkflowFailure(error);''',
    '''\t\tconst failure =\n\t\t\terror instanceof TeamStepError ? classifyTeamFailure(error.detail) : classifyWorkflowFailure(error);''',
)
sub_once(
    "src/workflow/engine.ts",
    r'''\n\tprivate failureFromTeam\(detail: TeamFailureDetail\): WorkflowFailure \{.*?\n\t\}\n\n\tprivate assertImplementationPr''',
    '''\n\tprivate assertImplementationPr''',
)
replace_once(
    "src/workflow/engine.ts",
    '''\t\tif (pendingAction !== undefined || Object.values(graph.nodes).some((node) => node.state === "FAILED")) {\n\t\t\treturn { ...graph, lifecycle: "BLOCKED" };\n\t\t}\n\t\tconst recovering = Object.values(graph.nodes).find((node) => node.state === "RECOVERING");''',
    '''\t\tif (pendingAction !== undefined || Object.values(graph.nodes).some((node) => node.state === "FAILED")) {\n\t\t\treturn { ...graph, lifecycle: "BLOCKED" };\n\t\t}\n\t\tconst waitingForUser = Object.values(graph.nodes).find((node) => node.state === "WAITING_USER");\n\t\tif (waitingForUser !== undefined) {\n\t\t\treturn { ...graph, phase: waitingForUser.phase, lifecycle: "WAITING_USER" };\n\t\t}\n\t\tconst recovering = Object.values(graph.nodes).find((node) => node.state === "RECOVERING");''',
)

replace_once(
    "test/workflow-recovery.test.ts",
    '''\tclassifyWorkflowFailure,\n\texecutionLeaseExpired,''',
    '''\tclassifyTeamFailure,\n\tclassifyWorkflowFailure,\n\texecutionLeaseExpired,''',
)
replace_once(
    "test/workflow-recovery.test.ts",
    '''\tit("does not consume a new attempt for user-owned confirmation", () => {''',
    '''\tit("classifies ambiguous team provider reconciliation as user-owned output recovery", () => {\n\t\tconst failure = classifyTeamFailure({\n\t\t\taccountId: "chatgpt-thinker",\n\t\t\tprovider: "chatgpt-web",\n\t\t\tstage: "provider_turn",\n\t\t\tround: 1,\n\t\t\tkind: "provider_reconciliation_failed",\n\t\t\tmessage: "provider response identity is ambiguous",\n\t\t\tretryable: false,\n\t\t\tfailedAt: startedAt,\n\t\t});\n\t\texpect(failure).toMatchObject({\n\t\t\tclass: "OUTPUT",\n\t\t\tcode: "RESULT_RECONCILIATION_AMBIGUOUS",\n\t\t\tretry: "USER_ACTION",\n\t\t});\n\t\texpect(recoveryPlanForFailure(failure, 2)).toEqual({ action: "USER_ACTION", attempt: 2, maxAttempts: 3 });\n\t});\n\n\tit("does not consume a new attempt for user-owned confirmation", () => {''',
)

replace_once(
    "test/workflow-graph-reducer.test.ts",
    '''\tretryWorkflowNode,\n\tstartWorkflowNode,''',
    '''\tresumeWorkflowNodeFromUserWait,\n\tretryWorkflowNode,\n\tstartWorkflowNode,\n\twaitWorkflowNodeForUser,''',
)
replace_once(
    "test/workflow-graph-reducer.test.ts",
    '''\tit("rejects late completion from a fenced execution", () => {''',
    '''\tit("preserves one live execution while a node waits for user action", () => {\n\t\tconst node: WorkflowGraphNode = {\n\t\t\tnodeId: "writer:implementation",\n\t\t\tkind: "WRITER_IMPLEMENTATION",\n\t\t\tphase: "WRITER",\n\t\t\tdependencies: [],\n\t\t\tstate: "READY",\n\t\t\tinput: input(),\n\t\t};\n\t\tconst started = startWorkflowNode(graph([node]), node.nodeId, execution("exec-live"));\n\t\tconst waiting = waitWorkflowNodeForUser(started, node.nodeId, "exec-live", {\n\t\t\tclass: "USER",\n\t\t\tcode: "UNKNOWN_CONFIRMATION",\n\t\t\tmessage: "inspect confirmation",\n\t\t\tretry: "USER_ACTION",\n\t\t\tat: now,\n\t\t});\n\t\texpect(waiting.nodes[node.nodeId]).toMatchObject({\n\t\t\tstate: "WAITING_USER",\n\t\t\texecution: { executionId: "exec-live", attempt: 1, providerState: "WAITING_USER" },\n\t\t\twaitReason: "UNKNOWN_CONFIRMATION",\n\t\t});\n\t\tconst resumed = resumeWorkflowNodeFromUserWait(waiting, node.nodeId, "exec-live");\n\t\texpect(resumed.nodes[node.nodeId]).toMatchObject({\n\t\t\tstate: "RUNNING",\n\t\t\texecution: { executionId: "exec-live", attempt: 1 },\n\t\t});\n\t});\n\n\tit("rejects late completion from a fenced execution", () => {''',
)

replace_once(
    "test/workflow-engine-graph.test.ts",
    '''\tit("requires both research lanes and never degrades to a one-lane quorum", async () => {''',
    '''\tit("fails closed on ambiguous provider reconciliation without blind resubmission", async () => {\n\t\tconst teams: WorkflowTeamRunner = {\n\t\t\trounds: 1,\n\t\t\tasync runStep(request) {\n\t\t\t\treturn {\n\t\t\t\t\tok: false,\n\t\t\t\t\terror: {\n\t\t\t\t\t\taccountId: request.step.accountId,\n\t\t\t\t\t\tprovider: getAccountDefinition(request.step.accountId).provider,\n\t\t\t\t\t\tstage: "provider_turn",\n\t\t\t\t\t\t...(request.step.kind === "member" ? { round: request.step.round } : {}),\n\t\t\t\t\t\tkind: "provider_reconciliation_failed",\n\t\t\t\t\t\tmessage: "provider completion is ambiguous",\n\t\t\t\t\t\tretryable: false,\n\t\t\t\t\t\tfailedAt: new Date().toISOString(),\n\t\t\t\t\t},\n\t\t\t\t};\n\t\t\t},\n\t\t};\n\t\tconst { engine } = createWorkflowTestRuntime(root(), { teams });\n\t\tconst job = start(engine);\n\t\tconst nodeId = workflowNodeId.researchMember("A", 1, 1);\n\t\tconst current = await engine.executeNode(job.jobId, nodeId, "driver");\n\n\t\texpect(current.graph.lifecycle).toBe("BLOCKED");\n\t\texpect(current.graph.nodes[nodeId]).toMatchObject({\n\t\t\tstate: "FAILED",\n\t\t\tfailure: { class: "OUTPUT", code: "RESULT_RECONCILIATION_AMBIGUOUS", retry: "USER_ACTION" },\n\t\t});\n\t\texpect(current.pendingAction).toMatchObject({ kind: "USER_ACTION_REQUIRED", nodeId });\n\t\texpect(engine.runnableNodeIds(job.jobId)).not.toContain(nodeId);\n\t});\n\n\tit("requires both research lanes and never degrades to a one-lane quorum", async () => {''',
)
