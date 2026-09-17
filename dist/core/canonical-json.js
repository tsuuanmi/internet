import { createHash } from "node:crypto";
function compareKeys(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function canonicalize(value) {
    if (value === null || typeof value === "string" || typeof value === "boolean")
        return value;
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            throw new TypeError("canonical JSON contains a non-finite number");
        return Object.is(value, -0) ? 0 : value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => {
            if (item === undefined)
                throw new TypeError("canonical JSON contains an undefined array item");
            return canonicalize(item);
        });
    }
    if (typeof value !== "object" || value === undefined) {
        throw new TypeError(`canonical JSON contains unsupported ${typeof value}`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("canonical JSON must contain only plain objects");
    }
    const entries = Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => compareKeys(left, right))
        .map(([key, item]) => [key, canonicalize(item)]);
    return Object.fromEntries(entries);
}
export function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
}
export function hashCanonicalJson(value) {
    return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
//# sourceMappingURL=canonical-json.js.map