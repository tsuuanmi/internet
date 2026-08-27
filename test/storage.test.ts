import { describe, expect, it } from "vitest";
import { providerLocations } from "#internet/browser/storage";

describe("providerLocations", () => {
	it("separates portable accounts from machine-local login profiles", () => {
		const locations = providerLocations("/tmp/dsh/internet", "chatgpt-web");
		expect(locations).toEqual({
			provider: "chatgpt-web",
			profileDir: "/tmp/dsh/internet/chatgpt-web/login-profile",
			accountPath: "/tmp/dsh/internet/accounts/chatgpt-web.json",
		});
	});
});
