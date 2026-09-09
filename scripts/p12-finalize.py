from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing expected block in {path}: {old[:140]!r}')
    p.write_text(text.replace(old, new, count))

# Preserve UNKNOWN_CONFIRMATION as its own operator boundary and invalidate merge authority.
replace(
    'src/workflow/engine.ts',
    '''\t\tif (result.status === "UNKNOWN_CONFIRMATION")\n\t\t\treturn this.writerBlocked(jobId, result.message, "READY_FOR_MERGE_AUTHORIZATION");\n\t\tif (result.status === "BLOCKED")\n''',
    '''\t\tif (result.status === "UNKNOWN_CONFIRMATION") {\n\t\t\treturn this.update(jobId, (current) => ({\n\t\t\t\t...withState(current, "UNKNOWN_CONFIRMATION"),\n\t\t\t\tmergeAuthorization: undefined,\n\t\t\t\tpendingAction: {\n\t\t\t\t\tkind: "UNKNOWN_CONFIRMATION",\n\t\t\t\t\tmessage: result.message,\n\t\t\t\t\tresumeState: "READY_FOR_MERGE_AUTHORIZATION",\n\t\t\t\t},\n\t\t\t\tlastEvent: { type: "UNKNOWN_CONFIRMATION", class: "ACTION_REQUIRED", at: now(), message: result.message },\n\t\t\t}));\n\t\t}\n\t\tif (result.status === "BLOCKED")\n''',
)

# Use the state returned by the immediate health recheck for the subsequent merge control.
replace(
    'src/workflow/engine.ts',
    '''\t\tconst result = await this.writer.runControl({\n\t\t\tsessionId: job.writerConversation.sessionId,\n\t\t\tjob,\n\t\t\tcontrol,\n\t\t\tsignal,\n\t\t});\n''',
    '''\t\tconst result = await this.writer.runControl({\n\t\t\tsessionId: health.writerConversation.sessionId,\n\t\t\tjob: health,\n\t\t\tcontrol,\n\t\t\tsignal,\n\t\t});\n''',
    1,
)

# Tighten driver fast path to the complete persisted PR identity, not SHA alone.
replace(
    'src/workflow/driver.ts',
    '''import type { WorkflowJobStore } from "#internet/workflow/job-store";\n''',
    '''import { normalizeGitHubRepository } from "#internet/workflow/approval-policy";\nimport type { WorkflowJobStore } from "#internet/workflow/job-store";\n''',
)
replace(
    'src/workflow/driver.ts',
    '''\t\t\t\t\tif (\n\t\t\t\t\t\tbefore.pullRequest !== undefined &&\n\t\t\t\t\t\tbefore.ciReceipt?.headSha === before.pullRequest.headSha &&\n\t\t\t\t\t\t(before.ciReceipt.status === "PASS" || before.ciReceipt.status === "NONE")\n\t\t\t\t\t)\n''',
    '''\t\t\t\t\tif (\n\t\t\t\t\t\tbefore.pullRequest !== undefined &&\n\t\t\t\t\t\tbefore.ciReceipt !== undefined &&\n\t\t\t\t\t\tnormalizeGitHubRepository(before.ciReceipt.repository) ===\n\t\t\t\t\t\t\tnormalizeGitHubRepository(before.pullRequest.repository) &&\n\t\t\t\t\t\tbefore.ciReceipt.number === before.pullRequest.number &&\n\t\t\t\t\t\tbefore.ciReceipt.url === before.pullRequest.url &&\n\t\t\t\t\t\tbefore.ciReceipt.headSha === before.pullRequest.headSha &&\n\t\t\t\t\t\t(before.ciReceipt.status === "PASS" || before.ciReceipt.status === "NONE")\n\t\t\t\t\t)\n''',
)

