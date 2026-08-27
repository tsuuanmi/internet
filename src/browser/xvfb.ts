import { accessSync, constants, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BUNDLED_TARGET = "linux-x64-gnu";
const MINIMUM_GLIBC = [2, 35] as const;

export interface XvfbCandidate {
	executable: string;
	env: NodeJS.ProcessEnv;
	source: "bundled" | "system";
}

export interface XvfbDiscoveryOptions {
	platform?: NodeJS.Platform;
	arch?: NodeJS.Architecture;
	glibcVersion?: string;
	bundleRoot?: string;
}

function runtimeGlibcVersion(): string | undefined {
	const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: unknown } } | undefined;
	const version = report?.header?.glibcVersionRuntime;
	return typeof version === "string" ? version : undefined;
}

function supportsBundledXvfb(platform: NodeJS.Platform, arch: NodeJS.Architecture, glibcVersion?: string): boolean {
	if (platform !== "linux" || arch !== "x64" || glibcVersion === undefined) return false;
	const [major, minor] = glibcVersion.split(".").map(Number);
	return (
		Number.isInteger(major) &&
		Number.isInteger(minor) &&
		(major > MINIMUM_GLIBC[0] || (major === MINIMUM_GLIBC[0] && minor >= MINIMUM_GLIBC[1]))
	);
}

function executableExists(path: string): boolean {
	if (!existsSync(path)) return false;
	try {
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/** Resolve bundled-first Xvfb candidates for this process and base environment. */
export function discoverXvfbCandidates(
	baseEnv: NodeJS.ProcessEnv,
	options: XvfbDiscoveryOptions = {},
): XvfbCandidate[] {
	const platform = options.platform ?? process.platform;
	const arch = options.arch ?? process.arch;
	const glibcVersion = options.glibcVersion ?? runtimeGlibcVersion();
	const bundleRoot =
		options.bundleRoot ?? fileURLToPath(new URL(`../../vendor/xvfb/${BUNDLED_TARGET}/`, import.meta.url));
	const candidates: XvfbCandidate[] = [];

	if (supportsBundledXvfb(platform, arch, glibcVersion)) {
		const executable = join(bundleRoot, "bin", "Xvfb");
		if (executableExists(executable)) {
			const binDir = dirname(executable);
			const libraryDir = join(bundleRoot, "lib");
			candidates.push({
				executable,
				source: "bundled",
				env: {
					...baseEnv,
					PATH: [binDir, baseEnv.PATH].filter(Boolean).join(":"),
					LD_LIBRARY_PATH: [libraryDir, baseEnv.LD_LIBRARY_PATH].filter(Boolean).join(":"),
					XKB_CONFIG_ROOT: join(bundleRoot, "share", "X11", "xkb"),
				},
			});
		}
	}

	candidates.push({ executable: "Xvfb", source: "system", env: { ...baseEnv } });
	return candidates;
}
