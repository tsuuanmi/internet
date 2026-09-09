from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing replacement anchor in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


def insert_before(path: str, anchor: str, content: str) -> None:
    replace_once(path, anchor, content + anchor)

# types.ts
replace_once(
    "src/workflow/types.ts",
    'export type WorkflowState = (typeof WORKFLOW_STATES)[number];\n',
    'export type WorkflowState = (typeof WORKFLOW_STATES)[number];\n\nexport const WORKFLOW_PR_HEALTH_STATUSES = ["PASS", "FAIL", "PENDING", "NONE", "UNKNOWN"] as const;\nexport type WorkflowPrHealthStatus = (typeof WORKFLOW_PR_HEALTH_STATUSES)[number];\n',
)
insert_before(
    "src/workflow/types.ts",
    'export interface WorkflowMergeAuthorization {\n',
    'export interface WorkflowPrHealthReceipt {\n\treadonly repository: string;\n\treadonly number: number;\n\treadonly url: string;\n\treadonly headSha: string;\n\treadonly status: WorkflowPrHealthStatus;\n\treadonly summary: string;\n\treadonly checkedAt: string;\n}\n\n',
)
replace_once(
    "src/workflow/types.ts",
    '\t\t| "ACCOUNT_REAUTH_REQUIRED"\n\t\t| "RETRY_REQUIRED";\n',
    '\t\t| "ACCOUNT_REAUTH_REQUIRED"\n\t\t| "PR_HEALTH_REQUIRED"\n\t\t| "RETRY_REQUIRED";\n',
)
replace_once(
    "src/workflow/types.ts",
    '\treadonly pullRequest?: WorkflowPullRequestReceipt;\n\treadonly mergeAuthorization?: WorkflowMergeAuthorization;\n',
    '\treadonly pullRequest?: WorkflowPullRequestReceipt;\n\treadonly prHealth?: WorkflowPrHealthReceipt;\n\treadonly mergeAuthorization?: WorkflowMergeAuthorization;\n',
)

# control.ts
replace_once(
    "src/workflow/control.ts",
    'export const WORKFLOW_CONTROL_KINDS = ["START_IMPLEMENTATION", "APPLY_REVIEWS", "RETRY", "MERGE_AUTHORIZED"] as const;\n',
    'export const WORKFLOW_CONTROL_KINDS = [\n\t"START_IMPLEMENTATION",\n\t"APPLY_REVIEWS",\n\t"CHECK_PR_HEALTH",\n\t"RETRY",\n\t"MERGE_AUTHORIZED",\n] as const;\n',
)

