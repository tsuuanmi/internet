from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing expected block in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, count))

# types.ts
replace(
    'src/workflow/types.ts',
    '''export interface WorkflowMergeAuthorization {\n''',
    '''export const WORKFLOW_CI_STATUSES = ["PASS", "FAIL", "PENDING", "NONE", "UNKNOWN"] as const;\nexport type WorkflowCiStatus = (typeof WORKFLOW_CI_STATUSES)[number];\n\nexport interface WorkflowCiReceipt {\n\treadonly repository: string;\n\treadonly number: number;\n\treadonly url: string;\n\treadonly headSha: string;\n\treadonly status: WorkflowCiStatus;\n\treadonly checkedAt: string;\n}\n\nexport interface WorkflowMergeAuthorization {\n''',
)
replace(
    'src/workflow/types.ts',
    '''\treadonly pullRequest?: WorkflowPullRequestReceipt;\n\treadonly mergeAuthorization?: WorkflowMergeAuthorization;\n''',
    '''\treadonly pullRequest?: WorkflowPullRequestReceipt;\n\treadonly ciReceipt?: WorkflowCiReceipt;\n\treadonly mergeAuthorization?: WorkflowMergeAuthorization;\n''',
)
replace(
    'src/workflow/types.ts',
    '''\t\t| "ACCOUNT_REAUTH_REQUIRED"\n\t\t| "RETRY_REQUIRED";\n''',
    '''\t\t| "ACCOUNT_REAUTH_REQUIRED"\n\t\t| "CI_HEALTH_FAILED"\n\t\t| "CI_HEALTH_UNKNOWN"\n\t\t| "RETRY_REQUIRED";\n''',
)

# control.ts
replace(
    'src/workflow/control.ts',
    '''export const WORKFLOW_CONTROL_KINDS = ["START_IMPLEMENTATION", "APPLY_REVIEWS", "RETRY", "MERGE_AUTHORIZED"] as const;\n''',
    '''export const WORKFLOW_CONTROL_KINDS = [\n\t"START_IMPLEMENTATION",\n\t"APPLY_REVIEWS",\n\t"RETRY",\n\t"CHECK_PR_HEALTH",\n\t"MERGE_AUTHORIZED",\n] as const;\n''',
)

