import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (typeof value !== "object" || value === null) return value;
	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([, item]) => item !== undefined)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, item]) => [key, canonicalize(item)] as const);
	return Object.fromEntries(entries);
}

export function canonicalAdmissionJson(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}

export function hashAdmissionValue(value: unknown): string {
	return createHash("sha256").update(canonicalAdmissionJson(value), "utf8").digest("hex");
}