# writer-runner.ts
replace_once(
    "src/workflow/writer-runner.ts",
    'import type { WorkflowJob, WorkflowPullRequestReceipt } from "#internet/workflow/types";\n',
    'import type { WorkflowJob, WorkflowPrHealthStatus, WorkflowPullRequestReceipt } from "#internet/workflow/types";\n',
)
replace_once(
    "src/workflow/writer-runner.ts",
    '\t| { readonly status: "PR_OPEN"; readonly pullRequest: WorkflowPullRequestReceipt }\n',
    '\t| { readonly status: "PR_OPEN"; readonly pullRequest: WorkflowPullRequestReceipt }\n\t| {\n\t\t\treadonly status: "PR_HEALTH";\n\t\t\treadonly repository: string;\n\t\t\treadonly number: number;\n\t\t\treadonly url: string;\n\t\t\treadonly headSha: string;\n\t\t\treadonly health: WorkflowPrHealthStatus;\n\t\t\treadonly summary: string;\n\t  }\n',
)
insert_before(
    "src/workflow/writer-runner.ts",
    '\tif (control.kind === "MERGE_AUTHORIZED") {\n',
    '\tif (control.kind === "CHECK_PR_HEALTH") {\n\t\tif (pullRequest === undefined || control.expectedHeadSha === undefined) {\n\t\t\tthrow new Error("CHECK_PR_HEALTH requires a persisted PR and expected head SHA");\n\t\t}\n\t\treturn [\n\t\t\t"You are the workflow writer/executor. This is a trusted read-only PR-health control message.",\n\t\t\t`Control: ${control.kind}`,\n\t\t\t`Workflow job: ${job.jobId}`,\n\t\t\t`Target repository: ${job.repository}`,\n\t\t\t`Pull request: ${pullRequest.url}`,\n\t\t\t`PR number: ${pullRequest.number}`,\n\t\t\t`Required PR head branch: ${pullRequest.head}`,\n\t\t\t`Expected exact head SHA: ${control.expectedHeadSha}`,\n\t\t\t"",\n\t\t\t"Read the actual current pull request and its current GitHub checks/statuses. Do not modify repository state and do not merge.",\n\t\t\t"First verify repository, PR number, head branch, and exact head SHA. If identity/head cannot be established exactly, report UNKNOWN for the actual head you observed when available; never guess.",\n\t\t\t"Classify the exact head as PASS when configured checks/status contexts relevant to merge are complete and successful; FAIL when any relevant check/status is failed, cancelled, timed out, stale, or action-required; PENDING when at least one relevant check is queued/in-progress/waiting and none has failed; NONE when GitHub shows no configured checks/status contexts for this head; UNKNOWN when health cannot be determined conclusively.",\n\t\t\t"Use NONE only for a genuinely check-free head, not for missing access or ambiguous UI/API state.",\n\t\t\t"",\n\t\t\t"Return exactly one JSON object and no markdown or surrounding prose.",\n\t\t\t\'{"status":"PR_HEALTH","repository":"owner/repo or repository URL","number":123,"url":"https://github.com/owner/repo/pull/123","headSha":"40-lowercase-hex","health":"PASS|FAIL|PENDING|NONE|UNKNOWN","summary":"concise evidence"}\',\n\t\t].join("\\n");\n\t}\n',
)
insert_before(
    "src/workflow/writer-runner.ts",
    '\tif (value.status === "MERGED") {\n',
    '\tif (value.status === "PR_HEALTH") {\n\t\tif (typeof value.repository !== "string" || value.repository.trim() === "")\n\t\t\tthrow new Error("writer PR health repository is required");\n\t\tif (typeof value.number !== "number" || !Number.isSafeInteger(value.number) || value.number < 1)\n\t\t\tthrow new Error("writer PR health PR number is invalid");\n\t\tif (typeof value.url !== "string" || !/^https:\\/\\/github\\.com\\//u.test(value.url))\n\t\t\tthrow new Error("writer PR health URL is invalid");\n\t\tif (typeof value.headSha !== "string" || !/^[0-9a-f]{40}$/u.test(value.headSha))\n\t\t\tthrow new Error("writer PR health head SHA is invalid");\n\t\tif (!["PASS", "FAIL", "PENDING", "NONE", "UNKNOWN"].includes(String(value.health)))\n\t\t\tthrow new Error("writer PR health status is invalid");\n\t\tif (typeof value.summary !== "string" || value.summary.trim() === "")\n\t\t\tthrow new Error("writer PR health summary is required");\n\t\treturn {\n\t\t\tstatus: "PR_HEALTH",\n\t\t\trepository: value.repository,\n\t\t\tnumber: value.number,\n\t\t\turl: value.url,\n\t\t\theadSha: value.headSha,\n\t\t\thealth: value.health as WorkflowPrHealthStatus,\n\t\t\tsummary: value.summary,\n\t\t};\n\t}\n',
)