# writer-runner imports/result/control prompt/parser
replace(
    'src/workflow/writer-runner.ts',
    '''import type { WorkflowJob, WorkflowPullRequestReceipt } from "#internet/workflow/types";\n''',
    '''import type { WorkflowCiStatus, WorkflowJob, WorkflowPullRequestReceipt } from "#internet/workflow/types";\n''',
)
replace(
    'src/workflow/writer-runner.ts',
    '''export type WorkflowWriterResult =\n\t| { readonly status: "PR_OPEN"; readonly pullRequest: WorkflowPullRequestReceipt }\n''',
    '''export type WorkflowWriterResult =\n\t| { readonly status: "PR_OPEN"; readonly pullRequest: WorkflowPullRequestReceipt }\n\t| {\n\t\t\treadonly status: "PR_HEALTH";\n\t\t\treadonly repository: string;\n\t\t\treadonly number: number;\n\t\t\treadonly url: string;\n\t\t\treadonly headSha: string;\n\t\t\treadonly health: WorkflowCiStatus;\n\t  }\n''',
)
replace(
    'src/workflow/writer-runner.ts',
    '''\tif (control.kind === "MERGE_AUTHORIZED") {\n''',
    '''\tif (control.kind === "CHECK_PR_HEALTH") {\n\t\tif (pullRequest === undefined || control.expectedHeadSha === undefined) {\n\t\t\tthrow new Error("CHECK_PR_HEALTH requires a persisted PR and expected head SHA");\n\t\t}\n\t\treturn [\n\t\t\t"You are the workflow writer/executor. This is a trusted read-only workflow control message.",\n\t\t\t`Control: ${control.kind}`,\n\t\t\t`Workflow job: ${job.jobId}`,\n\t\t\t`Target repository: ${job.repository}`,\n\t\t\t`Pull request: ${pullRequest.url}`,\n\t\t\t`PR number: ${pullRequest.number}`,\n\t\t\t`Required exact head SHA: ${control.expectedHeadSha}`,\n\t\t\t"",\n\t\t\t"Read the actual current pull request and GitHub check/status information. Do not modify files, branches, PR metadata, checks, settings, or merge state.",\n\t\t\t"First verify repository, PR number, and exact current head SHA. If the live head differs, return BLOCKED.",\n\t\t\t"Classify required merge health deterministically as: PASS when configured required checks/statuses are all successful; FAIL when any required check/status is failed/cancelled/timed out; PENDING when required checks/statuses are still queued/in progress; NONE only when the repository/PR truly has no required checks/statuses configured; UNKNOWN when you cannot determine required-check policy or health reliably.",\n\t\t\t"Do not infer PASS from a green-looking page if required-check policy cannot be established. Do not treat NONE as PASS unless absence of required checks is actually established.",\n\t\t\t"",\n\t\t\t"Return exactly one JSON object and no markdown or surrounding prose.",\n\t\t\t'On success: {"status":"PR_HEALTH","repository":"owner/repo or repository URL","number":123,"url":"https://github.com/owner/repo/pull/123","headSha":"40-lowercase-hex","health":"PASS|FAIL|PENDING|NONE|UNKNOWN"}',\n\t\t\t'On authority conflict: {"status":"BLOCKED","message":"concise reason"}',\n\t\t].join("\\n");\n\t}\n\tif (control.kind === "MERGE_AUTHORIZED") {\n''',
)
replace(
    'src/workflow/writer-runner.ts',
    '''\tif (value.status === "MERGED") {\n''',
    '''\tif (value.status === "PR_HEALTH") {\n\t\tif (typeof value.repository !== "string" || value.repository.trim() === "")\n\t\t\tthrow new Error("writer health repository is required");\n\t\tif (typeof value.number !== "number" || !Number.isSafeInteger(value.number) || value.number < 1)\n\t\t\tthrow new Error("writer health PR number is invalid");\n\t\tif (typeof value.url !== "string" || !/^https:\\/\\/github\\.com\\//u.test(value.url))\n\t\t\tthrow new Error("writer health PR URL is invalid");\n\t\tif (typeof value.headSha !== "string" || !/^[0-9a-f]{40}$/u.test(value.headSha))\n\t\t\tthrow new Error("writer health head SHA is invalid");\n\t\tif (!["PASS", "FAIL", "PENDING", "NONE", "UNKNOWN"].includes(String(value.health)))\n\t\t\tthrow new Error("writer health status is invalid");\n\t\treturn {\n\t\t\tstatus: "PR_HEALTH",\n\t\t\trepository: value.repository,\n\t\t\tnumber: value.number,\n\t\t\turl: value.url,\n\t\t\theadSha: value.headSha,\n\t\t\thealth: value.health as WorkflowCiStatus,\n\t\t};\n\t}\n\tif (value.status === "MERGED") {\n''',
)

