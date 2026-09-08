from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"expected text not found in {path}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "src/browser/runtime.ts",
    'import {\n\tCHATGPT_HOME_URL,\n',
    'import { chatgptHandleWorkflowConfirmation } from "#internet/browser/chatgpt-confirmation";\nimport {\n\tCHATGPT_HOME_URL,\n',
)
replace_once(
    "src/browser/runtime.ts",
    'import { ACCOUNT_IDS, type AccountId, getAccountDefinition } from "#internet/core/accounts";\n',
    'import { ACCOUNT_IDS, type AccountId, getAccountDefinition } from "#internet/core/accounts";\nimport type { WorkflowApprovalContext } from "#internet/workflow/approval-policy";\n',
)
replace_once(
    "src/browser/runtime.ts",
    '''\ttimeoutMs?: number;\n\tsignal?: AbortSignal;\n}\n''',
    '''\ttimeoutMs?: number;\n\t/** Optional fail-closed Website confirmation policy for the workflow writer turn. */\n\tconfirmation?: WorkflowApprovalContext;\n\tsignal?: AbortSignal;\n}\n''',
)
replace_once(
    "src/browser/runtime.ts",
    '''\t\t\t\t\t\trequest.research === true\n\t\t\t\t\t\t\t? chatgptDeepResearchSnapshot(page!, previousResearchText)\n\t\t\t\t\t\t\t: chatgptSnapshot(page!, previousTurnText),\n''',
    '''\t\t\t\t\t\trequest.research === true\n\t\t\t\t\t\t\t? chatgptDeepResearchSnapshot(page!, previousResearchText)\n\t\t\t\t\t\t\t: (async () => {\n\t\t\t\t\t\t\t\tif (request.confirmation !== undefined) {\n\t\t\t\t\t\t\t\t\tawait chatgptHandleWorkflowConfirmation(page!, request.confirmation);\n\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t\treturn chatgptSnapshot(page!, previousTurnText);\n\t\t\t\t\t\t\t})(),\n''',
)

replace_once(
    "src/workflow/types.ts",
    '''\treadonly expectedHeadSha?: string;\n}\n''',
    '''\treadonly expectedHeadSha?: string;\n\t/** State to resume after a manually handled non-terminal exception. */\n\treadonly resumeState?: WorkflowState;\n}\n''',
)

replace_once(
    "src/workflow/writer-runner.ts",
    'import type { BrowserManager } from "#internet/browser/runtime";\n',
    '''import {\n\tChatGptMergeConfirmationError,\n\tChatGptUnknownConfirmationError,\n} from "#internet/browser/chatgpt-confirmation";\nimport type { BrowserManager } from "#internet/browser/runtime";\n''',
)
replace_once(
    "src/workflow/writer-runner.ts",
    'import type { WorkflowControlMessage } from "#internet/workflow/control";\n',
    'import type { WorkflowControlMessage } from "#internet/workflow/control";\nimport { workflowWriterBranch } from "#internet/workflow/approval-policy";\n',
)
replace_once(
    "src/workflow/writer-runner.ts",
    '''export type WorkflowWriterResult =\n\t| { readonly status: "PR_OPEN"; readonly pullRequest: WorkflowPullRequestReceipt }\n\t| { readonly status: "BLOCKED"; readonly message: string };\n''',
    '''export type WorkflowWriterResult =\n\t| { readonly status: "PR_OPEN"; readonly pullRequest: WorkflowPullRequestReceipt }\n\t| { readonly status: "BLOCKED"; readonly message: string }\n\t| { readonly status: "UNKNOWN_CONFIRMATION"; readonly message: string }\n\t| { readonly status: "MERGE_CONFIRMATION_BLOCKED"; readonly message: string };\n''',
)
replace_once(
    "src/workflow/writer-runner.ts",
    '''\t\t`Required base revision: ${job.baseRevision}`,\n\t\t`Objective: ${job.objective}`,\n''',
    '''\t\t`Required base revision: ${job.baseRevision}`,\n\t\t`Required workflow branch: ${job.pullRequest?.head ?? workflowWriterBranch(job.jobId)}`,\n\t\t`Objective: ${job.objective}`,\n''',
)
replace_once(
    "src/workflow/writer-runner.ts",
    '''\tasync runControl(request: WorkflowWriterControlRequest): Promise<WorkflowWriterResult> {\n\t\tconst result = await this.manager.chat("chatgpt-writer", {\n\t\t\tprompt: controlPrompt(request.job, request.control),\n\t\t\tsessionId: request.sessionId,\n\t\t\tsignal: request.signal,\n\t\t});\n\t\treturn parseWorkflowWriterResult(result.text);\n\t}\n''',
    '''\tasync runControl(request: WorkflowWriterControlRequest): Promise<WorkflowWriterResult> {\n\t\ttry {\n\t\t\tconst result = await this.manager.chat("chatgpt-writer", {\n\t\t\t\tprompt: controlPrompt(request.job, request.control),\n\t\t\t\tsessionId: request.sessionId,\n\t\t\t\tconfirmation: {\n\t\t\t\t\tjobId: request.job.jobId,\n\t\t\t\t\taccountId: "chatgpt-writer",\n\t\t\t\t\tcurrentSessionId: request.sessionId,\n\t\t\t\t\twriterSessionId: request.job.writerConversation.sessionId,\n\t\t\t\t\trepository: request.job.repository,\n\t\t\t\t\tstate: request.job.state,\n\t\t\t\t\t...(request.job.pullRequest === undefined ? {} : { pullRequest: request.job.pullRequest }),\n\t\t\t\t},\n\t\t\t\tsignal: request.signal,\n\t\t\t});\n\t\t\treturn parseWorkflowWriterResult(result.text);\n\t\t} catch (error) {\n\t\t\tif (error instanceof ChatGptUnknownConfirmationError) {\n\t\t\t\treturn { status: "UNKNOWN_CONFIRMATION", message: error.message };\n\t\t\t}\n\t\t\tif (error instanceof ChatGptMergeConfirmationError) {\n\t\t\t\treturn { status: "MERGE_CONFIRMATION_BLOCKED", message: error.message };\n\t\t\t}\n\t\t\tthrow error;\n\t\t}\n\t}\n''',
)

