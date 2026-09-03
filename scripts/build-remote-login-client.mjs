import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outfile = join(root, "..", "dist", "remote-login-client.js");
await build({
	entryPoints: [join(root, "..", "src", "remote-login-client.ts")],
	bundle: true,
	format: "esm",
	platform: "browser",
	target: "es2022",
	minify: true,
	legalComments: "linked",
	outfile,
});
console.log(`built ${outfile}`);
