from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"expected marker missing in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1))

# --- Handoff integrity ------------------------------------------------------
replace(
    "src/workflow/handoff-store.ts",
    'import type { AccountId } from "#internet/core/accounts";',
    'import { isAccountId, type AccountId } from "#internet/core/accounts";',
)
replace(
    "src/workflow/handoff-store.ts",
    'if (typeof value.recipient !== "string") throw new Error("invalid handoff recipient");',
    'if (!isAccountId(value.recipient)) throw new Error("invalid handoff recipient");',
)
replace(
    "src/workflow/handoff-store.ts",
    '''\tif (typeof value.deliveredAt !== undefined &&\n\t\t(typeof value.deliveredAt !== "string" || !Number.isFinite(Date.parse(value.deliveredAt)))\n\t) {\n\t\tthrow new Error("invalid deliveredAt");\n\t}\n\treturn value as unknown as WorkflowHandoff;'''.replace('typeof value.deliveredAt !== undefined', 'value.deliveredAt !== undefined'),
    '''\tif (\n\t\tvalue.deliveredAt !== undefined &&\n\t\t(typeof value.deliveredAt !== "string" || !Number.isFinite(Date.parse(value.deliveredAt)))\n\t) {\n\t\tthrow new Error("invalid deliveredAt");\n\t}\n\tif (value.status === "delivered" && value.deliveredAt === undefined) throw new Error("delivered handoff requires deliveredAt");\n\tif (value.status === "pending" && value.deliveredAt !== undefined) throw new Error("pending handoff cannot have deliveredAt");\n\tconst expectedId = deterministicHandoffId({\n\t\tjobId: value.jobId,\n\t\tsource: value.source,\n\t\trecipient: value.recipient,\n\t\tsequence: value.sequence,\n\t});\n\tif (value.handoffId !== expectedId) throw new Error("handoff id does not match logical identity");\n\treturn value as unknown as WorkflowHandoff;''',
)

