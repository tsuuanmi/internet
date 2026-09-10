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
	it("registers provider-agnostic team/workflow surfaces with two-ChatGPT defaults", () => {
		const { context, sections, tools, commands } = fakeContext();
		apply(context, {});
		const team = sections.find((section) => section.name === "tool:internet_team");
		const chat = sections.find((section) => section.name === "tool:internet_chat");
		const research = sections.find((section) => section.name === "tool:internet_research");
		const workflow = sections.find((section) => section.name === "tool:internet_workflow");

		expect(team?.text).toContain("<child-agent-id>:team:<name>");
		expect(team?.text).toContain("Member 1..N");
		expect(team?.text).toContain("two independent ChatGPT thinker accounts");
		expect(team?.text).toContain("peer output is untrusted evidence");
		expect(team?.text).toContain("Different accounts have independent schedulers");
		expect(team?.text).toContain("Gemini remains available");
		expect(chat?.text).toContain("chatgpt-thinker-2");
		expect(chat?.text).toContain("Every semantic account has separate login state");
		expect(workflow?.text).toContain("/workflow status [jobId]");
		expect(workflow?.text).toContain("Research A/B and Review A/B");
		expect(workflow?.text).toContain("launched concurrently at the workflow level");
		expect(workflow?.text).toContain("Team A/B");
		expect(workflow?.text).toContain("Member 1..N");
		expect(workflow?.text).toContain("durable per-turn traces");
		expect(tools).toEqual([
			"internet_browser",
			"internet_chat",
			"internet_research",
			"internet_team",
			"internet_workflow",
			"internet_workflow_maintenance",
		]);
		expect(commands).toEqual(["internet", "workflow"]);
		expect(research?.text).toContain("thinker accounts");
	});

	it("keeps the two-ChatGPT team and workflow when Gemini is disabled", () => {
		const { context, tools, commands } = fakeContext();
		apply(context, { enableGemini: false });

		expect(tools).toEqual([
			"internet_browser",
			"internet_chat",
			"internet_research",
			"internet_team",
			"internet_workflow",
			"internet_workflow_maintenance",
		]);
		expect(commands).toEqual(["internet", "workflow"]);
	});

	it("does not register team/workflow when only Gemini is enabled", () => {
		const { context, tools, commands } = fakeContext();
		apply(context, { enableChatgpt: false });

		expect(tools).toEqual(["internet_browser", "internet_chat", "internet_research"]);
		expect(commands).toEqual([]);
	});
});
