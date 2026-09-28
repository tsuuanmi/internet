export interface InternetApplicationRequestContext {
    readonly ownerSessionId: string;
    readonly requestId: string;
    readonly signal?: AbortSignal;
}
export declare function assertInternetApplicationRequestContext(context: InternetApplicationRequestContext): void;
//# sourceMappingURL=context.d.ts.map