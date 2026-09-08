import { describe, expect, it } from "vitest";
import {
	ACCOUNT_IDS,
	ACCOUNTS,
	accountHasCapability,
	accountsWithCapabilities,
	getAccountDefinition,
	isAccountId,
} from "#internet/core/accounts";

describe("account identity catalog", () => {
	it("defines the three initial semantic account ids", () => {
		expect(ACCOUNT_IDS).toEqual(["chatgpt-thinker", "chatgpt-writer", "gemini-thinker"]);
	});

	it("keeps provider identity separate from account identity", () => {
		expect(getAccountDefinition("chatgpt-thinker").provider).toBe("chatgpt-web");
		expect(getAccountDefinition("chatgpt-writer").provider).toBe("chatgpt-web");
		expect(getAccountDefinition("gemini-thinker").provider).toBe("gemini-web");
	});

	it("assigns distinct thinker and writer authority", () => {
		expect(ACCOUNTS["chatgpt-thinker"].role).toBe("thinker");
		expect(ACCOUNTS["chatgpt-writer"].role).toBe("writer");
		expect(accountHasCapability("chatgpt-thinker", "team.synthesize")).toBe(true);
		expect(accountHasCapability("chatgpt-thinker", "github.write")).toBe(false);
		expect(accountHasCapability("chatgpt-writer", "github.write")).toBe(true);
		expect(accountHasCapability("chatgpt-writer", "github.merge")).toBe(true);
	});

	it("selects accounts by required capabilities", () => {
		expect(accountsWithCapabilities(["team.reason", "team.review"]).map((account) => account.accountId)).toEqual([
			"chatgpt-thinker",
			"gemini-thinker",
		]);
		expect(
			accountsWithCapabilities(["github.write", "github.pull_request"]).map((account) => account.accountId),
		).toEqual(["chatgpt-writer"]);
	});

	it("validates semantic account ids", () => {
		expect(isAccountId("chatgpt-thinker")).toBe(true);
		expect(isAccountId("chatgpt-web")).toBe(false);
		expect(isAccountId("unknown")).toBe(false);
	});
});
