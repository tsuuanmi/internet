from pathlib import Path

path = Path("scripts/p11-finalize.py")
text = path.read_text()
old = "shutdown_test = r'''\\tit("
new = "shutdown_test = '''\\tit("
if old not in text:
    raise SystemExit("expected raw shutdown test prefix not found")
path.write_text(text.replace(old, new, 1))
