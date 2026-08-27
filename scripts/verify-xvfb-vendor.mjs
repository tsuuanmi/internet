import { createHash } from "node:crypto";
import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "vendor", "xvfb", "linux-x64-gnu");
const provenance = JSON.parse(readFileSync(join(root, "PROVENANCE.json"), "utf8"));

for (const [relativePath, expectedHash] of Object.entries(provenance.files)) {
	const path = join(root, relativePath);
	const actualHash = createHash("sha256").update(readFileSync(path)).digest("hex");
	if (actualHash !== expectedHash) throw new Error(`Bundled Xvfb hash mismatch: ${relativePath}`);
}

for (const relativePath of ["bin/Xvfb", "bin/xkbcomp"]) {
	const path = join(root, relativePath);
	accessSync(path, constants.X_OK);
	if ((statSync(path).mode & 0o111) === 0) throw new Error(`Bundled executable lost its mode: ${relativePath}`);
}

console.log(`verified bundled Xvfb runtime (${Object.keys(provenance.files).length} files)`);