# --- Durable job parser: validate all authority-bearing nested state --------
replace(
    "src/workflow/job-store.ts",
    'import { WORKFLOW_STATES, type WorkflowJob, type WorkflowState } from "#internet/workflow/types";',
    'import { getAccountDefinition, isAccountId } from "#internet/core/accounts";\nimport { WORKFLOW_STATES, WORKFLOW_TEAM_STATUSES, type WorkflowJob, type WorkflowState } from "#internet/workflow/types";',
)
marker = '''function assertMergeReceipt(value: unknown): void {\n\tif (value === undefined) return;\n\tif (!isRecord(value)) throw new Error("invalid merge receipt");\n\tif (typeof value.repository !== "string" || value.repository.trim() === "")\n\t\tthrow new Error("invalid merge receipt repository");\n\tif (!isPositiveInteger(value.number)) throw new Error("invalid merge receipt PR number");\n\tif (typeof value.url !== "string" || !/^https:\\/\\/github\\.com\\//u.test(value.url))\n\t\tthrow new Error("invalid merge receipt URL");\n\tif (!isFullSha(value.headSha) || !isFullSha(value.mergedSha)) throw new Error("invalid merge receipt SHA");\n\tif (value.executorAccountId !== "chatgpt-writer") throw new Error("invalid merge receipt executor");\n\tif (!isTimestamp(value.mergedAt)) throw new Error("invalid merge receipt timestamp");\n}\n'''
helpers = r'''

function assertTeamResult(value: unknown, phase: "research" | "review"): void {
	if (!isRecord(value)) throw new Error("invalid team result");
	if (typeof value.finalAnswer !== "string") throw new Error("invalid team final answer");
	if (!isAccountId(value.finalAccountId)) throw new Error("invalid team final account");
	const provider = getAccountDefinition(value.finalAccountId).provider;
	if (value.finalProvider !== provider) throw new Error("team final provider does not match account identity");
	if (!isTimestamp(value.completedAt)) throw new Error("invalid team completion timestamp");
	if (phase === "review") {
		if (!isFullSha(value.reviewedHeadSha)) throw new Error("review result requires exact reviewed head SHA");
		if (value.reviewVerdict !== "PASS" && value.reviewVerdict !== "CHANGES_REQUIRED") {
			throw new Error("invalid review verdict");
		}
	} else if (value.reviewedHeadSha !== undefined || value.reviewVerdict !== undefined) {
		throw new Error("research result cannot carry review metadata");
	}
}

function assertTeamRun(
	value: unknown,
	phase: "research" | "review",
	expectedLane: "A" | "B",
	expectedSessionId: string,
): void {
	if (!isRecord(value)) throw new Error(`invalid ${phase} team run`);
	if (value.lane !== expectedLane) throw new Error(`invalid ${phase} lane order`);
	if (typeof value.status !== "string" || !(WORKFLOW_TEAM_STATUSES as readonly string[]).includes(value.status)) {
		throw new Error(`invalid ${phase} team status`);
	}
	if (typeof value.attempts !== "number" || !Number.isSafeInteger(value.attempts) || value.attempts < 0) {
		throw new Error(`invalid ${phase} team attempts`);
	}
	if (value.sessionId !== expectedSessionId) throw new Error(`${phase} team session identity mismatch`);
	if (value.error !== undefined && (typeof value.error !== "string" || value.error.trim() === "")) {
		throw new Error(`invalid ${phase} team error`);
	}
	if (value.status === "completed") {
		assertTeamResult(value.result, phase);
		if (value.error !== undefined) throw new Error(`completed ${phase} run cannot carry an error`);
	} else {
		if (value.result !== undefined) throw new Error(`incomplete ${phase} run cannot carry a result`);
		if (value.status === "failed" && value.error === undefined) throw new Error(`failed ${phase} run requires an error`);
		if (value.status !== "failed" && value.error !== undefined) throw new Error(`non-failed ${phase} run cannot carry an error`);
	}
}

function assertTeamRuns(value: unknown, ownerSessionId: string, jobId: string): void {
	if (!isRecord(value) || !Array.isArray(value.research) || !Array.isArray(value.review)) {
		throw new Error("invalid team run state");
	}
	if (value.research.length !== 2 || value.review.length !== 2) throw new Error("workflow requires exactly two lanes per phase");
	for (const phase of ["research", "review"] as const) {
		const runs = value[phase];
		assertTeamRun(runs[0], phase, "A", `${ownerSessionId}:workflow:${jobId}:${phase}:A`);
		assertTeamRun(runs[1], phase, "B", `${ownerSessionId}:workflow:${jobId}:${phase}:B`);
	}
}

function assertAccountRouting(value: unknown): void {
	if (!isRecord(value) || !Array.isArray(value.thinkerAccounts)) throw new Error("invalid account routing");
	if (
		value.thinkerAccounts.length !== 2 ||
		value.thinkerAccounts[0] !== "chatgpt-thinker" ||
		value.thinkerAccounts[1] !== "gemini-thinker" ||
		value.writerAccount !== "chatgpt-writer" ||
		value.synthesizerAccount !== "chatgpt-thinker"
	) {
		throw new Error("workflow account routing authority mismatch");
	}
}

function assertWriterConversation(value: unknown, ownerSessionId: string, jobId: string): void {
	if (!isRecord(value) || value.accountId !== "chatgpt-writer") throw new Error("invalid writer conversation account");
	if (value.sessionId !== `${ownerSessionId}:workflow:${jobId}:writer`) throw new Error("writer conversation identity mismatch");
}

function assertHandoffReceipts(value: unknown): void {
	if (!Array.isArray(value)) throw new Error("invalid handoff receipts");
	const ids = new Set<string>();
	for (const item of value) {
		if (!isRecord(item)) throw new Error("invalid handoff receipt");
		if (typeof item.handoffId !== "string" || !/^[0-9a-f]{64}$/u.test(item.handoffId)) throw new Error("invalid handoff receipt id");
		if (ids.has(item.handoffId)) throw new Error("duplicate handoff receipt id");
		ids.add(item.handoffId);
		if (typeof item.source !== "string" || item.source.trim() === "") throw new Error("invalid handoff receipt source");
		if (!isAccountId(item.recipient)) throw new Error("invalid handoff receipt recipient");
		if (!isPositiveInteger(item.sequence)) throw new Error("invalid handoff receipt sequence");
		if (typeof item.payloadHash !== "string" || !/^[0-9a-f]{64}$/u.test(item.payloadHash)) throw new Error("invalid handoff receipt hash");
		if (item.status !== "pending" && item.status !== "delivered") throw new Error("invalid handoff receipt status");
	}
}

function assertPullRequest(value: unknown): void {
	if (value === undefined) return;
	if (!isRecord(value)) throw new Error("invalid pull request receipt");
	if (typeof value.repository !== "string" || value.repository.trim() === "") throw new Error("invalid pull request repository");
	if (!isPositiveInteger(value.number)) throw new Error("invalid pull request number");
	if (typeof value.url !== "string" || !/^https:\/\/github\.com\//u.test(value.url)) throw new Error("invalid pull request URL");
	if (typeof value.base !== "string" || value.base.trim() === "") throw new Error("invalid pull request base");
	if (typeof value.head !== "string" || value.head.trim() === "") throw new Error("invalid pull request head");
	if (!isFullSha(value.headSha)) throw new Error("invalid pull request head SHA");
}

function assertPendingAction(value: unknown): void {
	if (value === undefined) return;
	if (!isRecord(value)) throw new Error("invalid pending action");
	if (![
		"MERGE_AUTHORIZATION_REQUIRED",
		"WRITER_BLOCKED",
		"UNKNOWN_CONFIRMATION",
		"REVIEW_LIMIT_REACHED",
		"ACCOUNT_REAUTH_REQUIRED",
	].includes(String(value.kind))) throw new Error("invalid pending action kind");
	if (typeof value.message !== "string" || value.message.trim() === "") throw new Error("invalid pending action message");
	if (value.expectedHeadSha !== undefined && !isFullSha(value.expectedHeadSha)) throw new Error("invalid pending action head SHA");
	if (value.resumeState !== undefined && !isState(value.resumeState)) throw new Error("invalid pending action resume state");
}

function assertEvent(value: unknown): void {
	if (value === undefined) return;
	if (!isRecord(value)) throw new Error("invalid workflow event");
	if (typeof value.type !== "string" || value.type.trim() === "") throw new Error("invalid workflow event type");
	if (value.class !== "INTERNAL" && value.class !== "PROGRESS" && value.class !== "ACTION_REQUIRED") {
		throw new Error("invalid workflow event class");
	}
	if (!isTimestamp(value.at)) throw new Error("invalid workflow event timestamp");
	if (value.message !== undefined && typeof value.message !== "string") throw new Error("invalid workflow event message");
}
'''
replace("src/workflow/job-store.ts", marker, marker + helpers)
old_parse = '''\tif (!isState(value.state)) throw new Error("invalid workflow state");\n\tif (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) throw new Error("invalid timestamps");\n\tif (!isRecord(value.teamRuns) || !Array.isArray(value.teamRuns.research) || !Array.isArray(value.teamRuns.review)) {\n\t\tthrow new Error("invalid team run state");\n\t}\n\tif (!isRecord(value.accountRouting) || !isRecord(value.writerConversation))\n\t\tthrow new Error("invalid account routing");\n\tif (!Array.isArray(value.handoffReceipts)) throw new Error("invalid handoff receipts");\n\tif (typeof value.reviewCycle !== "number" || !Number.isSafeInteger(value.reviewCycle) || value.reviewCycle < 0) {\n\t\tthrow new Error("invalid review cycle");\n\t}\n\tassertMergeAuthorization(value.mergeAuthorization);\n\tassertMergeReceipt(value.mergeReceipt);\n\tif (value.mergeReceipt !== undefined && value.state !== "DONE") throw new Error("merge receipt requires DONE state");\n\treturn value as unknown as WorkflowJob;'''
new_parse = '''\tif (!isState(value.state)) throw new Error("invalid workflow state");\n\tif (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) throw new Error("invalid timestamps");\n\tassertTeamRuns(value.teamRuns, value.ownerSessionId, value.jobId);\n\tassertAccountRouting(value.accountRouting);\n\tassertWriterConversation(value.writerConversation, value.ownerSessionId, value.jobId);\n\tassertHandoffReceipts(value.handoffReceipts);\n\tassertPullRequest(value.pullRequest);\n\tassertPendingAction(value.pendingAction);\n\tassertEvent(value.lastEvent);\n\tif (typeof value.reviewCycle !== "number" || !Number.isSafeInteger(value.reviewCycle) || value.reviewCycle < 0) {\n\t\tthrow new Error("invalid review cycle");\n\t}\n\tassertMergeAuthorization(value.mergeAuthorization);\n\tassertMergeReceipt(value.mergeReceipt);\n\tif (value.mergeAuthorization !== undefined) {\n\t\tif (!isRecord(value.pullRequest)) throw new Error("merge authorization requires a pull request receipt");\n\t\tif (\n\t\t\tvalue.mergeAuthorization.number !== value.pullRequest.number ||\n\t\t\tvalue.mergeAuthorization.url !== value.pullRequest.url ||\n\t\t\tvalue.mergeAuthorization.head !== value.pullRequest.head ||\n\t\t\tvalue.mergeAuthorization.headSha !== value.pullRequest.headSha\n\t\t) throw new Error("merge authorization does not match pull request receipt");\n\t}\n\tif (value.mergeReceipt !== undefined) {\n\t\tif (value.state !== "DONE") throw new Error("merge receipt requires DONE state");\n\t\tif (!isRecord(value.pullRequest)) throw new Error("merge receipt requires a pull request receipt");\n\t\tif (\n\t\t\tvalue.mergeReceipt.number !== value.pullRequest.number ||\n\t\t\tvalue.mergeReceipt.url !== value.pullRequest.url ||\n\t\t\tvalue.mergeReceipt.headSha !== value.pullRequest.headSha\n\t\t) throw new Error("merge receipt does not match pull request receipt");\n\t}\n\tif (value.state === "DONE" && value.mergeReceipt === undefined) throw new Error("DONE workflow requires a merge receipt");\n\treturn value as unknown as WorkflowJob;'''
replace("src/workflow/job-store.ts", old_parse, new_parse)

