from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"expected text not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))

# Visible remediation progress should reach Local before the writer starts applying review findings.
replace(
    "src/workflow/engine.ts",
    'lastEvent: { type: "APPLY_REVIEWS_READY", class: "INTERNAL", at: now() },',
    'lastEvent: { type: "REMEDIATION_STARTED", class: "PROGRESS", at: now(), message: state.pullRequest?.url },',
)

# Event delivery is observability only. A broken custom sink must not turn a committed state transition into an error.
replace(
    "src/workflow/engine.ts",
    "\t\t\tif (changed) this.events?.publish(updated, event);",
    "\t\t\tif (changed && this.events !== undefined) {\n\t\t\t\ttry {\n\t\t\t\t\tthis.events.publish(updated, event);\n\t\t\t\t} catch {\n\t\t\t\t\t// Notification delivery is never part of workflow correctness.\n\t\t\t\t}\n\t\t\t}",
)

# Focused integration checks for visible engine events and notification failure isolation.
p = Path("test/workflow-events.test.ts")
text = p.read_text()
insert = r'''

	it("publishes an ACTION_REQUIRED engine event without exposing team output", async () => {
		const root = mkdtempSync(join(tmpdir(), "internet-events-research-"));
		const seen: WorkflowEventRecord[] = [];
		const teams = {
			async run() {
				return { ok: false as const, error: "provider unavailable", failedAccountId: "chatgpt-thinker" as const, failedProvider: "chatgpt-web" as const };
			},
		};
		const events: WorkflowEventSink = { publish(_job, event) { seen.push(event); } };
		const engine = new WorkflowEngine(new WorkflowJobStore(root), teams, undefined, undefined, undefined, 3, events);
		const job = engine.start({ objective: "secret team objective", repository: "https://github.com/example/repo", baseRevision: "0123456789abcdef0123456789abcdef01234567", ownerSessionId: "local-agent" });
		const result = await engine.runResearch(job.jobId);
		expect(result.state).toBe("FAILED_RETRYABLE");
		expect(seen.some((event) => event.type === "RESEARCH_RETRY_REQUIRED" && event.class === "ACTION_REQUIRED")).toBe(true);
		expect(JSON.stringify(seen)).not.toContain("secret team objective");
	});

	it("keeps committed workflow state when an event sink throws", async () => {
		const root = mkdtempSync(join(tmpdir(), "internet-events-throwing-"));
		const teams = {
			async run() {
				return { ok: false as const, error: "provider unavailable", failedAccountId: "chatgpt-thinker" as const, failedProvider: "chatgpt-web" as const };
			},
		};
		const events: WorkflowEventSink = { publish() { throw new Error("notification transport failed"); } };
		const engine = new WorkflowEngine(new WorkflowJobStore(root), teams, undefined, undefined, undefined, 3, events);
		const job = engine.start({ objective: "x", repository: "https://github.com/example/repo", baseRevision: "0123456789abcdef0123456789abcdef01234567", ownerSessionId: "local-agent" });
		const result = await engine.runResearch(job.jobId);
		expect(result.state).toBe("FAILED_RETRYABLE");
		expect(engine.status(job.jobId).state).toBe("FAILED_RETRYABLE");
	});
'''
marker = "\n});\n"
pos = text.rfind(marker)
if pos < 0:
    raise SystemExit("workflow-events describe terminator missing")
text = text[:pos] + insert + text[pos:]
p.write_text(text)

replace(
    "src/index.ts",
    '"Scoped Website confirmation classification is fail-closed and auto-confirms only exact in-scope writer actions; merge is explicitly excluded. Actual PR review now runs two independent exact-head reviewer lanes, delivers both finals verbatim to the persistent writer, applies remediation to the same PR, and re-reviews changed heads for up to three cycles. Local event injection and explicit merge binding remain later workflow phases.",',
    '"Scoped Website confirmation classification is fail-closed and auto-confirms only exact in-scope writer actions; merge is explicitly excluded. Actual PR review runs two independent exact-head reviewer lanes, delivers both finals verbatim to the persistent writer, applies remediation to the same PR, and re-reviews changed heads for up to three cycles. PROGRESS and ACTION_REQUIRED workflow events are injected as compact host-native DSH context for Local without raw team/reviewer payloads; INTERNAL events remain engine-only. Explicit head-SHA-bound merge authorization remains a later workflow phase.",',
)

replace(
    "README.md",
    "`UNKNOWN_CONFIRMATION`; merge is never auto-authorized. Compact Local event injection and the explicit\nhead-SHA-bound merge gate remain later phases. The workflow is registered only when both thinker accounts are\nenabled; the writer path additionally requires a ready `chatgpt-writer` account when implementation is driven.",
    "`UNKNOWN_CONFIRMATION`; merge is never auto-authorized. The engine now publishes compact workflow events: `INTERNAL`\nrecords stay inside the control plane, while `PROGRESS` and `ACTION_REQUIRED` records are injected into the live\nowner Agent through DSH's native `agent.inject()` path. This adds durable model-facing context for Local's next\nadmitted step without waking an idle Local, and never includes research/reviewer payloads. `internet_workflow status`\nalso exposes payload-free team, handoff, writer, PR, review-cycle, pending-action, last-event, and last-error summaries.\nThe explicit head-SHA-bound merge gate remains a later phase. The workflow is registered only when both thinker\naccounts are enabled; the writer path additionally requires a ready `chatgpt-writer` account when implementation is driven.",
)

