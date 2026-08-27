import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: [{ find: /^#internet\/(.*)$/, replacement: `${fileURLToPath(new URL("./src/", import.meta.url))}$1` }],
	},
	test: {
		globals: true,
		environment: "node",
		testTimeout: 30000,
	},
});