# --- Engine idempotency + safer resume semantics ---------------------------
engine = Path("src/workflow/engine.ts")
text = engine.read_text()
helper_marker = '''function upsertReceipts(\n\tcurrent: readonly WorkflowHandoffReceipt[],\n\tincoming: readonly WorkflowHandoffReceipt[],\n): readonly WorkflowHandoffReceipt[] {\n\tconst byId = new Map(current.map((item) => [item.handoffId, item]));\n\tfor (const item of incoming) byId.set(item.handoffId, item);\n\treturn [...byId.values()].sort((a, b) => a.sequence - b.sequence || a.handoffId.localeCompare(b.handoffId));\n}\n'''
helper_add = '''\nfunction sameReceipt(a: WorkflowHandoffReceipt, b: WorkflowHandoffReceipt): boolean {\n\treturn (\n\t\ta.handoffId === b.handoffId &&\n\t\ta.source === b.source &&\n\t\ta.recipient === b.recipient &&\n\t\ta.sequence === b.sequence &&\n\t\ta.payloadHash === b.payloadHash &&\n\t\ta.status === b.status\n\t);\n}\n\nfunction receiptsAlreadyInstalled(\n\tcurrent: readonly WorkflowHandoffReceipt[],\n\tincoming: readonly WorkflowHandoffReceipt[],\n): boolean {\n\treturn incoming.every((next) => {\n\t\tconst existing = current.find((item) => item.handoffId === next.handoffId);\n\t\treturn existing !== undefined && sameReceipt(existing, next);\n\t});\n}\n'''
if helper_marker not in text:
    raise SystemExit("engine receipt helper marker missing")
