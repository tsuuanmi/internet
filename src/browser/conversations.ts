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
const GEMINI_ORIGIN = "https://gemini.google.com";
const GEMINI_CONVERSATION_PATH = /^\/app\/([A-Za-z0-9_-]+)$/;

export interface ConversationBinding {
	version: 1;
	revision: number;
	sessionHash: string;
	conversationId: string;
	conversationUrl: string;
	updatedAt: string;
}

export type ChatGptConversationBinding = ConversationBinding;
export type GeminiConversationBinding = ConversationBinding;

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

/** Parse and canonicalize one native Gemini conversation URL. */
export function parseGeminiConversationUrl(value: string): { id: string; url: string } {
	const url = new URL(value);
	const match =
		url.origin === GEMINI_ORIGIN && url.search.length === 0 && url.hash.length === 0
			? GEMINI_CONVERSATION_PATH.exec(url.pathname)
			: null;
	if (match?.[1] === undefined) throw new Error(`Invalid Gemini conversation URL: ${value}`);
	return { id: match[1], url: `${GEMINI_ORIGIN}/app/${match[1]}` };
}

type ConversationUrlParser = (value: string) => { id: string; url: string };

/**
 * Durable private 1:1 bindings from DSH session IDs to a provider's native
 * conversations. Shared by the ChatGPT and Gemini stores; each provider owns a
 * private subdirectory and its own URL parser.
 */
class ConversationStore {
	private readonly root: string;
	private readonly parseUrl: ConversationUrlParser;
	private readonly providerName: string;

	constructor(dataDir: string, providerDir: string, providerName: string, parseUrl: ConversationUrlParser) {
		this.root = resolve(dataDir, providerDir, "conversations");
		this.parseUrl = parseUrl;
		this.providerName = providerName;
		mkdirSync(this.root, { recursive: true, mode: 0o700 });
		chmodSync(this.root, 0o700);
	}

	read(sessionId: string): ConversationBinding | undefined {
		const expectedHash = hashSessionId(sessionId);
		const path = this.path(expectedHash);
		if (!existsSync(path)) return undefined;
		if ((statSync(path).mode & 0o077) !== 0) {
			throw new Error(`${this.providerName} conversation binding is not private: ${path}`);
		}
		const binding = JSON.parse(readFileSync(path, "utf8")) as unknown;
		return this.validateBinding(binding, expectedHash);
	}

	/** Create the session binding, or refresh its timestamp without allowing rebinding. */
	bind(sessionId: string, conversationUrl: string): ConversationBinding {
		const sessionHash = hashSessionId(sessionId);
		const conversation = this.parseUrl(conversationUrl);
		const existing = this.read(sessionId);
		if (existing !== undefined && existing.conversationId !== conversation.id) {
			throw new Error(
				`DSH session is already bound to ${this.providerName} conversation ${existing.conversationId}; refusing ${conversation.id}`,
			);
		}
		const binding: ConversationBinding = {
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

	private validateBinding(value: unknown, expectedHash: string): ConversationBinding {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			throw new Error(`Invalid ${this.providerName} conversation binding`);
		}
		const binding = value as Partial<ConversationBinding>;
		if (
			binding.version !== 1 ||
			!Number.isSafeInteger(binding.revision) ||
			(binding.revision ?? 0) < 1 ||
			binding.sessionHash !== expectedHash ||
			typeof binding.conversationId !== "string" ||
			typeof binding.conversationUrl !== "string" ||
			typeof binding.updatedAt !== "string"
		) {
			throw new Error(`Invalid ${this.providerName} conversation binding`);
		}
		const conversation = this.parseUrl(binding.conversationUrl);
		if (conversation.id !== binding.conversationId || conversation.url !== binding.conversationUrl) {
			throw new Error(`Invalid ${this.providerName} conversation binding identity`);
		}
		return binding as ConversationBinding;
	}
}

/** Durable private 1:1 bindings from DSH session IDs to ChatGPT conversations. */
export class ChatGptConversationStore extends ConversationStore {
	constructor(dataDir: string) {
		super(dataDir, "chatgpt-web", "ChatGPT", parseChatGptConversationUrl);
	}
}

/** Durable private 1:1 bindings from DSH session IDs to Gemini conversations. */
export class GeminiConversationStore extends ConversationStore {
	constructor(dataDir: string) {
		super(dataDir, "gemini-web", "Gemini", parseGeminiConversationUrl);
	}
}

function hashSessionId(sessionId: string): string {
	if (sessionId.trim().length === 0) throw new Error("DSH session ID must not be empty");
	return createHash("sha256").update(sessionId).digest("hex");
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
