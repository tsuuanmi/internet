import { describe, expect, it } from "vitest";
import { apply, type PluginContext } from "#internet/index";

function fakeContext(): {
	context: PluginContext;
	sections: Array<{ name: string; order: number; text: string }>;
	tools: string[];
	commands: string[];
} {
	const sections: Array<{ name: string; order: number; text: string }> = [];
	const tools: string[] = [];
	const commands: string[] = [];
	const context: PluginContext = {
		agents: { get: () => undefined },
		tools: { register: (tool) => tools.push(tool.name) },
		commands: { register: (command) => commands.push(command.name) },
		systemPrompt: { section: (options) => sections.push(options) },
		effect: () => {},
	};
	return { context, sections, tools, commands };
}

describe("account-aware plugin registration", () => {
	it("registers canonical tools, workflow engine surface, and account isolation guidance", () => {
		const { context, sections, tools, commands } = fakeContext();
		apply(context, {});
		const team = sections.find((section) => section.name === "tool:internet_team");
		const chat = sections.find((section) => section.name === "tool:internet_chat");
		const research = sections.find((section) => section.name === "tool:internet_research");
		const workflow = sections.find((section) => section.name === "tool:internet_workflow");

		expect(team?.text).toContain("<child-agent-id>:team:<name>");
		expect(team?.text).toContain("per authenticated account");
		expect(team?.text).toContain("maxConcurrentTurnsPerAccount");
		expect(team?.text).toContain("different accounts have independent schedulers");
		expect(team?.text).toContain("chatgpt-thinker is the default explicit synthesizer");
		expect(chat?.text).toContain("chatgpt-thinker and chatgpt-writer have separate login state");
		expect(workflow?.text).toContain("deterministic control-plane surface for durable coding jobs");
		expect(workflow?.text).toContain("calls the lower-level team runtime directly");
		expect(workflow?.text).toContain("no free-form child agent");
		expect(tools).toEqual([
			"internet_browser",
			"internet_chat",
			"internet_research",
			"internet_workflow",
			"internet_workflow_maintenance",
			"internet_team",
		]);
		expect(commands).toEqual(["internet", "workflow"]);
		expect(research?.text).toContain("thinker accounts");
	});

	it("omits workflow and internet_team when Gemini is disabled while keeping ChatGPT account lifecycle", () => {
		const { context, tools, commands } = fakeContext();
		apply(context, { enableGemini: false });

		expect(tools).toEqual(["internet_browser", "internet_chat", "internet_research"]);
		expect(commands).toEqual(["internet"]);
	});
});