text = text.replace(helper_marker, helper_marker + helper_add, 1)
# Replace both preparation updates with no-op when already identical.
old = '''\t\tthis.update(jobId, (current) => ({\n\t\t\t...current,\n\t\t\trevision: current.revision + 1,\n\t\t\thandoffReceipts: upsertReceipts(current.handoffReceipts, handoffs.map(receipt)),\n\t\t\tlastEvent: { type: "RESEARCH_HANDOFFS_PREPARED", class: "INTERNAL", at: now() },\n\t\t\tupdatedAt: now(),\n\t\t}));'''
new = '''\t\tconst incomingReceipts = handoffs.map(receipt);\n\t\tif (!receiptsAlreadyInstalled(job.handoffReceipts, incomingReceipts)) {\n\t\t\tthis.update(jobId, (current) => ({\n\t\t\t\t...current,\n\t\t\t\trevision: current.revision + 1,\n\t\t\t\thandoffReceipts: upsertReceipts(current.handoffReceipts, incomingReceipts),\n\t\t\t\tlastEvent: { type: "RESEARCH_HANDOFFS_PREPARED", class: "INTERNAL", at: now() },\n\t\t\t\tupdatedAt: now(),\n\t\t\t}));\n\t\t}'''
if old not in text:
    raise SystemExit("research preparation marker missing")
text = text.replace(old, new, 1)
old = '''\t\tthis.update(jobId, (current) => ({\n\t\t\t...current,\n\t\t\trevision: current.revision + 1,\n\t\t\thandoffReceipts: upsertReceipts(current.handoffReceipts, handoffs.map(receipt)),\n\t\t\tlastEvent: { type: "REVIEW_HANDOFFS_PREPARED", class: "INTERNAL", at: now() },\n\t\t\tupdatedAt: now(),\n\t\t}));'''
new = '''\t\tconst incomingReceipts = handoffs.map(receipt);\n\t\tif (!receiptsAlreadyInstalled(job.handoffReceipts, incomingReceipts)) {\n\t\t\tthis.update(jobId, (current) => ({\n\t\t\t\t...current,\n\t\t\t\trevision: current.revision + 1,\n\t\t\t\thandoffReceipts: upsertReceipts(current.handoffReceipts, incomingReceipts),\n\t\t\t\tlastEvent: { type: "REVIEW_HANDOFFS_PREPARED", class: "INTERNAL", at: now() },\n\t\t\t\tupdatedAt: now(),\n\t\t\t}));\n\t\t}'''
if old not in text:
    raise SystemExit("review preparation marker missing")
