from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"expected text not found in {path}: {old[:140]!r}")
    p.write_text(text.replace(old, new, 1))

# --- workflow types ---------------------------------------------------------
replace(
    "src/workflow/types.ts",
    "export interface WorkflowPullRequestReceipt {\n\treadonly repository: string;\n\treadonly number: number;\n\treadonly url: string;\n\treadonly base: string;\n\treadonly head: string;\n\treadonly headSha: string;\n}\n",
    "export interface WorkflowPullRequestReceipt {\n\treadonly repository: string;\n\treadonly number: number;\n\treadonly url: string;\n\treadonly base: string;\n\treadonly head: string;\n\treadonly headSha: string;\n}\n\nexport interface WorkflowMergeAuthorization {\n\treadonly repository: string;\n\treadonly number: number;\n\treadonly url: string;\n\treadonly head: string;\n\treadonly headSha: string;\n\treadonly reviewCycle: number;\n\treadonly authorizedAt: string;\n\treadonly authorizedByOwnerSessionId: string;\n}\n\nexport interface WorkflowMergeReceipt {\n\treadonly repository: string;\n\treadonly number: number;\n\treadonly url: string;\n\treadonly headSha: string;\n\treadonly mergedSha: string;\n\treadonly executorAccountId: \"chatgpt-writer\";\n\treadonly mergedAt: string;\n}\n",
)
replace(
    "src/workflow/types.ts",
    "\treadonly pullRequest?: WorkflowPullRequestReceipt;\n\treadonly reviewCycle: number;",
    "\treadonly pullRequest?: WorkflowPullRequestReceipt;\n\treadonly mergeAuthorization?: WorkflowMergeAuthorization;\n\treadonly mergeReceipt?: WorkflowMergeReceipt;\n\treadonly reviewCycle: number;",
)

# --- approval policy --------------------------------------------------------
replace(
    "src/workflow/approval-policy.ts",
    'import type { WorkflowPullRequestReceipt, WorkflowState } from "#internet/workflow/types";',
    'import type { WorkflowMergeAuthorization, WorkflowPullRequestReceipt, WorkflowState } from "#internet/workflow/types";',
)
replace(
    "src/workflow/approval-policy.ts",
    "\treadonly pullRequest?: WorkflowPullRequestReceipt;\n}",
    "\treadonly pullRequest?: WorkflowPullRequestReceipt;\n\treadonly mergeAuthorization?: WorkflowMergeAuthorization;\n}",
)
replace(
    "src/workflow/approval-policy.ts",
    'export type WorkflowConfirmationDecision =\n\t| { readonly kind: "auto-approve"; readonly action: Exclude<WorkflowConfirmationAction, "merge_pull_request"> }',
    'export type WorkflowConfirmationDecision =\n\t| { readonly kind: "auto-approve"; readonly action: WorkflowConfirmationAction }',
)
old_merge = '''\tif (observation.action === "merge_pull_request") {\n\t\tif (context.pullRequest !== undefined) {\n\t\t\tif (observation.prNumber !== undefined && observation.prNumber !== context.pullRequest.number) {\n\t\t\t\treturn { kind: "unknown", reason: "merge confirmation PR number does not match the workflow PR" };\n\t\t\t}\n\t\t\tif (observation.branch !== undefined && observation.branch !== context.pullRequest.head) {\n\t\t\t\treturn { kind: "unknown", reason: "merge confirmation branch does not match the workflow PR head" };\n\t\t\t}\n\t\t}\n\t\treturn { kind: "merge-requires-user", reason: "merge requires explicit user authorization" };\n\t}\n'''
new_merge = '''\tif (observation.action === "merge_pull_request") {\n\t\tif (context.pullRequest === undefined) {\n\t\t\treturn { kind: "unknown", reason: "merge confirmation requires the persisted workflow PR" };\n\t\t}\n\t\tif (observation.prNumber !== undefined && observation.prNumber !== context.pullRequest.number) {\n\t\t\treturn { kind: "unknown", reason: "merge confirmation PR number does not match the workflow PR" };\n\t\t}\n\t\tif (observation.branch !== undefined && observation.branch !== context.pullRequest.head) {\n\t\t\treturn { kind: "unknown", reason: "merge confirmation branch does not match the workflow PR head" };\n\t\t}\n\t\tif (context.state !== "MERGING" || context.mergeAuthorization === undefined) {\n\t\t\treturn { kind: "merge-requires-user", reason: "merge requires explicit user authorization" };\n\t\t}\n\t\tconst authorization = context.mergeAuthorization;\n\t\tif (normalizeGitHubRepository(authorization.repository) !== authoritativeRepository) {\n\t\t\treturn { kind: "unknown", reason: "merge authorization repository does not match workflow authority" };\n\t\t}\n\t\tif (\n\t\t\tauthorization.number !== context.pullRequest.number ||\n\t\t\tauthorization.url !== context.pullRequest.url ||\n\t\t\tauthorization.head !== context.pullRequest.head ||\n\t\t\tauthorization.headSha !== context.pullRequest.headSha\n\t\t) {\n\t\t\treturn { kind: "unknown", reason: "merge authorization is stale or bound to a different pull request" };\n\t\t}\n\t\treturn { kind: "auto-approve", action: "merge_pull_request" };\n\t}\n'''
replace("src/workflow/approval-policy.ts", old_merge, new_merge)

