from pathlib import Path

engine = Path("src/workflow/engine.ts")
text = engine.read_text()
old = '''\t\tif (job.state !== "RESEARCH_HANDOFFS_DELIVERING") {\n\t\t\tthrow new WorkflowEngineError(`workflow job ${jobId} cannot prepare research handoffs from ${job.state}`);\n\t\t}\n'''
new = '''\t\tif (job.state !== "RESEARCH_HANDOFFS_DELIVERING" && job.state !== "WRITER_RUNNING") {\n\t\t\tthrow new WorkflowEngineError(`workflow job ${jobId} cannot prepare research handoffs from ${job.state}`);\n\t\t}\n'''
if old not in text:
    raise SystemExit("expected prepareResearchHandoffs state guard not found")
engine.write_text(text.replace(old, new, 1))
