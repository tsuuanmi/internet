import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { writePrivateJson } from "#internet/core/private-json";
const CHATGPT_ORIGIN = "https://chatgpt.com";
const CHATGPT_CONVERSATION_PATH = /^\/c\/([A-Za-z0-9_-]+)$/;
const GEMINI_ORIGIN = "https://gemini.google.com";
const GEMINI_CONVERSATION_PATH = /^\/app\/([A-Za-z0-9_-]+)$/;
/** Parse and canonicalize one native ChatGPT conversation URL. */
export function parseChatGptConversationUrl(value) {
    const url = new URL(value);
    const match = url.origin === CHATGPT_ORIGIN && url.search.length === 0 && url.hash.length === 0
        ? CHATGPT_CONVERSATION_PATH.exec(url.pathname)
        : null;
    if (match?.[1] === undefined)
        throw new Error(`Invalid ChatGPT conversation URL: ${value}`);
    return { id: match[1], url: `${CHATGPT_ORIGIN}/c/${match[1]}` };
}
/** Parse and canonicalize one native Gemini conversation URL. */
export function parseGeminiConversationUrl(value) {
    const url = new URL(value);
    const match = url.origin === GEMINI_ORIGIN && url.search.length === 0 && url.hash.length === 0
        ? GEMINI_CONVERSATION_PATH.exec(url.pathname)
        : null;
    if (match?.[1] === undefined)
        throw new Error(`Invalid Gemini conversation URL: ${value}`);
    return { id: match[1], url: `${GEMINI_ORIGIN}/app/${match[1]}` };
}
/**
 * Durable private 1:1 bindings from DSH session IDs to a provider's native
 * conversations. Shared by the ChatGPT and Gemini stores; each provider owns a
 * private subdirectory and its own URL parser.
 */
class ConversationStore {
    constructor(dataDir, providerDir, providerName, parseUrl) {
        this.root = resolve(dataDir, providerDir, "conversations");
        this.parseUrl = parseUrl;
        this.providerName = providerName;
        mkdirSync(this.root, { recursive: true, mode: 0o700 });
        chmodSync(this.root, 0o700);
    }
    read(sessionId) {
        const expectedHash = hashSessionId(sessionId);
        const path = this.path(expectedHash);
        if (!existsSync(path))
            return undefined;
        if ((statSync(path).mode & 0o077) !== 0) {
            throw new Error(`${this.providerName} conversation binding is not private: ${path}`);
        }
        const binding = JSON.parse(readFileSync(path, "utf8"));
        return this.validateBinding(binding, expectedHash);
    }
    /** Create the session binding, or refresh its timestamp without allowing rebinding. */
    bind(sessionId, conversationUrl) {
        const sessionHash = hashSessionId(sessionId);
        const conversation = this.parseUrl(conversationUrl);
        const existing = this.read(sessionId);
        if (existing !== undefined && existing.conversationId !== conversation.id) {
            throw new Error(`DSH session is already bound to ${this.providerName} conversation ${existing.conversationId}; refusing ${conversation.id}`);
        }
        const binding = {
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
    path(sessionHash) {
        return join(this.root, `${sessionHash}.json`);
    }
    validateBinding(value, expectedHash) {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
            throw new Error(`Invalid ${this.providerName} conversation binding`);
        }
        const binding = value;
        if (binding.version !== 1 ||
            !Number.isSafeInteger(binding.revision) ||
            (binding.revision ?? 0) < 1 ||
            binding.sessionHash !== expectedHash ||
            typeof binding.conversationId !== "string" ||
            typeof binding.conversationUrl !== "string" ||
            typeof binding.updatedAt !== "string") {
            throw new Error(`Invalid ${this.providerName} conversation binding`);
        }
        const conversation = this.parseUrl(binding.conversationUrl);
        if (conversation.id !== binding.conversationId || conversation.url !== binding.conversationUrl) {
            throw new Error(`Invalid ${this.providerName} conversation binding identity`);
        }
        return binding;
    }
}
/** Durable private 1:1 bindings from DSH session IDs to ChatGPT conversations. */
export class ChatGptConversationStore extends ConversationStore {
    constructor(dataDir) {
        super(dataDir, "chatgpt-web", "ChatGPT", parseChatGptConversationUrl);
    }
}
/** Durable private 1:1 bindings from DSH session IDs to Gemini conversations. */
export class GeminiConversationStore extends ConversationStore {
    constructor(dataDir) {
        super(dataDir, "gemini-web", "Gemini", parseGeminiConversationUrl);
    }
}
function hashSessionId(sessionId) {
    if (sessionId.trim().length === 0)
        throw new Error("DSH session ID must not be empty");
    return createHash("sha256").update(sessionId).digest("hex");
}
//# sourceMappingURL=conversations.js.map