# --- writer runner ----------------------------------------------------------
replace(
    "src/workflow/writer-runner.ts",
    'export type WorkflowWriterResult =\n\t| { readonly status: "PR_OPEN"; readonly pullRequest: WorkflowPullRequestReceipt }\n\t| { readonly status: "BLOCKED"; readonly message: string }\n\t| { readonly status: "UNKNOWN_CONFIRMATION"; readonly message: string };',
    'export type WorkflowWriterResult =\n\t| { readonly status: "PR_OPEN"; readonly pullRequest: WorkflowPullRequestReceipt }\n\t| { readonly status: "MERGED"; readonly repository: string; readonly number: number; readonly url: string; readonly headSha: string; readonly mergedSha: string }\n\t| { readonly status: "BLOCKED"; readonly message: string }\n\t| { readonly status: "UNKNOWN_CONFIRMATION"; readonly message: string };',
)
marker = '\tif (control.kind === "APPLY_REVIEWS") {'
merge_prompt = '''\tif (control.kind === "MERGE_AUTHORIZED") {\n\t\tif (pullRequest === undefined || job.mergeAuthorization === undefined || control.expectedHeadSha === undefined) {\n\t\t\tthrow new Error("MERGE_AUTHORIZED requires a persisted PR, authorization, and expected head SHA");\n\t\t}\n\t\treturn [\n\t\t\t"You are the workflow writer/executor. This is a trusted, explicitly user-authorized merge control message.",\n\t\t\t`Control: ${control.kind}`,\n\t\t\t`Workflow job: ${job.jobId}`,\n\t\t\t`Target repository: ${job.repository}`,\n\t\t\t`Pull request: ${pullRequest.url}`,\n\t\t\t`PR number: ${pullRequest.number}`,\n\t\t\t`Required PR head branch: ${pullRequest.head}`,\n\t\t\t`Authorized exact head SHA: ${control.expectedHeadSha}`,\n\t\t\t"",\n\t\t\t"Immediately before attempting merge, read the actual current pull request from GitHub and verify repository, PR number, head branch, and current head SHA. If the current head SHA is not exactly the authorized SHA, do not open or approve a merge confirmation and return BLOCKED.",\n\t\t\t"Do not modify files, commits, branch contents, PR metadata, or repository settings. Merge exactly this one pull request and nothing else.",\n\t\t\t"After the merge completes, report the exact pre-merge head SHA you verified and the resulting merge commit SHA.",\n\t\t\t"",\n\t\t\t"Return exactly one JSON object and no markdown or surrounding prose.",\n\t\t\t'On success: {"status":"MERGED","repository":"owner/repo or repository URL","number":123,"url":"https://github.com/owner/repo/pull/123","headSha":"40-lowercase-hex-authorized-head","mergedSha":"40-lowercase-hex-merge-commit"}',\n\t\t\t'On block: {"status":"BLOCKED","message":"concise reason"}',\n\t\t].join("\\n");\n\t}\n'''
replace("src/workflow/writer-runner.ts", marker, merge_prompt + marker)
replace(
    "src/workflow/writer-runner.ts",
    'if (value.status !== "PR_OPEN") throw new Error("workflow writer result has an unsupported status");',
    '''if (value.status === "MERGED") {\n\t\tif (typeof value.repository !== "string" || value.repository.trim() === "") throw new Error("writer merge repository is required");\n\t\tif (typeof value.number !== "number" || !Number.isSafeInteger(value.number) || value.number < 1) throw new Error("writer merge PR number is invalid");\n\t\tif (typeof value.url !== "string" || !/^https:\\/\\/github\\.com\\//u.test(value.url)) throw new Error("writer merge PR URL is invalid");\n\t\tif (typeof value.headSha !== "string" || !/^[0-9a-f]{40}$/u.test(value.headSha)) throw new Error("writer merge head SHA is invalid");\n\t\tif (typeof value.mergedSha !== "string" || !/^[0-9a-f]{40}$/u.test(value.mergedSha)) throw new Error("writer merge commit SHA is invalid");\n\t\treturn { status: "MERGED", repository: value.repository, number: value.number, url: value.url, headSha: value.headSha, mergedSha: value.mergedSha };\n\t}\n\tif (value.status !== "PR_OPEN") throw new Error("workflow writer result has an unsupported status");''',
)
replace(
    "src/workflow/writer-runner.ts",
    "\t\t\t\t\t...(request.job.pullRequest === undefined ? {} : { pullRequest: request.job.pullRequest }),",
    "\t\t\t\t\t...(request.job.pullRequest === undefined ? {} : { pullRequest: request.job.pullRequest }),\n\t\t\t\t\t...(request.job.mergeAuthorization === undefined ? {} : { mergeAuthorization: request.job.mergeAuthorization }),",
)

