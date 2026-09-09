from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"expected text not found in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1))

# Keep system guidance aligned with the implemented P9 gate.
replace(
    "src/index.ts",
    '"Scoped Website confirmation classification is fail-closed and auto-confirms only exact in-scope writer actions; merge is explicitly excluded. Actual PR review runs two independent exact-head reviewer lanes, delivers both finals verbatim to the persistent writer, applies remediation to the same PR, and re-reviews changed heads for up to three cycles. PROGRESS and ACTION_REQUIRED workflow events are injected as compact host-native DSH context for Local without raw team/reviewer payloads; INTERNAL events remain engine-only. Explicit head-SHA-bound merge authorization remains a later workflow phase.",',
    '"Scoped Website confirmation classification is fail-closed. Implementation/remediation actions auto-confirm only in exact writer scope; merge remains excluded until a reviewed PR reaches the explicit P9 gate. request_merge emits a concrete ACTION_REQUIRED request, approve binds repository + PR + branch + exact head SHA, and only MERGING may auto-confirm the exact merge after the writer revalidates the live PR head. Successful merge records the merge SHA/executor and completes the job. PROGRESS and ACTION_REQUIRED events remain compact Local context without raw team/reviewer payloads.",',
)

# Rejecting the merge request means "not authorized", not a generic broken workflow.
p = Path("src/workflow/engine.ts")
text = p.read_text()
old = r'''	reject(input: WorkflowDecisionInput): WorkflowJob {
		return this.update(input.jobId, (current) => {
			if (current.pendingAction === undefined)
				throw new WorkflowEngineError(`workflow job ${input.jobId} has no pending action to reject`);
			return { ...withState(current, "BLOCKED"), pendingAction: undefined };
		});
	}
'''
new = r'''	reject(input: WorkflowDecisionInput): WorkflowJob {
		return this.update(input.jobId, (current) => {
			if (current.pendingAction === undefined)
				throw new WorkflowEngineError(`workflow job ${input.jobId} has no pending action to reject`);
			if (current.pendingAction.kind === "MERGE_AUTHORIZATION_REQUIRED") {
				return {
					...withState(current, "READY_FOR_MERGE_AUTHORIZATION"),
					pendingAction: undefined,
					mergeAuthorization: undefined,
					lastEvent: { type: "MERGE_AUTHORIZATION_REJECTED", class: "INTERNAL", at: now() },
				};
			}
			return { ...withState(current, "BLOCKED"), pendingAction: undefined };
		});
	}
'''
if old not in text:
    raise SystemExit("engine reject marker missing")
p.write_text(text.replace(old, new, 1))

# Validate newly authoritative persisted merge structures instead of shallow-casting them.
p = Path("src/workflow/job-store.ts")
text = p.read_text()
marker = '''function isState(value: unknown): value is WorkflowState {\n\treturn typeof value === "string" && (WORKFLOW_STATES as readonly string[]).includes(value);\n}\n'''
helpers = r'''

function isFullSha(value: unknown): value is string {
	return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function assertMergeAuthorization(value: unknown): void {
	if (value === undefined) return;
	if (!isRecord(value)) throw new Error("invalid merge authorization");
	if (typeof value.repository !== "string" || value.repository.trim() === "") throw new Error("invalid merge authorization repository");
	if (!isPositiveInteger(value.number)) throw new Error("invalid merge authorization PR number");
	if (typeof value.url !== "string" || !/^https:\/\/github\.com\//u.test(value.url)) throw new Error("invalid merge authorization URL");
	if (typeof value.head !== "string" || value.head.trim() === "") throw new Error("invalid merge authorization head");
	if (!isFullSha(value.headSha)) throw new Error("invalid merge authorization head SHA");
	if (typeof value.reviewCycle !== "number" || !Number.isSafeInteger(value.reviewCycle) || value.reviewCycle < 1) throw new Error("invalid merge authorization review cycle");
	if (!isTimestamp(value.authorizedAt)) throw new Error("invalid merge authorization timestamp");
	if (typeof value.authorizedByOwnerSessionId !== "string" || value.authorizedByOwnerSessionId.trim() === "") throw new Error("invalid merge authorization owner");
}

function assertMergeReceipt(value: unknown): void {
	if (value === undefined) return;
	if (!isRecord(value)) throw new Error("invalid merge receipt");
	if (typeof value.repository !== "string" || value.repository.trim() === "") throw new Error("invalid merge receipt repository");
	if (!isPositiveInteger(value.number)) throw new Error("invalid merge receipt PR number");
	if (typeof value.url !== "string" || !/^https:\/\/github\.com\//u.test(value.url)) throw new Error("invalid merge receipt URL");
	if (!isFullSha(value.headSha) || !isFullSha(value.mergedSha)) throw new Error("invalid merge receipt SHA");
	if (value.executorAccountId !== "chatgpt-writer") throw new Error("invalid merge receipt executor");
	if (!isTimestamp(value.mergedAt)) throw new Error("invalid merge receipt timestamp");
}
'''
if marker not in text:
    raise SystemExit("job-store state marker missing")
