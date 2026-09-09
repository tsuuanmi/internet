from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"expected text not found in {path}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))

# Persist the parent/local identity explicitly; no inference from derived writer session IDs.
replace(
    "src/workflow/types.ts",
    "\treadonly jobId: string;\n\treadonly objective: string;",
    "\treadonly jobId: string;\n\treadonly ownerSessionId: string;\n\treadonly objective: string;",
)
replace(
    "src/workflow/job-store.ts",
    "\tif (typeof value.objective !== \"string\" || value.objective.trim() === \"\") throw new Error(\"invalid objective\");",
    "\tif (typeof value.ownerSessionId !== \"string\" || value.ownerSessionId.trim() === \"\")\n\t\tthrow new Error(\"invalid owner session id\");\n\tif (typeof value.objective !== \"string\" || value.objective.trim() === \"\") throw new Error(\"invalid objective\");",
)

# Route all engine job mutations through one event publication boundary.
p = Path("src/workflow/engine.ts")
text = p.read_text()
text = text.replace(
    'import type { WorkflowHandoff, WorkflowHandoffStore } from "#internet/workflow/handoff-store";\n',
    'import type { WorkflowEventSink } from "#internet/workflow/events";\nimport type { WorkflowHandoff, WorkflowHandoffStore } from "#internet/workflow/handoff-store";\n',
    1,
)
text = text.replace("\tprivate readonly maxReviewCycles: number;\n", "\tprivate readonly maxReviewCycles: number;\n\tprivate readonly events?: WorkflowEventSink;\n", 1)
text = text.replace(
    "\t\twriter?: WorkflowWriterRunner,\n\t\tmaxReviewCycles = 3,\n\t) {",
    "\t\twriter?: WorkflowWriterRunner,\n\t\tmaxReviewCycles = 3,\n\t\tevents?: WorkflowEventSink,\n\t) {",
    1,
)
text = text.replace("\t\tthis.maxReviewCycles = maxReviewCycles;\n\t}\n", "\t\tthis.maxReviewCycles = maxReviewCycles;\n\t\tthis.events = events;\n\t}\n", 1)
text = text.replace(
    "\t\t\tjobId: id,\n\t\t\tobjective,",
    "\t\t\tjobId: id,\n\t\t\townerSessionId: input.ownerSessionId,\n\t\t\tobjective,",
    1,
)
text = text.replace("this.jobs.update(", "this.update(")
marker = "\n\tcancel(jobId: string): WorkflowJob {"
helper = '''\n\tprivate update(jobId: string, mutate: (current: WorkflowJob) => WorkflowJob): WorkflowJob {\n\t\tconst before = this.jobs.get(jobId);\n\t\tconst updated = this.jobs.update(jobId, mutate);\n\t\tconst event = updated.lastEvent;\n\t\tif (event !== undefined) {\n\t\t\tconst prior = before?.lastEvent;\n\t\t\tconst changed =\n\t\t\t\tprior === undefined ||\n\t\t\t\tprior.type !== event.type ||\n\t\t\t\tprior.class !== event.class ||\n\t\t\t\tprior.at !== event.at ||\n\t\t\t\tprior.message !== event.message;\n\t\t\tif (changed) this.events?.publish(updated, event);\n\t\t}\n\t\treturn updated;\n\t}\n'''
if marker not in text:
    raise SystemExit("engine cancel marker missing")
text = text.replace(marker, helper + marker, 1)
p.write_text(text)