# engine.ts imports and helpers
replace_once(
    "src/workflow/engine.ts",
    '\ttype WorkflowJob,\n\ttype WorkflowState,\n',
    '\ttype WorkflowJob,\n\ttype WorkflowPrHealthReceipt,\n\ttype WorkflowState,\n',
)
insert_before(
    "src/workflow/engine.ts",
    'export class WorkflowEngine {\n',
    'function mergeEligibleHealth(receipt: WorkflowPrHealthReceipt | undefined, headSha: string): boolean {\n\treturn receipt !== undefined && receipt.headSha === headSha && (receipt.status === "PASS" || receipt.status === "NONE");\n}\n\n',
)
# Clear stale health on remediation head advance.
replace_once(
    "src/workflow/engine.ts",
    '\t\t\tpullRequest: result.pullRequest,\n\t\t\tteamRuns: {\n',
    '\t\t\tpullRequest: result.pullRequest,\n\t\t\tprHealth: undefined,\n\t\t\tmergeAuthorization: undefined,\n\t\t\tteamRuns: {\n',
)
# Add health gate before requestMergeAuthorization.
insert_before(
    "src/workflow/engine.ts",
    '\t/** Move a fully reviewed PR into the explicit user-authorization gate. */\n',
    '\t/** Read and persist exact-head PR/check health before merge authorization. */\n\tasync runPrHealthGate(jobId: string, signal?: AbortSignal): Promise<WorkflowJob> {\n\t\tif (this.writer === undefined) throw new WorkflowEngineError("workflow writer runner is not configured");\n\t\tconst job = this.status(jobId);\n\t\tif (job.state !== "READY_FOR_MERGE_AUTHORIZATION")\n\t\t\tthrow new WorkflowEngineError(`workflow job ${jobId} cannot check PR health from ${job.state}`);\n\t\tif (job.pullRequest === undefined) throw new WorkflowEngineError("PR health check requires a persisted pull request");\n\t\tconst pr = job.pullRequest;\n\t\tconst result = await this.writer.runControl({\n\t\t\tsessionId: job.writerConversation.sessionId,\n\t\t\tjob,\n\t\t\tcontrol: createWorkflowControlMessage("CHECK_PR_HEALTH", jobId, pr.headSha),\n\t\t\tsignal,\n\t\t});\n\t\tif (result.status === "UNKNOWN_CONFIRMATION") {\n\t\t\treturn this.update(jobId, (current) => ({\n\t\t\t\t...withState(current, "UNKNOWN_CONFIRMATION"),\n\t\t\t\tpendingAction: { kind: "UNKNOWN_CONFIRMATION", message: result.message, resumeState: "READY_FOR_MERGE_AUTHORIZATION" },\n\t\t\t\tlastEvent: { type: "UNKNOWN_CONFIRMATION", class: "ACTION_REQUIRED", at: now(), message: result.message },\n\t\t\t}));\n\t\t}\n\t\tif (result.status === "BLOCKED") return this.writerBlocked(jobId, result.message, "READY_FOR_MERGE_AUTHORIZATION");\n\t\tif (result.status !== "PR_HEALTH") throw new WorkflowEngineError("writer did not return PR health during health gate");\n\t\tif (\n\t\t\tnormalizeGitHubRepository(result.repository) !== normalizeGitHubRepository(pr.repository) ||\n\t\t\tresult.number !== pr.number ||\n\t\t\tresult.url !== pr.url ||\n\t\t\tresult.headSha !== pr.headSha\n\t\t) {\n\t\t\treturn this.writerBlocked(jobId, "PR health result does not match the authoritative PR/head", "READY_FOR_MERGE_AUTHORIZATION");\n\t\t}\n\t\tconst receipt: WorkflowPrHealthReceipt = {\n\t\t\trepository: result.repository,\n\t\t\tnumber: result.number,\n\t\t\turl: result.url,\n\t\t\theadSha: result.headSha,\n\t\t\tstatus: result.health,\n\t\t\tsummary: result.summary,\n\t\t\tcheckedAt: now(),\n\t\t};\n\t\tif (result.health === "PASS" || result.health === "NONE") {\n\t\t\treturn this.update(jobId, (current) => ({\n\t\t\t\t...current,\n\t\t\t\trevision: current.revision + 1,\n\t\t\t\tprHealth: receipt,\n\t\t\t\tpendingAction: undefined,\n\t\t\t\tlastEvent: { type: "PR_HEALTH_PASSED", class: "PROGRESS", at: now(), message: `ci=${result.health.toLowerCase()} head=${result.headSha}` },\n\t\t\t\tupdatedAt: now(),\n\t\t\t}));\n\t\t}\n\t\tconst message = `PR health blocks merge authorization: ci=${result.health.toLowerCase()} head=${result.headSha} summary=${result.summary}`;\n\t\treturn this.update(jobId, (current) => ({\n\t\t\t...withState(current, "BLOCKED"),\n\t\t\tprHealth: receipt,\n\t\t\tmergeAuthorization: undefined,\n\t\t\tpendingAction: { kind: "PR_HEALTH_REQUIRED", message, expectedHeadSha: result.headSha, resumeState: "READY_FOR_MERGE_AUTHORIZATION" },\n\t\t\tlastEvent: { type: "PR_HEALTH_REQUIRED", class: "ACTION_REQUIRED", at: now(), message },\n\t\t}));\n\t}\n\n',
)
# Request gate requires exact eligible health and reports it.
replace_once(
    "src/workflow/engine.ts",
    '\t\tconst pr = current.pullRequest;\n\t\treturn this.update(jobId, (state) => ({\n',
    '\t\tconst pr = current.pullRequest;\n\t\tif (!mergeEligibleHealth(current.prHealth, pr.headSha)) {\n\t\t\tthrow new WorkflowEngineError("merge authorization requires exact-head PR health PASS or NONE");\n\t\t}\n\t\tconst ci = current.prHealth!.status.toLowerCase();\n\t\treturn this.update(jobId, (state) => ({\n',
)
replace_once(
    "src/workflow/engine.ts",
    'message: `Merge authorization required: pr=${pr.url} reviews=PASS/PASS ci=unknown expected_head=${pr.headSha}`,\n',
    'message: `Merge authorization required: pr=${pr.url} reviews=PASS/PASS ci=${ci} expected_head=${pr.headSha}`,\n',
)
replace_once(
    "src/workflow/engine.ts",
    'message: `pr=${pr.url} reviews=PASS/PASS ci=unknown expected_head=${pr.headSha}`,\n',
    'message: `pr=${pr.url} reviews=PASS/PASS ci=${ci} expected_head=${pr.headSha}`,\n',
)
# Re-check exact-head health immediately before merge.
replace_once(
    "src/workflow/engine.ts",
    '\t\tconst control = createWorkflowControlMessage("MERGE_AUTHORIZED", jobId, authorization.headSha);\n',
    '\t\tconst healthResult = await this.writer.runControl({\n\t\t\tsessionId: job.writerConversation.sessionId,\n\t\t\tjob,\n\t\t\tcontrol: createWorkflowControlMessage("CHECK_PR_HEALTH", jobId, authorization.headSha),\n\t\t\tsignal,\n\t\t});\n\t\tif (healthResult.status === "UNKNOWN_CONFIRMATION") {\n\t\t\treturn this.update(jobId, (current) => ({\n\t\t\t\t...withState(current, "UNKNOWN_CONFIRMATION"),\n\t\t\t\tpendingAction: { kind: "UNKNOWN_CONFIRMATION", message: healthResult.message, resumeState: "MERGING" },\n\t\t\t\tlastEvent: { type: "UNKNOWN_CONFIRMATION", class: "ACTION_REQUIRED", at: now(), message: healthResult.message },\n\t\t\t}));\n\t\t}\n\t\tif (healthResult.status === "BLOCKED") return this.writerBlocked(jobId, healthResult.message, "READY_FOR_MERGE_AUTHORIZATION");\n\t\tif (healthResult.status !== "PR_HEALTH") throw new WorkflowEngineError("writer did not return PR health before merge");\n\t\tif (\n\t\t\tnormalizeGitHubRepository(healthResult.repository) !== normalizeGitHubRepository(pr.repository) ||\n\t\t\thealthResult.number !== pr.number ||\n\t\t\thealthResult.url !== pr.url ||\n\t\t\thealthResult.headSha !== authorization.headSha\n\t\t) {\n\t\t\treturn this.writerBlocked(jobId, "pre-merge PR health result does not match the authorized PR/head", "READY_FOR_MERGE_AUTHORIZATION");\n\t\t}\n\t\tconst refreshedHealth: WorkflowPrHealthReceipt = {\n\t\t\trepository: healthResult.repository,\n\t\t\tnumber: healthResult.number,\n\t\t\turl: healthResult.url,\n\t\t\theadSha: healthResult.headSha,\n\t\t\tstatus: healthResult.health,\n\t\t\tsummary: healthResult.summary,\n\t\t\tcheckedAt: now(),\n\t\t};\n\t\tif (healthResult.health !== "PASS" && healthResult.health !== "NONE") {\n\t\t\tconst message = `PR health changed before merge: ci=${healthResult.health.toLowerCase()} head=${healthResult.headSha} summary=${healthResult.summary}`;\n\t\t\tthis.update(jobId, (current) => ({\n\t\t\t\t...current,\n\t\t\t\trevision: current.revision + 1,\n\t\t\t\tprHealth: refreshedHealth,\n\t\t\t\tupdatedAt: now(),\n\t\t\t}));\n\t\t\treturn this.writerBlocked(jobId, message, "READY_FOR_MERGE_AUTHORIZATION");\n\t\t}\n\t\tjob = this.update(jobId, (current) => ({\n\t\t\t...current,\n\t\t\trevision: current.revision + 1,\n\t\t\tprHealth: refreshedHealth,\n\t\t\tlastEvent: { type: "PR_HEALTH_REVALIDATED", class: "INTERNAL", at: now(), message: `ci=${healthResult.health.toLowerCase()} head=${healthResult.headSha}` },\n\t\t\tupdatedAt: now(),\n\t\t}));\n\t\tconst control = createWorkflowControlMessage("MERGE_AUTHORIZED", jobId, authorization.headSha);\n',
)
# runWriterMerge job must be mutable.
replace_once(
    "src/workflow/engine.ts",
    '\t\tconst job = this.status(jobId);\n\t\tif (job.state !== "MERGING")\n',
    '\t\tlet job = this.status(jobId);\n\t\tif (job.state !== "MERGING")\n',
)