# --- engine -----------------------------------------------------------------
# Guard unexpected MERGED results in implementation/remediation.
replace(
    "src/workflow/engine.ts",
    '\t\tif (result.status === "BLOCKED") {\n\t\t\treturn this.update(jobId, (current) => ({\n\t\t\t\t...withState(current, "BLOCKED"),\n\t\t\t\tpendingAction: { kind: "WRITER_BLOCKED", message: result.message, resumeState: "WRITER_RUNNING" },',
    '\t\tif (result.status === "BLOCKED") {\n\t\t\treturn this.update(jobId, (current) => ({\n\t\t\t\t...withState(current, "BLOCKED"),\n\t\t\t\tpendingAction: { kind: "WRITER_BLOCKED", message: result.message, resumeState: "WRITER_RUNNING" },',
)
# insert after implementation BLOCKED block by anchoring PR_OPEN update
replace(
    "src/workflow/engine.ts",
    '\t\treturn this.update(jobId, (current) => ({\n\t\t\t...withState(current, "PR_OPEN"),\n\t\t\tpullRequest: result.pullRequest,',
    '\t\tif (result.status !== "PR_OPEN") throw new WorkflowEngineError("writer returned merge output outside merge phase");\n\t\treturn this.update(jobId, (current) => ({\n\t\t\t...withState(current, "PR_OPEN"),\n\t\t\tpullRequest: result.pullRequest,',
)
# remediation second occurrence
needle = '\t\tif (!samePullRequestIdentity(reviewedPullRequest, result.pullRequest)) {'
replace(
    "src/workflow/engine.ts",
    needle,
    '\t\tif (result.status !== "PR_OPEN") throw new WorkflowEngineError("writer returned merge output outside merge phase");\n' + needle,
)
# Add P9 methods before reviewLimitReached.
marker = '\n\tprivate reviewLimitReached(jobId: string, expectedHeadSha: string): WorkflowJob {'
methods = r'''

	/** Move a fully reviewed PR into the explicit user-authorization gate. */
	requestMergeAuthorization(jobId: string): WorkflowJob {
		const current = this.status(jobId);
		if (current.state !== "READY_FOR_MERGE_AUTHORIZATION") {
			throw new WorkflowEngineError(`workflow job ${jobId} cannot request merge authorization from ${current.state}`);
		}
		if (current.pullRequest === undefined) throw new WorkflowEngineError("merge authorization requires a persisted pull request");
		if (!current.teamRuns.review.every((run) => run.result?.reviewVerdict === "PASS" && run.result.reviewedHeadSha === current.pullRequest?.headSha)) {
			throw new WorkflowEngineError("merge authorization requires both reviewers to PASS the current exact PR head");
		}
		const pr = current.pullRequest;
		return this.update(jobId, (state) => ({
			...withState(state, "AWAITING_MERGE_AUTHORIZATION"),
			pendingAction: {
				kind: "MERGE_AUTHORIZATION_REQUIRED",
				expectedHeadSha: pr.headSha,
				message: `Merge authorization required: pr=${pr.url} reviews=PASS/PASS ci=unknown expected_head=${pr.headSha}`,
			},
			mergeAuthorization: undefined,
			lastEvent: {
				type: "MERGE_AUTHORIZATION_REQUIRED",
				class: "ACTION_REQUIRED",
				at: now(),
				message: `pr=${pr.url} reviews=PASS/PASS ci=unknown expected_head=${pr.headSha}`,
			},
		}));
	}

	/** Execute an already authorized exact-head merge through the persistent Website writer. */
	async runWriterMerge(jobId: string, signal?: AbortSignal): Promise<WorkflowJob> {
		if (this.writer === undefined) throw new WorkflowEngineError("workflow writer runner is not configured");
		const job = this.status(jobId);
		if (job.state !== "MERGING") throw new WorkflowEngineError(`workflow job ${jobId} cannot merge from ${job.state}`);
		if (job.pullRequest === undefined || job.mergeAuthorization === undefined) {
			throw new WorkflowEngineError("merge execution requires a persisted PR and exact authorization");
		}
		const pr = job.pullRequest;
		const authorization = job.mergeAuthorization;
		if (
			normalizeGitHubRepository(authorization.repository) !== normalizeGitHubRepository(job.repository) ||
			authorization.number !== pr.number || authorization.url !== pr.url || authorization.head !== pr.head ||
			authorization.headSha !== pr.headSha
		) {
			return this.writerBlocked(jobId, "merge authorization is stale or no longer matches the authoritative PR", "READY_FOR_MERGE_AUTHORIZATION");
		}
		const control = createWorkflowControlMessage("MERGE_AUTHORIZED", jobId, authorization.headSha);
		const result = await this.writer.runControl({
			sessionId: job.writerConversation.sessionId,
			job,
			control,
			signal,
		});
		if (result.status === "UNKNOWN_CONFIRMATION") {
			return this.update(jobId, (current) => ({
				...withState(current, "UNKNOWN_CONFIRMATION"),
				pendingAction: { kind: "UNKNOWN_CONFIRMATION", message: result.message, resumeState: "MERGING" },
				lastEvent: { type: "UNKNOWN_CONFIRMATION", class: "ACTION_REQUIRED", at: now(), message: result.message },
			}));
		}
		if (result.status === "BLOCKED") return this.writerBlocked(jobId, result.message, "READY_FOR_MERGE_AUTHORIZATION");
		if (result.status !== "MERGED") throw new WorkflowEngineError("writer did not return a merge result during merge phase");
		if (
			normalizeGitHubRepository(result.repository) !== normalizeGitHubRepository(pr.repository) ||
			result.number !== pr.number || result.url !== pr.url || result.headSha !== authorization.headSha
		) {
			return this.writerBlocked(jobId, "writer merge result does not match the authorized PR/head", "READY_FOR_MERGE_AUTHORIZATION");
		}
		return this.update(jobId, (current) => ({
			...withState(current, "DONE"),
			pendingAction: undefined,
			mergeReceipt: {
				repository: result.repository,
				number: result.number,
				url: result.url,
				headSha: result.headSha,
				mergedSha: result.mergedSha,
				executorAccountId: "chatgpt-writer",
				mergedAt: now(),
			},
			lastEvent: { type: "MERGED", class: "PROGRESS", at: now(), message: `pr=${result.url} merged_sha=${result.mergedSha}` },
		}));
	}
'''
replace("src/workflow/engine.ts", marker, methods + marker)
# Replace approve semantics.
old_approve = r'''	approve(input: WorkflowDecisionInput): WorkflowJob {
		return this.update(input.jobId, (current) => {
			if (
				current.state !== "AWAITING_MERGE_AUTHORIZATION" ||
				current.pendingAction?.kind !== "MERGE_AUTHORIZATION_REQUIRED"
			) {
				throw new WorkflowEngineError(`workflow job ${input.jobId} is not awaiting merge authorization`);
			}
			if (
				current.pendingAction.expectedHeadSha !== undefined &&
				input.expectedHeadSha !== current.pendingAction.expectedHeadSha
			) {
				throw new WorkflowEngineError("merge authorization head SHA does not match the pending action");
			}
			return { ...withState(current, "READY_FOR_MERGE_AUTHORIZATION"), pendingAction: undefined };
		});
	}
'''
new_approve = r'''	approve(input: WorkflowDecisionInput): WorkflowJob {
		return this.update(input.jobId, (current) => {
			if (
				current.state !== "AWAITING_MERGE_AUTHORIZATION" ||
				current.pendingAction?.kind !== "MERGE_AUTHORIZATION_REQUIRED" ||
				current.pullRequest === undefined
			) {
				throw new WorkflowEngineError(`workflow job ${input.jobId} is not awaiting merge authorization`);
			}
			if (input.expectedHeadSha === undefined || input.expectedHeadSha !== current.pendingAction.expectedHeadSha || input.expectedHeadSha !== current.pullRequest.headSha) {
				throw new WorkflowEngineError("merge authorization requires the exact pending PR head SHA");
			}
			const pr = current.pullRequest;
			return {
				...withState(current, "MERGING"),
				pendingAction: undefined,
				mergeAuthorization: {
					repository: current.repository,
					number: pr.number,
					url: pr.url,
					head: pr.head,
					headSha: pr.headSha,
					reviewCycle: current.reviewCycle,
					authorizedAt: now(),
					authorizedByOwnerSessionId: current.ownerSessionId,
				},
				lastEvent: { type: "MERGE_AUTHORIZED", class: "INTERNAL", at: now() },
			};
		});
	}
'''
replace("src/workflow/engine.ts", old_approve, new_approve)

