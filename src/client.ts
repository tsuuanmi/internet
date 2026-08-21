import { MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives";
import { createElement } from "react";

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
		register(options: { name: string; key: string }, component: (props: InternetCommandProps) => unknown): () => void;
	};
}

const responseStyle = { minWidth: 0, width: "100%" };
const statusStyle = { ...responseStyle, whiteSpace: "pre-wrap" as const };

/** Render `/internet` output directly as assistant-style Markdown instead of a collapsed command card. */
function InternetCommandResponse({ node }: InternetCommandProps): unknown {
	if (node.outcome === null) {
		return createElement("div", { style: statusStyle }, "Asking ChatGPT…");
	}
	const text =
		node.outcome.text ?? (node.outcome.kind === "error" ? "/internet failed." : "ChatGPT returned no text.");
	if (node.outcome.kind === "error") {
		return createElement("div", { style: statusStyle, role: "alert" }, text);
	}
	return createElement("div", { style: responseStyle }, createElement(MarkdownText, { text, streaming: false }));
}

export const inject = ["slots"];

/** Register the browser-side presentation for `/internet`. */
export function apply(ctx: ClientPluginContext): void {
	ctx.slots.inject("conversation.chat.commandview", () =>
		ctx.slots.register({ name: "conversation.chat.commandview", key: "internet" }, InternetCommandResponse),
	);
}
