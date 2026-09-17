import { canonicalJson, hashCanonicalJson } from "#internet/core/canonical-json";
export function canonicalAdmissionJson(value) {
    return canonicalJson(value);
}
export function hashAdmissionValue(value) {
    return hashCanonicalJson(value);
}
//# sourceMappingURL=hash.js.map