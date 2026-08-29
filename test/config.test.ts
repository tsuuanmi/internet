import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, resolveBrowserConfig } from "#internet/core/config";
import { InternetError } from "#internet/core/errors";

describe("resolveBrowserConfig", () => {
	it("applies defaults for an empty config", () => {
		const config = resolveBrowserConfig({});
		expect(config).toEqual(DEFAULT_CONFIG);
	});

	it("defaults remote login to a three-minute expiry, a 30-minute idle TTL, and serial provider turns", () => {
		expect(resolveBrowserConfig({}).loginTimeoutMs).toBe(180_000);
		expect(resolveBrowserConfig({}).closeAfterMs).toBe(1_800_000);
		expect(resolveBrowserConfig({}).maxConcurrentTurnsPerProvider).toBe(1);
	});

	it("honors explicit overrides", () => {
		const config = resolveBrowserConfig({
			chromePath: "/custom/chrome",
			headless: false,
			enableChatgpt: false,
			enableGemini: true,
			loginTimeoutMs: 60_000,
			remoteLoginPort: 40_000,
			closeAfterMs: 5_000,
			maxConcurrentTurnsPerProvider: 2,
		});
		expect(config.chromePath).toBe("/custom/chrome");
		expect(config.headless).toBe(false);
		expect(config.enableChatgpt).toBe(false);
		expect(config.enableGemini).toBe(true);
		expect(config.loginTimeoutMs).toBe(60_000);
		expect(config.remoteLoginPort).toBe(40_000);
		expect(config.closeAfterMs).toBe(5_000);
		expect(config.maxConcurrentTurnsPerProvider).toBe(2);
	});

	it("ignores unknown fields and non-object input", () => {
		expect(resolveBrowserConfig(null)).toEqual(DEFAULT_CONFIG);
		expect(resolveBrowserConfig("nope").dataDir).toBe(DEFAULT_CONFIG.dataDir);
	});

	it("normalizes dataDir and expands leading home paths", () => {
		const config = resolveBrowserConfig({ dataDir: "~/custom-dir", chromePath: "~/chrome" });
		expect(config.dataDir).toBe(join(homedir(), "custom-dir"));
		expect(config.chromePath).toBe(join(homedir(), "chrome"));
		expect(resolveBrowserConfig({ dataDir: "relative-data" }).dataDir).toBe(join(process.cwd(), "relative-data"));
	});

	it("rejects invalid positive-integer config", () => {
		expect(() => resolveBrowserConfig({ turnTimeoutMs: -5 })).toThrow(InternetError);
		expect(() => resolveBrowserConfig({ maxConcurrentTurnsPerProvider: 0 })).toThrow(InternetError);
		expect(() => resolveBrowserConfig({ maxConcurrentTurnsPerProvider: Number.NaN })).toThrow(InternetError);
		expect(() => resolveBrowserConfig({ remoteLoginPort: 65_535 })).toThrow(/must not exceed 65534/);
	});

	it("honors team config overrides", () => {
		const config = resolveBrowserConfig({
			teamRounds: 3,
			teamMaxRounds: 5,
			teamTranscriptMaxChars: 10_000,
			teamSynthesis: false,
		});
		expect(config.teamRounds).toBe(3);
		expect(config.teamMaxRounds).toBe(5);
		expect(config.teamTranscriptMaxChars).toBe(10_000);
		expect(config.teamSynthesis).toBe(false);
	});

	it("rejects invalid team limits", () => {
		expect(() => resolveBrowserConfig({ teamMaxRounds: 0 })).toThrow(InternetError);
		expect(() => resolveBrowserConfig({ teamTranscriptMaxChars: 0 })).toThrow(InternetError);
		expect(() => resolveBrowserConfig({ teamTranscriptMaxChars: 0.5 })).toThrow(InternetError);
		expect(() => resolveBrowserConfig({ teamRounds: 3, teamMaxRounds: 2 })).toThrow(/must not exceed/);
	});

	it("defaults chatgptThinkingLevel to medium", () => {
		expect(resolveBrowserConfig({}).chatgptThinkingLevel).toBe("medium");
	});

	it("honors the three supported chatgptThinkingLevel values", () => {
		expect(resolveBrowserConfig({ chatgptThinkingLevel: "instant" }).chatgptThinkingLevel).toBe("instant");
		expect(resolveBrowserConfig({ chatgptThinkingLevel: "medium" }).chatgptThinkingLevel).toBe("medium");
		expect(resolveBrowserConfig({ chatgptThinkingLevel: "high" }).chatgptThinkingLevel).toBe("high");
	});

	it("rejects unsupported chatgptThinkingLevel values", () => {
		expect(() => resolveBrowserConfig({ chatgptThinkingLevel: "extra-high" })).toThrow(InternetError);
		expect(() => resolveBrowserConfig({ chatgptThinkingLevel: "pro" })).toThrow(InternetError);
		expect(() => resolveBrowserConfig({ chatgptThinkingLevel: "ultra" })).toThrow(InternetError);
		expect(() => resolveBrowserConfig({ chatgptThinkingLevel: 1 })).toThrow(InternetError);
	});
});
