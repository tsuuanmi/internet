import { describe, expect, it } from "vitest";
import { buildTeamPlan, prepareTeamStep } from "#internet/team/plan";
import type { TeamTurn } from "#internet/team/types";

const accounts = ["chatgpt-thinker", "chatgpt-thinker-2"] as const;

describe("team plan", () => {
	it("builds speaking order and exact consumed-input dependencies", () => {
		const plan = buildTeamPlan({ accounts, rounds: 2, synthesize: true, synthesizer: "chatgpt-thinker" });
		expect(plan.steps.map((step) => step.stepId)).toEqual([
			"round:1:member:1",
			"round:1:member:2",
			"round:2:member:1",
			"round:2:member:2",
			"synthesis",
		]);
		expect(plan.steps.map((step) => step.accountId)).toEqual([
			"chatgpt-thinker",
			"chatgpt-thinker-2",
			"chatgpt-thinker",
			"chatgpt-thinker-2",
			"chatgpt-thinker",
		]);
		expect(plan.steps.map((step) => step.dependsOnStepIds)).toEqual([
			[],
			["round:1:member:1"],
			["round:1:member:2"],
			["round:2:member:1"],
			["round:1:member:1", "round:1:member:2", "round:2:member:1", "round:2:member:2"],
		]);
	});

	it("prepares a member step from only the latest completed peer contribution", () => {
		const plan = buildTeamPlan({ accounts, rounds: 2, synthesize: true, synthesizer: "chatgpt-thinker" });
		const transcript: TeamTurn[] = [
			{ round: 1, accountId: "chatgpt-thinker", provider: "chatgpt-web", text: "A1" },
			{ round: 1, accountId: "chatgpt-thinker-2", provider: "chatgpt-web", text: "B1" },
			{ round: 2, accountId: "chatgpt-thinker", provider: "chatgpt-web", text: "A2" },
		];
		const step = plan.steps[3];
		if (step === undefined) throw new Error("missing team step");
		const prepared = prepareTeamStep(plan, step, "Task X", transcript, "generic-debate");
		expect(prepared.accountId).toBe("chatgpt-thinker-2");
		expect(prepared.prompt).toContain("A2");
		expect(prepared.prompt).not.toContain("A1");
		expect(prepared.prompt).not.toContain("chatgpt-thinker");
	});

	it("prepares synthesis from the complete persisted transcript", () => {
		const plan = buildTeamPlan({ accounts, rounds: 1, synthesize: true, synthesizer: "chatgpt-thinker" });
		const transcript: TeamTurn[] = [
			{ round: 1, accountId: "chatgpt-thinker", provider: "chatgpt-web", text: "A1" },
			{ round: 1, accountId: "chatgpt-thinker-2", provider: "chatgpt-web", text: "B1" },
		];
		const step = plan.steps.at(-1);
		if (step === undefined) throw new Error("missing synthesis step");
		const prepared = prepareTeamStep(plan, step, "Task X", transcript, "generic-debate");
		expect(step.kind).toBe("synthesis");
		expect(prepared.prompt).toContain("A1");
		expect(prepared.prompt).toContain("B1");
		expect(prepared.prompt).toContain("best combined answer");
	});

	it("rejects invalid plans before any provider execution", () => {
		expect(() =>
			buildTeamPlan({ accounts: ["chatgpt-thinker"], rounds: 1, synthesize: true, synthesizer: "chatgpt-thinker" }),
		).toThrow("at least two accounts");
		expect(() => buildTeamPlan({ accounts, rounds: 0, synthesize: true, synthesizer: "chatgpt-thinker" })).toThrow(
			"positive integer",
		);
	});
});