text = text.replace(old, new, 1)
old = '''\tmarkHandoffDelivered(jobId: string, handoffId: string, expectedPayloadHash: string): WorkflowJob {\n\t\tif (this.handoffs === undefined) throw new WorkflowEngineError("workflow handoff store is not configured");\n\t\tconst delivered = this.handoffs.markDelivered(jobId, handoffId, expectedPayloadHash);\n\t\treturn this.update(jobId, (current) => {\n\t\t\tif (!current.handoffReceipts.some((item) => item.handoffId === handoffId)) {\n\t\t\t\tthrow new WorkflowEngineError(`handoff ${handoffId} is not registered on workflow job ${jobId}`);\n\t\t\t}\n\t\t\treturn {\n\t\t\t\t...current,\n\t\t\t\trevision: current.revision + 1,\n\t\t\t\thandoffReceipts: upsertReceipts(current.handoffReceipts, [receipt(delivered)]),\n\t\t\t\tlastEvent: { type: "HANDOFF_DELIVERED", class: "INTERNAL", at: now() },\n\t\t\t\tupdatedAt: now(),\n\t\t\t};\n\t\t});\n\t}\n'''
new = '''\tmarkHandoffDelivered(jobId: string, handoffId: string, expectedPayloadHash: string): WorkflowJob {\n\t\tif (this.handoffs === undefined) throw new WorkflowEngineError("workflow handoff store is not configured");\n\t\tconst current = this.status(jobId);\n\t\tconst registered = current.handoffReceipts.find((item) => item.handoffId === handoffId);\n\t\tif (registered === undefined) throw new WorkflowEngineError(`handoff ${handoffId} is not registered on workflow job ${jobId}`);\n\t\tif (registered.payloadHash !== expectedPayloadHash) throw new WorkflowEngineError("handoff delivery hash does not match job receipt");\n\t\tconst delivered = this.handoffs.markDelivered(jobId, handoffId, expectedPayloadHash);\n\t\tif (registered.status === "delivered" && sameReceipt(registered, receipt(delivered))) return current;\n\t\treturn this.update(jobId, (state) => ({\n\t\t\t...state,\n\t\t\trevision: state.revision + 1,\n\t\t\thandoffReceipts: upsertReceipts(state.handoffReceipts, [receipt(delivered)]),\n\t\t\tlastEvent: { type: "HANDOFF_DELIVERED", class: "INTERNAL", at: now() },\n\t\t\tupdatedAt: now(),\n\t\t}));\n\t}\n'''
if old not in text:
    raise SystemExit("markHandoffDelivered marker missing")
text = text.replace(old, new, 1)
old = '''\tprivate writerBlocked(jobId: string, message: string, resumeState: WorkflowState): WorkflowJob {\n\t\treturn this.update(jobId, (current) => ({\n\t\t\t...withState(current, "BLOCKED"),\n\t\t\tpendingAction: { kind: "WRITER_BLOCKED", message, resumeState },\n\t\t\tlastEvent: { type: "WRITER_BLOCKED", class: "ACTION_REQUIRED", at: now(), message },\n\t\t}));\n\t}\n'''
new = '''\tprivate writerBlocked(jobId: string, message: string, resumeState: WorkflowState): WorkflowJob {\n\t\treturn this.update(jobId, (current) => ({\n\t\t\t...withState(current, "BLOCKED"),\n\t\t\tpendingAction: { kind: "WRITER_BLOCKED", message, resumeState },\n\t\t\t...(resumeState === "READY_FOR_MERGE_AUTHORIZATION" ? { mergeAuthorization: undefined } : {}),\n\t\t\tlastEvent: { type: "WRITER_BLOCKED", class: "ACTION_REQUIRED", at: now(), message },\n\t\t}));\n\t}\n'''
if old not in text:
    raise SystemExit("writerBlocked marker missing")
text = text.replace(old, new, 1)
old = '''\tcontinue(jobId: string): WorkflowJob {\n\t\treturn this.update(jobId, (current) => {\n\t\t\tif (!new Set<WorkflowState>(["BLOCKED", "UNKNOWN_CONFIRMATION", "FAILED_RETRYABLE"]).has(current.state)) {\n\t\t\t\tthrow new WorkflowEngineError(`workflow job ${jobId} cannot continue from ${current.state}`);\n\t\t\t}\n\t\t\treturn { ...withState(current, current.pendingAction?.resumeState ?? "CREATED"), pendingAction: undefined };\n\t\t});\n\t}\n'''
new = '''\tcontinue(jobId: string): WorkflowJob {\n\t\treturn this.update(jobId, (current) => {\n\t\t\tif (!new Set<WorkflowState>(["BLOCKED", "UNKNOWN_CONFIRMATION", "FAILED_RETRYABLE"]).has(current.state)) {\n\t\t\t\tthrow new WorkflowEngineError(`workflow job ${jobId} cannot continue from ${current.state}`);\n\t\t\t}\n\t\t\tif (current.state === "FAILED_RETRYABLE") {\n\t\t\t\treturn { ...withState(current, "RESEARCH_RUNNING"), pendingAction: undefined };\n\t\t\t}\n\t\t\tconst resumeState = current.pendingAction?.resumeState;\n\t\t\tif (resumeState === undefined) throw new WorkflowEngineError(`workflow job ${jobId} has no explicit resume state`);\n\t\t\treturn { ...withState(current, resumeState), pendingAction: undefined };\n\t\t});\n\t}\n'''
if old not in text:
    raise SystemExit("continue marker missing")
text = text.replace(old, new, 1)
engine.write_text(text)