text = text.replace(marker, marker + helpers, 1)
needle = '''\tif (typeof value.reviewCycle !== "number" || !Number.isSafeInteger(value.reviewCycle) || value.reviewCycle < 0) {\n\t\tthrow new Error("invalid review cycle");\n\t}\n\treturn value as unknown as WorkflowJob;'''
replacement = '''\tif (typeof value.reviewCycle !== "number" || !Number.isSafeInteger(value.reviewCycle) || value.reviewCycle < 0) {\n\t\tthrow new Error("invalid review cycle");\n\t}\n\tassertMergeAuthorization(value.mergeAuthorization);\n\tassertMergeReceipt(value.mergeReceipt);\n\tif (value.mergeReceipt !== undefined && value.state !== "DONE") throw new Error("merge receipt requires DONE state");\n\treturn value as unknown as WorkflowJob;'''
if needle not in text:
    raise SystemExit("job-store review marker missing")
p.write_text(text.replace(needle, replacement, 1))

# Add focused tests for deny semantics and persisted authority validation.
p = Path("test/workflow-merge-gate.test.ts")
text = p.read_text()
insert = r'''

	it("keeps a denied merge request ready but unauthorized", () => {
		const engine = setup();
		engine.requestMergeAuthorization(jobId);
		const denied = engine.reject({ jobId, expectedHeadSha: headSha });
		expect(denied.state).toBe("READY_FOR_MERGE_AUTHORIZATION");
		expect(denied.pendingAction).toBeUndefined();
		expect(denied.mergeAuthorization).toBeUndefined();
	});
'''
end = text.rfind("\n});\n")
if end < 0:
    raise SystemExit("merge-gate describe terminator missing")
text = text[:end] + insert + text[end:]
p.write_text(text)

# Job-store validation test stays small and authority-focused.
p = Path("test/workflow-engine.test.ts")
text = p.read_text()
anchor = 'describe("WorkflowJobStore", () => {'
if anchor in text:
    # existing suite can remain untouched; merge gate suite exercises writes/reads indirectly.
    pass

# Clarify docs for deny semantics and durable authority validation.
replace(
    "docs/TODO.md",
    "`approve(job_id, expectedHeadSha)` requires the exact pending head and persists a `mergeAuthorization` bound to repository, PR number/URL, head branch, head SHA, review cycle, authorization time, and owner session.",
    "`approve(job_id, expectedHeadSha)` requires the exact pending head and persists a `mergeAuthorization` bound to repository, PR number/URL, head branch, head SHA, review cycle, authorization time, and owner session. Rejecting the request simply returns the job to `READY_FOR_MERGE_AUTHORIZATION` with no authorization; it does not mark the workflow broken. Persisted merge authorization/receipt structures are validated on load rather than shallow-cast.",
)
