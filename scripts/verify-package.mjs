import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(root);
const temporaryRoot = mkdtempSync(join(tmpdir(), "internet-package-smoke-"));
let tarball;

try {
	const output = execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["pack", "--json"], {
		cwd: packageRoot,
		encoding: "utf8",
	});
	const packed = JSON.parse(output);
	if (!Array.isArray(packed) || typeof packed[0]?.filename !== "string") {
		throw new Error("npm pack did not report a tarball filename");
	}
	tarball = join(packageRoot, packed[0].filename);
	const consumer = join(temporaryRoot, "consumer");
	mkdirSync(consumer);
	writeFileSync(join(consumer, "package.json"), '{"private":true,"type":"module"}\n');
	execFileSync(
		process.platform === "win32" ? "npm.cmd" : "npm",
		["install", "--ignore-scripts", "--package-lock=false", "--omit=dev", "--no-audit", "--no-fund", tarball],
		{ cwd: consumer, stdio: "pipe" },
	);
	const installed = join(consumer, "node_modules", "@tsuuanmi", "internet");
	for (const artifact of ["dist/index.js", "dist/client.js", "dist/client.d.ts", "dist/remote-login-client.js", "cordis.patch.yml"]) {
		if (!existsSync(join(installed, artifact))) throw new Error(`packed consumer artifact missing: ${artifact}`);
	}
	for (const artifact of [
		"dist/client.js.map",
		"dist/remote-login-client.js.map",
		"dist/remote-login-client.d.ts",
		"dist/remote-login-client.d.ts.map",
	]) {
		if (existsSync(join(installed, artifact))) throw new Error(`packed consumer artifact must not contain: ${artifact}`);
	}
	const plugin = await import(pathToFileURL(join(installed, "dist/index.js")).href);
	const scenarios = [
		{
			config: {},
			tools: ["internet_chat", "internet_research", "internet_browser", "internet_team"],
			commands: ["internet", "workflow"],
			sections: ["tool:internet_research", "tool:internet_team", "tool:internet_chat"],
		},
		{
			config: { enableChatgpt: false },
			tools: ["internet_chat", "internet_research", "internet_browser"],
			commands: [],
			sections: ["tool:internet_research", "tool:internet_chat"],
		},
		{
			config: { enableGemini: false },
			tools: ["internet_chat", "internet_research", "internet_browser"],
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