# Host-native DSH agent injection. It is best-effort and never part of workflow correctness.
replace(
    "src/index.ts",
    'import { WorkflowEngine } from "#internet/workflow/engine";\n',
    'import { WorkflowEngine } from "#internet/workflow/engine";\nimport { DshWorkflowEventSink, type WorkflowAgentRegistry } from "#internet/workflow/events";\n',
)
replace(
    "src/index.ts",
    'export const inject = ["tools", "systemPrompt", "commands"] as const;',
    'export const inject = ["tools", "systemPrompt", "commands", "agents"] as const;',
)
replace(
    "src/index.ts",
    "export interface PluginContext {\n\ttools:",
    "export interface PluginContext {\n\tagents: WorkflowAgentRegistry;\n\ttools:",
)
replace(
    "src/index.ts",
    "\t\t\tnew BrowserWorkflowWriterRunner(manager),\n\t\t);",
    "\t\t\tnew BrowserWorkflowWriterRunner(manager),\n\t\t\t3,\n\t\t\tnew DshWorkflowEventSink(ctx.agents),\n\t\t);",
)
replace(
    "src/index.ts",
    'export type { WorkflowControlStep } from "#internet/workflow/engine";\nexport { WorkflowEngine, WorkflowEngineError } from "#internet/workflow/engine";',
    'export type { WorkflowControlStep } from "#internet/workflow/engine";\nexport { WorkflowEngine, WorkflowEngineError } from "#internet/workflow/engine";\nexport type { WorkflowAgentRegistry, WorkflowEventSink, WorkflowLocalAgent } from "#internet/workflow/events";\nexport { DshWorkflowEventSink, formatWorkflowEvent } from "#internet/workflow/events";',
)

# Add payload-free workflow debug projection to the existing tool surface.
p = Path("src/tools/internet-workflow.ts")
text = p.read_text()
old = '''function project(job: WorkflowJob) {\n\treturn {\n\t\tjobId: job.jobId,\n\t\tstate: job.state,\n\t\trepository: job.repository,\n\t\tbaseRevision: job.baseRevision,\n\t\treviewCycle: job.reviewCycle,'''
new = '''function runsSummary(runs: WorkflowJob["teamRuns"]["research"]): string {\n\treturn runs.map((run) => `${run.lane}:${run.status}:attempts=${run.attempts}${run.error === undefined ? "" : `:error=${run.error}`}`).join(", ");\n}\n\nfunction handoffSummary(job: WorkflowJob): string {\n\treturn job.handoffReceipts\n\t\t.map((item) => `${item.sequence}:${item.source}->${item.recipient}:${item.status}:${item.payloadHash}`)\n\t\t.join(", ");\n}\n\nfunction lastError(job: WorkflowJob): string | undefined {\n\tconst failed = [...job.teamRuns.research, ...job.teamRuns.review].find((run) => run.status === "failed" && run.error !== undefined);\n\treturn failed?.error ?? job.pendingAction?.message;\n}\n\nfunction project(job: WorkflowJob) {\n\treturn {\n\t\tjobId: job.jobId,\n\t\tstate: job.state,\n\t\trepository: job.repository,\n\t\tbaseRevision: job.baseRevision,\n\t\tresearchRuns: runsSummary(job.teamRuns.research),\n\t\treviewRuns: runsSummary(job.teamRuns.review),\n\t\thandoffs: handoffSummary(job),\n\t\twriterState: `account=${job.writerConversation.accountId} session=${job.writerConversation.sessionId}`,\n\t\treviewCycle: job.reviewCycle,\n\t\t...(job.lastEvent === undefined\n\t\t\t? {}\n\t\t\t: { lastEventClass: job.lastEvent.class, lastEventType: job.lastEvent.type, lastEventMessage: job.lastEvent.message }),\n\t\t...(lastError(job) === undefined ? {} : { lastError: lastError(job) }),'''
if old not in text:
    raise SystemExit("tool project marker missing")
text = text.replace(old, new, 1)
text = text.replace(
    '\t\t\t\t\treviewCycle: { type: "number" },\n',
    '\t\t\t\t\tresearchRuns: { type: "string" },\n\t\t\t\t\treviewRuns: { type: "string" },\n\t\t\t\t\thandoffs: { type: "string" },\n\t\t\t\t\twriterState: { type: "string" },\n\t\t\t\t\treviewCycle: { type: "number" },\n\t\t\t\t\tlastEventClass: { type: "string" },\n\t\t\t\t\tlastEventType: { type: "string" },\n\t\t\t\t\tlastEventMessage: { type: "string" },\n\t\t\t\t\tlastError: { type: "string" },\n',
    1,
)
p.write_text(text)

