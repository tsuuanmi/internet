export function assertInternetApplicationRequestContext(context) {
    if (context.ownerSessionId.trim() === "") {
        throw new Error("internet application owner session id must not be empty");
    }
    if (context.requestId.trim() === "") {
        throw new Error("internet application request id must not be empty");
    }
}
//# sourceMappingURL=context.js.map