# job-store strict validation.
replace_once(
    "src/workflow/job-store.ts",
    '\t\t\t"ACCOUNT_REAUTH_REQUIRED",\n\t\t\t"RETRY_REQUIRED",\n',
    '\t\t\t"ACCOUNT_REAUTH_REQUIRED",\n\t\t\t"PR_HEALTH_REQUIRED",\n\t\t\t"RETRY_REQUIRED",\n',
)
insert_before(
    "src/workflow/job-store.ts",
    'function assertMergeAuthorization(value: unknown): void {\n',
    'function assertPrHealth(value: unknown): void {\n\tif (value === undefined) return;\n\tif (!isRecord(value)) throw new Error("invalid PR health receipt");\n\tif (typeof value.repository !== "string" || value.repository.trim() === "") throw new Error("invalid PR health repository");\n\tif (!isPositiveInteger(value.number)) throw new Error("invalid PR health PR number");\n\tif (typeof value.url !== "string" || !/^https:\\/\\/github\\.com\\//u.test(value.url)) throw new Error("invalid PR health URL");\n\tif (!isFullSha(value.headSha)) throw new Error("invalid PR health head SHA");\n\tif (!["PASS", "FAIL", "PENDING", "NONE", "UNKNOWN"].includes(String(value.status))) throw new Error("invalid PR health status");\n\tif (typeof value.summary !== "string" || value.summary.trim() === "") throw new Error("invalid PR health summary");\n\tif (!isTimestamp(value.checkedAt)) throw new Error("invalid PR health timestamp");\n}\n\n',
)
replace_once(
    "src/workflow/job-store.ts",
    '\tassertPullRequest(value.pullRequest);\n\tassertPendingAction(value.pendingAction);\n',
    '\tassertPullRequest(value.pullRequest);\n\tassertPrHealth(value.prHealth);\n\tassertPendingAction(value.pendingAction);\n',
)
insert_before(
    "src/workflow/job-store.ts",
    '\tif (value.mergeAuthorization !== undefined) {\n',
    '\tif (value.prHealth !== undefined) {\n\t\tif (!isRecord(value.prHealth) || !isRecord(value.pullRequest)) throw new Error("PR health receipt requires a pull request receipt");\n\t\tif (value.prHealth.number !== value.pullRequest.number || value.prHealth.url !== value.pullRequest.url || value.prHealth.headSha !== value.pullRequest.headSha)\n\t\t\tthrow new Error("PR health receipt does not match pull request receipt");\n\t}\n',
)
insert_before(
    "src/workflow/job-store.ts",
    '\tif (value.mergeReceipt !== undefined) {\n',
    '\tif (value.mergeAuthorization !== undefined) {\n\t\tif (!isRecord(value.prHealth) || (value.prHealth.status !== "PASS" && value.prHealth.status !== "NONE"))\n\t\t\tthrow new Error("merge authorization requires merge-eligible PR health");\n\t}\n',
)

