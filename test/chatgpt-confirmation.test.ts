import type { Locator, Page } from "patchright-core";
import { describe, expect, it, vi } from "vitest";
import {
	chatgptHandleWorkflowConfirmation,
	parseChatGptConfirmationText,
} from "#internet/browser/chatgpt-confirmation";
import type { WorkflowApprovalScope } from "#internet/workflow/approval-policy";

type Button = {
	name: string;
	visible?: boolean;
	isEnabled: ReturnType<typeof vi.fn>;
	press: ReturnType<typeof vi.fn>;
};

function listLocator<T extends { visible?: boolean }>(items: T[]): Locator {
	return {
		count: async () => items.length,
		nth: (index: number) => ({
			isVisible: async () => items[index]?.visible !== false,
			...(items[index] ?? {}),
		}),
	} as unknown as Locator;
}

function confirmationPage(text: string): {
	page: Page;
	allowPrimary: Button;
	allowMenu: Button;
	deny: Button;
	waitFor: ReturnType<typeof vi.fn>;
} {
	const allowPrimary: Button = {
		name: "Allow",
		isEnabled: vi.fn(async () => true),
		press: vi.fn(async () => {}),
	};
	const allowMenu: Button = {
		name: "Allow GitHub for this conversation",
		isEnabled: vi.fn(async () => true),
		press: vi.fn(async () => {}),
	};
	const deny: Button = { name: "Deny", isEnabled: vi.fn(async () => true), press: vi.fn(async () => {}) };
	const buttons = [deny, allowPrimary, allowMenu];
	const waitFor = vi.fn(async () => {});
	const root = {
		visible: true,
		innerText: async () => text,
		isVisible: async () => true,
		waitFor,
		getByRole: (_role: string, options: { name: RegExp }) =>
			listLocator(buttons.filter((button) => options.name.test(button.name))),
	};
	const page = {
		locator: (selector: string) => listLocator(selector === '[data-testid*="approval"]' ? [root] : []),
	} as unknown as Page;
	return { page, allowPrimary, allowMenu, deny, waitFor };
}

const scope: WorkflowApprovalScope = {
	jobId: "0123456789abcdef0123456789abcdef",
	writerSessionId: "writer-session",
	repository: "https://github.com/tsuuanmi/internet",
	authority: "IMPLEMENTATION",
};

const LIVE_CARD_TEXT =
	"GitHub\nAllow ChatGPT to use GitHub?\n" +
	"Open a pull request in the tsuuanmi/internet repository with a documentation title and body, targeting main; " +
	"this creates content visible to repository collaborators.\nDeny\nAllow";

const LIVE_FILE_UPDATE_TEXT =
	"GitHub\nAllow ChatGPT to use GitHub?\n" +
	"Updates the README.md file in the GitHub repository tsuuanmi/internet on branch " +
	"internet-workflow/0123456789abcdef0123456789abcdef with extensive project documentation; " +
	"no sensitive data or suspicious instructions are present.\nSee details\nDeny\nAllow";

describe("ChatGPT GitHub approval card", () => {
	it("selects only the primary side of the live split Allow control", async () => {
		const page = confirmationPage(`${LIVE_CARD_TEXT}\nBranch: internet-workflow/0123456789abcdef0123456789abcdef`);

		await expect(
			chatgptHandleWorkflowConfirmation(page.page, scope, "chatgpt-writer", "writer-session"),
		).resolves.toBe(true);
		expect(page.allowPrimary.press).toHaveBeenCalledWith("Enter");
		expect(page.allowMenu.press).not.toHaveBeenCalled();
		expect(page.deny.press).not.toHaveBeenCalled();
		expect(page.waitFor).toHaveBeenCalledWith({ state: "hidden", timeout: 10_000 });
	});

	it("waits until the visible primary Allow control is enabled", async () => {
		const page = confirmationPage(
			`${LIVE_FILE_UPDATE_TEXT}\nBranch: internet-workflow/0123456789abcdef0123456789abcdef`,
		);
		page.allowPrimary.isEnabled.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

		await expect(
			chatgptHandleWorkflowConfirmation(page.page, scope, "chatgpt-writer", "writer-session"),
		).resolves.toBe(true);
		expect(page.allowPrimary.isEnabled).toHaveBeenCalledTimes(2);
		expect(page.allowPrimary.press).toHaveBeenCalledWith("Enter");
	});

	it("parses the live file-update confirmation grammar", () => {
		expect(parseChatGptConfirmationText(LIVE_FILE_UPDATE_TEXT)).toEqual({
			action: "write_file",
			repository: "tsuuanmi/internet",
			branch: "internet-workflow/0123456789abcdef0123456789abcdef",
			prNumber: undefined,
		});
	});

	it("recognizes the live natural-language repository but fails closed without its source branch", async () => {
		expect(parseChatGptConfirmationText(LIVE_CARD_TEXT)).toEqual({
			action: "create_pull_request",
			repository: "tsuuanmi/internet",
			branch: undefined,
			prNumber: undefined,
		});

		const page = confirmationPage(LIVE_CARD_TEXT);
		await expect(
			chatgptHandleWorkflowConfirmation(page.page, scope, "chatgpt-writer", "writer-session"),
		).rejects.toThrow("confirmation branch identity is missing");
		expect(page.allowPrimary.press).not.toHaveBeenCalled();
		expect(page.allowMenu.press).not.toHaveBeenCalled();
		expect(page.deny.press).not.toHaveBeenCalled();
	});
});
