import { accessSync, constants, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { discoverVncCandidates, vncArgs } from "#internet/browser/vnc";

describe("discoverVncCandidates", () => {
	it("prefers the bundled executable on supported glibc Linux x64", () => {
		const candidates = discoverVncCandidates(
			{ PATH: "/usr/bin", MARKER: "yes" },
			{ platform: "linux", arch: "x64", glibcVersion: "2.31" },
		);
		expect(candidates).toHaveLength(2);
		expect(candidates[0]).toMatchObject({ source: "bundled", env: { MARKER: "yes" } });
		expect(candidates[0]?.executable).toMatch(/vendor\/xvfb\/linux-x64-gnu\/bin\/x11vnc$/);
		expect(candidates[1]).toEqual({
			executable: "x11vnc",
			source: "system",
			env: { PATH: "/usr/bin", MARKER: "yes" },
		});
		const executable = candidates[0]?.executable ?? "";
		accessSync(executable, constants.X_OK);
		expect(statSync(executable).mode & 0o111).not.toBe(0);
	});

	it("uses only the system candidate on unsupported targets", () => {
		expect(discoverVncCandidates({}, { platform: "linux", arch: "arm64", glibcVersion: "2.35" })).toEqual([
			{ executable: "x11vnc", source: "system", env: {} },
		]);
	});
});

describe("vncArgs", () => {
	it("binds x11vnc to loopback with a private password file", () => {
		expect(vncArgs(":42", 5901, "/private/password")).toEqual([
			"-display",
			":42",
			"-rfbport",
			"5901",
			"-passwdfile",
			"rm:/private/password",
			"-localhost",
			"-norc",
			"-forever",
			"-shared",
			"-noxdamage",
			"-noxfixes",
			"-noxrecord",
			"-quiet",
		]);
	});
});
