from pathlib import Path

p = Path("src/workflow/approval-policy.ts")
text = p.read_text()
old = '''\tif (observation.action === "merge_pull_request") {\n\t\tif (context.pullRequest === undefined) {\n\t\t\treturn { kind: "unknown", reason: "merge confirmation requires the persisted workflow PR" };\n\t\t}\n'''
new = '''\tif (observation.action === "merge_pull_request") {\n\t\tif (context.pullRequest === undefined) {\n\t\t\treturn context.state === "MERGING"\n\t\t\t\t? { kind: "unknown", reason: "merge confirmation requires the persisted workflow PR" }\n\t\t\t\t: { kind: "merge-requires-user", reason: "merge requires explicit user authorization" };\n\t\t}\n'''
if old not in text:
    raise SystemExit("P9 merge classifier marker missing")
p.write_text(text.replace(old, new, 1))
