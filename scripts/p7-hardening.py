from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"expected text not found in {path}")
    file.write_text(text.replace(old, new, 1))


Path("src/workflow/review-result.ts").write_text('''export const WORKFLOW_REVIEW_VERDICTS = ["PASS", "CHANGES_REQUIRED"] as const;
export type WorkflowReviewVerdict = (typeof WORKFLOW_REVIEW_VERDICTS)[number];

export interface WorkflowReviewResult {
\treadonly verdict: WorkflowReviewVerdict;
\treadonly reviewedHeadSha: string;
}

/** Parse control-plane review metadata while the complete reviewer payload remains stored verbatim. */
export function parseWorkflowReviewResult(payload: string): WorkflowReviewResult {
\tlet value: unknown;
\ttry {
\t\tvalue = JSON.parse(payload.trim());
\t} catch {
\t\tthrow new Error("workflow reviewer must return one JSON object");
\t}
\tif (typeof value !== "object" || value === null || Array.isArray(value)) {
\t\tthrow new Error("workflow reviewer result must be an object");
\t}
\tconst record = value as Record<string, unknown>;
\tif (record.verdict !== "PASS" && record.verdict !== "CHANGES_REQUIRED") {
\t\tthrow new Error("workflow reviewer verdict must be PASS or CHANGES_REQUIRED");
\t}
\tif (typeof record.reviewedHeadSha !== "string" || !/^[0-9a-f]{40}$/u.test(record.reviewedHeadSha)) {
\t\tthrow new Error("workflow reviewer reviewedHeadSha must be a full Git SHA");
\t}
\treturn { verdict: record.verdict, reviewedHeadSha: record.reviewedHeadSha };
}
''')

replace_once(
    "src/workflow/team-prompt-builder.ts",
    'Use {"verdict":"PASS","summary":"concise evidence-based summary"} when no material issue remains. Otherwise use {"verdict":"CHANGES_REQUIRED","findings":[{"severity":"high|medium|low","location":"file/area","issue":"concrete problem","remediation":"required fix"}]}.',
    'Use {"verdict":"PASS","reviewedHeadSha":"the exact 40-character PR head SHA above","summary":"concise evidence-based summary"} when no material issue remains. Otherwise use {"verdict":"CHANGES_REQUIRED","reviewedHeadSha":"the exact 40-character PR head SHA above","findings":[{"severity":"high|medium|low","location":"file/area","issue":"concrete problem","remediation":"required fix"}]}.',
)

replace_once(
    "src/workflow/engine.ts",
    'import { parseWorkflowReviewVerdict } from "#internet/workflow/review-result";\n',
    'import type { WorkflowReviewResult } from "#internet/workflow/review-result";\nimport { parseWorkflowReviewResult } from "#internet/workflow/review-result";\n',
)
replace_once(
    "src/workflow/engine.ts",
    '\t\t\t\tlet result: WorkflowTeamRunResult;\n\t\t\t\ttry {\n\t\t\t\t\tresult = await this.teams!.run({\n\t\t\t\t\t\ttask: this.prompts.review(running, lane),\n\t\t\t\t\t\tsessionId: run.sessionId,\n\t\t\t\t\t\taccounts: running.accountRouting.thinkerAccounts,\n\t\t\t\t\t\tsynthesizer: running.accountRouting.synthesizerAccount,\n\t\t\t\t\t\tsignal,\n\t\t\t\t\t});\n\t\t\t\t\tif (result.ok) parseWorkflowReviewVerdict(result.finalAnswer);\n',
    '\t\t\t\tlet result: WorkflowTeamRunResult;\n\t\t\t\tlet reviewResult: WorkflowReviewResult | undefined;\n\t\t\t\ttry {\n\t\t\t\t\tresult = await this.teams!.run({\n\t\t\t\t\t\ttask: this.prompts.review(running, lane),\n\t\t\t\t\t\tsessionId: run.sessionId,\n\t\t\t\t\t\taccounts: running.accountRouting.thinkerAccounts,\n\t\t\t\t\t\tsynthesizer: running.accountRouting.synthesizerAccount,\n\t\t\t\t\t\tsignal,\n\t\t\t\t\t});\n\t\t\t\t\tif (result.ok) {\n\t\t\t\t\t\treviewResult = parseWorkflowReviewResult(result.finalAnswer);\n\t\t\t\t\t\tif (reviewResult.reviewedHeadSha !== reviewedHeadSha) {\n\t\t\t\t\t\t\tthrow new Error("workflow reviewer result is bound to a different PR head SHA");\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n',
)
replace_once(
    "src/workflow/engine.ts",
    '\t\t\t\tthis.recordTeamResult(jobId, "review", lane, result, reviewedHeadSha);\n',
    '\t\t\t\tthis.recordTeamResult(jobId, "review", lane, result, reviewResult);\n',
)
replace_once(
    "src/workflow/engine.ts",
    '\t\tresult: WorkflowTeamRunResult,\n\t\treviewedHeadSha?: string,\n',
    '\t\tresult: WorkflowTeamRunResult,\n\t\treviewResult?: WorkflowReviewResult,\n',
)
replace_once(
    "src/workflow/engine.ts",
    '\t\t\t\t\t\t\t\t...(phase === "review" && reviewedHeadSha !== undefined\n\t\t\t\t\t\t\t\t\t? { reviewedHeadSha, reviewVerdict: parseWorkflowReviewVerdict(result.finalAnswer) }\n\t\t\t\t\t\t\t\t\t: {}),\n',
    '\t\t\t\t\t\t\t\t...(phase === "review" && reviewResult !== undefined\n\t\t\t\t\t\t\t\t\t? { reviewedHeadSha: reviewResult.reviewedHeadSha, reviewVerdict: reviewResult.verdict }\n\t\t\t\t\t\t\t\t\t: {}),\n',
)

# Every test reviewer payload must explicitly bind itself to the reviewed head.
test = Path("test/workflow-review.test.ts")
text = test.read_text()
text = text.replace('{"verdict":"PASS","summary":"clean"}', '{"verdict":"PASS","reviewedHeadSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","summary":"clean"}')
text = text.replace('{"verdict":"PASS","summary":"A clean"}', '{"verdict":"PASS","reviewedHeadSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","summary":"A clean"}')
text = text.replace('{"verdict":"PASS","summary":"B clean"}', '{"verdict":"PASS","reviewedHeadSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","summary":"B clean"}')
text = text.replace('{"verdict":"PASS","summary":"ok"}', '{"verdict":"PASS","reviewedHeadSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","summary":"ok"}')
text = text.replace('{"verdict":"CHANGES_REQUIRED","findings":[', '{"verdict":"CHANGES_REQUIRED","reviewedHeadSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","findings":[')
# Second-cycle answers must bind to the remediated head instead of the initial head.
old = 'const { engine, jobId } = setup([change, pass, pass, pass], writer);'
new = '''const passNewHead = '{"verdict":"PASS","reviewedHeadSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","summary":"clean"}';
\t\tconst { engine, jobId } = setup([change, pass, passNewHead, passNewHead], writer);'''
if old not in text:
    raise SystemExit("expected second-cycle review fixture not found")
text = text.replace(old, new, 1)
test.write_text(text)
