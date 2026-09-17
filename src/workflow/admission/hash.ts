import { canonicalJson, hashCanonicalJson } from "#internet/core/canonical-json";

export function canonicalAdmissionJson(value: unknown): string {
	return canonicalJson(value);
}

export function hashAdmissionValue(value: unknown): string {
	return hashCanonicalJson(value);
}