# driver: health check before authorization.
replace_once(
    "src/workflow/driver.ts",
    '\trunWriterRemediation(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;\n\trequestMergeAuthorization(jobId: string): WorkflowJob;\n',
    '\trunWriterRemediation(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;\n\trunPrHealthGate(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;\n\trequestMergeAuthorization(jobId: string): WorkflowJob;\n',
)
replace_once(
    "src/workflow/driver.ts",
    '\t\t\t\tcase "READY_FOR_MERGE_AUTHORIZATION":\n\t\t\t\t\tif (before.lastEvent?.type === "MERGE_AUTHORIZATION_REJECTED") return;\n\t\t\t\t\tafter = this.engine.requestMergeAuthorization(jobId);\n\t\t\t\t\tbreak;\n',
    '\t\t\t\tcase "READY_FOR_MERGE_AUTHORIZATION":\n\t\t\t\t\tif (before.lastEvent?.type === "MERGE_AUTHORIZATION_REJECTED") return;\n\t\t\t\t\tif (\n\t\t\t\t\t\tbefore.pullRequest !== undefined &&\n\t\t\t\t\t\tbefore.prHealth?.headSha === before.pullRequest.headSha &&\n\t\t\t\t\t\t(before.prHealth.status === "PASS" || before.prHealth.status === "NONE")\n\t\t\t\t\t) {\n\t\t\t\t\t\tafter = this.engine.requestMergeAuthorization(jobId);\n\t\t\t\t\t} else {\n\t\t\t\t\t\tafter = await this.engine.runPrHealthGate(jobId, signal);\n\t\t\t\t\t}\n\t\t\t\t\tbreak;\n',
)