# job-store validation
replace(
    'src/workflow/job-store.ts',
    '''function assertPendingAction(value: unknown): void {\n''',
    '''function assertCiReceipt(value: unknown): void {\n\tif (value === undefined) return;\n\tif (!isRecord(value)) throw new Error("invalid CI receipt");\n\tif (typeof value.repository !== "string" || value.repository.trim() === "") throw new Error("invalid CI repository");\n\tif (!isPositiveInteger(value.number)) throw new Error("invalid CI PR number");\n\tif (typeof value.url !== "string" || !/^https:\\/\\/github\\.com\\//u.test(value.url)) throw new Error("invalid CI PR URL");\n\tif (!isFullSha(value.headSha)) throw new Error("invalid CI head SHA");\n\tif (!["PASS", "FAIL", "PENDING", "NONE", "UNKNOWN"].includes(String(value.status))) throw new Error("invalid CI status");\n\tif (!isTimestamp(value.checkedAt)) throw new Error("invalid CI checked timestamp");\n}\n\nfunction assertPendingAction(value: unknown): void {\n''',
)
replace(
    'src/workflow/job-store.ts',
    '''\t\t\t"ACCOUNT_REAUTH_REQUIRED",\n\t\t\t"RETRY_REQUIRED",\n''',
    '''\t\t\t"ACCOUNT_REAUTH_REQUIRED",\n\t\t\t"CI_HEALTH_FAILED",\n\t\t\t"CI_HEALTH_UNKNOWN",\n\t\t\t"RETRY_REQUIRED",\n''',
)
replace(
    'src/workflow/job-store.ts',
    '''\tassertPullRequest(value.pullRequest);\n\tassertPendingAction(value.pendingAction);\n''',
    '''\tassertPullRequest(value.pullRequest);\n\tassertCiReceipt(value.ciReceipt);\n\tassertPendingAction(value.pendingAction);\n''',
)
replace(
    'src/workflow/job-store.ts',
    '''\tif (value.mergeAuthorization !== undefined) {\n''',
    '''\tif (value.ciReceipt !== undefined) {\n\t\tconst ci = value.ciReceipt;\n\t\tif (!isRecord(ci) || !isRecord(value.pullRequest)) throw new Error("CI receipt requires a pull request receipt");\n\t\tif (ci.number !== value.pullRequest.number || ci.url !== value.pullRequest.url || ci.headSha !== value.pullRequest.headSha)\n\t\t\tthrow new Error("CI receipt does not match pull request receipt");\n\t}\n\tif (value.mergeAuthorization !== undefined) {\n''',
)

# engine imports
replace(
    'src/workflow/engine.ts',
    '''\ttype WorkflowDecisionInput,\n\ttype WorkflowHandoffReceipt,\n''',
    '''\ttype WorkflowCiReceipt,\n\ttype WorkflowDecisionInput,\n\ttype WorkflowHandoffReceipt,\n''',
)

# invalidate CI receipt on remediation head change
replace(
    'src/workflow/engine.ts',
    '''\t\t\tpullRequest: result.pullRequest,\n\t\t\tteamRuns: {\n''',
    '''\t\t\tpullRequest: result.pullRequest,\n\t\t\tciReceipt: undefined,\n\t\t\tteamRuns: {\n''',
)

