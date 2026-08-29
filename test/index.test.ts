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

describe("browser-team system guidance", () => {
	it("prefers focused background subagents while documenting isolation and bounded concurrency", () => {
		const { context, sections, tools } = fakeContext();
		apply(context, {});
		const team = sections.find((section) => section.name === "tool:browser_team");
		const research = sections.find((section) => section.name === "tool:internet_research");

		expect(team?.text).toContain("focused background subagent");
		expect(team?.text).toContain("<child-agent-id>:team:<name>");
		expect(team?.text).toContain("rather than recursively delegating");
		expect(team?.text).toContain("maxConcurrentTurnsPerProvider");
		expect(team?.text).toContain("same-session turns, visible calls, login");
		expect(team?.text).toContain("call browser_team directly");
		expect(tools).toContain("internet_research");
		expect(research?.text).toContain("30 minutes");
	});
});
