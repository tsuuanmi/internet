import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("DSH package contract", () => {
	it("lets runtime manage display availability instead of disabling the plugin", async () => {
		const patch = await readFile(new URL("../cordis.patch.yml", import.meta.url), "utf8");
		expect(patch).toContain("name: '@tsuuanmi/internet'");
		expect(patch).not.toContain("DISPLAY");
		expect(patch).not.toContain("disabled:");
	});

	it("publishes the bundled Xvfb and x11vnc runtime", async () => {
		const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
			files?: string[];
			scripts?: Record<string, string>;
		};
		expect(manifest.files).toContain("vendor");
		expect(manifest.scripts?.build).toContain("build-remote-login-client.mjs");
		await access(new URL("../vendor/xvfb/linux-x64-gnu/bin/Xvfb", import.meta.url), constants.X_OK);
		await access(new URL("../vendor/xvfb/linux-x64-gnu/bin/x11vnc", import.meta.url), constants.X_OK);
	});
});