# add helpers/method before requestMergeAuthorization
needle = '''\t/** Move a fully reviewed PR into the explicit user-authorization gate. */\n\trequestMergeAuthorization(jobId: string): WorkflowJob {\n'''
insert = '''\tprivate ciReceiptMatches(job: WorkflowJob, receipt: WorkflowCiReceipt | undefined): receipt is WorkflowCiReceipt {\n\t\tconst pr = job.pullRequest;\n\t\treturn (\n\t\t\tpr !== undefined &&\n\t\t\treceipt !== undefined &&\n\t\t\tnormalizeGitHubRepository(receipt.repository) === normalizeGitHubRepository(pr.repository) &&\n\t\t\treceipt.number === pr.number &&\n\t\t\treceipt.url === pr.url &&\n\t\t\treceipt.headSha === pr.headSha\n\t\t);\n\t}\n\n\tasync runPrHealthCheck(jobId: string, signal?: AbortSignal): Promise<WorkflowJob> {\n\t\tif (this.writer === undefined) throw new WorkflowEngineError("workflow writer runner is not configured");\n\t\tconst job = this.status(jobId);\n\t\tif (job.state !== "READY_FOR_MERGE_AUTHORIZATION" && job.state !== "MERGING")\n\t\t\tthrow new WorkflowEngineError(`workflow job ${jobId} cannot check PR health from ${job.state}`);\n\t\tif (job.pullRequest === undefined) throw new WorkflowEngineError("PR health check requires a persisted pull request");\n\t\tconst pr = job.pullRequest;\n\t\tconst control = createWorkflowControlMessage("CHECK_PR_HEALTH", jobId, pr.headSha);\n\t\tconst result = await this.writer.runControl({\n\t\t\tsessionId: job.writerConversation.sessionId,\n\t\t\tjob,\n\t\t\tcontrol,\n\t\t\tsignal,\n\t\t});\n\t\tif (result.status === "UNKNOWN_CONFIRMATION")\n\t\t\treturn this.writerBlocked(jobId, result.message, "READY_FOR_MERGE_AUTHORIZATION");\n\t\tif (result.status === "BLOCKED")\n\t\t\treturn this.writerBlocked(jobId, result.message, "READY_FOR_MERGE_AUTHORIZATION");\n\t\tif (result.status !== "PR_HEALTH") throw new WorkflowEngineError("writer did not return PR health during health-check phase");\n\t\tif (\n\t\t\tnormalizeGitHubRepository(result.repository) !== normalizeGitHubRepository(pr.repository) ||\n\t\t\tresult.number !== pr.number ||\n\t\t\tresult.url !== pr.url ||\n\t\t\tresult.headSha !== pr.headSha\n\t\t) return this.writerBlocked(jobId, "PR health result does not match the authoritative PR/head", "READY_FOR_MERGE_AUTHORIZATION");\n\t\tconst ciReceipt: WorkflowCiReceipt = {\n\t\t\trepository: result.repository, number: result.number, url: result.url, headSha: result.headSha, status: result.health, checkedAt: now(),\n\t\t};\n\t\tif (result.health === "PASS" || result.health === "NONE") {\n\t\t\treturn this.update(jobId, (current) => ({\n\t\t\t\t...current, revision: current.revision + 1, ciReceipt, pendingAction: undefined, updatedAt: now(),\n\t\t\t\tlastEvent: { type: "CI_HEALTH_VERIFIED", class: "PROGRESS", at: now(), message: `ci=${result.health} head=${result.headSha}` },\n\t\t\t}));\n\t\t}\n\t\tif (result.health === "PENDING") {\n\t\t\tconst message = `Required PR checks are still pending for exact head ${result.headSha}`;\n\t\t\treturn this.update(jobId, (current) => ({\n\t\t\t\t...withState(current, "FAILED_RETRYABLE"), ciReceipt, mergeAuthorization: undefined,\n\t\t\t\tpendingAction: { kind: "RETRY_REQUIRED", message, expectedHeadSha: result.headSha, resumeState: "READY_FOR_MERGE_AUTHORIZATION" },\n\t\t\t\tlastEvent: { type: "CI_HEALTH_PENDING", class: "ACTION_REQUIRED", at: now(), message },\n\t\t\t}));\n\t\t}\n\t\tconst kind = result.health === "FAIL" ? "CI_HEALTH_FAILED" as const : "CI_HEALTH_UNKNOWN" as const;\n\t\tconst message = result.health === "FAIL"\n\t\t\t? `Required PR checks failed for exact head ${result.headSha}`\n\t\t\t: `Required PR check policy/health is unknown for exact head ${result.headSha}`;\n\t\treturn this.update(jobId, (current) => ({\n\t\t\t...withState(current, "BLOCKED"), ciReceipt, mergeAuthorization: undefined,\n\t\t\tpendingAction: { kind, message, expectedHeadSha: result.headSha, resumeState: "READY_FOR_MERGE_AUTHORIZATION" },\n\t\t\tlastEvent: { type: kind, class: "ACTION_REQUIRED", at: now(), message },\n\t\t}));\n\t}\n\n\t/** Move a fully reviewed, exact-head healthy PR into the explicit user-authorization gate. */\n\trequestMergeAuthorization(jobId: string): WorkflowJob {\n'''
replace('src/workflow/engine.ts', needle, insert)

