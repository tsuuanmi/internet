from pathlib import Path

p = Path("scripts/p10-roi.py")
text = p.read_text()
old = """    '''\\tif (typeof value.deliveredAt !== undefined &&\\n\\t\\t(typeof value.deliveredAt !== \"string\" || !Number.isFinite(Date.parse(value.deliveredAt)))\\n\\t) {\\n\\t\\tthrow new Error(\"invalid deliveredAt\");\\n\\t}\\n\\treturn value as unknown as WorkflowHandoff;'''.replace('typeof value.deliveredAt !== undefined', 'value.deliveredAt !== undefined'),"""
new = """    '''\\tif (\\n\\t\\tvalue.deliveredAt !== undefined &&\\n\\t\\t(typeof value.deliveredAt !== \"string\" || !Number.isFinite(Date.parse(value.deliveredAt)))\\n\\t) {\\n\\t\\tthrow new Error(\"invalid deliveredAt\");\\n\\t}\\n\\treturn value as unknown as WorkflowHandoff;''',"""
if old not in text:
    raise SystemExit("faulty handoff marker not found")
p.write_text(text.replace(old, new, 1))
