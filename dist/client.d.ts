interface CommandOutcome {
    kind: "success" | "error";
    text?: string;
}
interface InternetCommandProps {
    node: {
        outcome: CommandOutcome | null;
    };
}
interface ClientPluginContext {
    slots: {
        inject(name: string, callback: () => () => void): void;
        register(options: {
            name: string;
            key: string;
        }, component: (props: InternetCommandProps) => unknown): () => void;
    };
}
export declare const inject: string[];
/** Register the browser-side presentation for `/internet`. */
export declare function apply(ctx: ClientPluginContext): void;
export {};
//# sourceMappingURL=client.d.ts.map