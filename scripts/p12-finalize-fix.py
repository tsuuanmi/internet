from pathlib import Path

p = Path('scripts/p12-finalize.py')
text = p.read_text()
old = "extra = r'''\\tit(\"preserves unknown Website confirmation as its own fail-closed boundary\", async () => {"
new = "extra = '''\\tit(\"preserves unknown Website confirmation as its own fail-closed boundary\", async () => {"
if old not in text:
    raise SystemExit('expected raw test block not found')
p.write_text(text.replace(old, new, 1))