replace_once(
    "src/workflow/engine.ts",
    '''\t\tif (result.status === "BLOCKED") {\n\t\t\treturn this.jobs.update(jobId, (current) => ({\n\t\t\t\t...withState(current, "BLOCKED"),\n\t\t\t\tpendingAction: { kind: "WRITER_BLOCKED", message: result.message },\n\t\t\t\tlastEvent: { type: "WRITER_BLOCKED", class: "ACTION_REQUIRED", at: now(), message: result.message },\n\t\t\t}));\n\t\t}\n''',
    '''\t\tif (result.status === "UNKNOWN_CONFIRMATION") {\n\t\t\treturn this.jobs.update(jobId, (current) => ({\n\t\t\t\t...withState(current, "UNKNOWN_CONFIRMATION"),\n\t\t\t\tpendingAction: {\n\t\t\t\t\tkind: "UNKNOWN_CONFIRMATION",\n\t\t\t\t\tmessage: result.message,\n\t\t\t\t\tresumeState: "WRITER_RUNNING",\n\t\t\t\t},\n\t\t\t\tlastEvent: { type: "UNKNOWN_CONFIRMATION", class: "ACTION_REQUIRED", at: now(), message: result.message },\n\t\t\t}));\n\t\t}\n\t\tif (result.status === "MERGE_CONFIRMATION_BLOCKED") {\n\t\t\treturn this.jobs.update(jobId, (current) => ({\n\t\t\t\t...withState(current, "BLOCKED"),\n\t\t\t\tpendingAction: {\n\t\t\t\t\tkind: "WRITER_BLOCKED",\n\t\t\t\t\tmessage: result.message,\n\t\t\t\t\tresumeState: "WRITER_RUNNING",\n\t\t\t\t},\n\t\t\t\tlastEvent: { type: "MERGE_CONFIRMATION_BLOCKED", class: "ACTION_REQUIRED", at: now(), message: result.message },\n\t\t\t}));\n\t\t}\n\t\tif (result.status === "BLOCKED") {\n\t\t\treturn this.jobs.update(jobId, (current) => ({\n\t\t\t\t...withState(current, "BLOCKED"),\n\t\t\t\tpendingAction: { kind: "WRITER_BLOCKED", message: result.message, resumeState: "WRITER_RUNNING" },\n\t\t\t\tlastEvent: { type: "WRITER_BLOCKED", class: "ACTION_REQUIRED", at: now(), message: result.message },\n\t\t\t}));\n\t\t}\n''',
)
replace_once(
    "src/workflow/engine.ts",
    '''\t\t\treturn { ...withState(current, "CREATED"), pendingAction: undefined };\n''',
    '''\t\t\treturn { ...withState(current, current.pendingAction?.resumeState ?? "CREATED"), pendingAction: undefined };\n''',
)
