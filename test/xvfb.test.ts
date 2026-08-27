import { accessSync, constants, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { discoverXvfbCandidates } from "#internet/browser/xvfb";

describe("discoverXvfbCandidates", () => {
	it("prefers the executable bundled with the package on supported glibc Linux x64", () => {
		const candidates = discoverXvfbCandidates(
			{ PATH: "/usr/bin", MARKER: "yes" },
			{ platform: "linux", arch: "x64", glibcVersion: "2.35" },
		);
		expect(candidates).toHaveLength(2);
		expect(candidates[0]).toMatchObject({ source: "bundled" });
		expect(candidates[0]?.executable).toMatch(/vendor\/xvfb\/linux-x64-gnu\/bin\/Xvfb$/);
		expect(candidates[0]?.env).toMatchObject({ MARKER: "yes" });
		expect(candidates[0]?.env.PATH).toMatch(/vendor\/xvfb\/linux-x64-gnu\/bin:\/usr\/bin$/);
		expect(candidates[0]?.env.LD_LIBRARY_PATH).toMatch(/vendor\/xvfb\/linux-x64-gnu\/lib$/);
		expect(candidates[0]?.env.XKB_CONFIG_ROOT).toMatch(/vendor\/xvfb\/linux-x64-gnu\/share\/X11\/xkb$/);
		expect(candidates[1]).toEqual({ executable: "Xvfb", source: "system", env: { PATH: "/usr/bin", MARKER: "yes" } });

		const executable = candidates[0]?.executable ?? "";
		accessSync(executable, constants.X_OK);
		expect(statSync(executable).mode & 0o111).not.toBe(0);
	});

	it("uses only system Xvfb on unsupported targets", () => {
		const expected = [{ executable: "Xvfb", source: "system", env: {} }];
		expect(discoverXvfbCandidates({}, { platform: "linux", arch: "arm64", glibcVersion: "2.35" })).toEqual(expected);
		expect(discoverXvfbCandidates({}, { platform: "linux", arch: "x64", glibcVersion: "" })).toEqual(expected);
		expect(discoverXvfbCandidates({}, { platform: "darwin", arch: "x64", glibcVersion: "2.35" })).toEqual(expected);
	});

	it("rejects glibc versions older than the bundled runtime", () => {
		expect(discoverXvfbCandidates({}, { platform: "linux", arch: "x64", glibcVersion: "2.34" })).toEqual([
			{ executable: "Xvfb", source: "system", env: {} },
		]);
	});
});
