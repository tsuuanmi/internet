from pathlib import Path
p = Path('scripts/p13-apply.py')
s = p.read_text()
s = s.replace('''\tconstructor(\n\t\tprivate readonly dataDir: string,\n\t\tprivate readonly jobs: WorkflowJobStore,''', '''\tconstructor(\n\t\tdataDir: string,\n\t\tprivate readonly jobs: WorkflowJobStore,''')
p.write_text(s)
