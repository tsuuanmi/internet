import { randomUUID } from "node:crypto";
import { chmodSync, closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Create a private directory and correct permissions on an existing one. */
export function ensurePrivateDirectory(path: string): void {
	mkdirSync(path, { recursive: true, mode: 0o700 });
	chmodSync(path, 0o700);
}

/** Atomically persist private JSON with a durable file and parent-directory rename. */
export function writePrivateJson(path: string, value: unknown): void {
	const serialized = JSON.stringify(value);
	if (serialized === undefined) throw new TypeError("private JSON value is not serializable");
	const directory = dirname(path);
	ensurePrivateDirectory(directory);
	const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
	let descriptor: number | undefined;
	try {
		descriptor = openSync(temporary, "wx", 0o600);
		writeFileSync(descriptor, `${serialized}\n`);
		fsyncSync(descriptor);
		closeSync(descriptor);
		descriptor = undefined;
		renameSync(temporary, path);
		// The rename is the commit point. The temporary file was created as 0600;
		// directory syncing is best-effort so callers never see a failed commit.
		try {
			fsyncDirectory(directory);
		} catch {}
	} finally {
		if (descriptor !== undefined) closeSync(descriptor);
		rmSync(temporary, { force: true });
	}
}

function fsyncDirectory(path: string): void {
	if (process.platform === "win32") return;
	const descriptor = openSync(path, "r");
	try {
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
}