replace(
    "docs/how-it-works.md",
    "Compact Local event injection and the head-SHA-bound user merge authorization/execution gate remain later workflow\nphases and are not implied by reaching `READY_FOR_MERGE_AUTHORIZATION`.",
    "Every durable engine mutation that installs a new `lastEvent` passes through one event-publication boundary.\n`INTERNAL` events remain control-plane-only. `PROGRESS` and `ACTION_REQUIRED` events are projected by\n`DshWorkflowEventSink` into compact text containing only job/state/repository/review-cycle/PR/head/pending-action\nmetadata and the compact event message; team and reviewer payloads are never copied into Local. The job persists\nits exact `ownerSessionId`, so notification routing never reverse-parses a derived writer session ID. The sink looks\nup that live owner through DSH's `ctx.agents` registry and uses `agent.inject()` with plugin source `internet`. DSH\ninjection is durable model-facing context for the next admitted step and deliberately does not wake an idle Local.\nA missing/disposed owner or a notification transport failure is ignored after the workflow state commit, because\nobservability is not part of workflow correctness.\n\n`internet_workflow status` projects payload-free debug summaries for research/review lanes, handoff hashes and\ndelivery state, writer identity, PR/head, review cycle, pending action, last event, and last error. A polling-style\n`wait(job_id)` remains optional and is not part of orchestration. The head-SHA-bound user merge authorization and\nexecution gate remains P9 and is not implied by reaching `READY_FOR_MERGE_AUTHORIZATION`.",
)

p = Path("docs/TODO.md")
text = p.read_text()
start = text.index("## P8 — Events and Local integration")
end = text.index("## P9 — Merge gate")
block = '''## P8 — Events and Local integration\n\n**Status:** implemented with compact host-native Local context injection and a payload-free status/debug projection.\nNotification delivery is explicitly best-effort and never part of workflow correctness.\n\n### 30. ✅ Add INTERNAL / PROGRESS / ACTION_REQUIRED events\n\nThe existing durable `lastEvent` classification is now connected to a workflow event sink. `INTERNAL` records remain\ninside the engine; `PROGRESS` and `ACTION_REQUIRED` are eligible for Local notification. Research/reviewer finals are\nnever projected into these events. Remediation now emits an explicit `REMEDIATION_STARTED` progress event.\n\n### 31. ✅ Integrate with host-native DSH completion/event injection\n\nEach job persists its exact Local `ownerSessionId`. `DshWorkflowEventSink` resolves that live Agent through\n`ctx.agents` and uses `agent.inject()` with plugin source `internet`. Injection adds compact durable model-facing context\nfor Local's next admitted step without waking an idle agent. Missing/disposed Local agents and notification failures\ndo not affect committed workflow state.\n\n### 32. ✅ Add workflow status/debug surface\n\n`internet_workflow status` now projects payload-free summaries for:\n\n```text\njob state\nresearch/review lane status + attempts/errors\nhandoff source/recipient/hash/delivery state\nwriter account/session\nPR URL/head SHA\nreview cycle\npending action\nlast event\nlast error\n```\n\nExact team/reviewer payloads remain in their dedicated stores and are not returned by status.\n\n### 33. Optional wait convenience — deferred\n\n`wait(job_id)` is intentionally not added. Host-native event injection plus explicit `status(job_id)` provides the\nneeded UX without turning polling/waiting into the orchestration model. Add it only if a concrete caller needs a\nsynchronous convenience later.\n\n'''
p.write_text(text[:start] + block + text[end:])

p = Path("docs/UPDATE.md")
text = p.read_text()
addition = '''\n\n### 8. Local integration uses compact host-native Agent injection\n\nP8 connects durable workflow events to the Local owner without restoring the old child-agent transformation layer.\nEach job persists its exact `ownerSessionId`. New `PROGRESS` and `ACTION_REQUIRED` records are formatted from\ncontrol-plane metadata only and injected through DSH `agent.inject()` with plugin source `internet`; `INTERNAL`\nrecords are not injected. DSH injection does not wake an idle Agent, so the notification becomes context for the\nnext admitted Local step rather than forcing an extra model turn.\n\nNotification delivery is best-effort after the durable state transition. A missing/disposed Local Agent or a broken\nevent sink cannot roll back or fail committed workflow work. The `internet_workflow status` projection now exposes\nteam/run state, handoff hashes and receipts, writer state, PR/head, review cycle, pending action, last event, and last\nerror without returning research or reviewer payloads. `wait(job_id)` remains deferred until a concrete synchronous\ncaller needs it.\n'''
if "### 8. Local integration uses compact host-native Agent injection" not in text:
    p.write_text(text.rstrip() + addition + "\n")
