export class InternetError extends Error {
    constructor(kind, message) {
        super(message);
        this.name = "InternetError";
        this.kind = kind;
    }
}
export function isInternetError(error) {
    return error instanceof InternetError;
}
//# sourceMappingURL=errors.js.map