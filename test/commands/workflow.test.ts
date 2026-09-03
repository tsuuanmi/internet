import { describe, expect, it, vi } from "vitest";
import { defineWorkflowCommand, type GitRunner, normalizeRepositoryUrl } from "#internet/commands/workflow";

const REVISION = "0123456789abcdef0123456789abcdef01234567";

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

function invocation(rawInput: string, cwd = "/repo") {
	const followup = vi.fn();
	return {
		input: {
			agent: {
				id: "1-1",
				session: { header: cwd === "" ? {} : { cwd } },
				followup,
			},
			rawInput,
			signal: new AbortController().signal,
		},
		followup,
	};
}

function textFromFollowup(call: unknown): string {
	const message = call as { content: Array<{ type: string; text: string }> };
	return message.content[0]?.text ?? "";
}

describe("defineWorkflowCommand", () => {
	it("queues the complete workflow against the session Git upstream", async () => {
		const runGit = vi.fn(createRunner());
		const command = defineWorkflowCommand({ runGit });
		const { input, followup } = invocation("  Correct the login redirect.  ");

		await expect(command.handler(input)).resolves.toEqual({
			kind: "success",
			text: "Workflow queued for https://github.com/example/signal at 0123456789ab.",
		});
		expect(runGit).toHaveBeenCalledWith("/repo", ["rev-parse", "--show-toplevel"], input.signal);
		expect(runGit).toHaveBeenCalledWith("/repo", ["remote", "get-url", "--", "origin"], input.signal);
		expect(followup).toHaveBeenCalledTimes(1);
		const text = textFromFollowup(followup.mock.calls[0]?.[0]);
		expect(text).toContain("Repository: https://github.com/example/signal");
		expect(text).toContain("# Objective\n\nCorrect the login redirect.");
		expect(text).toContain("Phase 1 — Independent Research and Review");
		expect(text).toContain("Phase 7 — Final Report");
		expect(text).toContain("`internet_team`");
		expect(text).toContain("MUST include this exact repository handoff in every subagent prompt");
		expect(text).toContain(
			"Repository URL: https://github.com/example/signal\nTarget revision: 0123456789abcdef0123456789abcdef01234567",
		);
		expect(text).toContain("MUST include this exact repository handoff in every reviewer prompt");
		expect(text).toContain("Commit to review: <exact pushed SHA>");
		expect(text).not.toContain("git@github.com");
	});

	it("does not inspect Git or queue work without an objective", async () => {
		const runGit = vi.fn(createRunner());
		const command = defineWorkflowCommand({ runGit });
		const { input, followup } = invocation("  ");

		await expect(command.handler(input)).resolves.toEqual({
			kind: "error",
			text: "An objective is required. Usage: /workflow <objective>",
		});
		expect(runGit).not.toHaveBeenCalled();
		expect(followup).not.toHaveBeenCalled();
	});

	it("requires the session working directory", async () => {
		const runGit = vi.fn(createRunner());
		const command = defineWorkflowCommand({ runGit });
		const { input, followup } = invocation("Fix it", "");

		await expect(command.handler(input)).resolves.toEqual({
			kind: "error",
			text: "/workflow requires a session working directory.",
		});
		expect(runGit).not.toHaveBeenCalled();
		expect(followup).not.toHaveBeenCalled();
	});

	it("does not queue work when the session directory is not a Git worktree", async () => {
		const command = defineWorkflowCommand({
			runGit: createRunner({ "rev-parse --show-toplevel": new Error("not a git repository") }),
		});
		const { input, followup } = invocation("Fix it");

		await expect(command.handler(input)).resolves.toEqual({
			kind: "error",
			text: "/workflow requires the current session to be inside a Git worktree.",
		});
		expect(followup).not.toHaveBeenCalled();
	});

	it("rejects ambiguous remotes without a tracked branch or origin", async () => {
		const command = defineWorkflowCommand({
			runGit: createRunner({
				remote: "fork\nupstream\n",
				"config --get branch.main.remote": new Error("missing"),
			}),
		});
		const { input, followup } = invocation("Fix it");

		await expect(command.handler(input)).resolves.toMatchObject({
			kind: "error",
			text: expect.stringContaining("could not select an upstream remote"),
		});
		expect(followup).not.toHaveBeenCalled();
	});

	it("rejects unusable remotes without queuing work", async () => {
		const command = defineWorkflowCommand({
			runGit: createRunner({ "remote get-url -- origin": "file:///private/repository\n" }),
		});
		const { input, followup } = invocation("Fix it");

		await expect(command.handler(input)).resolves.toMatchObject({
			kind: "error",
			text: expect.stringContaining("publicly addressable Git remote"),
		});
		expect(followup).not.toHaveBeenCalled();
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