# Clean-break durable authority: a merge authorization must carry a current acceptable health receipt.
replace(
    'src/workflow/job-store.ts',
    '''\tif (value.mergeAuthorization !== undefined) {\n\t\tconst authorization = value.mergeAuthorization;\n''',
    '''\tif (value.mergeAuthorization !== undefined) {\n\t\tconst authorization = value.mergeAuthorization;\n\t\tif (!isRecord(value.ciReceipt) || (value.ciReceipt.status !== "PASS" && value.ciReceipt.status !== "NONE"))\n\t\t\tthrow new Error("merge authorization requires an acceptable exact-head CI receipt");\n''',
)

# Update system guidance and public type exports to reflect P12 authority.
replace(
    'src/index.ts',
    '''\t"Scoped Website confirmation classification is fail-closed. Implementation/remediation actions auto-confirm only in exact writer scope; merge remains excluded until a reviewed PR reaches the explicit P9 gate. request_merge emits a concrete ACTION_REQUIRED request, approve binds repository + PR + branch + exact head SHA, and only MERGING may auto-confirm the exact merge after the writer revalidates the live PR head. Successful merge records the merge SHA/executor and completes the job. PROGRESS and ACTION_REQUIRED events remain compact Local context without raw team/reviewer payloads.",\n''',
    '''\t"Scoped Website confirmation classification is fail-closed. Implementation/remediation actions auto-confirm only in exact writer scope. Before merge authorization, the writer performs a read-only live GitHub health check bound to repository + PR + exact head SHA and classifies required-check health as PASS, FAIL, PENDING, NONE, or UNKNOWN; only PASS or verified NONE is merge-eligible. request_merge emits a concrete ACTION_REQUIRED request only after that exact-head health gate, approve binds repository + PR + branch + exact head SHA, and MERGING re-checks live PR health immediately before the writer revalidates and merges the exact authorized head. Successful merge records the merge SHA/executor and completes the job. PROGRESS and ACTION_REQUIRED events remain compact Local context without raw team/reviewer payloads.",\n''',
)
replace(
    'src/index.ts',
    '''\tWorkflowAccountRouting,\n\tWorkflowDecisionInput,\n''',
    '''\tWorkflowAccountRouting,\n\tWorkflowCiReceipt,\n\tWorkflowCiStatus,\n\tWorkflowDecisionInput,\n''',
)
replace(
    'src/index.ts',
    '''export { TERMINAL_WORKFLOW_STATES, WORKFLOW_STATES, WORKFLOW_TEAM_STATUSES } from "#internet/workflow/types";\n''',
    '''export {\n\tTERMINAL_WORKFLOW_STATES,\n\tWORKFLOW_CI_STATUSES,\n\tWORKFLOW_STATES,\n\tWORKFLOW_TEAM_STATUSES,\n} from "#internet/workflow/types";\n''',
)

# Add focused unknown-confirmation test and assert exact health survives premerge recheck.
p = Path('test/workflow-ci-health.test.ts')
text = p.read_text()
anchor = '''\tit("keeps pending checks retryable and rejects stale-head health", async () => {\n'''
if anchor not in text:
    raise SystemExit('P12 test anchor not found')
extra = r'''\tit("preserves unknown Website confirmation as its own fail-closed boundary", async () => {
		const { engine, jobId } = ready({ status: "UNKNOWN_CONFIRMATION", message: "unexpected GitHub confirmation" });
		const blocked = await engine.runPrHealthCheck(jobId);
		expect(blocked.state).toBe("UNKNOWN_CONFIRMATION");
		expect(blocked.pendingAction).toMatchObject({
			kind: "UNKNOWN_CONFIRMATION",
			resumeState: "READY_FOR_MERGE_AUTHORIZATION",
		});
		expect(blocked.mergeAuthorization).toBeUndefined();
	});

'''
text = text.replace(anchor, extra + anchor, 1)
p.write_text(text)

# Mark roadmap phase implemented and awaiting review rather than leaving stale in-progress guidance.
p = Path('docs/TODO.md')
text = p.read_text().replace(
    '**Status:** implementation in progress on `impl/p12-ci-health-gate`.',
    '**Status:** implemented on `impl/p12-ci-health-gate`; pending review/merge.',
    1,
)
p.write_text(text)