# Tool status and manual request_merge.
replace_once(
    "src/tools/internet-workflow.ts",
    '\t\t...(job.mergeAuthorization === undefined ? {} : { authorizedHeadSha: job.mergeAuthorization.headSha }),\n',
    '\t\t...(job.prHealth === undefined\n\t\t\t? {}\n\t\t\t: { prHealthStatus: job.prHealth.status, prHealthHeadSha: job.prHealth.headSha, prHealthCheckedAt: job.prHealth.checkedAt }),\n\t\t...(job.mergeAuthorization === undefined ? {} : { authorizedHeadSha: job.mergeAuthorization.headSha }),\n',
)
replace_once(
    "src/tools/internet-workflow.ts",
    '\t\t\t\t\tprHeadSha: { type: "string" },\n',
    '\t\t\t\t\tprHeadSha: { type: "string" },\n\t\t\t\t\tprHealthStatus: { type: "string" },\n\t\t\t\t\tprHealthHeadSha: { type: "string" },\n\t\t\t\t\tprHealthCheckedAt: { type: "string" },\n',
)
replace_once(
    "src/tools/internet-workflow.ts",
    '\t\t\t\telse if (operation === "request_merge") job = engine.requestMergeAuthorization(args.jobId);\n',
    '\t\t\t\telse if (operation === "request_merge") {\n\t\t\t\t\tconst current = engine.status(args.jobId);\n\t\t\t\t\tconst checked =\n\t\t\t\t\t\tcurrent.pullRequest !== undefined &&\n\t\t\t\t\t\tcurrent.prHealth?.headSha === current.pullRequest.headSha &&\n\t\t\t\t\t\t(current.prHealth.status === "PASS" || current.prHealth.status === "NONE")\n\t\t\t\t\t\t\t? current\n\t\t\t\t\t\t\t: await engine.runPrHealthGate(args.jobId, exec.signal);\n\t\t\t\t\tjob = checked.state === "READY_FOR_MERGE_AUTHORIZATION" ? engine.requestMergeAuthorization(args.jobId) : checked;\n\t\t\t\t}\n',
)

# Existing merge-gate tests: ready fixtures now carry exact-head PASS, merge mocks answer health recheck first.
replace_once(
    "test/workflow-merge-gate.test.ts",
    '\t\tpullRequest: {\n\t\t\trepository: "example/repo",\n\t\t\tnumber: 7,\n\t\t\turl: "https://github.com/example/repo/pull/7",\n\t\t\tbase: "main",\n\t\t\thead: `internet-workflow/${jobId}`,\n\t\t\theadSha,\n\t\t},\n\t\treviewCycle: 1,\n',
    '\t\tpullRequest: {\n\t\t\trepository: "example/repo",\n\t\t\tnumber: 7,\n\t\t\turl: "https://github.com/example/repo/pull/7",\n\t\t\tbase: "main",\n\t\t\thead: `internet-workflow/${jobId}`,\n\t\t\theadSha,\n\t\t},\n\t\tprHealth: {\n\t\t\trepository: "example/repo",\n\t\t\tnumber: 7,\n\t\t\turl: "https://github.com/example/repo/pull/7",\n\t\t\theadSha,\n\t\t\tstatus: "PASS",\n\t\t\tsummary: "all required checks passed",\n\t\t\tcheckedAt: timestamp,\n\t\t},\n\t\treviewCycle: 1,\n',
)
replace_once(
    "test/workflow-merge-gate.test.ts",
    '\t\t\tasync runControl(request) {\n\t\t\t\texpect(request.control.kind).toBe("MERGE_AUTHORIZED");\n\t\t\t\texpect(request.control.expectedHeadSha).toBe(headSha);\n\t\t\t\treturn {\n',
    '\t\t\tasync runControl(request) {\n\t\t\t\tif (request.control.kind === "CHECK_PR_HEALTH") {\n\t\t\t\t\treturn { status: "PR_HEALTH", repository: "example/repo", number: 7, url: "https://github.com/example/repo/pull/7", headSha, health: "PASS", summary: "all required checks passed" };\n\t\t\t\t}\n\t\t\t\texpect(request.control.kind).toBe("MERGE_AUTHORIZED");\n\t\t\t\texpect(request.control.expectedHeadSha).toBe(headSha);\n\t\t\t\treturn {\n',
)
replace_once(
    "test/workflow-merge-gate.test.ts",
    '\t\t\tasync runControl() {\n\t\t\t\treturn {\n\t\t\t\t\tstatus: "MERGED",\n',
    '\t\t\tasync runControl(request) {\n\t\t\t\tif (request.control.kind === "CHECK_PR_HEALTH") {\n\t\t\t\t\treturn { status: "PR_HEALTH", repository: "example/repo", number: 7, url: "https://github.com/example/repo/pull/7", headSha, health: "PASS", summary: "all required checks passed" };\n\t\t\t\t}\n\t\t\t\treturn {\n\t\t\t\t\tstatus: "MERGED",\n',
)

