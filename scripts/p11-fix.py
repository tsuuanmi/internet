from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing expected block in {path}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1))


replace(
    'src/tools/internet-workflow.ts',
    'export function defineInternetWorkflowTool(engine: WorkflowEngine, driver: WorkflowDriver): ReturnType<typeof defineTool> {\n',
    'export function defineInternetWorkflowTool(\n\tengine: WorkflowEngine,\n\tdriver: Pick<WorkflowDriver, "enqueue" | "cancel">,\n): ReturnType<typeof defineTool> {\n',
)

p = Path('test/internet-workflow.test.ts')
text = p.read_text()
text = text.replace('import { WorkflowDriver } from "#internet/workflow/driver";\n', '')
text = text.replace(
    '''\tconst driver = new WorkflowDriver(engine, jobs);\n\treturn defineInternetWorkflowTool(engine, driver);\n''',
    '''\tconst driver = {\n\t\tenqueue() {},\n\t\tasync cancel(jobId: string) {\n\t\t\treturn engine.cancel(jobId);\n\t\t},\n\t};\n\treturn defineInternetWorkflowTool(engine, driver);\n''',
)
p.write_text(text)

p = Path('test/workflow-review.test.ts')
text = p.read_text()
text = text.replace('expect(reviewed.state).toBe("REVIEW_RUNNING");', 'expect(reviewed.state).toBe("FAILED_RETRYABLE");', 1)
old = 'expect(reviewed.teamRuns.review.some((run) => run.status === "failed")).toBe(true);'
new = '''expect(reviewed.teamRuns.review.some((run) => run.status === "failed")).toBe(true);\n\t\texpect(reviewed.pendingAction).toMatchObject({ kind: "RETRY_REQUIRED", resumeState: "REVIEW_RUNNING" });'''
if old not in text:
    raise SystemExit('review failure assertion not found')
text = text.replace(old, new, 1)
p.write_text(text)
