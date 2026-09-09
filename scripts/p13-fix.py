from pathlib import Path

p = Path('scripts/p13-apply.py')
s = p.read_text()
s = s.replace(
'''\tprivate readonly auditDir: string;\n\tprivate readonly handoffRoot: string;\n\n\tconstructor(\n\t\tprivate readonly dataDir: string,\n\t\tprivate readonly jobs: WorkflowJobStore,\n\t\tprivate readonly policy: WorkflowRetentionPolicy = DEFAULT_WORKFLOW_RETENTION_POLICY,\n\t\tprivate readonly now: () => Date = () => new Date(),\n\t) {\n\t\tassertPolicy(policy);''',
'''\tprivate readonly auditDir: string;\n\tprivate readonly handoffRoot: string;\n\tprivate readonly jobs: WorkflowJobStore;\n\tprivate readonly policy: WorkflowRetentionPolicy;\n\tprivate readonly now: () => Date;\n\n\tconstructor(\n\t\tdataDir: string,\n\t\tjobs: WorkflowJobStore,\n\t\tpolicy: WorkflowRetentionPolicy = DEFAULT_WORKFLOW_RETENTION_POLICY,\n\t\tnow: () => Date = () => new Date(),\n\t) {\n\t\tassertPolicy(policy);\n\t\tthis.jobs = jobs;\n\t\tthis.policy = policy;\n\t\tthis.now = now;''')
s = s.replace('\t\texecute(args, exec) {', '\t\tasync execute(args, exec) {')
p.write_text(s)