# Driver fake gets a health turn before request-merge.
replace_once(
    "test/workflow-driver.test.ts",
    '\t\t\tasync runWriterRemediation() {\n\t\t\t\tcalls.push("gate");\n\t\t\t\tcurrent = advance(current, "READY_FOR_MERGE_AUTHORIZATION", "REVIEW_GATE_PASSED");\n\t\t\t\treturn current;\n\t\t\t},\n\t\t\trequestMergeAuthorization() {\n',
    '\t\t\tasync runWriterRemediation() {\n\t\t\t\tcalls.push("gate");\n\t\t\t\tcurrent = advance(current, "READY_FOR_MERGE_AUTHORIZATION", "REVIEW_GATE_PASSED");\n\t\t\t\treturn current;\n\t\t\t},\n\t\t\tasync runPrHealthGate() {\n\t\t\t\tcalls.push("health");\n\t\t\t\tcurrent = { ...advance(current, "READY_FOR_MERGE_AUTHORIZATION", "PR_HEALTH_PASSED"), prHealth: { repository: "example/repo", number: 1, url: "https://github.com/example/repo/pull/1", headSha: sha, status: "PASS", summary: "passed", checkedAt: new Date().toISOString() }, pullRequest: { repository: "example/repo", number: 1, url: "https://github.com/example/repo/pull/1", base: "main", head: "branch", headSha: sha } };\n\t\t\t\treturn current;\n\t\t\t},\n\t\t\trequestMergeAuthorization() {\n',
)
replace_once(
    "test/workflow-driver.test.ts",
    'expect(calls).toEqual(["research", "writer", "review", "gate", "request-merge"]);\n',
    'expect(calls).toEqual(["research", "writer", "review", "gate", "health", "request-merge"]);\n',
)
replace_once(
    "test/workflow-driver.test.ts",
    '\t\t\tasync runWriterRemediation() {\n\t\t\t\treturn current;\n\t\t\t},\n\t\t\trequestMergeAuthorization() {\n',
    '\t\t\tasync runWriterRemediation() {\n\t\t\t\treturn current;\n\t\t\t},\n\t\t\tasync runPrHealthGate() {\n\t\t\t\treturn current;\n\t\t\t},\n\t\t\trequestMergeAuthorization() {\n',
)