# enforce receipt in request merge and message
replace(
    'src/workflow/engine.ts',
    '''\t\tconst pr = current.pullRequest;\n\t\treturn this.update(jobId, (state) => ({\n''',
    '''\t\tconst pr = current.pullRequest;\n\t\tif (!this.ciReceiptMatches(current, current.ciReceipt) || !["PASS", "NONE"].includes(current.ciReceipt.status)) {\n\t\t\tthrow new WorkflowEngineError("merge authorization requires an acceptable CI receipt for the current exact PR head");\n\t\t}\n\t\tconst ci = current.ciReceipt.status;\n\t\treturn this.update(jobId, (state) => ({\n''',
)
replace(
    'src/workflow/engine.ts',
    '''message: `Merge authorization required: pr=${pr.url} reviews=PASS/PASS ci=unknown expected_head=${pr.headSha}`,\n''',
    '''message: `Merge authorization required: pr=${pr.url} reviews=PASS/PASS ci=${ci} expected_head=${pr.headSha}`,\n''',
)
replace(
    'src/workflow/engine.ts',
    '''message: `pr=${pr.url} reviews=PASS/PASS ci=unknown expected_head=${pr.headSha}`,\n''',
    '''message: `pr=${pr.url} reviews=PASS/PASS ci=${ci} expected_head=${pr.headSha}`,\n''',
)

# premerge health recheck in runWriterMerge before MERGE_AUTHORIZED control
replace(
    'src/workflow/engine.ts',
    '''\t\tconst control = createWorkflowControlMessage("MERGE_AUTHORIZED", jobId, authorization.headSha);\n\t\tconst result = await this.writer.runControl({\n''',
    '''\t\tconst health = await this.runPrHealthCheck(jobId, signal);\n\t\tif (health.state !== "MERGING") return health;\n\t\tif (!this.ciReceiptMatches(health, health.ciReceipt) || !["PASS", "NONE"].includes(health.ciReceipt.status))\n\t\t\treturn this.writerBlocked(jobId, "PR health is no longer merge-eligible", "READY_FOR_MERGE_AUTHORIZATION");\n\t\tconst control = createWorkflowControlMessage("MERGE_AUTHORIZED", jobId, authorization.headSha);\n\t\tconst result = await this.writer.runControl({\n''',
)

# driver interface + READY logic
replace(
    'src/workflow/driver.ts',
    '''\trunWriterRemediation(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;\n\trequestMergeAuthorization(jobId: string): WorkflowJob;\n''',
    '''\trunWriterRemediation(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;\n\trunPrHealthCheck(jobId: string, signal?: AbortSignal): Promise<WorkflowJob>;\n\trequestMergeAuthorization(jobId: string): WorkflowJob;\n''',
)
replace(
    'src/workflow/driver.ts',
    '''\t\t\t\tcase "READY_FOR_MERGE_AUTHORIZATION":\n\t\t\t\t\tif (before.lastEvent?.type === "MERGE_AUTHORIZATION_REJECTED") return;\n\t\t\t\t\tafter = this.engine.requestMergeAuthorization(jobId);\n\t\t\t\t\tbreak;\n''',
    '''\t\t\t\tcase "READY_FOR_MERGE_AUTHORIZATION":\n\t\t\t\t\tif (before.lastEvent?.type === "MERGE_AUTHORIZATION_REJECTED") return;\n\t\t\t\t\tif (\n\t\t\t\t\t\tbefore.pullRequest !== undefined &&\n\t\t\t\t\t\tbefore.ciReceipt?.headSha === before.pullRequest.headSha &&\n\t\t\t\t\t\t(before.ciReceipt.status === "PASS" || before.ciReceipt.status === "NONE")\n\t\t\t\t\t) after = this.engine.requestMergeAuthorization(jobId);\n\t\t\t\t\telse after = await this.engine.runPrHealthCheck(jobId, signal);\n\t\t\t\t\tbreak;\n''',
)

