import { createHash, randomUUID } from "node:crypto";
import {
	chmodSync,
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const CHATGPT_ORIGIN = "https://chatgpt.com";
const CHATGPT_CONVERSATION_PATH = /^\/c\/([A-Za-z0-9_-]+)$/;

export interface ChatGptConversationBinding {
	version: 1;
	revision: number;
	sessionHash: string;
	conversationId: string;
	conversationUrl: string;
	updatedAt: string;
}

/** Parse and canonicalize one native ChatGPT conversation URL. */
export function parseChatGptConversationUrl(value: string): { id: string; url: string } {
	const url = new URL(value);
	const match =
		url.origin === CHATGPT_ORIGIN && url.search.length === 0 && url.hash.length === 0
			? CHATGPT_CONVERSATION_PATH.exec(url.pathname)
			: null;
	if (match?.[1] === undefined) throw new Error(`Invalid ChatGPT conversation URL: ${value}`);
	return { id: match[1], url: `${CHATGPT_ORIGIN}/c/${match[1]}` };
}

/** Durable private 1:1 bindings from DSH session IDs to ChatGPT conversations. */
export class ChatGptConversationStore {
	private readonly root: string;

	constructor(dataDir: string) {
		this.root = resolve(dataDir, "chatgpt-web", "conversations");
		mkdirSync(this.root, { recursive: true, mode: 0o700 });
		chmodSync(this.root, 0o700);
	}

	read(sessionId: string): ChatGptConversationBinding | undefined {
		const expectedHash = hashSessionId(sessionId);
		const path = this.path(expectedHash);
		if (!existsSync(path)) return undefined;
		if ((statSync(path).mode & 0o077) !== 0) {
			throw new Error(`ChatGPT conversation binding is not private: ${path}`);
		}
		const binding = JSON.parse(readFileSync(path, "utf8")) as unknown;
		return validateBinding(binding, expectedHash);
	}

	/** Create the session binding, or refresh its timestamp without allowing rebinding. */
	bind(sessionId: string, conversationUrl: string): ChatGptConversationBinding {
		const sessionHash = hashSessionId(sessionId);
		const conversation = parseChatGptConversationUrl(conversationUrl);
		const existing = this.read(sessionId);
		if (existing !== undefined && existing.conversationId !== conversation.id) {
			throw new Error(
				`DSH session is already bound to ChatGPT conversation ${existing.conversationId}; refusing ${conversation.id}`,
			);
		}
		const binding: ChatGptConversationBinding = {
			version: 1,
			revision: (existing?.revision ?? 0) + 1,
			sessionHash,
			conversationId: conversation.id,
			conversationUrl: conversation.url,
			updatedAt: new Date().toISOString(),
		};
		writePrivateJson(this.path(sessionHash), binding);
		return binding;
	}

	private path(sessionHash: string): string {
		return join(this.root, `${sessionHash}.json`);
	}
}

function hashSessionId(sessionId: string): string {
	if (sessionId.trim().length === 0) throw new Error("DSH session ID must not be empty");
	return createHash("sha256").update(sessionId).digest("hex");
}

function validateBinding(value: unknown, expectedHash: string): ChatGptConversationBinding {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Invalid ChatGPT conversation binding");
	}
	const binding = value as Partial<ChatGptConversationBinding>;
	if (
		binding.version !== 1 ||
		!Number.isSafeInteger(binding.revision) ||
		(binding.revision ?? 0) < 1 ||
		binding.sessionHash !== expectedHash ||
		typeof binding.conversationId !== "string" ||
		typeof binding.conversationUrl !== "string" ||
		typeof binding.updatedAt !== "string"
	) {
		throw new Error("Invalid ChatGPT conversation binding");
	}
	const conversation = parseChatGptConversationUrl(binding.conversationUrl);
	if (conversation.id !== binding.conversationId || conversation.url !== binding.conversationUrl) {
		throw new Error("Invalid ChatGPT conversation binding identity");
	}
	return binding as ChatGptConversationBinding;
}

function writePrivateJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
	let descriptor: number | undefined;
	try {
		descriptor = openSync(temporary, "wx", 0o600);
		writeFileSync(descriptor, `${JSON.stringify(value)}\n`);
		fsyncSync(descriptor);
		closeSync(descriptor);
		descriptor = undefined;
		renameSync(temporary, path);
		chmodSync(path, 0o600);
		fsyncDirectory(dirname(path));
	} finally {
		if (descriptor !== undefined) closeSync(descriptor);
		rmSync(temporary, { force: true });
	}
}

function fsyncDirectory(path: string): void {
	const descriptor = openSync(path, "r");
	try {
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
}
