// Build the DSH web client bundle from src/client.ts into dist/client.js.
//
// The DeepSeek Harness loads each plugin's client module as a *classic* script
// that must register itself by calling window.__ModuleLoader__.load({ id,
// factory }). The plain `tsgo` emit of src/client.ts is ES modules (import/
// export), which fails both to parse as a classic script and to register the
// module, so the plugin's browser surface never composes ("loaded without
// registering ... via __ModuleLoader__.load"). This script bundles the client
// entry with esbuild (keeping shell-own modules such as `react` and
// `@deepseek-ai/dsh-client-ui-primitives` external so they resolve through the
// runtime's require table) and wraps the CommonJS output in the load call the
// harness expects.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outfile = join(root, "..", "dist", "client.js");

const result = await build({
	entryPoints: [join(root, "..", "src", "client.ts")],
	bundle: true,
	format: "cjs",
	platform: "browser",
	target: "es2020",
	external: ["react", "@deepseek-ai/*"],
	sourcemap: false,
	write: false,
});

const body = result.outputFiles[0].text;
// The generated artifact is plain CommonJS that reads `require`/`module` from
// its surrounding scope, so a wrapper that supplies them (plus the factory's
// `require`) and returns `module.exports` is all the harness needs.
const bundle = `window.__ModuleLoader__.load({
	id: ${JSON.stringify("@tsuuanmi/internet")},
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${body}
		return module.exports;
	}
});
`;

mkdirSync(dirname(outfile), { recursive: true });
writeFileSync(outfile, bundle);

console.log(`built ${outfile} (${bundle.length} bytes)`);


// Temporary PR instrumentation: capture exact tsgo output for host-neutral application boundary.
// This block is removed after generated artifacts are committed.
for (const relative of [
	"application.js",
	"application.js.map",
	"application.d.ts",
	"application.d.ts.map",
	"application/context.js",
	"application/context.js.map",
	"application/context.d.ts",
	"application/context.d.ts.map",
	"application/chat.js",
	"application/chat.js.map",
	"application/chat.d.ts",
	"application/chat.d.ts.map",
	"application/artifact.js",
	"application/artifact.js.map",
	"application/artifact.d.ts",
	"application/artifact.d.ts.map",
	"index.js",
	"index.js.map",
	"index.d.ts",
	"index.d.ts.map",
	"tools/internet-chat.js",
	"tools/internet-chat.js.map",
	"tools/internet-chat.d.ts",
	"tools/internet-chat.d.ts.map",
	"tools/internet-artifact.js",
	"tools/internet-artifact.js.map",
	"tools/internet-artifact.d.ts",
	"tools/internet-artifact.d.ts.map",
]) {
	const path = join(root, "..", "dist", relative);
	console.log(`DIST_CAPTURE ${relative} ${readFileSync(path).toString("base64")}`);
}