# --- PR creation retry/idempotency contract --------------------------------
replace(
    "src/workflow/writer-runner.ts",
    '"Verify the target repository and base revision, inspect the current repository, implement the objective without needless redesign, validate the change, create or update exactly one pull request, and do not merge it.",',
    '"Verify the target repository and base revision, inspect the current repository, implement the objective without needless redesign, and validate the change.",\n\t\t\t"This control is retry-safe and the workflow job ID plus required workflow branch are the PR idempotency key. Before creating a PR, query GitHub for any pull request whose head is exactly the required workflow branch. If exactly one open PR exists, reuse/update that PR and return it. If a closed/merged PR already exists for that exact workflow branch, or multiple PRs conflict, return BLOCKED rather than creating another PR. Only when no PR exists for the exact workflow branch may you create one. Never create a second PR for the same workflow job/branch, and do not merge.",',
)

# --- Focused P10 tests ------------------------------------------------------
Path("test/workflow-p10-hardening.test.ts").write_text(r'''import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowEngine } from "#internet/workflow/engine";
import { WorkflowHandoffStore } from "#internet/workflow/handoff-store";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import { WorkflowTeamPromptBuilder } from "#internet/workflow/team-prompt-builder";
import type { WorkflowTeamRunner } from "#internet/workflow/team-runner";
import type { WorkflowWriterRunner } from "#internet/workflow/writer-runner";

const roots: string[] = [];
const baseSha = "0123456789abcdef0123456789abcdef01234567";
const prHeadSha = "abcdef0123456789abcdef0123456789abcdef01";
const mergedSha = "1111111111111111111111111111111111111111";

function root(): string {
	const value = mkdtempSync(join(tmpdir(), "internet-p10-"));
	roots.push(value);
	return value;
}

function runner(): WorkflowTeamRunner {
	return {
		async run(request) {
			const lane = request.sessionId.endsWith(":A") ? "A" : "B";
			return {
				ok: true,
				finalAnswer: `${lane} exact payload`,
				finalAccountId: "chatgpt-thinker",
				finalProvider: "chatgpt-web",
			};
		},
	};
}

function start(engine: WorkflowEngine) {
	return engine.start({
		objective: "Harden recovery.",
		repository: "https://github.com/example/repo",
		baseRevision: baseSha,
		ownerSessionId: "agent-p10",
	});
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe("P10 durable recovery and transition hardening", () => {
	it("resumes after restart without redelivering an acknowledged exact handoff", async () => {
		const dataDir = root();
		const jobs1 = new WorkflowJobStore(dataDir);
		const handoffs1 = new WorkflowHandoffStore(dataDir);
		const first = new WorkflowEngine(jobs1, runner(), new WorkflowTeamPromptBuilder(), handoffs1);
		const job = start(first);
		await first.runResearch(job.jobId);
		const prepared = first.prepareResearchHandoffs(job.jobId);
		first.markHandoffDelivered(job.jobId, prepared[0]!.handoffId, prepared[0]!.payloadHash);

		const delivered: string[] = [];
		const writer: WorkflowWriterRunner = {
			async deliverExact(request) {
				delivered.push(request.payload);
			},
			async runControl() {
				return {
					status: "PR_OPEN",
					pullRequest: {
						repository: "example/repo",
						number: 9,
						url: "https://github.com/example/repo/pull/9",
						base: "main",
						head: `internet-workflow/${job.jobId}`,
						headSha: prHeadSha,
					},
				};
			},
		};
		const restarted = new WorkflowEngine(
			new WorkflowJobStore(dataDir),
			runner(),
			new WorkflowTeamPromptBuilder(),
			new WorkflowHandoffStore(dataDir),
			writer,
		);
		const completed = await restarted.runWriterImplementation(job.jobId);
		expect(delivered).toEqual(["B exact payload"]);
		expect(completed.state).toBe("PR_OPEN");
		expect(completed.pullRequest?.number).toBe(9);
	});

	it("keeps handoff receipt operations revision-idempotent", async () => {
		const dataDir = root();
		const jobs = new WorkflowJobStore(dataDir);
		const handoffs = new WorkflowHandoffStore(dataDir);
		const engine = new WorkflowEngine(jobs, runner(), new WorkflowTeamPromptBuilder(), handoffs);
		const job = start(engine);
		await engine.runResearch(job.jobId);
		const prepared = engine.prepareResearchHandoffs(job.jobId);
		const afterPrepare = engine.status(job.jobId).revision;
		engine.prepareResearchHandoffs(job.jobId);
		expect(engine.status(job.jobId).revision).toBe(afterPrepare);
		const delivered = engine.markHandoffDelivered(job.jobId, prepared[0]!.handoffId, prepared[0]!.payloadHash);
		const deliveredRevision = delivered.revision;
		expect(engine.markHandoffDelivered(job.jobId, prepared[0]!.handoffId, prepared[0]!.payloadHash).revision).toBe(
			deliveredRevision,
		);
	});

	it("recovers an exact durable merge authorization after process restart", async () => {
		const dataDir = root();
		const jobs = new WorkflowJobStore(dataDir);
		const bootstrap = new WorkflowEngine(jobs);
		const job = start(bootstrap);
		const pr = {
			repository: "example/repo",
			number: 4,
			url: "https://github.com/example/repo/pull/4",
			base: "main",
			head: `internet-workflow/${job.jobId}`,
			headSha: prHeadSha,
		};
		jobs.update(job.jobId, (current) => ({
			...current,
			revision: current.revision + 1,
			state: "MERGING",
			pullRequest: pr,
			reviewCycle: 1,
			mergeAuthorization: {
				repository: current.repository,
				number: pr.number,
				url: pr.url,
				head: pr.head,
				headSha: pr.headSha,
				reviewCycle: 1,
				authorizedAt: new Date().toISOString(),
				authorizedByOwnerSessionId: current.ownerSessionId,
			},
			updatedAt: new Date().toISOString(),
		}));
		const writer: WorkflowWriterRunner = {
			async deliverExact() {},
			async runControl() {
				return {
					status: "MERGED",
				repository: "example/repo",
				number: 4,
				url: pr.url,
				headSha: prHeadSha,
				mergedSha,
				};
			},
		};
		const restarted = new WorkflowEngine(
			new WorkflowJobStore(dataDir),
			undefined,
			new WorkflowTeamPromptBuilder(),
			undefined,
			writer,
		);
		const done = await restarted.runWriterMerge(job.jobId);
		expect(done.state).toBe("DONE");
		expect(done.mergeReceipt).toMatchObject({ headSha: prHeadSha, mergedSha, executorAccountId: "chatgpt-writer" });
	});

	it("never falls back to CREATED when continuing an exception", () => {
		const dataDir = root();
		const jobs = new WorkflowJobStore(dataDir);
		const engine = new WorkflowEngine(jobs);
		const job = start(engine);
		jobs.update(job.jobId, (current) => ({
			...current,
			revision: current.revision + 1,
			state: "BLOCKED",
			pendingAction: { kind: "WRITER_BLOCKED", message: "operator decision required" },
			updatedAt: new Date().toISOString(),
		}));
		expect(() => engine.continue(job.jobId)).toThrow(/no explicit resume state/u);
		expect(engine.status(job.jobId).state).toBe("BLOCKED");
	});

	it("fails closed on corrupted durable account/session authority", () => {
		const dataDir = root();
		const jobs = new WorkflowJobStore(dataDir);
		const engine = new WorkflowEngine(jobs);
		const job = start(engine);
		const path = jobs.pathFor(job.jobId);
		const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
		const writer = raw.writerConversation as Record<string, unknown>;
		writer.sessionId = "other-agent:workflow:wrong:writer";
		writeFileSync(path, JSON.stringify(raw, null, 2) + "\n", { mode: 0o600 });
		expect(() => new WorkflowJobStore(dataDir).get(job.jobId)).toThrow(/writer conversation identity mismatch/u);
	});
});
''')