# tool request_merge async health, status fields
replace(
    'src/tools/internet-workflow.ts',
    '''\t\t...(job.mergeAuthorization === undefined ? {} : { authorizedHeadSha: job.mergeAuthorization.headSha }),\n''',
    '''\t\t...(job.ciReceipt === undefined ? {} : { ciStatus: job.ciReceipt.status, ciHeadSha: job.ciReceipt.headSha, ciCheckedAt: job.ciReceipt.checkedAt }),\n\t\t...(job.mergeAuthorization === undefined ? {} : { authorizedHeadSha: job.mergeAuthorization.headSha }),\n''',
)
replace(
    'src/tools/internet-workflow.ts',
    '''\t\t\t\t\tauthorizedHeadSha: { type: "string" },\n''',
    '''\t\t\t\t\tciStatus: { type: "string" },\n\t\t\t\t\tciHeadSha: { type: "string" },\n\t\t\t\t\tciCheckedAt: { type: "string" },\n\t\t\t\t\tauthorizedHeadSha: { type: "string" },\n''',
)
replace(
    'src/tools/internet-workflow.ts',
    '''\t\t\t\telse if (operation === "request_merge") job = engine.requestMergeAuthorization(args.jobId);\n''',
    '''\t\t\t\telse if (operation === "request_merge") {\n\t\t\t\t\tjob = await engine.runPrHealthCheck(args.jobId, exec.signal);\n\t\t\t\t\tif (job.state === "READY_FOR_MERGE_AUTHORIZATION") job = engine.requestMergeAuthorization(args.jobId);\n\t\t\t\t}\n''',
)

# tests: extend mock driver engine methods
p = Path('test/workflow-driver.test.ts')
text = p.read_text()
text = text.replace('''\t\t\trequestMergeAuthorization() {\n\t\t\t\tcalls.push("request-merge");\n''', '''\t\t\tasync runPrHealthCheck() {\n\t\t\t\tcalls.push("health");\n\t\t\t\tcurrent = { ...advance(current, "READY_FOR_MERGE_AUTHORIZATION"), ciReceipt: { repository: current.repository, number: 1, url: "https://github.com/example/repo/pull/1", headSha: sha, status: "PASS", checkedAt: new Date().toISOString() }, pullRequest: { repository: current.repository, number: 1, url: "https://github.com/example/repo/pull/1", base: "main", head: "branch", headSha: sha } };\n\t\t\t\treturn current;\n\t\t\t},\n\t\t\trequestMergeAuthorization() {\n\t\t\t\tcalls.push("request-merge");\n''', 1)
text = text.replace('expect(calls).toEqual(["research", "writer", "review", "gate", "request-merge"]);', 'expect(calls).toEqual(["research", "writer", "review", "gate", "health", "request-merge"]);', 1)
text = text.replace('''\t\t\tasync runWriterImplementation() {\n\t\t\t\treturn current;\n''', '''\t\t\tasync runWriterImplementation() {\n\t\t\t\treturn current;\n''', 1)
# Add runPrHealthCheck to cancellation mock where full interface literal is used
anchor = '''\t\t\tasync runWriterRemediation() {\n\t\t\t\treturn current;\n\t\t\t},\n\t\t\trequestMergeAuthorization() {\n'''
text = text.replace(anchor, '''\t\t\tasync runWriterRemediation() {\n\t\t\t\treturn current;\n\t\t\t},\n\t\t\tasync runPrHealthCheck() {\n\t\t\t\treturn current;\n\t\t\t},\n\t\t\trequestMergeAuthorization() {\n''')
p.write_text(text)

