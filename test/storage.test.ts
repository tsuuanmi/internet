import { describe, expect, it } from "vitest";
import { accountLocations } from "#internet/browser/storage";

describe("accountLocations", () => {
	it("separates two ChatGPT account profiles and portable files", () => {
		expect(accountLocations("/tmp/dsh/internet", "chatgpt-thinker")).toEqual({
			accountId: "chatgpt-thinker",
			provider: "chatgpt-web",
			profileDir: "/tmp/dsh/internet/chatgpt-thinker/login-profile",
			accountPath: "/tmp/dsh/internet/accounts/chatgpt-thinker.json",
		});
		expect(accountLocations("/tmp/dsh/internet", "chatgpt-writer")).toEqual({
			accountId: "chatgpt-writer",
			provider: "chatgpt-web",
			profileDir: "/tmp/dsh/internet/chatgpt-writer/login-profile",
			accountPath: "/tmp/dsh/internet/accounts/chatgpt-writer.json",
		});
	});
});
