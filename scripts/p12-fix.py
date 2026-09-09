from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing replacement anchor in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))

# A non-merge-eligible pre-merge health result must invalidate authorization
# in the same durable update; otherwise the JobStore correctly rejects the
# transient combination of PENDING/FAIL/UNKNOWN health plus authorization.
replace_once(
    "src/workflow/engine.ts",
    '\t\t\t\tprHealth: refreshedHealth,\n\t\t\t\tupdatedAt: now(),\n\t\t\t}));\n\t\t\treturn this.writerBlocked(jobId, message, "READY_FOR_MERGE_AUTHORIZATION");\n',
    '\t\t\t\tprHealth: refreshedHealth,\n\t\t\t\tmergeAuthorization: undefined,\n\t\t\t\tupdatedAt: now(),\n\t\t\t}));\n\t\t\treturn this.writerBlocked(jobId, message, "READY_FOR_MERGE_AUTHORIZATION");\n',
)

# P10's durable restart fixture now needs the exact-head health authority that
# production MERGING jobs require. This is an intentional schema invariant,
# not a compatibility fallback.
replace_once(
    "test/workflow-p10-hardening.test.ts",
    '\t\t\tstate: "MERGING",\n\t\t\tpullRequest: pr,\n\t\t\treviewCycle: 1,\n\t\t\tmergeAuthorization: {\n',
    '\t\t\tstate: "MERGING",\n\t\t\tpullRequest: pr,\n\t\t\tprHealth: {\n\t\t\t\trepository: pr.repository,\n\t\t\t\tnumber: pr.number,\n\t\t\t\turl: pr.url,\n\t\t\t\theadSha: pr.headSha,\n\t\t\t\tstatus: "PASS",\n\t\t\t\tsummary: "all required checks passed before authorization",\n\t\t\t\tcheckedAt: new Date().toISOString(),\n\t\t\t},\n\t\t\treviewCycle: 1,\n\t\t\tmergeAuthorization: {\n',
)

# The restarted writer must answer the new immediate health revalidation
# before it receives MERGE_AUTHORIZED.
replace_once(
    "test/workflow-p10-hardening.test.ts",
    '\t\t\tasync runControl() {\n\t\t\t\treturn {\n\t\t\t\t\tstatus: "MERGED",\n\t\t\t\t\trepository: "example/repo",\n\t\t\t\t\tnumber: 4,\n\t\t\t\t\turl: pr.url,\n\t\t\t\t\theadSha: prHeadSha,\n\t\t\t\t\tmergedSha,\n\t\t\t\t};\n\t\t\t},\n',
    '\t\t\tasync runControl(request) {\n\t\t\t\tif (request.control.kind === "CHECK_PR_HEALTH") {\n\t\t\t\t\treturn {\n\t\t\t\t\t\tstatus: "PR_HEALTH",\n\t\t\t\t\t\trepository: "example/repo",\n\t\t\t\t\t\tnumber: 4,\n\t\t\t\t\t\turl: pr.url,\n\t\t\t\t\t\theadSha: prHeadSha,\n\t\t\t\t\t\thealth: "PASS",\n\t\t\t\t\t\tsummary: "all required checks still pass",\n\t\t\t\t\t};\n\t\t\t\t}\n\t\t\t\treturn {\n\t\t\t\t\tstatus: "MERGED",\n\t\t\t\t\trepository: "example/repo",\n\t\t\t\t\tnumber: 4,\n\t\t\t\t\turl: pr.url,\n\t\t\t\t\theadSha: prHeadSha,\n\t\t\t\t\tmergedSha,\n\t\t\t\t};\n\t\t\t},\n',
)

print("P12 validation fixes applied")
