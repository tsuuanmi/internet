import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
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
	execFileSync("tar", ["-xzf", tarball, "-C", temporaryRoot]);
	const installed = join(temporaryRoot, "package");
	for (const artifact of ["dist/index.js", "dist/client.js", "dist/remote-login-client.js", "cordis.patch.yml"]) {
		if (!existsSync(join(installed, artifact))) throw new Error(`packed consumer artifact missing: ${artifact}`);
	}
	// Resolve this repository's development peer dependencies exactly as a consumer host would.
	symlinkSync(join(packageRoot, "node_modules"), join(installed, "node_modules"), "dir");
	await import(pathToFileURL(join(installed, "dist/index.js")).href);
	console.log("verified packed root consumer import and browser client artifacts");
} finally {
	if (tarball !== undefined) rmSync(tarball, { force: true });
	rmSync(temporaryRoot, { recursive: true, force: true });
}
