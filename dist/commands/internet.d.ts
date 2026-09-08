import type { CommandDefinition } from "@deepseek-ai/dsh-commands";
import type { BrowserManager } from "#internet/browser/runtime";
/** Define the human-facing `/internet` command backed by the ChatGPT thinker account. */
export declare function defineInternetCommand(manager: Pick<BrowserManager, "chat">): CommandDefinition;
//# sourceMappingURL=internet.d.ts.map