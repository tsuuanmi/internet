from pathlib import Path
import re

path = Path("test/workflow-writer-runner.test.ts")
text = path.read_text()
text, count = re.subn(
    r'(runControl\(\{\n\s+sessionId: writerSessionId,\n)(?!\s+requestKey:)',
    r'\1\t\t\trequestKey: "writer-request",\n',
    text,
)
if count < 1:
    raise RuntimeError("expected at least one writer request without requestKey")
path.write_text(text)