# --- tool surface -----------------------------------------------------------
replace(
    "src/tools/internet-workflow.ts",
    'export const WORKFLOW_OPERATIONS = ["start", "status", "approve", "reject", "cancel", "continue"] as const;',
    'export const WORKFLOW_OPERATIONS = ["start", "status", "request_merge", "approve", "merge", "reject", "cancel", "continue"] as const;',
)
replace(
    "src/tools/internet-workflow.ts",
    '\t\t...(job.pendingAction === undefined\n\t\t\t? {}\n\t\t\t: {\n\t\t\t\t\tpendingAction: job.pendingAction.kind,\n\t\t\t\t\tpendingMessage: job.pendingAction.message,\n\t\t\t\t}),',
    '\t\t...(job.pendingAction === undefined\n\t\t\t? {}\n\t\t\t: {\n\t\t\t\t\tpendingAction: job.pendingAction.kind,\n\t\t\t\t\tpendingMessage: job.pendingAction.message,\n\t\t\t\t}),\n\t\t...(job.mergeAuthorization === undefined ? {} : { authorizedHeadSha: job.mergeAuthorization.headSha }),\n\t\t...(job.mergeReceipt === undefined ? {} : { mergedSha: job.mergeReceipt.mergedSha, mergeExecutor: job.mergeReceipt.executorAccountId }),',
)
replace(
    "src/tools/internet-workflow.ts",
    '\t\t\t\t\tpendingMessage: { type: "string" },\n\t\t\t\t\tupdatedAt: { type: "string" },',
    '\t\t\t\t\tpendingMessage: { type: "string" },\n\t\t\t\t\tauthorizedHeadSha: { type: "string" },\n\t\t\t\t\tmergedSha: { type: "string" },\n\t\t\t\t\tmergeExecutor: { type: "string" },\n\t\t\t\t\tupdatedAt: { type: "string" },',
)
old_dispatch = '''\t\t\t\tconst job =\n\t\t\t\t\toperation === "status"\n\t\t\t\t\t\t? engine.status(args.jobId)\n\t\t\t\t\t\t: operation === "cancel"\n\t\t\t\t\t\t\t? engine.cancel(args.jobId)\n\t\t\t\t\t\t\t: operation === "continue"\n\t\t\t\t\t\t\t\t? engine.continue(args.jobId)\n\t\t\t\t\t\t\t\t: operation === "approve"\n\t\t\t\t\t\t\t\t\t? engine.approve({ jobId: args.jobId, expectedHeadSha })\n\t\t\t\t\t\t\t\t\t: engine.reject({ jobId: args.jobId, expectedHeadSha });'''
new_dispatch = '''\t\t\t\tconst job =\n\t\t\t\t\toperation === "status"\n\t\t\t\t\t\t? engine.status(args.jobId)\n\t\t\t\t\t\t: operation === "request_merge"\n\t\t\t\t\t\t\t? engine.requestMergeAuthorization(args.jobId)\n\t\t\t\t\t\t\t: operation === "merge"\n\t\t\t\t\t\t\t\t? await engine.runWriterMerge(args.jobId, exec.signal)\n\t\t\t\t\t\t\t\t: operation === "cancel"\n\t\t\t\t\t\t\t\t\t? engine.cancel(args.jobId)\n\t\t\t\t\t\t\t\t\t: operation === "continue"\n\t\t\t\t\t\t\t\t\t\t? engine.continue(args.jobId)\n\t\t\t\t\t\t\t\t\t\t: operation === "approve"\n\t\t\t\t\t\t\t\t\t\t\t? engine.approve({ jobId: args.jobId, expectedHeadSha })\n\t\t\t\t\t\t\t\t\t\t\t: engine.reject({ jobId: args.jobId, expectedHeadSha });'''
replace("src/tools/internet-workflow.ts", old_dispatch, new_dispatch)

