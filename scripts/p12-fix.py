from pathlib import Path

# Existing merge-gate fixtures now include an exact-head healthy receipt.
p = Path('test/workflow-merge-gate.test.ts')
text = p.read_text()
text = text.replace(
'''\t\tpullRequest: {\n\t\t\trepository: "example/repo",\n\t\t\tnumber: 7,\n\t\t\turl: "https://github.com/example/repo/pull/7",\n\t\t\tbase: "main",\n\t\t\thead: `internet-workflow/${jobId}`,\n\t\t\theadSha,\n\t\t},\n\t\treviewCycle: 1,\n''',
'''\t\tpullRequest: {\n\t\t\trepository: "example/repo",\n\t\t\tnumber: 7,\n\t\t\turl: "https://github.com/example/repo/pull/7",\n\t\t\tbase: "main",\n\t\t\thead: `internet-workflow/${jobId}`,\n\t\t\theadSha,\n\t\t},\n\t\tciReceipt: {\n\t\t\trepository: "example/repo",\n\t\t\tnumber: 7,\n\t\t\turl: "https://github.com/example/repo/pull/7",\n\t\t\theadSha,\n\t\t\tstatus: "PASS",\n\t\t\tcheckedAt: timestamp,\n\t\t},\n\t\treviewCycle: 1,\n''', 1)

# Merge execution now performs one read-only health control before MERGE_AUTHORIZED.
text = text.replace(
'''\t\tconst writer: WorkflowWriterRunner = {\n\t\t\tasync deliverExact() {},\n\t\t\tasync runControl(request) {\n\t\t\t\texpect(request.control.kind).toBe("MERGE_AUTHORIZED");\n\t\t\t\texpect(request.control.expectedHeadSha).toBe(headSha);\n\t\t\t\treturn {\n\t\t\t\t\tstatus: "MERGED",\n''',
'''\t\tlet calls = 0;\n\t\tconst writer: WorkflowWriterRunner = {\n\t\t\tasync deliverExact() {},\n\t\t\tasync runControl(request) {\n\t\t\t\tcalls += 1;\n\t\t\t\tif (request.control.kind === "CHECK_PR_HEALTH") {\n\t\t\t\t\treturn { status: "PR_HEALTH", repository: "example/repo", number: 7, url: "https://github.com/example/repo/pull/7", headSha, health: "PASS" };\n\t\t\t\t}\n\t\t\t\texpect(request.control.kind).toBe("MERGE_AUTHORIZED");\n\t\t\t\texpect(request.control.expectedHeadSha).toBe(headSha);\n\t\t\t\treturn {\n\t\t\t\t\tstatus: "MERGED",\n''', 1)
text = text.replace(
'''\t\texpect(done.state).toBe("DONE");\n\t\texpect(done.mergeReceipt).toMatchObject({ headSha, mergedSha, executorAccountId: "chatgpt-writer" });\n''',
'''\t\texpect(done.state).toBe("DONE");\n\t\texpect(calls).toBe(2);\n\t\texpect(done.mergeReceipt).toMatchObject({ headSha, mergedSha, executorAccountId: "chatgpt-writer" });\n''', 1)

# Different-premerge-head test also needs the preceding health response.
old = '''\t\tconst writer: WorkflowWriterRunner = {\n\t\t\tasync deliverExact() {},\n\t\t\tasync runControl() {\n\t\t\t\treturn {\n\t\t\t\t\tstatus: "MERGED",\n\t\t\t\t\trepository: "example/repo",\n\t\t\t\t\tnumber: 7,\n\t\t\t\t\turl: "https://github.com/example/repo/pull/7",\n\t\t\t\t\theadSha: mergedSha,\n\t\t\t\t\tmergedSha,\n\t\t\t\t};\n\t\t\t},\n\t\t};\n'''
new = '''\t\tlet calls = 0;\n\t\tconst writer: WorkflowWriterRunner = {\n\t\t\tasync deliverExact() {},\n\t\t\tasync runControl() {\n\t\t\t\tcalls += 1;\n\t\t\t\tif (calls === 1) return { status: "PR_HEALTH", repository: "example/repo", number: 7, url: "https://github.com/example/repo/pull/7", headSha, health: "PASS" };\n\t\t\t\treturn {\n\t\t\t\t\tstatus: "MERGED",\n\t\t\t\t\trepository: "example/repo",\n\t\t\t\t\tnumber: 7,\n\t\t\t\t\turl: "https://github.com/example/repo/pull/7",\n\t\t\t\t\theadSha: mergedSha,\n\t\t\t\t\tmergedSha,\n\t\t\t\t};\n\t\t\t},\n\t\t};\n'''
if old not in text:
    raise SystemExit('merge mismatch writer block not found')
text = text.replace(old, new, 1)
p.write_text(text)

# P10 restart merge fixture: persist the old exact-head receipt and return health then merge.
p = Path('test/workflow-p10-hardening.test.ts')
text = p.read_text()
text = text.replace(
'''\t\t\tpullRequest: pr,\n\t\t\treviewCycle: 1,\n''',
'''\t\t\tpullRequest: pr,\n\t\t\tciReceipt: { repository: current.repository, number: pr.number, url: pr.url, headSha: pr.headSha, status: "PASS", checkedAt: new Date().toISOString() },\n\t\t\treviewCycle: 1,\n''', 1)
old = '''\t\tconst writer: WorkflowWriterRunner = {\n\t\t\tasync deliverExact() {},\n\t\t\tasync runControl() {\n\t\t\t\treturn {\n\t\t\t\t\tstatus: "MERGED",\n\t\t\t\t\trepository: "example/repo",\n\t\t\t\t\tnumber: 4,\n\t\t\t\t\turl: pr.url,\n\t\t\t\t\theadSha: prHeadSha,\n\t\t\t\t\tmergedSha,\n\t\t\t\t};\n\t\t\t},\n\t\t};\n'''
new = '''\t\tlet calls = 0;\n\t\tconst writer: WorkflowWriterRunner = {\n\t\t\tasync deliverExact() {},\n\t\t\tasync runControl() {\n\t\t\t\tcalls += 1;\n\t\t\t\tif (calls === 1) return { status: "PR_HEALTH", repository: "example/repo", number: 4, url: pr.url, headSha: prHeadSha, health: "PASS" };\n\t\t\t\treturn {\n\t\t\t\t\tstatus: "MERGED",\n\t\t\t\t\trepository: "example/repo",\n\t\t\t\t\tnumber: 4,\n\t\t\t\t\turl: pr.url,\n\t\t\t\t\theadSha: prHeadSha,\n\t\t\t\t\tmergedSha,\n\t\t\t\t};\n\t\t\t},\n\t\t};\n'''
if old not in text:
    raise SystemExit('P10 merge writer block not found')
text = text.replace(old, new, 1)
p.write_text(text)
