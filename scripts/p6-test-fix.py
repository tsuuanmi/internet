from pathlib import Path

path = Path("test/workflow-writer.test.ts")
text = path.read_text()
old = 'expect(blocked.pendingAction).toEqual({ kind: "WRITER_BLOCKED", message: "Base revision no longer matches." });'
new = 'expect(blocked.pendingAction).toEqual({ kind: "WRITER_BLOCKED", message: "Base revision no longer matches.", resumeState: "WRITER_RUNNING" });'
if old not in text:
    raise SystemExit("expected writer BLOCKED assertion not found")
path.write_text(text.replace(old, new, 1))
