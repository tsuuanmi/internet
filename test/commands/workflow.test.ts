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
		"rev-parse HEAD": `${REVISION}\n`,
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
	return {
		schema: "@tsuuanmi/internet-workflow-job",
		version: 1,
		revision: 1,
		jobId: JOB_ID,
		ownerSessionId: "agent",
		objective: input.objective,
		repository: input.repository,
		baseRevision: input.baseRevision,
		state: "CREATED",
		teamRuns: {
			research: [
				{ lane: "A", status: "pending", attempts: 0, sessionId: "research:A" },
				{ lane: "B", status: "pending", attempts: 0, sessionId: "research:B" },
			],
			review: [
				{ lane: "A", status: "pending", attempts: 0, sessionId: "review:A" },
				{ lane: "B", status: "pending", attempts: 0, sessionId: "review:B" },
			],
		},
		accountRouting: {
			thinkerAccounts: ["chatgpt-thinker", "gemini-thinker"],
			writerAccount: "chatgpt-writer",
			synthesizerAccount: "chatgpt-thinker",
		},
		handoffReceipts: [],
		writerConversation: { sessionId: "writer", accountId: "chatgpt-writer" },
		reviewCycle: 0,
		createdAt: "2026-09-08T00:00:00.000Z",
		updatedAt: "2026-09-08T00:00:00.000Z",
	};
}

function engine() {
	return { start: vi.fn((input: StartWorkflowInput) => fakeJob(input)) };
}

function driver() {
	return { enqueue: vi.fn() };
}

function operator(): WorkflowCommandOperator & {
	list: ReturnType<typeof vi.fn>;
	status: ReturnType<typeof vi.fn>;
	watch: ReturnType<typeof vi.fn>;
	stop: ReturnType<typeof vi.fn>;
	continue: ReturnType<typeof vi.fn>;
} {
	return {
		list: vi.fn(() => "LIST"),
		status: vi.fn(() => "STATUS"),
		watch: vi.fn(() => "WATCH"),
		stop: vi.fn(async () => "STOPPED"),
		continue: vi.fn(() => "CONTINUED"),
	};
}

function invocation(rawInput: string, cwd = "/repo") {
	return {
		agent: {
			id: "1-1",
			session: { header: cwd === "" ? {} : { cwd } },
		},
		rawInput,
		signal: new AbortController().signal,
	};
}