# New focused P12 tests
Path('test/workflow-ci-health.test.ts').write_text(r'''import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowWriterRunner, WorkflowWriterResult } from "#internet/workflow/writer-runner";

const roots: string[] = [];
const sha = "0123456789abcdef0123456789abcdef01234567";

function root() { const value = mkdtempSync(join(tmpdir(), "internet-ci-")); roots.push(value); return value; }
afterEach(async () => { await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true }))); });

function ready(writerResult: WorkflowWriterResult) {
  const jobs = new WorkflowJobStore(root());
  const writer: WorkflowWriterRunner = { async deliverExact() {}, async runControl() { return writerResult; } };
  const engine = new WorkflowEngine(jobs, undefined, undefined, undefined, writer);
  const created = engine.start({ objective: "x", repository: "https://github.com/example/repo", baseRevision: sha, ownerSessionId: "agent" });
  jobs.update(created.jobId, (job) => ({ ...job, revision: job.revision + 1, state: "READY_FOR_MERGE_AUTHORIZATION", pullRequest: { repository: job.repository, number: 7, url: "https://github.com/example/repo/pull/7", base: "main", head: "internet-workflow/x", headSha: sha }, teamRuns: { ...job.teamRuns, review: job.teamRuns.review.map((run) => ({ ...run, status: "completed", result: { finalAnswer: "{}", finalAccountId: "chatgpt-thinker", finalProvider: "chatgpt-web", completedAt: new Date().toISOString(), reviewedHeadSha: sha, reviewVerdict: "PASS" } })) as never }, updatedAt: new Date().toISOString() }));
  return { engine, jobId: created.jobId };
}

describe("exact-head PR health gate", () => {
  it("persists PASS and allows merge authorization", async () => {
    const { engine, jobId } = ready({ status: "PR_HEALTH", repository: "https://github.com/example/repo", number: 7, url: "https://github.com/example/repo/pull/7", headSha: sha, health: "PASS" });
    const checked = await engine.runPrHealthCheck(jobId);
    expect(checked.ciReceipt).toMatchObject({ status: "PASS", headSha: sha });
    expect(engine.requestMergeAuthorization(jobId).state).toBe("AWAITING_MERGE_AUTHORIZATION");
  });

  it("treats NONE as eligible but UNKNOWN as action-required", async () => {
    const none = ready({ status: "PR_HEALTH", repository: "https://github.com/example/repo", number: 7, url: "https://github.com/example/repo/pull/7", headSha: sha, health: "NONE" });
    await none.engine.runPrHealthCheck(none.jobId);
    expect(none.engine.requestMergeAuthorization(none.jobId).pendingAction?.message).toContain("ci=NONE");
    const unknown = ready({ status: "PR_HEALTH", repository: "https://github.com/example/repo", number: 7, url: "https://github.com/example/repo/pull/7", headSha: sha, health: "UNKNOWN" });
    const blocked = await unknown.engine.runPrHealthCheck(unknown.jobId);
    expect(blocked.state).toBe("BLOCKED");
    expect(blocked.pendingAction?.kind).toBe("CI_HEALTH_UNKNOWN");
  });

  it("keeps pending checks retryable and rejects stale-head health", async () => {
    const pending = ready({ status: "PR_HEALTH", repository: "https://github.com/example/repo", number: 7, url: "https://github.com/example/repo/pull/7", headSha: sha, health: "PENDING" });
    const wait = await pending.engine.runPrHealthCheck(pending.jobId);
    expect(wait.state).toBe("FAILED_RETRYABLE");
    expect(wait.pendingAction).toMatchObject({ kind: "RETRY_REQUIRED", resumeState: "READY_FOR_MERGE_AUTHORIZATION" });
    const stale = ready({ status: "PR_HEALTH", repository: "https://github.com/example/repo", number: 7, url: "https://github.com/example/repo/pull/7", headSha: "abcdef0123456789abcdef0123456789abcdef01", health: "PASS" });
    const blocked = await stale.engine.runPrHealthCheck(stale.jobId);
    expect(blocked.state).toBe("BLOCKED");
  });
});
''')

# TODO status/docs
p = Path('docs/TODO.md')
text = p.read_text()
text = text.replace('''## P12 — Exact-head CI / PR health gate\n\n**ROI:** very high''', '''## P12 — Exact-head CI / PR health gate\n\n**Status:** implementation in progress on `impl/p12-ci-health-gate`.\n\n**ROI:** very high''', 1)
p.write_text(text)

p = Path('docs/UPDATE.md')
text = p.read_text()
text += '''\n## P12 exact-head PR health gate\n\nThe merge path now models PR health as an authoritative exact-head receipt instead of the prior `ci=unknown` placeholder. The Website writer performs a read-only GitHub check-policy/status inspection and returns one deterministic `PASS`, `FAIL`, `PENDING`, `NONE`, or `UNKNOWN` classification bound to repository + PR + exact head SHA. `PASS` and verified `NONE` are merge-eligible; failures/unknown state stop with action-required context; pending checks are retryable. The writer re-checks the exact authorized head immediately before merge, so an old green receipt cannot authorize a changed or newly unhealthy head.\n'''
p.write_text(text)
