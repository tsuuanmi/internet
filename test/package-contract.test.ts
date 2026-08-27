import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("DSH package contract", () => {
	it("lets runtime manage display availability instead of disabling the plugin", async () => {
		const patch = await readFile(new URL("../cordis.patch.yml", import.meta.url), "utf8");
		expect(patch).toContain("name: '@tsuuanmi/internet'");
		expect(patch).not.toContain("DISPLAY");
		expect(patch).not.toContain("disabled:");
	});

	it("publishes the bundled Xvfb runtime with the plugin", async () => {
		const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
			files?: string[];
		};
		expect(manifest.files).toContain("vendor");
	});
});
