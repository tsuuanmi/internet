import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { type StdioServerHandle, serveStdio } from "@modelcontextprotocol/server/stdio";
import type {
	InternetArtifactApplicationService,
	InternetArtifactReadResult,
	InternetChatApplicationResult,
	InternetChatApplicationService,
} from "#internet/application";
import { ACCOUNT_IDS, type AccountId, isAccountId } from "#internet/core/accounts";

const CHAT_INPUT_SCHEMA = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	type: "object",
	additionalProperties: false,
	properties: {
		account: { type: "string", enum: [...ACCOUNT_IDS] },
		prompt: { type: "string", minLength: 1 },
		visible: { type: "boolean" },
	},
	required: ["account", "prompt"],
} as const;

const CHAT_OUTPUT_SCHEMA = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	type: "object",
	additionalProperties: false,
	properties: {
		answer: { type: "string" },
		accountId: { type: "string" },
		provider: { type: "string" },
		url: { type: "string" },
		conversationId: { type: "string" },
		artifactId: { type: "string" },
		totalChars: { type: "integer" },
		truncated: { type: "boolean" },
		nextOffset: { type: "integer" },
		isError: { type: "boolean" },
	},
	required: ["answer", "accountId", "provider"],
} as const;

const ARTIFACT_INPUT_SCHEMA = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	type: "object",
	additionalProperties: false,
	properties: {
		artifact_id: { type: "string", pattern: "^[0-9a-f]{64}$" },
		offset: { type: "integer", minimum: 0 },
		max_chars: { type: "integer", minimum: 1, maximum: 50_000 },
	},
	required: ["artifact_id"],
} as const;

const ARTIFACT_OUTPUT_SCHEMA = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	type: "object",
	additionalProperties: false,
	properties: {
		text: { type: "string" },
		artifactId: { type: "string" },
		offset: { type: "integer" },
		totalChars: { type: "integer" },
		nextOffset: { type: "integer" },
	},
	required: ["text", "artifactId", "offset", "totalChars"],
} as const;

interface InternetMcpChatArgs {
	readonly account: string;
	readonly prompt: string;
	readonly visible?: boolean;
}

interface InternetMcpArtifactArgs {
	readonly artifact_id: string;
	readonly offset?: number;
	readonly max_chars?: number;
}

export interface InternetMcpToolRequestContext {
	readonly requestId: string | number;
	readonly signal?: AbortSignal;
}

export interface InternetMcpToolResult {
	readonly content: readonly [{ readonly type: "text"; readonly text: string }];
	readonly structuredContent?: Readonly<Record<string, unknown>>;
	readonly isError?: boolean;
}

export interface InternetMcpToolDefinition {
	readonly name: "internet_chat" | "internet_artifact";
	readonly description: string;
	readonly inputSchema: Readonly<Record<string, unknown>>;
	readonly outputSchema: Readonly<Record<string, unknown>>;
	readonly annotations: {
		readonly readOnlyHint: boolean;
		readonly destructiveHint: boolean;
		readonly idempotentHint: boolean;
		readonly openWorldHint: boolean;
	};
	invoke(
		args: Readonly<Record<string, unknown>>,
		request: InternetMcpToolRequestContext,
	): Promise<InternetMcpToolResult>;
}

export interface InternetMcpServerDependencies {
	readonly ownerSessionId: string;
	readonly chat: Pick<InternetChatApplicationService, "execute">;
	readonly artifacts: Pick<InternetArtifactApplicationService, "read">;
}

function assertOwnerSessionId(ownerSessionId: string): void {
	if (ownerSessionId.trim() === "") throw new Error("internet MCP owner session id must not be empty");
}

function requestContext(ownerSessionId: string, request: InternetMcpToolRequestContext) {
	return {
		ownerSessionId,
		requestId: String(request.requestId),
		...(request.signal === undefined ? {} : { signal: request.signal }),
	};
}

function parseChatArgs(args: Readonly<Record<string, unknown>>): InternetMcpChatArgs & { account: AccountId } {
	const account = args.account;
	if (!isAccountId(account)) throw new Error(`internet_chat account must be one of ${ACCOUNT_IDS.join(", ")}`);
	const prompt = args.prompt;
	if (typeof prompt !== "string" || prompt.trim() === "") {
		throw new Error("internet_chat prompt must be a non-empty string");
	}
	const visible = args.visible;
	if (visible !== undefined && typeof visible !== "boolean")
		throw new Error("internet_chat visible must be a boolean");
	return { account, prompt, ...(visible === undefined ? {} : { visible }) };
}

