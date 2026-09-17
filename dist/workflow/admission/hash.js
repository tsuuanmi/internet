import { createHash } from "node:crypto";
function canonicalize(value) {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (typeof value !== "object" || value === null)
        return value;
    const entries = Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]);
    return Object.fromEntries(entries);
}
export function canonicalAdmissionJson(value) {
    return JSON.stringify(canonicalize(value));
}
export function hashAdmissionValue(value) {
    return createHash("sha256").update(canonicalAdmissionJson(value), "utf8").digest("hex");
}
//# sourceMappingURL=hash.js.map