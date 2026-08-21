import { describe, expect, it } from "vitest";
import { providerLocations } from "#internet/browser/storage";

describe("providerLocations", () => {
	it("derives profile and storage-state paths under dataDir", () => {
		const loc = providerLocations("/tmp/pi-dsh", "chatgpt-web");
		expect(loc.profileDir).toBe("/tmp/pi-dsh/chatgpt-web/login-profile");
		expect(loc.storageStatePath).toBe("/tmp/pi-dsh/chatgpt-web/storage-state.json");
		expect(loc.verificationMarkerPath).toBe("/tmp/pi-dsh/chatgpt-web/storage-state.verified.json");
	});
});
