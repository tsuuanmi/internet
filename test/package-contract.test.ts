import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("DSH package contract", () => {
	it("enables the plugin when a graphical display is available", async () => {
		const patch = await readFile(new URL("../cordis.patch.yml", import.meta.url), "utf8");
		expect(patch).toContain("disabled: !!js process.env.DISPLAY === undefined || process.env.DISPLAY === ''");
	});
});
