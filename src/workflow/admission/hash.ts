import { createHash } from "node:crypto";

function compareKeys(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value: unknown): unknown {
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new TypeError("admission hash input contains a non-finite number");
		return Object.is(value, -0) ? 0 : value;
	}
	if (Array.isArray(value)) {
		return value.map((item) => {
			if (item === undefined) throw new TypeError("admission hash input contains an undefined array item");
			return canonicalize(item);
		});
	}
	if (typeof value !== "object" || value === undefined) {
		throw new TypeError(`admission hash input contains unsupported ${typeof value}`);
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new TypeError("admission hash input must contain only plain objects");
	}
	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([, item]) => item !== undefined)
		.sort(([left], [right]) => compareKeys(left, right))
		.map(([key, item]) => [key, canonicalize(item)] as const);
	return Object.fromEntries(entries);
}

export function canonicalAdmissionJson(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}

export function hashAdmissionValue(value: unknown): string {
	return createHash("sha256").update(canonicalAdmissionJson(value), "utf8").digest("hex");
}
