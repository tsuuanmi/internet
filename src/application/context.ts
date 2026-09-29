export interface InternetApplicationRequestContext {
	readonly ownerSessionId: string;
	readonly conversationSessionId?: string;
	readonly requestId: string;
	readonly signal?: AbortSignal;
}

export function assertInternetApplicationRequestContext(context: InternetApplicationRequestContext): void {
	if (context.ownerSessionId.trim() === "") {
		throw new Error("internet application owner session id must not be empty");
	}
	if (context.conversationSessionId !== undefined && context.conversationSessionId.trim() === "") {
		throw new Error("internet application conversation session id must not be empty");
	}
	if (context.requestId.trim() === "") {
		throw new Error("internet application request id must not be empty");
	}
}
