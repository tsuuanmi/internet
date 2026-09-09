declare module "@novnc/novnc" {
	export interface RfbOptions {
		credentials?: { password?: string };
		shared?: boolean;
	}

	export default class RFB extends EventTarget {
		constructor(target: HTMLElement, url: string, options?: RfbOptions);
		scaleViewport: boolean;
		resizeSession: boolean;
		focus(): void;
		sendKey(keysym: number, code: string | null, down?: boolean): void;
		disconnect(): void;
	}
}
