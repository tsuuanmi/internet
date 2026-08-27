import { createHash } from "node:crypto";
import { accessSync, constants, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "vendor", "xvfb", "linux-x64-gnu");
const provenancePath = join(root, "PROVENANCE.json");
const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));

function files(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const child = join(directory, entry.name);
		return entry.isDirectory() ? files(child) : [child];
	});
}

const actualFiles = files(root)
	.filter((path) => path !== provenancePath)
	.map((path) => relative(root, path))
	.sort();
const expectedFiles = Object.keys(provenance.files).sort();
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
	throw new Error("Bundled browser runtime inventory does not match PROVENANCE.json");
}
for (const [relativePath, expectedHash] of Object.entries(provenance.files)) {
	const path = join(root, relativePath);
	const actualHash = createHash("sha256").update(readFileSync(path)).digest("hex");
	if (actualHash !== expectedHash) throw new Error(`Bundled browser runtime hash mismatch: ${relativePath}`);
}
for (const relativePath of ["bin/Xvfb", "bin/xkbcomp", "bin/x11vnc"]) {
	const path = join(root, relativePath);
	accessSync(path, constants.X_OK);
	if ((statSync(path).mode & 0o111) === 0) throw new Error(`Bundled executable lost its mode: ${relativePath}`);
}
console.log(`verified bundled browser runtime (${expectedFiles.length} files)`);