# Existing static WorkflowJob fixtures now carry the explicit owner identity.
for fixture in [
    "test/commands/workflow.test.ts",
    "test/workflow-team-runtime.test.ts",
    "test/workflow-writer-runner.test.ts",
]:
    p = Path(fixture)
    lines = p.read_text().splitlines()
    out = []
    inserted = False
    for line in lines:
        out.append(line)
        stripped = line.strip()
        if not inserted and ("jobId:" in line or stripped == "jobId,"):
            indent = line[: len(line) - len(line.lstrip())]
            out.append(f'{indent}ownerSessionId: "agent",')
            inserted = True
    if not inserted:
        raise SystemExit(f"jobId fixture marker missing in {fixture}")
    p.write_text("\n".join(out) + "\n")

replace(
    "test/index.test.ts",
    "\tconst context: PluginContext = {\n\t\ttools:",
    "\tconst context: PluginContext = {\n\t\tagents: { get: () => undefined },\n\t\ttools:",
)

# Focused tests: no raw payload injection, INTERNAL suppression, and engine event boundary behavior.
Path("test/workflow-events.test.ts").write_text(r'''import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorkflowEngine } from "#internet/workflow/engine";
import { DshWorkflowEventSink, formatWorkflowEvent, type WorkflowEventSink } from "#internet/workflow/events";
import { WorkflowJobStore } from "#internet/workflow/job-store";
import type { WorkflowEventRecord, WorkflowJob } from "#internet/workflow/types";

function minimalJob(): WorkflowJob {
	const engine = new WorkflowEngine(new WorkflowJobStore(mkdtempSync(join(tmpdir(), "internet-events-job-"))));
	return engine.start({
		objective: "test objective",
		repository: "https://github.com/example/repo",
		baseRevision: "0123456789abcdef0123456789abcdef01234567",
		ownerSessionId: "local-agent",
	});
}

describe("workflow Local events", () => {
	it("injects compact PROGRESS context and suppresses INTERNAL events", () => {
		const injected: unknown[] = [];
		const sink = new DshWorkflowEventSink({
			get(id) {
				expect(id).toBe("local-agent");
				return { inject(message) { injected.push(message); } };
			},
		});
		const job = minimalJob();
		const internal: WorkflowEventRecord = { type: "TEAM_COMPLETED", class: "INTERNAL", at: new Date().toISOString() };
		sink.publish(job, internal);
		expect(injected).toEqual([]);
		const progress: WorkflowEventRecord = { type: "PR_OPENED", class: "PROGRESS", at: new Date().toISOString(), message: "https://github.com/example/repo/pull/7" };
		sink.publish(job, progress);
		expect(injected).toHaveLength(1);
		const text = (injected[0] as { content: [{ text: string }] }).content[0].text;
		expect(text).toContain("event=PR_OPENED");
		expect(text).toContain("state=CREATED");
		expect(text).not.toContain("finalAnswer");
	});

	it("formats only control-plane job facts", () => {
		const text = formatWorkflowEvent(minimalJob(), { type: "WRITER_BLOCKED", class: "ACTION_REQUIRED", at: new Date().toISOString(), message: "needs user action" });
		expect(text).not.toContain("pending_action=");
		expect(text).not.toContain("test objective");
		expect(text).toContain("needs user action");
	});

	it("does not fabricate an event for a mutation that leaves lastEvent unchanged", () => {
		const root = mkdtempSync(join(tmpdir(), "internet-events-engine-"));
		const seen: Array<{ job: string; event: string; klass: string }> = [];
		const events: WorkflowEventSink = { publish(job, event) { seen.push({ job: job.jobId, event: event.type, klass: event.class }); } };
		const engine = new WorkflowEngine(new WorkflowJobStore(root), undefined, undefined, undefined, undefined, 3, events);
		const job = engine.start({ objective: "x", repository: "https://github.com/example/repo", baseRevision: "0123456789abcdef0123456789abcdef01234567", ownerSessionId: "local-agent" });
		engine.cancel(job.jobId);
		expect(seen).toEqual([]);
	});
});
''')
