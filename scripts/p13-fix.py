from pathlib import Path

retention = Path("src/workflow/retention.ts")
s = retention.read_text()
s = s.replace(
'''\tprivate readonly auditDir: string;\n\tprivate readonly handoffRoot: string;\n\n\tconstructor(\n\t\tprivate readonly dataDir: string,\n\t\tprivate readonly jobs: WorkflowJobStore,\n\t\tprivate readonly policy: WorkflowRetentionPolicy = DEFAULT_WORKFLOW_RETENTION_POLICY,\n\t\tprivate readonly now: () => Date = () => new Date(),\n\t) {\n\t\tassertPolicy(policy);''',
'''\tprivate readonly auditDir: string;\n\tprivate readonly handoffRoot: string;\n\tprivate readonly jobs: WorkflowJobStore;\n\tprivate readonly policy: WorkflowRetentionPolicy;\n\tprivate readonly now: () => Date;\n\n\tconstructor(\n\t\tdataDir: string,\n\t\tjobs: WorkflowJobStore,\n\t\tpolicy: WorkflowRetentionPolicy = DEFAULT_WORKFLOW_RETENTION_POLICY,\n\t\tnow: () => Date = () => new Date(),\n\t) {\n\t\tassertPolicy(policy);\n\t\tthis.jobs = jobs;\n\t\tthis.policy = policy;\n\t\tthis.now = now;''')

# Validate the entire handoff directory before deleting anything, so malformed contents cannot produce partial cleanup.
s = s.replace(
'''\t\t\tif (existsSync(jobHandoffDir)) {\n\t\t\t\tconst stat = lstatSync(jobHandoffDir);\n\t\t\t\tif (!stat.isDirectory()) throw new WorkflowRetentionError("workflow handoff path is not a directory");\n\t\t\t\tfor (const name of readdirSync(jobHandoffDir).sort()) {\n\t\t\t\t\tif (!/^[0-9a-f]{64}\\.json$/u.test(name))\n\t\t\t\t\t\tthrow new WorkflowRetentionError(`unexpected file in workflow handoff directory: ${name}`);\n\t\t\t\t\tconst path = join(jobHandoffDir, name);\n\t\t\t\t\tconst file = lstatSync(path);\n\t\t\t\t\tif (!file.isFile()) throw new WorkflowRetentionError(`handoff cleanup target is not a regular file: ${name}`);\n\t\t\t\t\tif (process.platform !== "win32" && (file.mode & 0o077) !== 0)\n\t\t\t\t\t\tthrow new WorkflowRetentionError(`handoff cleanup target permissions must be 0600: ${name}`);\n\t\t\t\t\tunlinkSync(path);\n\t\t\t\t\tdeletedHandoffFiles += 1;\n\t\t\t\t}\n\t\t\t\trmdirSync(jobHandoffDir);\n\t\t\t}''',
'''\t\t\tif (existsSync(jobHandoffDir)) {\n\t\t\t\tconst stat = lstatSync(jobHandoffDir);\n\t\t\t\tif (!stat.isDirectory()) throw new WorkflowRetentionError("workflow handoff path is not a directory");\n\t\t\t\tconst names = readdirSync(jobHandoffDir).sort();\n\t\t\t\tfor (const name of names) {\n\t\t\t\t\tif (!/^[0-9a-f]{64}\\.json$/u.test(name))\n\t\t\t\t\t\tthrow new WorkflowRetentionError(`unexpected file in workflow handoff directory: ${name}`);\n\t\t\t\t\tconst path = join(jobHandoffDir, name);\n\t\t\t\t\tconst file = lstatSync(path);\n\t\t\t\t\tif (!file.isFile()) throw new WorkflowRetentionError(`handoff cleanup target is not a regular file: ${name}`);\n\t\t\t\t\tif (process.platform !== "win32" && (file.mode & 0o077) !== 0)\n\t\t\t\t\t\tthrow new WorkflowRetentionError(`handoff cleanup target permissions must be 0600: ${name}`);\n\t\t\t\t}\n\t\t\t\tfor (const name of names) {\n\t\t\t\t\tunlinkSync(join(jobHandoffDir, name));\n\t\t\t\t\tdeletedHandoffFiles += 1;\n\t\t\t\t}\n\t\t\t\trmdirSync(jobHandoffDir);\n\t\t\t}''')
retention.write_text(s)

maintenance = Path("src/tools/internet-workflow-maintenance.ts")
m = maintenance.read_text().replace("\t\texecute(args, exec) {", "\t\tasync execute(args, exec) {")
maintenance.write_text(m)

for path in [Path("test/index.test.ts"), Path("scripts/verify-package.mjs")]:
    text = path.read_text()
    text = text.replace(
'''\t\t\t"internet_workflow",\n\t\t\t"internet_team",''',
'''\t\t\t"internet_workflow",\n\t\t\t"internet_workflow_maintenance",\n\t\t\t"internet_team",''')
    text = text.replace(
'''"internet_browser", "internet_chat", "internet_research", "internet_workflow", "internet_team"''',
'''"internet_browser", "internet_chat", "internet_research", "internet_workflow", "internet_workflow_maintenance", "internet_team"''')
    path.write_text(text)
