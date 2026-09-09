from pathlib import Path

p = Path("src/workflow/job-store.ts")
text = p.read_text()
text = text.replace("\t\tconst runs = value[phase];", "\t\tconst runs = value[phase] as unknown[];")
old = '''\tif (value.mergeAuthorization !== undefined) {\n\t\tif (!isRecord(value.pullRequest)) throw new Error("merge authorization requires a pull request receipt");\n\t\tif (\n\t\t\tvalue.mergeAuthorization.number !== value.pullRequest.number ||\n\t\t\tvalue.mergeAuthorization.url !== value.pullRequest.url ||\n\t\t\tvalue.mergeAuthorization.head !== value.pullRequest.head ||\n\t\t\tvalue.mergeAuthorization.headSha !== value.pullRequest.headSha\n\t\t) throw new Error("merge authorization does not match pull request receipt");\n\t}\n\tif (value.mergeReceipt !== undefined) {\n\t\tif (value.state !== "DONE") throw new Error("merge receipt requires DONE state");\n\t\tif (!isRecord(value.pullRequest)) throw new Error("merge receipt requires a pull request receipt");\n\t\tif (\n\t\t\tvalue.mergeReceipt.number !== value.pullRequest.number ||\n\t\t\tvalue.mergeReceipt.url !== value.pullRequest.url ||\n\t\t\tvalue.mergeReceipt.headSha !== value.pullRequest.headSha\n\t\t) throw new Error("merge receipt does not match pull request receipt");\n\t}\n'''
new = '''\tif (value.mergeAuthorization !== undefined) {\n\t\tconst authorization = value.mergeAuthorization;\n\t\tif (!isRecord(authorization)) throw new Error("invalid merge authorization");\n\t\tif (!isRecord(value.pullRequest)) throw new Error("merge authorization requires a pull request receipt");\n\t\tif (\n\t\t\tauthorization.number !== value.pullRequest.number ||\n\t\t\tauthorization.url !== value.pullRequest.url ||\n\t\t\tauthorization.head !== value.pullRequest.head ||\n\t\t\tauthorization.headSha !== value.pullRequest.headSha\n\t\t) throw new Error("merge authorization does not match pull request receipt");\n\t}\n\tif (value.mergeReceipt !== undefined) {\n\t\tconst mergeReceipt = value.mergeReceipt;\n\t\tif (!isRecord(mergeReceipt)) throw new Error("invalid merge receipt");\n\t\tif (value.state !== "DONE") throw new Error("merge receipt requires DONE state");\n\t\tif (!isRecord(value.pullRequest)) throw new Error("merge receipt requires a pull request receipt");\n\t\tif (\n\t\t\tmergeReceipt.number !== value.pullRequest.number ||\n\t\t\tmergeReceipt.url !== value.pullRequest.url ||\n\t\t\tmergeReceipt.headSha !== value.pullRequest.headSha\n\t\t) throw new Error("merge receipt does not match pull request receipt");\n\t}\n'''
if old not in text:
    raise SystemExit("merge narrowing marker missing")
p.write_text(text.replace(old, new, 1))

for path in ["test/workflow-handoff.test.ts", "test/workflow-p10-hardening.test.ts"]:
    p = Path(path)
    text = p.read_text()
    text = text.replace('JSON.stringify(changed, null, 2) + "\\n"', '`${JSON.stringify(changed, null, 2)}\\n`')
    text = text.replace('JSON.stringify(raw, null, 2) + "\\n"', '`${JSON.stringify(raw, null, 2)}\\n`')
    p.write_text(text)