# Extend handoff integrity tests with tamper checks.
p = Path("test/workflow-handoff.test.ts")
text = p.read_text()
text = text.replace(
    'import { chmodSync, mkdtempSync } from "node:fs";',
    'import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";',
)
insert = r'''

	it("rejects tampered logical identity, recipient, and delivery-state metadata", () => {
		const handoffs = store();
		const created = handoffs.create({
			jobId: "0123456789abcdef0123456789abcdef",
			source: "research:A",
			recipient: "chatgpt-writer",
			sequence: 1,
			payload: "exact",
		});
		const path = handoffs.pathFor(created.jobId, created.handoffId);
		const original = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
		for (const mutate of [
			(value: Record<string, unknown>) => { value.source = "research:B"; },
			(value: Record<string, unknown>) => { value.recipient = "chatgpt-web"; },
			(value: Record<string, unknown>) => { value.status = "delivered"; delete value.deliveredAt; },
		]) {
			const changed = structuredClone(original);
			mutate(changed);
			writeFileSync(path, JSON.stringify(changed, null, 2) + "\n", { mode: 0o600 });
			expect(() => handoffs.get(created.jobId, created.handoffId)).toThrow();
		}
	});
'''
end = text.rfind("\n});\n")
if end < 0:
    raise SystemExit("handoff test terminator missing")
text = text[:end] + insert + text[end:]
p.write_text(text)