# New focused P12 tests.
Path("test/workflow-pr-health.test.ts").write_text(r'''import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowJob, WorkflowTeamRun } from "#internet/workflow/types";
import { parseWorkflowWriterResult, type WorkflowWriterRunner } from "#internet/workflow/writer-runner";

const jobId = "0123456789abcdef0123456789abcdef";
const headSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const mergedSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const timestamp = "2026-09-09T00:00:00.000Z";

function readyJob(): WorkflowJob {
	const pending = (lane: "A" | "B", phase: "research" | "review"): WorkflowTeamRun => ({ lane, status: "pending", attempts: 0, sessionId: `local:workflow:${jobId}:${phase}:${lane}` });
	const review = (lane: "A" | "B"): WorkflowTeamRun => ({ lane, status: "completed", attempts: 1, sessionId: `local:workflow:${jobId}:review:${lane}`, result: { finalAnswer: `review-${lane}`, finalAccountId: "chatgpt-thinker", finalProvider: "chatgpt-web", completedAt: timestamp, reviewedHeadSha: headSha, reviewVerdict: "PASS" } });
	return {
		schema: "@tsuuanmi/internet-workflow-job", version: 1, revision: 1, jobId, ownerSessionId: "local", objective: "health gate", repository: "https://github.com/example/repo", baseRevision: "0123456789abcdef0123456789abcdef01234567", state: "READY_FOR_MERGE_AUTHORIZATION",
		teamRuns: { research: [pending("A", "research"), pending("B", "research")], review: [review("A"), review("B")] },
		accountRouting: { thinkerAccounts: ["chatgpt-thinker", "gemini-thinker"], writerAccount: "chatgpt-writer", synthesizerAccount: "chatgpt-thinker" }, handoffReceipts: [], writerConversation: { sessionId: `local:workflow:${jobId}:writer`, accountId: "chatgpt-writer" },
		pullRequest: { repository: "example/repo", number: 7, url: "https://github.com/example/repo/pull/7", base: "main", head: `internet-workflow/${jobId}`, headSha }, reviewCycle: 1, createdAt: timestamp, updatedAt: timestamp,
	};
}

function setup(writer: WorkflowWriterRunner): WorkflowEngine {
	const jobs = new WorkflowJobStore(mkdtempSync(join(tmpdir(), "internet-pr-health-")));
	jobs.create(readyJob());
	return new WorkflowEngine(jobs, undefined, undefined, undefined, writer);
}

function health(status: "PASS" | "FAIL" | "PENDING" | "NONE" | "UNKNOWN", sha = headSha) {
	return { status: "PR_HEALTH" as const, repository: "example/repo", number: 7, url: "https://github.com/example/repo/pull/7", headSha: sha, health: status, summary: `health=${status}` };
}

describe("workflow exact-head PR health gate", () => {
	it("parses strict PR_HEALTH writer results", () => {
		expect(parseWorkflowWriterResult(JSON.stringify(health("PASS")))).toMatchObject({ status: "PR_HEALTH", health: "PASS", headSha });
		expect(() => parseWorkflowWriterResult(JSON.stringify({ ...health("PASS"), health: "MAYBE" }))).toThrow(/health status/u);
	});

	it.each(["PASS", "NONE"] as const)("allows merge authorization after exact-head %s", async (status) => {
		const engine = setup({ async deliverExact() {}, async runControl() { return health(status); } });
		const checked = await engine.runPrHealthGate(jobId);
		expect(checked.state).toBe("READY_FOR_MERGE_AUTHORIZATION");
		expect(checked.prHealth?.status).toBe(status);
		const awaiting = engine.requestMergeAuthorization(jobId);
		expect(awaiting.state).toBe("AWAITING_MERGE_AUTHORIZATION");
		expect(awaiting.pendingAction?.message).toContain(`ci=${status.toLowerCase()}`);
	});

	it.each(["FAIL", "PENDING", "UNKNOWN"] as const)("blocks merge authorization for %s", async (status) => {
		const engine = setup({ async deliverExact() {}, async runControl() { return health(status); } });
		const blocked = await engine.runPrHealthGate(jobId);
		expect(blocked.state).toBe("BLOCKED");
		expect(blocked.pendingAction).toMatchObject({ kind: "PR_HEALTH_REQUIRED", resumeState: "READY_FOR_MERGE_AUTHORIZATION", expectedHeadSha: headSha });
		expect(blocked.prHealth?.status).toBe(status);
	});

	it("fails closed on a stale health head", async () => {
		const engine = setup({ async deliverExact() {}, async runControl() { return health("PASS", mergedSha); } });
		const blocked = await engine.runPrHealthGate(jobId);
		expect(blocked.state).toBe("BLOCKED");
		expect(blocked.mergeAuthorization).toBeUndefined();
	});

	it("re-checks health immediately before merge and invalidates authorization when it becomes pending", async () => {
		let checks = 0;
		const writer: WorkflowWriterRunner = {
			async deliverExact() {},
			async runControl(request) {
				if (request.control.kind === "CHECK_PR_HEALTH") return health(checks++ === 0 ? "PASS" : "PENDING");
				return { status: "MERGED", repository: "example/repo", number: 7, url: "https://github.com/example/repo/pull/7", headSha, mergedSha };
			},
		};
		const engine = setup(writer);
		await engine.runPrHealthGate(jobId);
		engine.requestMergeAuthorization(jobId);
		engine.approve({ jobId, expectedHeadSha: headSha });
		const blocked = await engine.runWriterMerge(jobId);
		expect(blocked.state).toBe("BLOCKED");
		expect(blocked.mergeAuthorization).toBeUndefined();
		expect(blocked.prHealth?.status).toBe("PENDING");
	});
});
''')

# TODO P12 status.
replace_once(
    "docs/TODO.md",
    '## P12 — Exact-head CI / PR health gate\n\n**ROI:** very high  \n**Risk:** medium  \n**Dependency:** P11 automatic driver.\n\n### 50. Persist exact-head CI/check receipt\n',
    '## P12 — Exact-head CI / PR health gate\n\n**Status:** implemented with exact-head durable PR-health receipts, merge-authorization gating, and immediate pre-merge revalidation.\n\n**ROI:** very high  \n**Risk:** medium  \n**Dependency:** P11 automatic driver.\n\n### 50. ✅ Persist exact-head CI/check receipt\n',
)
replace_once("docs/TODO.md", '### 51. Gate merge authorization on current PR health\n', '### 51. ✅ Gate merge authorization on current PR health\n')
replace_once("docs/TODO.md", '### 52. Re-check health immediately before merge\n', '### 52. ✅ Re-check health immediately before merge\n')

print("P12 changes applied")
