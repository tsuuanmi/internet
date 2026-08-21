/**
 * Minimal ambient type declarations for the DeepSeek Harness peer packages
 * that this plugin imports. The real packages are present at runtime in the
 * DSH host (declared as peerDependencies); these declarations exist only so
 * this standalone package can typecheck and build without installing them.
 * Keep this surface as small as what the plugin actually uses.
 */

declare module "@deepseek-ai/dsh-commands" {
	export interface CommandInvocation {
		readonly agent: { readonly id: string };
		readonly rawInput: string;
		readonly signal: AbortSignal;
	}

	export type CommandResult =
		| { readonly kind: "success"; readonly text?: string }
		| { readonly kind: "error"; readonly text: string };

	export interface CommandDefinition {
		readonly name: string;
		readonly description: string;
		readonly input?: { readonly hint: string };
		readonly recordInput?: boolean;
		readonly handler: (invocation: CommandInvocation) => CommandResult | Promise<CommandResult>;
	}
}

declare module "@deepseek-ai/dsh-tools" {
	export interface ToolArgs {
		[key: string]: unknown;
	}

	export interface ToolExecution {
		signal: AbortSignal;
		agent?: {
			id: string;
		};
	}

	export interface JsonSchema {
		type: "object" | "string" | "number" | "integer" | "boolean" | "array" | "null" | "json";
		description?: string;
		additionalProperties?: boolean;
		properties?: Record<string, JsonSchema>;
		required?: boolean;
		items?: JsonSchema;
		enum?: Array<string | number | boolean>;
		const?: string | number | boolean;
		oneOf?: JsonSchema[];
	}

	export interface TextBlock {
		type: "text";
		text: string;
	}

	export interface ToolDefinition {
		name: string;
		description: string;
		parameters: unknown;
		output: unknown;
	}

	export interface DefineToolOptions {
		name: string;
		description: string;
		parameters: Record<
			string,
			{
				type: "string" | "number" | "boolean";
				required?: boolean;
				description?: string;
				enum?: string[];
			}
		>;
		output: {
			schema: JsonSchema;
			render: (args: ToolArgs, value: unknown) => TextBlock[];
			presentationMeta?: (args: ToolArgs, value: unknown) => unknown;
		};
		timeoutMs?: number;
		isConcurrencySafe?: () => boolean;
		execute: (args: ToolArgs, exec: ToolExecution) => Promise<unknown>;
		presentCall?: (args: ToolArgs) => unknown;
		presentResult?: (args: ToolArgs, result: unknown) => unknown;
	}

	export function defineTool(options: DefineToolOptions): ToolDefinition;
}

declare module "@deepseek-ai/schemastery" {
	export interface Schema<T> {
		default(value: T): Schema<T>;
		readonly "~standard": {
			validate(value: unknown): { value: T } | { issues: unknown[] };
		};
	}

	const S: {
		object<T extends Record<string, Schema<unknown>>>(
			dict: T,
		): Schema<{ [K in keyof T]: T[K] extends Schema<infer U> ? U : never }>;
		string(): Schema<string>;
		number(): Schema<number>;
		boolean(): Schema<boolean>;
	};
	export default S;
}

declare module "react" {
	export function createElement(type: unknown, props?: unknown, ...children: unknown[]): unknown;
}

declare module "@deepseek-ai/dsh-client-ui-primitives" {
	export function MarkdownText(props: { text: string; streaming: boolean }): unknown;
}

/** `turndown-plugin-gfm` ships no types; the plugin only needs its `gfm` plugin. */
declare module "turndown-plugin-gfm";