function parseArtifactArgs(args: Readonly<Record<string, unknown>>): InternetMcpArtifactArgs {
	const artifactId = args.artifact_id;
	if (typeof artifactId !== "string" || !/^[0-9a-f]{64}$/u.test(artifactId)) {
		throw new Error("internet_artifact artifact_id must be 64 lowercase hex characters");
	}
	const offset = args.offset;
	if (offset !== undefined && (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0)) {
		throw new Error("internet_artifact offset must be a non-negative integer");
	}
	const maxChars = args.max_chars;
	if (
		maxChars !== undefined &&
		(typeof maxChars !== "number" || !Number.isSafeInteger(maxChars) || maxChars < 1 || maxChars > 50_000)
	) {
		throw new Error("internet_artifact max_chars must be an integer from 1 through 50000");
	}
	return {
		artifact_id: artifactId,
		...(offset === undefined ? {} : { offset }),
		...(maxChars === undefined ? {} : { max_chars: maxChars }),
	};
}

function chatResult(result: InternetChatApplicationResult): InternetMcpToolResult {
	return {
		content: [{ type: "text", text: result.answer }],
		structuredContent: result as unknown as Readonly<Record<string, unknown>>,
		...(result.isError === true ? { isError: true } : {}),
	};
}

function artifactResult(result: InternetArtifactReadResult): InternetMcpToolResult {
	return {
		content: [{ type: "text", text: result.text }],
		structuredContent: result as unknown as Readonly<Record<string, unknown>>,
	};
}

function errorResult(prefix: string, error: unknown): InternetMcpToolResult {
	return {
		content: [{ type: "text", text: `${prefix}: ${error instanceof Error ? error.message : String(error)}` }],
		isError: true,
	};
}

export function createInternetMcpToolDefinitions(
	dependencies: InternetMcpServerDependencies,
): readonly InternetMcpToolDefinition[] {
	assertOwnerSessionId(dependencies.ownerSessionId);
	return [
		{
			name: "internet_chat",
			description:
				"Ask an authenticated Internet thinker account through the host-neutral Internet application service.",
			inputSchema: CHAT_INPUT_SCHEMA,
			outputSchema: CHAT_OUTPUT_SCHEMA,
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: true,
			},
			async invoke(args, request) {
				try {
					const input = parseChatArgs(args);
					return chatResult(
						await dependencies.chat.execute(requestContext(dependencies.ownerSessionId, request), {
							accountId: input.account,
							prompt: input.prompt,
							...(input.visible === undefined ? {} : { visible: input.visible }),
						}),
					);
				} catch (error) {
					return errorResult("internet_chat failed", error);
				}
			},
		},
		{
			name: "internet_artifact",
			description: "Read an exact owner-scoped range from a retained Internet result artifact.",
			inputSchema: ARTIFACT_INPUT_SCHEMA,
			outputSchema: ARTIFACT_OUTPUT_SCHEMA,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
			async invoke(args, request) {
				try {
					const input = parseArtifactArgs(args);
					return artifactResult(
						dependencies.artifacts.read(requestContext(dependencies.ownerSessionId, request), {
							artifactId: input.artifact_id,
							...(input.offset === undefined ? {} : { offset: input.offset }),
							...(input.max_chars === undefined ? {} : { maxChars: input.max_chars }),
						}),
					);
				} catch (error) {
					return errorResult("internet_artifact failed", error);
				}
			},
		},
	];
}

export function createInternetMcpServer(dependencies: InternetMcpServerDependencies): McpServer {
	const server = new McpServer({ name: "@tsuuanmi/internet", version: "0.0.1" });
	for (const tool of createInternetMcpToolDefinitions(dependencies)) {
		server.registerTool(
			tool.name,
			{
				description: tool.description,
				inputSchema: fromJsonSchema<Record<string, unknown>>(tool.inputSchema),
				outputSchema: fromJsonSchema<Record<string, unknown>>(tool.outputSchema),
				annotations: tool.annotations,
			},
			async (args, ctx) =>
				tool.invoke(args, {
					requestId: ctx.mcpReq.id,
					signal: ctx.mcpReq.signal,
				}),
		);
	}
	return server;
}

export function serveInternetMcpStdio(dependencies: InternetMcpServerDependencies): StdioServerHandle {
	return serveStdio(() => createInternetMcpServer(dependencies), { legacy: "reject" });
}
