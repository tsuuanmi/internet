/// <reference lib="dom" />

import RFB from "@novnc/novnc";

interface RemoteStatus {
	state: "waiting" | "finalizing" | "complete" | "failed";
	message: string;
}

function requiredElement<T extends Element>(selector: string): T {
	const element = document.querySelector<T>(selector);
	if (element === null) throw new Error(`missing ${selector}`);
	return element;
}

const root = document.documentElement;
const token = root.dataset.token ?? "";
const password = root.dataset.password ?? "";
if (!token || !password) throw new Error("remote login page is incomplete");
const screen = requiredElement<HTMLElement>("#screen");
const status = requiredElement<HTMLElement>("#status");
const save = requiredElement<HTMLButtonElement>("#save");
const cancel = requiredElement<HTMLButtonElement>("#cancel");

const base = `/${token}`;
const socketUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${base}/vnc`;
const rfb = new RFB(screen, socketUrl, { credentials: { password }, shared: true });
rfb.scaleViewport = true;
rfb.resizeSession = false;
rfb.addEventListener("connect", () => {
	status.textContent = "Connected. Sign in, then press Save account.";
});
rfb.addEventListener("disconnect", () => {
	if (!save.disabled) status.textContent = "Remote desktop disconnected. Check status or cancel this login.";
});

async function readStatus(): Promise<RemoteStatus> {
	const response = await fetch(`${base}/status`, { cache: "no-store" });
	if (!response.ok) throw new Error(`status request failed (${response.status})`);
	return (await response.json()) as RemoteStatus;
}

function render(remote: RemoteStatus): void {
	status.textContent = remote.message;
	save.disabled = remote.state !== "waiting";
	cancel.disabled = remote.state !== "waiting";
	if (remote.state === "complete") rfb.disconnect();
}

async function poll(): Promise<void> {
	try {
		const remote = await readStatus();
		render(remote);
		if (remote.state === "waiting" || remote.state === "finalizing") setTimeout(() => void poll(), 750);
	} catch (error) {
		status.textContent = error instanceof Error ? error.message : "status request failed";
	}
}

save.addEventListener("click", async () => {
	save.disabled = true;
	status.textContent = "Saving account…";
	try {
		const response = await fetch(`${base}/save`, { method: "POST" });
		if (!response.ok) throw new Error(await response.text());
		await poll();
	} catch (error) {
		status.textContent = error instanceof Error ? error.message : "save failed";
	}
});

setTimeout(() => void poll(), 750);

cancel.addEventListener("click", async () => {
	cancel.disabled = true;
	try {
		await fetch(`${base}/cancel`, { method: "POST" });
		status.textContent = "Remote login cancelled.";
		rfb.disconnect();
	} catch (error) {
		status.textContent = error instanceof Error ? error.message : "cancel failed";
	}
});
