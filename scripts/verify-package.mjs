import assert from "node:assert/strict";
import { constants, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { access as accessAsync } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

const temporaryRoot = mkdtempSync(join(tmpdir(), "internet-package-"));
let tarball;
try {
	const packed = execFileSync("npm", ["pack", "--json", "--pack-destination", temporaryRoot], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const [{ filename }] = JSON.parse(packed);
	tarball = join(temporaryRoot, filename);
	const consumer = join(temporaryRoot, "consumer");
	execFileSync("npm", ["init", "-y"], { cwd: temporaryRoot, stdio: "ignore" });
	execFileSync("npm", ["install", "--ignore-scripts", tarball], { cwd: temporaryRoot, stdio: "ignore" });
	const installed = join(temporaryRoot, "node_modules", "@tsuuanmi", "internet");

	const packageJson = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
	assert.equal(packageJson.name, "@tsuuanmi/internet");
	assert.equal(packageJson.type, "module");
	assert.equal(packageJson.main, "./dist/index.js");
	assert.equal(packageJson.types, "./dist/index.d.ts");
	assert.equal(packageJson.exports?.["."]?.import, "./dist/index.js");
	assert.equal(packageJson.exports?.["."]?.types, "./dist/index.d.ts");
	assert.equal(packageJson.exports?.["./client"]?.import, "./dist/client.js");
	assert.equal(packageJson.exports?.["./client"]?.types, "./dist/client.d.ts");
	assert.equal(packageJson.exports?.["./remote-login-client"]?.import, "./dist/remote-login-client.js");
	assert.deepEqual(packageJson.files, ["dist", "vendor", "cordis.patch.yml", "README.md"]);
	assert.equal(packageJson.peerDependencies?.["@deepseek-ai/dsh"], ">=0.1.0-rc.1");
	assert.equal(packageJson.peerDependencies?.["@deepseek-ai/dsh-tools"], ">=0.1.0-rc.1");
	assert.equal(packageJson.peerDependencies?.["@deepseek-ai/dsh-commands"], ">=0.1.0-rc.1");
	assert.equal(packageJson.peerDependenciesMeta?.["@deepseek-ai/dsh"]?.optional, true);
	assert.equal(packageJson.peerDependenciesMeta?.["@deepseek-ai/dsh-tools"]?.optional, true);
	assert.equal(packageJson.peerDependenciesMeta?.["@deepseek-ai/dsh-commands"]?.optional, true);
	assert.equal(packageJson.dependencies?.["@deepseek-ai/schemastery"], "^3.17.0");
	assert.equal(packageJson.dependencies?.["patchright-core"], "1.57.2");

	for (const artifact of [
		"dist/index.js",
		"dist/index.d.ts",
		"dist/client.js",
		"dist/client.d.ts",
		"dist/remote-login-client.js",
		"dist/tools/internet-browser.js",
		"dist/tools/internet-browser.d.ts",
		"dist/tools/internet-chat.js",
		"dist/tools/internet-chat.d.ts",
		"dist/tools/internet-research.js",
		"dist/tools/internet-research.d.ts",
		"dist/tools/internet-team.js",
		"dist/tools/internet-team.d.ts",
	]) {
		if (!existsSync(join(installed, artifact))) throw new Error(`packed consumer artifact missing: ${artifact}`);
	}
	if (process.platform === "linux" && process.arch === "x64") {
		const runtime = join(installed, "vendor", "xvfb", "linux-x64-gnu");
		for (const executable of ["Xvfb", "x11vnc", "xkbcomp"]) {
			await accessAsync(join(runtime, "bin", executable), constants.X_OK);
		}
		execFileSync(join(runtime, "bin", "x11vnc"), ["-version"], {
			env: { ...process.env, LD_LIBRARY_PATH: join(runtime, "lib"), XKB_CONFIG_ROOT: join(runtime, "share", "X11", "xkb") },
			stdio: "pipe",
		});
	}
	const plugin = await import(pathToFileURL(join(installed, "dist/index.js")).href);
	const scenarios = [
		{
			config: {},
			tools: ["internet_browser", "internet_chat", "internet_research", "internet_team"],
			commands: ["internet", "workflow"],
			sections: ["tool:internet_research", "tool:internet_chat", "tool:internet_team"],
		},
		{
			config: { enableChatgpt: false },
			tools: ["internet_browser", "internet_chat", "internet_research"],
			commands: [],
			sections: ["tool:internet_research", "tool:internet_chat"],
		},
		{
			config: { enableGemini: false },
			tools: ["internet_browser", "internet_chat", "internet_research"],
			commands: ["internet"],
			sections: ["tool:internet_research", "tool:internet_chat"],
		},
		{
			config: { enableChatgpt: false, enableGemini: false },
			tools: [],
			commands: [],
			sections: [],
		},
	];
	for (const scenario of scenarios) {
		const tools = [];
		const commands = [];
		const sections = [];
		const cleanups = [];
		plugin.apply(
			{
				tools: { register: (tool) => tools.push(tool.name) },
				commands: { register: (command) => commands.push(command.name) },
				systemPrompt: { section: (section) => sections.push(section.name) },
				effect: (effect) => cleanups.push(effect()),
			},
			scenario.config,
		);
		assert.deepEqual(tools, scenario.tools);
		assert.deepEqual(commands, scenario.commands);
		assert.deepEqual(sections, scenario.sections);
		await Promise.all(cleanups.map((cleanup) => cleanup?.()));
	}
	console.log("verified isolated packed plugin registration and browser client artifacts");
} finally {
	if (tarball !== undefined) rmSync(tarball, { force: true });
	rmSync(temporaryRoot, { recursive: true, force: true });
}