# --- focused tests ----------------------------------------------------------
Path("test/workflow-merge-gate.test.ts").write_text(r'''import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyWorkflowConfirmation, type WorkflowApprovalContext } from "#internet/workflow/approval-policy";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowJob, WorkflowTeamRun } from "#internet/workflow/types";
import type { WorkflowWriterRunner } from "#internet/workflow/writer-runner";

const headSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const mergedSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const jobId = "0123456789abcdef0123456789abcdef";

function readyJob(): WorkflowJob {
	const timestamp = "2026-09-09T00:00:00.000Z";
	const review = (lane: "A" | "B"): WorkflowTeamRun => ({
		lane,
		status: "completed",
		attempts: 1,
		sessionId: `local:workflow:${jobId}:review:${lane}`,
		result: {
			finalAnswer: `review-${lane}`,
			finalAccountId: "chatgpt-thinker",
			finalProvider: "chatgpt-web",
			completedAt: timestamp,
			reviewedHeadSha: headSha,
			reviewVerdict: "PASS",
		},
	});
	const pending = (lane: "A" | "B", phase: "research" | "review"): WorkflowTeamRun => ({ lane, status: "pending", attempts: 0, sessionId: `local:workflow:${jobId}:${phase}:${lane}` });
	return {
		schema: "@tsuuanmi/internet-workflow-job",
		version: 1,
		revision: 1,
		jobId,
		ownerSessionId: "local",
		objective: "merge tested change",
		repository: "https://github.com/example/repo",
		baseRevision: "0123456789abcdef0123456789abcdef01234567",
		state: "READY_FOR_MERGE_AUTHORIZATION",
		teamRuns: { research: [pending("A", "research"), pending("B", "research")], review: [review("A"), review("B")] },
		accountRouting: { thinkerAccounts: ["chatgpt-thinker", "gemini-thinker"], writerAccount: "chatgpt-writer", synthesizerAccount: "chatgpt-thinker" },
		handoffReceipts: [],
		writerConversation: { sessionId: `local:workflow:${jobId}:writer`, accountId: "chatgpt-writer" },
		pullRequest: { repository: "example/repo", number: 7, url: "https://github.com/example/repo/pull/7", base: "main", head: `internet-workflow/${jobId}`, headSha },
		reviewCycle: 1,
		createdAt: timestamp,
		updatedAt: timestamp,
	};
}

function setup(writer?: WorkflowWriterRunner) {
	const root = mkdtempSync(join(tmpdir(), "internet-merge-gate-"));
	const jobs = new WorkflowJobStore(root);
	jobs.create(readyJob());
	return new WorkflowEngine(jobs, undefined, undefined, undefined, writer);
}

describe("workflow merge gate", () => {
	it("binds user authorization to the exact persisted PR head", () => {
		const engine = setup();
		const awaiting = engine.requestMergeAuthorization(jobId);
		expect(awaiting.state).toBe("AWAITING_MERGE_AUTHORIZATION");
		expect(awaiting.pendingAction?.expectedHeadSha).toBe(headSha);
		expect(awaiting.pendingAction?.message).toContain("reviews=PASS/PASS");
		expect(() => engine.approve({ jobId, expectedHeadSha: mergedSha })).toThrow(/exact pending PR head SHA/u);
		const merging = engine.approve({ jobId, expectedHeadSha: headSha });
		expect(merging.state).toBe("MERGING");
		expect(merging.mergeAuthorization).toMatchObject({ repository: "https://github.com/example/repo", number: 7, headSha });
	});

	it("allows Website merge confirmation only in MERGING with matching authorization", () => {
		const engine = setup();
		engine.requestMergeAuthorization(jobId);
		const merging = engine.approve({ jobId, expectedHeadSha: headSha });
		const context: WorkflowApprovalContext = {
			jobId,
			writerSessionId: merging.writerConversation.sessionId,
			repository: merging.repository,
			state: merging.state,
			pullRequest: merging.pullRequest,
			mergeAuthorization: merging.mergeAuthorization,
			accountId: "chatgpt-writer",
			sessionId: merging.writerConversation.sessionId,
		};
		expect(classifyWorkflowConfirmation(context, { action: "merge_pull_request", repository: "example/repo", branch: `internet-workflow/${jobId}`, prNumber: 7 })).toEqual({ kind: "auto-approve", action: "merge_pull_request" });
		expect(classifyWorkflowConfirmation({ ...context, state: "READY_FOR_MERGE_AUTHORIZATION" }, { action: "merge_pull_request", repository: "example/repo", prNumber: 7 }).kind).toBe("merge-requires-user");
	});

	it("records a merge receipt only when writer revalidates the authorized head", async () => {
		const writer: WorkflowWriterRunner = {
			async deliverExact() {},
			async runControl(request) {
				expect(request.control.kind).toBe("MERGE_AUTHORIZED");
				expect(request.control.expectedHeadSha).toBe(headSha);
				return { status: "MERGED", repository: "example/repo", number: 7, url: "https://github.com/example/repo/pull/7", headSha, mergedSha };
			},
		};
		const engine = setup(writer);
		engine.requestMergeAuthorization(jobId);
		engine.approve({ jobId, expectedHeadSha: headSha });
		const done = await engine.runWriterMerge(jobId);
		expect(done.state).toBe("DONE");
		expect(done.mergeReceipt).toMatchObject({ headSha, mergedSha, executorAccountId: "chatgpt-writer" });
	});

	it("fails closed when writer reports a different pre-merge head", async () => {
		const writer: WorkflowWriterRunner = {
			async deliverExact() {},
			async runControl() { return { status: "MERGED", repository: "example/repo", number: 7, url: "https://github.com/example/repo/pull/7", headSha: mergedSha, mergedSha }; },
		};
		const engine = setup(writer);
		engine.requestMergeAuthorization(jobId);
		engine.approve({ jobId, expectedHeadSha: headSha });
		const blocked = await engine.runWriterMerge(jobId);
		expect(blocked.state).toBe("BLOCKED");
		expect(blocked.mergeReceipt).toBeUndefined();
	});
});
''')

