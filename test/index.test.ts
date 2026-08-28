import { describe, expect, it } from "vitest";
import { apply, type PluginContext } from "#internet/index";

function fakeContext(): { context: PluginContext; sections: Array<{ name: string; order: number; text: string }> } {
	const sections: Array<{ name: string; order: number; text: string }> = [];
	const context: PluginContext = {
		tools: { register: () => {} },
		commands: { register: () => {} },
		systemPrompt: { section: (options) => sections.push(options) },
		effect: () => {},
	};
	return { context, sections };
}

describe("browser-team system guidance", () => {
	it("prefers focused background subagents while documenting isolation and bounded concurrency", () => {
		const { context, sections } = fakeContext();
		apply(context, {});
		const team = sections.find((section) => section.name === "tool:browser_team");

		expect(team?.text).toContain("focused background subagent");
		expect(team?.text).toContain("<child-agent-id>:team:<name>");
		expect(team?.text).toContain("rather than recursively delegating");
		expect(team?.text).toContain("maxConcurrentTurnsPerProvider");
		expect(team?.text).toContain("same-session turns, visible calls, login");
		expect(team?.text).toContain("call browser_team directly");
	});
});