# Writer idempotency prompt test.
p = Path("test/workflow-writer-runner.test.ts")
text = p.read_text()
insert = r'''

	it("makes START_IMPLEMENTATION PR creation retry-safe by exact workflow branch", async () => {
		let prompt = "";
		const browser: WorkflowWriterBrowser = {
			async chat(_accountId, request) {
				prompt = request.prompt;
				return {
					text: '{"status":"PR_OPEN","repository":"example/repo","number":7,"url":"https://github.com/example/repo/pull/7","base":"main","head":"internet-workflow/0123456789abcdef0123456789abcdef","headSha":"abcdef0123456789abcdef0123456789abcdef01"}',
				};
			},
		};
		await new BrowserWorkflowWriterRunner(browser).runControl({
			sessionId: writerSessionId,
			job: job(),
			control: createWorkflowControlMessage("START_IMPLEMENTATION", jobId),
		});
		expect(prompt).toContain("PR idempotency key");
		expect(prompt).toContain("If exactly one open PR exists, reuse/update that PR");
		expect(prompt).toContain("Never create a second PR for the same workflow job/branch");
	});
'''
end = text.rfind("\n});\n")
if end < 0:
    raise SystemExit("writer-runner test terminator missing")
text = text[:end] + insert + text[end:]
p.write_text(text)

# --- TODO reordered by ROI and completed high-ROI hardening -----------------
p = Path("docs/TODO.md")
text = p.read_text()
old = '''## P10 — Hardening\n\n### 39. Account isolation tests\n\n### 40. Workflow transition tests\n\n### 41. Handoff fidelity/idempotency tests\n\n### 42. Approval classification tests\n\n### 43. PR creation idempotency\n\n### 44. Durable restart recovery\n\n### 45. Audit/retention/cleanup policy\n'''
new = '''## P10 — Hardening\n\n**Ordering:** ROI first, then residual risk. The correctness-critical restart/idempotency work is completed before retention/cleanup policy.\n\n### 44. ✅ Durable restart recovery — ROI: critical\n\nRestart tests reconstruct `WorkflowEngine`, `WorkflowJobStore`, and `WorkflowHandoffStore` from the same durable directory. Acknowledged exact handoffs are not resent, an exact persisted merge authorization survives process reconstruction, and corrupted account/session authority fails closed on load. Durable nested job state is now validated rather than shallow-cast.\n\n### 43. ✅ PR creation idempotency — ROI: critical\n\n`START_IMPLEMENTATION` now treats workflow job ID + deterministic workflow branch as the PR idempotency key. On every retry the writer must reconcile GitHub by exact head branch, reuse exactly one existing open PR, and BLOCK on closed/merged or conflicting duplicate PR identity instead of creating another PR.\n\n### 40. ✅ Workflow transition tests — ROI: very high\n\nException continuation no longer has a generic fallback to `CREATED`. `FAILED_RETRYABLE` resumes the research phase explicitly; BLOCKED/UNKNOWN confirmation paths require a persisted `resumeState`. Merge-block paths clear stale merge authorization before returning to the authorization gate. Existing phase tests plus the P10 recovery/transition suite cover the state guards.\n\n### 41. ✅ Handoff fidelity/idempotency tests — ROI: very high\n\nHandoff parsing now validates semantic recipient account IDs, recomputes deterministic handoff identity, enforces delivered/deliveredAt consistency, and still verifies exact payload SHA-256. Re-preparing identical handoffs and re-recording an acknowledged delivery are revision-idempotent at the engine layer. Tamper tests cover identity, recipient, and delivery metadata.\n\n### 42. ✅ Approval classification tests — ROI: high\n\nThe existing scoped approval suite plus P9 merge-gate tests cover exact writer account/session/repository/branch/PR matching, malformed/ambiguous confirmations, cross-repo fail-closed behavior, premature merge rejection, and authorized MERGING-only approval. P10 durable-state validation now prevents corrupted persisted authority from reaching that classifier.\n\n### 39. ✅ Account isolation tests — ROI: high\n\nThe account catalog, storage, stale-write, reauthentication, scheduler, browser-runtime, and workflow routing tests collectively cover thinker/writer isolation even when both ChatGPT accounts share the same provider implementation. P10 strict job parsing additionally rejects altered writer/lane session identities during restart.\n\n### 45. Audit/retention/cleanup policy — ROI: medium\n\nDefine explicit retention windows, audit metadata, safe cleanup eligibility, and operator-visible cleanup commands only after correctness-critical restart/idempotency hardening is stable. No automatic deletion should be introduced implicitly.\n'''
if old not in text:
    raise SystemExit("P10 TODO marker missing")
p.write_text(text.replace(old, new, 1))

# Keep UPDATE/how-it-works concise but current.
p = Path("docs/UPDATE.md")
text = p.read_text()
text += '''\n## P10 ROI hardening\n\nThe first P10 hardening pass follows ROI rather than TODO number order. Durable restart recovery and PR idempotency are treated as correctness-critical, followed by transition and handoff integrity. Durable job parsing now validates nested account/session/team/handoff/PR/pending/event authority, exact handoff parsing verifies its deterministic logical identity, and engine handoff receipts are revision-idempotent. START_IMPLEMENTATION retries reconcile an exact deterministic head branch before creating a PR. Existing account-isolation and scoped-approval suites were audited as sufficient closure coverage; retention/cleanup remains the lower-ROI residual item.\n'''
p.write_text(text)
