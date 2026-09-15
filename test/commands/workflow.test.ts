import { describe, expect, it, vi } from "vitest";
import {
	defineWorkflowCommand,
	type GitRunner,
	normalizeRepositoryUrl,
	type WorkflowCommandOperator,
} from "#internet/commands/workflow";
import type { StartWorkflowInput, WorkflowJob } from "#internet/workflow/types";

const REVISION = "0123456789abcdef0123456789abcdef01234567";
const JOB_ID = "0123456789abcdef0123456789abcdef";

function createRunner(overrides: Record<string, string | Error> = {}): GitRunner {
	const outputs: Record<string, string | Error> = {
		"rev-parse --show-toplevel": "/repo\n",
		"ls-remote --exit-code --heads origin refs/heads/main": `${REVISION}\trefs/heads/main\n`,
		remote: "origin\n",
		"rev-parse --abbrev-ref HEAD": "main\n",
		"config --get branch.main.remote": "origin\n",
		"remote get-url -- origin": "git@github.com:example/signal.git\n",
		...overrides,
	};
	return async (_cwd, args) => {
		const output = outputs[args.join(" ")];
		if (output instanceof Error) throw output;
		if (output === undefined) throw new Error(`unexpected Git invocation: ${args.join(" ")}`);
		return output;
	};
}

function fakeJob(input: StartWorkflowInput): WorkflowJob {
	const at = "2026-09-08T00:00:00.000Z";
	return {
		schema: "@tsuuanmi/internet-workflow-job",
		version: 3,
		revision: 1,
		jobId: JOB_ID,
		ownerSessionId: "agent",
		objective: input.objective,
		repository: input.repository,
		baseRevision: input.baseRevision,
		graph: {
			schema: "@tsuuanmi/internet-workflow-graph",
			version: 1,
			graphRevision: 0,
			eventSeq: 0,
			phase: "RESEARCH",
			lifecycle: "RUNNING",
			nodes: {},
		},
		accountRouting: {
			thinkerAccounts: ["chatgpt-thinker", "gemini-thinker"],
			writerAccount: "chatgpt-writer",
			synthesizerAccount: "chatgpt-thinker",
		},
		handoffReceipts: [],
		writerConversation: { sessionId: "writer", accountId: "chatgpt-writer" },
		reviewCycle: 0,
		createdAt: at,
		updatedAt: at,
	};
}

function operator(): WorkflowCommandOperator {
	return {
		list: vi.fn(() => "LIST"),
		status: vi.fn(() => "STATUS"),
		watch: vi.fn(() => "WATCH"),
		stop: vi.fn(async () => "STOPPED"),
		continue: vi.fn(() => "CONTINUED"),
		delete: vi.fn(async () => "DELETED"),
	};
}

function invocation(rawInput: string, cwd = "/repo") {
	return {
		agent: { id: "1-1", session: { header: cwd === "" ? {} : { cwd } } },
		rawInput,
		signal: new AbortController().signal,
	};
}

describe("defineWorkflowCommand", () => {
	it("resolves upstream main and starts one durable workflow", async () => {
		const runGit = vi.fn(createRunner());
		const start = vi.fn((input: StartWorkflowInput) => fakeJob(input));
		const enqueue = vi.fn();
		const command = defineWorkflowCommand({ engine: { start }, driver: { enqueue }, operator: operator(), runGit });
		await expect(command.handler(invocation("  Correct the login redirect.  ") as never)).resolves.toEqual({
			kind: "success",
			text: `Workflow ${JOB_ID} started for https://github.com/example/signal at 0123456789ab.`,
		});
		expect(start).toHaveBeenCalledWith({
			objective: "Correct the login redirect.",
			repository: "https://github.com/example/signal",
			baseRevision: REVISION,
			ownerSessionId: "1-1",
		});
		expect(enqueue).toHaveBeenCalledWith(JOB_ID);
	});

	it("routes operator commands without inspecting Git", async () => {
		const runGit = vi.fn(createRunner());
		const op = operator();
		const command = defineWorkflowCommand({ engine: { start: vi.fn() }, driver: { enqueue: vi.fn() }, operator: op, runGit });
		for (const [raw, expected] of [
			["list", "LIST"],
			[`status ${JOB_ID}`, "STATUS"],
			[`watch ${JOB_ID}`, "WATCH"],
			[`stop ${JOB_ID}`, "STOPPED"],
			[`continue ${JOB_ID}`, "CONTINUED"],
			[`delete ${JOB_ID}`, "DELETED"],
		] as const) {
			await expect(command.handler(invocation(raw) as never)).resolves.toEqual({ kind: "success", text: expected });
		}
		expect(runGit).not.toHaveBeenCalled();
	});

	it("rejects malformed operations", async () => {
		const command = defineWorkflowCommand({
			engine: { start: vi.fn() },
			driver: { enqueue: vi.fn() },
			operator: operator(),
			runGit: createRunner(),
		});
		await expect(command.handler(invocation("list extra") as never)).resolves.toMatchObject({ kind: "error" });
		await expect(command.handler(invocation("status one two") as never)).resolves.toMatchObject({ kind: "error" });
		await expect(command.handler(invocation("delete") as never)).resolves.toMatchObject({ kind: "error" });
	});
});

describe("normalizeRepositoryUrl", () => {
	it.each([
		["git@github.com:example/signal.git", "https://github.com/example/signal"],
		["ssh://git@gitlab.com/group/project.git", "https://gitlab.com/group/project"],
		["https://token@github.com/example/signal.git", "https://github.com/example/signal"],
		["https://github.com/example/signal", "https://github.com/example/signal"],
		["file:///repo", undefined],
	])("normalizes %s", (remote, expected) => {
		expect(normalizeRepositoryUrl(remote)).toBe(expected);
	});
});
