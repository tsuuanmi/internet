from pathlib import Path

p = Path('scripts/p12-finalize.py')
text = p.read_text()
old = "extra = r'''\\tit(\"preserves unknown Website confirmation as its own fail-closed boundary\", async () => {"
new = "extra = '''\\tit(\"preserves unknown Website confirmation as its own fail-closed boundary\", async () => {"
if old not in text:
    raise SystemExit('expected raw test block not found')
text = text.replace(old, new, 1)

misplaced = '''# Use the state returned by the immediate health recheck for the subsequent merge control.\nreplace(\n    'src/workflow/engine.ts',\n    '''\\t\\tconst result = await this.writer.runControl({\\n\\t\\t\\tsessionId: job.writerConversation.sessionId,\\n\\t\\t\\tjob,\\n\\t\\t\\tcontrol,\\n\\t\\t\\tsignal,\\n\\t\\t});\\n''',\n    '''\\t\\tconst result = await this.writer.runControl({\\n\\t\\t\\tsessionId: health.writerConversation.sessionId,\\n\\t\\t\\tjob: health,\\n\\t\\t\\tcontrol,\\n\\t\\t\\tsignal,\\n\\t\\t});\\n''',\n    1,\n)\n\n'''
if misplaced not in text:
    raise SystemExit('misplaced merge-control rewrite not found')
text = text.replace(misplaced, '', 1)
p.write_text(text)
