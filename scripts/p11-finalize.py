from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing expected block in {path}: {old[:100]!r}')
    p.write_text(text.replace(old, new, count))


# An intentional plugin shutdown abort must leave the durable phase resumable instead of
# manufacturing a user-facing retry failure.
replace(
    'src/workflow/engine.ts',
    '''\t\t\t\t} catch (error) {\n\t\t\t\t\tresult = {\n\t\t\t\t\t\tok: false,\n\t\t\t\t\t\terror: error instanceof Error ? error.message : String(error),\n\t\t\t\t\t\tfailedAccountId: running.accountRouting.synthesizerAccount,\n\t\t\t\t\t\tfailedProvider: "chatgpt-web",\n\t\t\t\t\t};\n\t\t\t\t}\n\t\t\t\tthis.recordTeamResult(jobId, "research", lane, result);\n''',
    '''\t\t\t\t} catch (error) {\n\t\t\t\t\tif (signal?.aborted) throw error;\n\t\t\t\t\tresult = {\n\t\t\t\t\t\tok: false,\n\t\t\t\t\t\terror: error instanceof Error ? error.message : String(error),\n\t\t\t\t\t\tfailedAccountId: running.accountRouting.synthesizerAccount,\n\t\t\t\t\t\tfailedProvider: "chatgpt-web",\n\t\t\t\t\t};\n\t\t\t\t}\n\t\t\t\tthis.recordTeamResult(jobId, "research", lane, result);\n''',
)
replace(
    'src/workflow/engine.ts',
    '''\t\t\t\t} catch (error) {\n\t\t\t\t\tresult = {\n\t\t\t\t\t\tok: false,\n\t\t\t\t\t\terror: error instanceof Error ? error.message : String(error),\n\t\t\t\t\t\tfailedAccountId: running.accountRouting.synthesizerAccount,\n\t\t\t\t\t\tfailedProvider: "chatgpt-web",\n\t\t\t\t\t};\n\t\t\t\t}\n\t\t\t\tthis.recordTeamResult(jobId, "review", lane, result, reviewResult);\n''',
    '''\t\t\t\t} catch (error) {\n\t\t\t\t\tif (signal?.aborted) throw error;\n\t\t\t\t\tresult = {\n\t\t\t\t\t\tok: false,\n\t\t\t\t\t\terror: error instanceof Error ? error.message : String(error),\n\t\t\t\t\t\tfailedAccountId: running.accountRouting.synthesizerAccount,\n\t\t\t\t\t\tfailedProvider: "chatgpt-web",\n\t\t\t\t\t};\n\t\t\t\t}\n\t\t\t\tthis.recordTeamResult(jobId, "review", lane, result, reviewResult);\n''',
)

# Make the normal UX accurately describe background execution.
replace(
    'src/commands/workflow.ts',
    'description: "start a durable reviewed implementation workflow",',
    'description: "start an automatically driven durable reviewed implementation workflow",',
)
replace(
    'src/commands/workflow.ts',
    'text: `Workflow ${job.jobId} created for ${repository.url} at ${repository.revision.slice(0, 12)}.`,',
    'text: `Workflow ${job.jobId} started for ${repository.url} at ${repository.revision.slice(0, 12)}.`,',
)
replace(
    'test/commands/workflow.test.ts',
    'text: `Workflow ${JOB_ID} created for https://github.com/example/signal at 0123456789ab.`,',
    'text: `Workflow ${JOB_ID} started for https://github.com/example/signal at 0123456789ab.`,',
)
replace(
    'src/tools/internet-workflow.ts',
    '"Create and control durable deterministic coding workflow jobs. start persists authoritative repository/objective state; status/approve/reject/cancel/continue operate by job ID.",',
    '"Create and control automatically driven durable coding workflow jobs. start persists authoritative state and enqueues execution; status/approve/reject/cancel/continue operate by job ID.",',
)

replace(
    'src/index.ts',
    '''\t"Use internet_workflow as the deterministic control-plane surface for durable coding jobs. /workflow <task> is the normal user entry point and creates the same durable engine job after resolving the current Git repository and exact revision.",\n''',
    '''\t"Use internet_workflow as the deterministic control-plane surface for durable coding jobs. /workflow <task> is the normal user entry point: it resolves the current Git repository and exact revision, creates the durable job, and immediately enqueues deterministic background execution.",\n\t"WorkflowDriver advances runnable engine states automatically through research, exact handoffs, writer implementation, PR review/remediation, and the explicit merge-authorization boundary. It is code-owned orchestration, not another LLM layer. Safe in-flight states are rediscovered after plugin restart; action-required and rejected-merge states remain stopped until explicit user/operator action.",\n''',
)

# Extend driver coverage for shutdown/restart behavior.
p = Path('test/workflow-driver.test.ts')
text = p.read_text()
needle = '''\tit("aborts and settles active work before persisting cancellation", async () => {\n'''
if needle not in text:
    raise SystemExit('driver cancellation test anchor not found')
shutdown_test = r'''\tit("keeps an intentionally aborted research phase resumable across driver disposal", async () => {
		const dataDir = root();
		const jobs = new WorkflowJobStore(dataDir);
		const created = start(jobs);
		const team = {
			async run(request: { signal?: AbortSignal }) {
				await new Promise<void>((_resolve, reject) => {
					request.signal?.addEventListener(
						"abort",
						() => reject(Object.assign(new Error("shutdown"), { name: "AbortError" })),
						{ once: true },
					);
				});
				throw new Error("unreachable");
			},
		};
		const engine = new WorkflowEngine(jobs, team);
		const driver = new WorkflowDriver(engine, jobs);
		driver.enqueue(created.jobId);
		await vi.waitFor(() => expect(engine.status(created.jobId).state).toBe("RESEARCH_RUNNING"));
		await driver.dispose();
		const persisted = engine.status(created.jobId);
		expect(persisted.state).toBe("RESEARCH_RUNNING");
		expect(persisted.pendingAction).toBeUndefined();
		const restarted = new WorkflowDriver(engine, jobs);
		restarted.resumeActive();
		expect(restarted.isActive(created.jobId)).toBe(true);
		await restarted.dispose();
	});

'''
text = text.replace(needle, shutdown_test + needle, 1)
p.write_text(text)

# P11 is implemented on the stacked branch; P12 remains the next ROI target.
p = Path('docs/TODO.md')
text = p.read_text()
text = text.replace(
    '**Status:** implementation in progress on `impl/p11-workflow-driver`.',
    '**Status:** implemented on `impl/p11-workflow-driver`; pending review/merge after P10.',
    1,
)
p.write_text(text)

p = Path('docs/UPDATE.md')
text = p.read_text()
if 'Intentional plugin shutdowns preserve runnable durable states' not in text:
    text += '''\nIntentional plugin shutdowns preserve runnable durable states: aborted research/review turns propagate the abort instead of being recorded as user-facing retry failures. This allows startup discovery to rerun only incomplete lanes after restart.\n'''
    p.write_text(text)
