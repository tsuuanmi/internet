import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { type AccountId, isAccountId } from "#internet/core/accounts";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";

export const PROVIDER_TURN_RECEIPT_SCHEMA = "@tsuuanmi/internet-provider-turn-receipt" as const;

export type ProviderTurnReceiptStatus = "SUBMITTED" | "COMPLETED";

export interface ProviderTurnReceipt {
	readonly schema: typeof PROVIDER_TURN_RECEIPT_SCHEMA;
	readonly version: 2;
	readonly receiptId: string;
	readonly accountId: AccountId;
	readonly sessionHash: string;
	readonly requestIdHash: string;
	readonly promptHash: string;
	readonly previousResponseHash: string;
	readonly status: ProviderTurnReceiptStatus;
	readonly revision: number;
	readonly submittedAt: string;
	readonly conversationUrl?: string;
	readonly responseHash?: string;
	readonly completedAt?: string;
}

export interface ProviderTurnSnapshot {
	readonly text: string;
	readonly running: boolean;
}

export type ProviderTurnReconciliation = "WAIT" | "RECOVER" | "RESUBMIT" | "AMBIGUOUS";

export class ProviderTurnReceiptError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProviderTurnReceiptError";
	}
}

export function hashProviderTurnText(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

function identityHash(value: string, name: string): string {
	if (value.trim() === "") throw new ProviderTurnReceiptError(`${name} must not be empty`);
	return hashProviderTurnText(value);
}

function receiptId(accountId: AccountId, sessionHash: string, requestIdHash: string): string {
	return hashProviderTurnText(`${accountId}\0${sessionHash}\0${requestIdHash}`);
}

export function providerTurnReceiptId(accountId: AccountId, sessionId: string, requestId: string): string {
	return receiptId(accountId, identityHash(sessionId, "session id"), identityHash(requestId, "request id"));
}

export function reconcileProviderTurn(
	receipt: ProviderTurnReceipt,
	snapshot: ProviderTurnSnapshot,
): ProviderTurnReconciliation {
	const text = snapshot.text.trim();
	const currentHash = hashProviderTurnText(text);
	if (snapshot.running) return receipt.status === "SUBMITTED" ? "WAIT" : "AMBIGUOUS";
	if (receipt.status === "COMPLETED") {
		return text !== "" && receipt.responseHash === currentHash ? "RECOVER" : "AMBIGUOUS";
	}
	if (text !== "" && currentHash !== receipt.previousResponseHash) return "RECOVER";
	return "RESUBMIT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timestamp(value: unknown): value is string {
	return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function hex(value: unknown): value is string {
	return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

export function parseProviderTurnReceipt(value: unknown): ProviderTurnReceipt {
	if (!isRecord(value) || value.schema !== PROVIDER_TURN_RECEIPT_SCHEMA || value.version !== 2) {
		throw new Error("unsupported provider turn receipt schema");
	}
	if (!isAccountId(value.accountId)) throw new Error("invalid provider turn account id");
	if (!hex(value.receiptId) || !hex(value.sessionHash) || !hex(value.requestIdHash)) {
		throw new Error("invalid provider turn receipt identity");
	}
	if (!hex(value.promptHash) || !hex(value.previousResponseHash)) {
		throw new Error("invalid provider turn receipt hashes");
	}
	if (value.status !== "SUBMITTED" && value.status !== "COMPLETED") {
		throw new Error("invalid provider turn receipt status");
	}
	if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 1 || !timestamp(value.submittedAt)) {
		throw new Error("invalid provider turn receipt revision");
	}
	if (
		value.conversationUrl !== undefined &&
		(typeof value.conversationUrl !== "string" || value.conversationUrl === "")
	) {
		throw new Error("invalid provider turn receipt conversation URL");
	}
	if (value.status === "COMPLETED") {
		if (!hex(value.responseHash) || !timestamp(value.completedAt)) {
			throw new Error("completed provider turn receipt requires response identity");
		}
	} else if (value.responseHash !== undefined || value.completedAt !== undefined) {
		throw new Error("submitted provider turn receipt cannot contain completion identity");
	}
	const expectedId = receiptId(value.accountId, value.sessionHash, value.requestIdHash);
	if (value.receiptId !== expectedId) throw new Error("provider turn receipt id does not match logical identity");
	return value as unknown as ProviderTurnReceipt;
}

export class ProviderTurnReceiptStore {
	private readonly root: string;
	private readonly accountId: AccountId;

	constructor(dataDir: string, accountId: AccountId) {
		this.accountId = accountId;
		this.root = join(dataDir, "provider-turns", accountId);
	}

	read(sessionId: string, requestId: string): ProviderTurnReceipt | undefined {
		const id = providerTurnReceiptId(this.accountId, sessionId, requestId);
		const path = join(this.root, `${id}.json`);
		if (!existsSync(path)) return undefined;
		const stat = lstatSync(path);
		if (!stat.isFile()) throw new ProviderTurnReceiptError(`provider turn receipt ${id} is not a regular file`);
		if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
			throw new ProviderTurnReceiptError(`provider turn receipt ${id} permissions must be 0600`);
		}
		try {
			return parseProviderTurnReceipt(JSON.parse(readFileSync(path, "utf8")));
		} catch (error) {
			throw new ProviderTurnReceiptError(
				`provider turn receipt ${id} is invalid: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	deleteSession(sessionId: string): number {
		const sessionHash = identityHash(sessionId, "session id");
		if (!existsSync(this.root)) return 0;
		if (!lstatSync(this.root).isDirectory()) {
			throw new ProviderTurnReceiptError(`provider turn receipt root is not a directory: ${this.root}`);
		}
		let deleted = 0;
		for (const filename of readdirSync(this.root).sort()) {
			if (!/^[0-9a-f]{64}\.json$/u.test(filename)) {
				throw new ProviderTurnReceiptError(`unexpected provider turn receipt file: ${filename}`);
			}
			const path = join(this.root, filename);
			const stat = lstatSync(path);
			if (!stat.isFile())
				throw new ProviderTurnReceiptError(`provider turn receipt ${filename} is not a regular file`);
			if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
				throw new ProviderTurnReceiptError(`provider turn receipt ${filename} permissions must be 0600`);
			}
			let receipt: ProviderTurnReceipt;
			try {
				receipt = parseProviderTurnReceipt(JSON.parse(readFileSync(path, "utf8")));
			} catch (error) {
				throw new ProviderTurnReceiptError(
					`provider turn receipt ${filename} is invalid: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			if (receipt.accountId !== this.accountId) {
				throw new ProviderTurnReceiptError(`provider turn receipt ${filename} belongs to another account`);
			}
			if (receipt.sessionHash !== sessionHash) continue;
			unlinkSync(path);
			deleted += 1;
		}
		if (readdirSync(this.root).length === 0) rmdirSync(this.root);
		return deleted;
	}

	submit(input: {
		readonly sessionId: string;
		readonly requestId: string;
		readonly prompt: string;
		readonly previousResponse: string;
		readonly conversationUrl?: string;
	}): ProviderTurnReceipt {
		const sessionHash = identityHash(input.sessionId, "session id");
		const requestIdHash = identityHash(input.requestId, "request id");
		const id = receiptId(this.accountId, sessionHash, requestIdHash);
		const current = this.read(input.sessionId, input.requestId);
		const promptHash = hashProviderTurnText(input.prompt);
		const previousResponseHash = hashProviderTurnText(input.previousResponse.trim());
		if (current !== undefined) {
			if (current.promptHash !== promptHash) {
				throw new ProviderTurnReceiptError("provider turn request id was reused with a different prompt");
			}
			if (current.previousResponseHash !== previousResponseHash) {
				throw new ProviderTurnReceiptError(
					"provider turn resubmission no longer matches its original response boundary",
				);
			}
		}
		const next: ProviderTurnReceipt = {
			schema: PROVIDER_TURN_RECEIPT_SCHEMA,
			version: 2,
			receiptId: id,
			accountId: this.accountId,
			sessionHash,
			requestIdHash,
			promptHash,
			previousResponseHash,
			status: "SUBMITTED",
			revision: (current?.revision ?? 0) + 1,
			submittedAt: new Date().toISOString(),
			...((input.conversationUrl ?? current?.conversationUrl)
				? { conversationUrl: input.conversationUrl ?? current?.conversationUrl }
				: {}),
		};
		this.write(next);
		return next;
	}

	bindConversation(sessionId: string, requestId: string, conversationUrl: string): ProviderTurnReceipt {
		if (conversationUrl.trim() === "") {
			throw new ProviderTurnReceiptError("provider conversation URL must not be empty");
		}
		const current = this.require(sessionId, requestId);
		if (current.conversationUrl === conversationUrl) return current;
		if (current.conversationUrl !== undefined) {
			throw new ProviderTurnReceiptError("provider turn receipt cannot be rebound to another conversation");
		}
		const next = { ...current, conversationUrl, revision: current.revision + 1 };
		this.write(next);
		return next;
	}

	complete(sessionId: string, requestId: string, response: string, conversationUrl: string): ProviderTurnReceipt {
		const current = this.bindConversation(sessionId, requestId, conversationUrl);
		const responseHash = hashProviderTurnText(response.trim());
		if (response.trim() === "") {
			throw new ProviderTurnReceiptError("provider turn completion response must not be empty");
		}
		if (current.status === "COMPLETED") {
			if (current.responseHash !== responseHash) {
				throw new ProviderTurnReceiptError("provider turn completed with conflicting response content");
			}
			return current;
		}
		const next: ProviderTurnReceipt = {
			...current,
			status: "COMPLETED",
			revision: current.revision + 1,
			responseHash,
			completedAt: new Date().toISOString(),
		};
		this.write(next);
		return next;
	}

	private require(sessionId: string, requestId: string): ProviderTurnReceipt {
		const current = this.read(sessionId, requestId);
		if (current === undefined) throw new ProviderTurnReceiptError("provider turn receipt does not exist");
		return current;
	}

	private write(receipt: ProviderTurnReceipt): void {
		parseProviderTurnReceipt(receipt);
		ensurePrivateDirectory(this.root);
		writePrivateJson(join(this.root, `${receipt.receiptId}.json`), receipt);
	}
}