describe("defineWorkflowCommand", () => {
	it("resolves Git context and creates one durable engine job", async () => {
		const runGit = vi.fn(createRunner());
		const workflow = engine();
		const enqueuer = driver();
		const command = defineWorkflowCommand({ engine: workflow, driver: enqueuer, operator: operator(), runGit });
		const input = invocation("  Correct the login redirect.  ");

		await expect(command.handler(input as never)).resolves.toEqual({
			kind: "success",
			text: `Workflow ${JOB_ID} started for https://github.com/example/signal at 0123456789ab.`,
		});
		expect(runGit).toHaveBeenCalledWith("/repo", ["rev-parse", "--show-toplevel"], input.signal);
		expect(workflow.start).toHaveBeenCalledWith({
			objective: "Correct the login redirect.",
			repository: "https://github.com/example/signal",
			baseRevision: REVISION,
			ownerSessionId: "1-1",
		});
		expect(enqueuer.enqueue).toHaveBeenCalledWith(JOB_ID);
	});

	it("routes list/status/watch/stop/continue without inspecting Git", async () => {
		const runGit = vi.fn(createRunner());
		const op = operator();
		const command = defineWorkflowCommand({ engine: engine(), driver: driver(), operator: op, runGit });
		for (const [raw, expected] of [
			["list", "LIST"],
			["status", "STATUS"],
			[`status ${JOB_ID}`, "STATUS"],
			["watch", "WATCH"],
			[`watch ${JOB_ID}`, "WATCH"],
			["stop", "STOPPED"],
			[`stop ${JOB_ID}`, "STOPPED"],
			["continue", "CONTINUED"],
			[`continue ${JOB_ID}`, "CONTINUED"],
		] as const) {
			await expect(command.handler(invocation(raw) as never)).resolves.toEqual({ kind: "success", text: expected });
		}
		expect(op.list).toHaveBeenCalledWith("1-1");
		expect(op.status).toHaveBeenCalledWith("1-1", JOB_ID);
		expect(op.watch).toHaveBeenCalledWith("1-1", JOB_ID);
		expect(op.stop).toHaveBeenCalledWith("1-1", JOB_ID);
		expect(op.continue).toHaveBeenCalledWith("1-1", JOB_ID);
		expect(runGit).not.toHaveBeenCalled();
	});

	it("rejects malformed operator syntax", async () => {
		const command = defineWorkflowCommand({ engine: engine(), driver: driver(), operator: operator(), runGit: createRunner() });
		await expect(command.handler(invocation("list extra") as never)).resolves.toMatchObject({
			kind: "error",
			text: expect.stringContaining("does not accept"),
		});
		await expect(command.handler(invocation("status one two") as never)).resolves.toMatchObject({
			kind: "error",
			text: expect.stringContaining("at most one jobId"),
		});
	});

	it("does not inspect Git or start a job without an objective or operation", async () => {
		const runGit = vi.fn(createRunner());
		const workflow = engine();
		const command = defineWorkflowCommand({ engine: workflow, driver: driver(), operator: operator(), runGit });
		await expect(command.handler(invocation("  ") as never)).resolves.toMatchObject({
			kind: "error",
			text: expect.stringContaining("A workflow objective or operation is required"),
		});
		expect(runGit).not.toHaveBeenCalled();
		expect(workflow.start).not.toHaveBeenCalled();
	});

	it("requires the session working directory only for starting a workflow", async () => {
		const runGit = vi.fn(createRunner());
		const workflow = engine();
		const command = defineWorkflowCommand({ engine: workflow, driver: driver(), operator: operator(), runGit });
		await expect(command.handler(invocation("Fix it", "") as never)).resolves.toEqual({
			kind: "error",
			text: "/workflow requires a session working directory.",
		});
		expect(runGit).not.toHaveBeenCalled();
		expect(workflow.start).not.toHaveBeenCalled();
	});

	it("does not start a job when the session directory is not a Git worktree", async () => {
		const workflow = engine();
		const command = defineWorkflowCommand({
			engine: workflow,
			driver: driver(),
			operator: operator(),
			runGit: createRunner({ "rev-parse --show-toplevel": new Error("not a git repository") }),
		});
		await expect(command.handler(invocation("Fix it") as never)).resolves.toEqual({
			kind: "error",
			text: "/workflow requires the current session to be inside a Git worktree.",
		});
		expect(workflow.start).not.toHaveBeenCalled();
	});

	it("rejects ambiguous remotes without a tracked branch or origin", async () => {
		const workflow = engine();
		const command = defineWorkflowCommand({
			engine: workflow,
			driver: driver(),
			operator: operator(),
			runGit: createRunner({ remote: "fork\nupstream\n", "config --get branch.main.remote": new Error("missing") }),
		});
		await expect(command.handler(invocation("Fix it") as never)).resolves.toMatchObject({
			kind: "error",
			text: expect.stringContaining("could not select an upstream remote"),
		});
		expect(workflow.start).not.toHaveBeenCalled();
	});

	it("rejects unusable remotes without starting a job", async () => {
		const workflow = engine();
		const command = defineWorkflowCommand({
			engine: workflow,
			driver: driver(),
			operator: operator(),
			runGit: createRunner({ "remote get-url -- origin": "file:///private/repository\n" }),
		});
		await expect(command.handler(invocation("Fix it") as never)).resolves.toMatchObject({
			kind: "error",
			text: expect.stringContaining("publicly addressable Git remote"),
		});
		expect(workflow.start).not.toHaveBeenCalled();
	});
});

describe("normalizeRepositoryUrl", () => {
	it.each([
		["git@github.com:example/signal.git", "https://github.com/example/signal"],
		["ssh://git@gitlab.com/group/project.git", "https://gitlab.com/group/project"],
		["https://token@github.com/example/signal.git", "https://github.com/example/signal"],
		["https://github.com/example/signal", "https://github.com/example/signal"],
		["file:///repo", undefined],
		["https://localhost/example/signal", undefined],
		["https://127.0.0.1/example/signal", undefined],
	])("normalizes %s", (remote, expected) => {
		expect(normalizeRepositoryUrl(remote)).toBe(expected);
	});
});
