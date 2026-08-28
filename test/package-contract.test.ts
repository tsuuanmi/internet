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

	it("publishes the built provider tools, client assets, and bundled Xvfb runtime", async () => {
		const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
			files?: string[];
			scripts?: Record<string, string>;
		};
		expect(manifest.files).toEqual(expect.arrayContaining(["dist", "vendor", "cordis.patch.yml", "README.md"]));
		expect(manifest.scripts?.build).toContain("build-remote-login-client.mjs");
		expect(manifest.scripts?.["verify-package"]).toContain("verify-package.mjs");
		await Promise.all([
			access(new URL("../dist/index.js", import.meta.url), constants.R_OK),
			access(new URL("../dist/client.js", import.meta.url), constants.R_OK),
			access(new URL("../dist/remote-login-client.js", import.meta.url), constants.R_OK),
			access(new URL("../vendor/xvfb/linux-x64-gnu/bin/Xvfb", import.meta.url), constants.X_OK),
			access(new URL("../vendor/xvfb/linux-x64-gnu/bin/x11vnc", import.meta.url), constants.X_OK),
		]);
	});
});