# --- docs -------------------------------------------------------------------
replace(
    "docs/TODO.md",
    "## P9 — Merge gate\n\n### 34. Add READY/AWAITING merge authorization states\n\n### 35. Present concrete merge request to Local/user\n\nInclude PR URL, review state, CI state if known, and expected head SHA.\n\n### 36. Bind user authorization to exact PR head\n\n### 37. Revalidate head immediately before merge\n\nChanged head invalidates stale authorization.\n\n### 38. Execute writer merge and Website Allow only after authorization\n\nRecord merged SHA and executor.\n",
    "## P9 — Merge gate\n\n**Status:** implemented with an exact-head durable authorization record and a separate merge execution phase.\n\n### 34. ✅ Add READY/AWAITING merge authorization states\n\nA fully reviewed exact head reaches `READY_FOR_MERGE_AUTHORIZATION`. `request_merge` moves it to `AWAITING_MERGE_AUTHORIZATION` and installs one explicit pending action. Approval moves the job to `MERGING`; it never loops back to READY.\n\n### 35. ✅ Present concrete merge request to Local/user\n\nThe ACTION_REQUIRED event includes the exact PR URL, `PASS/PASS` review state, `ci=unknown` when no CI receipt is available, and the exact expected head SHA. No team/reviewer payload is copied into Local.\n\n### 36. ✅ Bind user authorization to exact PR head\n\n`approve(job_id, expectedHeadSha)` requires the exact pending head and persists a `mergeAuthorization` bound to repository, PR number/URL, head branch, head SHA, review cycle, authorization time, and owner session.\n\n### 37. ✅ Revalidate head immediately before merge\n\n`MERGE_AUTHORIZED` instructs the writer to fetch the actual PR immediately before merge and refuse if its current head differs. The writer must report that verified pre-merge head; the engine accepts a merge result only when it equals the durable authorization. Any changed head invalidates the authorization.\n\n### 38. ✅ Execute writer merge and Website Allow only after authorization\n\nThe scoped Website controller auto-allows `merge_pull_request` only while the job is `MERGING` and the durable authorization still exactly matches the authoritative PR. On success the engine records `mergedSha`, exact merged head, executor `chatgpt-writer`, timestamp, and transitions to `DONE`.\n",
)
replace(
    "README.md",
    "The explicit head-SHA-bound merge gate remains a later phase.",
    "The merge gate is head-SHA-bound: a reviewed PR first becomes an ACTION_REQUIRED request, explicit approval persists the exact repository/PR/head authorization, and only then may the writer revalidate the live PR and execute the merge. A changed head invalidates stale authorization.",
)
replace(
    "docs/how-it-works.md",
    "The head-SHA-bound user merge authorization and\nexecution gate remains P9 and is not implied by reaching `READY_FOR_MERGE_AUTHORIZATION`.",
    "Reaching `READY_FOR_MERGE_AUTHORIZATION` still does not authorize a merge. `request_merge` creates one concrete ACTION_REQUIRED request containing the PR URL, PASS/PASS review state, CI state when known, and exact expected head SHA. `approve` persists an authorization bound to repository + PR + head branch + head SHA and moves the job to `MERGING`. The writer then receives separate `MERGE_AUTHORIZED` control, fetches the live PR immediately before merge, refuses a changed head, and reports the verified pre-merge head plus resulting merge commit SHA. The Website confirmation controller auto-allows merge only in `MERGING` when the persisted authorization still exactly matches the authoritative PR. Success records a merge receipt and transitions to `DONE`.\n",
)
