from pathlib import Path

path = Path("test/workflow-review.test.ts")
text = path.read_text()
old = '''\tjobs.update(started.jobId, (job) => ({
\t\t...job,
\t\tstate: "PR_OPEN",
'''
new = '''\tjobs.update(started.jobId, (job) => ({
\t\t...job,
\t\trevision: job.revision + 1,
\t\tstate: "PR_OPEN",
'''
if old not in text:
    raise SystemExit("expected review fixture update not found")
path.write_text(text.replace(old, new, 1))
