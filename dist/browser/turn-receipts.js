import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
export const PROVIDER_TURN_RECEIPT_SCHEMA = "@tsuuanmi/internet-provider-turn-receipt";
export class ProviderTurnReceiptError extends Error {
    constructor(message) {
        super(message);
        this.name = "ProviderTurnReceiptError";
    }
}
export function hashProviderTurnText(value) {
    return createHash("sha256").update(value, "utf8").digest("hex");
}
function identityHash(value, name) {
    if (value.trim() === "")
        throw new ProviderTurnReceiptError(`${name} must not be empty`);
    return hashProviderTurnText(value);
}
function receiptId(accountId, sessionHash, requestKeyHash) {
    return hashProviderTurnText(`${accountId}\0${sessionHash}\0${requestKeyHash}`);
}
export function providerTurnReceiptId(accountId, sessionId, requestKey) {
    return receiptId(accountId, identityHash(sessionId, "session id"), identityHash(requestKey, "request key"));
}
export function reconcileProviderTurn(receipt, snapshot) {
    const text = snapshot.text.trim();
    const currentHash = hashProviderTurnText(text);
    if (snapshot.running)
        return receipt.status === "SUBMITTED" ? "WAIT" : "AMBIGUOUS";
    if (receipt.status === "COMPLETED") {
        return text !== "" && receipt.responseHash === currentHash ? "RECOVER" : "AMBIGUOUS";
    }
    if (text !== "" && currentHash !== receipt.previousResponseHash)
        return "RECOVER";
    // The provider exposes no active generation and no new assistant response.
    // This is the explicit bounded at-least-once resubmission boundary for a
    // submitted turn whose provider cannot prove exactly-once execution.
    return "RESUBMIT";
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function timestamp(value) {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function hex(value) {
    return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}
export function parseProviderTurnReceipt(value) {
    if (!isRecord(value) || value.schema !== PROVIDER_TURN_RECEIPT_SCHEMA || value.version !== 1) {
        throw new Error("unsupported provider turn receipt schema");
    }
    if (!hex(value.receiptId) || !hex(value.sessionHash) || !hex(value.requestKeyHash)) {
        throw new Error("invalid provider turn receipt identity");
    }
    if (typeof value.accountId !== "string" || !hex(value.promptHash) || !hex(value.previousResponseHash)) {
        throw new Error("invalid provider turn receipt hashes");
    }
    if (value.status !== "SUBMITTED" && value.status !== "COMPLETED") {
        throw new Error("invalid provider turn receipt status");
    }
    if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 1 || !timestamp(value.submittedAt)) {
        throw new Error("invalid provider turn receipt revision");
    }
    if (value.conversationUrl !== undefined &&
        (typeof value.conversationUrl !== "string" || value.conversationUrl === "")) {
        throw new Error("invalid provider turn receipt conversation URL");
    }
    if (value.status === "COMPLETED") {
        if (!hex(value.responseHash) || !timestamp(value.completedAt)) {
            throw new Error("completed provider turn receipt requires response identity");
        }
    }
    else if (value.responseHash !== undefined || value.completedAt !== undefined) {
        throw new Error("submitted provider turn receipt cannot contain completion identity");
    }
    const expectedId = receiptId(value.accountId, value.sessionHash, value.requestKeyHash);
    if (value.receiptId !== expectedId)
        throw new Error("provider turn receipt id does not match logical identity");
    return value;
}
export class ProviderTurnReceiptStore {
    constructor(dataDir, accountId) {
        this.accountId = accountId;
        this.root = join(dataDir, accountId, "turn-receipts");
    }
    read(sessionId, requestKey) {
        const id = providerTurnReceiptId(this.accountId, sessionId, requestKey);
        const path = join(this.root, `${id}.json`);
        if (!existsSync(path))
            return undefined;
        const stat = lstatSync(path);
        if (!stat.isFile())
            throw new ProviderTurnReceiptError(`provider turn receipt ${id} is not a regular file`);
        if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
            throw new ProviderTurnReceiptError(`provider turn receipt ${id} permissions must be 0600`);
        }
        try {
            return parseProviderTurnReceipt(JSON.parse(readFileSync(path, "utf8")));
        }
        catch (error) {
            throw new ProviderTurnReceiptError(`provider turn receipt ${id} is invalid: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    submit(input) {
        const sessionHash = identityHash(input.sessionId, "session id");
        const requestKeyHash = identityHash(input.requestKey, "request key");
        const id = receiptId(this.accountId, sessionHash, requestKeyHash);
        const current = this.read(input.sessionId, input.requestKey);
        const promptHash = hashProviderTurnText(input.prompt);
        const previousResponseHash = hashProviderTurnText(input.previousResponse.trim());
        if (current !== undefined) {
            if (current.promptHash !== promptHash) {
                throw new ProviderTurnReceiptError("provider turn request key was reused with a different prompt");
            }
            if (current.previousResponseHash !== previousResponseHash) {
                throw new ProviderTurnReceiptError("provider turn resubmission no longer matches its original response boundary");
            }
        }
        const next = {
            schema: PROVIDER_TURN_RECEIPT_SCHEMA,
            version: 1,
            receiptId: id,
            accountId: this.accountId,
            sessionHash,
            requestKeyHash,
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
    bindConversation(sessionId, requestKey, conversationUrl) {
        if (conversationUrl.trim() === "")
            throw new ProviderTurnReceiptError("provider conversation URL must not be empty");
        const current = this.require(sessionId, requestKey);
        if (current.conversationUrl === conversationUrl)
            return current;
        if (current.conversationUrl !== undefined) {
            throw new ProviderTurnReceiptError("provider turn receipt cannot be rebound to another conversation");
        }
        const next = { ...current, conversationUrl, revision: current.revision + 1 };
        this.write(next);
        return next;
    }
    complete(sessionId, requestKey, response, conversationUrl) {
        const current = this.bindConversation(sessionId, requestKey, conversationUrl);
        const responseHash = hashProviderTurnText(response.trim());
        if (response.trim() === "")
            throw new ProviderTurnReceiptError("provider turn completion response must not be empty");
        if (current.status === "COMPLETED") {
            if (current.responseHash !== responseHash) {
                throw new ProviderTurnReceiptError("provider turn completed with conflicting response content");
            }
            return current;
        }
        const next = {
            ...current,
            status: "COMPLETED",
            revision: current.revision + 1,
            responseHash,
            completedAt: new Date().toISOString(),
        };
        this.write(next);
        return next;
    }
    require(sessionId, requestKey) {
        const current = this.read(sessionId, requestKey);
        if (current === undefined)
            throw new ProviderTurnReceiptError("provider turn receipt does not exist");
        return current;
    }
    write(receipt) {
        parseProviderTurnReceipt(receipt);
        ensurePrivateDirectory(this.root);
        writePrivateJson(join(this.root, `${receipt.receiptId}.json`), receipt);
    }
}
//# sourceMappingURL=turn-receipts.js.map