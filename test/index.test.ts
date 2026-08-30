import { describe, expect, it } from "vitest";
import { apply, type PluginContext } from "#internet/index";

function fakeContext(): {
	context: PluginContext;
	sections: Array<{ name: string; order: number; text: string }>;
	tools: string[];
} {
	const sections: Array<{ name: string; order: number; text: string }> = [];
	const tools: string[] = [];
	const context: PluginContext = {
		tools: { register: (tool) => tools.push(tool.name) },
		commands: { register: () => {} },
		systemPrompt: { section: (options) => sections.push(options) },
		effect: () => {},
	};
	return { context, sections, tools };
}

describe("internet-team system guidance", () => {
	it("registers only canonical tool IDs and documents team isolation", () => {
		const { context, sections, tools } = fakeContext();
		apply(context, {});
		const team = sections.find((section) => section.name === "tool:internet_team");
		const research = sections.find((section) => section.name === "tool:internet_research");

		expect(team?.text).toContain("focused background subagent");
		expect(team?.text).toContain("<child-agent-id>:team:<name>");
		expect(team?.text).toContain("rather than recursively delegating");
		expect(team?.text).toContain("maxConcurrentTurnsPerProvider");
		expect(team?.text).toContain("same-session turns, visible calls, login");
		expect(team?.text).toContain("call internet_team directly");
		expect(tools).toEqual(["internet_chat", "internet_research", "internet_browser", "internet_team"]);
		expect(research?.text).toContain("30 minutes");
	});

	it("omits internet_team when only one provider is enabled", () => {
		const { context, tools } = fakeContext();
		apply(context, { enableGemini: false });

		expect(tools).toEqual(["internet_chat", "internet_research", "internet_browser"]);
	});
});
