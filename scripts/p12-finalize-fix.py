from pathlib import Path

p = Path('scripts/p12-finalize.py')
text = p.read_text()
old = "extra = r'''\\tit(\"preserves unknown Website confirmation as its own fail-closed boundary\", async () => {"
new = "extra = '''\\tit(\"preserves unknown Website confirmation as its own fail-closed boundary\", async () => {"
if old not in text:
    raise SystemExit('expected raw test block not found')
text = text.replace(old, new, 1)

start_marker = '# Use the state returned by the immediate health recheck for the subsequent merge control.\n'
end_marker = '# Tighten driver fast path to the complete persisted PR identity, not SHA alone.\n'
start = text.find(start_marker)
end = text.find(end_marker)
if start < 0 or end < 0 or end <= start:
    raise SystemExit('misplaced merge-control rewrite markers not found')
text = text[:start] + text[end:]
p.write_text(text)
