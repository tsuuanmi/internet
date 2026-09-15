import type { Locator, Page } from "patchright-core";
import { describe, expect, it, vi } from "vitest";
import { chatgptHandleWorkflowConfirmation } from "#internet/browser/chatgpt-confirmation";
import type { WorkflowApprovalScope } from "#internet/workflow/approval-policy";

type StructuredApprovalFixture = {
	actionName: string;
	isWrite: boolean;
	repositoryFullName?: string;
	branch?: string;
	branchName?: string;
	head?: string;
	headBranch?: string;
	prNumber?: number;
	path?: string;
};

type FakeLocator = {
	visible?: boolean;
	locator?: (selector: string) => Locator;
	getAttribute?: ReturnType<typeof vi.fn>;
	click?: ReturnType<typeof vi.fn>;
	evaluate?: ReturnType<typeof vi.fn>;
	waitFor?: ReturnType<typeof vi.fn>;
};

function listLocator<T extends FakeLocator>(items: T[]): Locator {
	return {
		count: async () => items.length,
		nth: (index: number) => ({
			isVisible: async () => items[index]?.visible !== false,
			...(items[index] ?? {}),
		}),
	} as unknown as Locator;
}

function approvalPage(
	approval: StructuredApprovalFixture | undefined,
	options?: { extraSplitButton?: boolean },
): {
	page: Page;
	primary: FakeLocator;
	menu: FakeLocator;
	reject: FakeLocator;
	waitFor: ReturnType<typeof vi.fn>;
} {
	const primary: FakeLocator = {
		getAttribute: vi.fn(async () => null),
		click: vi.fn(async () => {}),
	};
	const menu: FakeLocator = {
		getAttribute: vi.fn(async (name: string) => (name === "aria-haspopup" ? "menu" : null)),
		click: vi.fn(async () => {}),
	};
	const reject: FakeLocator = { click: vi.fn(async () => {}) };
	const extra: FakeLocator = { getAttribute: vi.fn(async () => null), click: vi.fn(async () => {}) };
	const splitButtons = options?.extraSplitButton ? [primary, menu, extra] : [primary, menu];
	const splitGroup: FakeLocator = {
		locator: (selector: string) => listLocator(selector === ":scope > button" ? splitButtons : []),
	};
	const actionBar: FakeLocator = {
		locator: (selector: string) => {
			if (selector === "button") return listLocator([reject, ...splitButtons]);
			if (selector === ":scope > button") return listLocator([reject]);
			if (selector === ":scope > div") return listLocator([splitGroup]);
			return listLocator([]);
		},
	};
	const waitFor = vi.fn(async () => {});
	const root: FakeLocator = {
		evaluate: vi.fn(async () => approval),
		waitFor,
		locator: (selector: string) => listLocator(selector === '[data-testid="tool-action-buttons"]' ? [actionBar] : []),
	};
	const page = {
		locator: (selector: string) => listLocator(selector === '[data-testid="tool-approval-card"]' ? [root] : []),
	} as unknown as Page;
	return { page, primary, menu, reject, waitFor };
}

const scope: WorkflowApprovalScope = {
	jobId: "0123456789abcdef0123456789abcdef",
	writerSessionId: "writer-session",
	repository: "https://github.com/tsuuanmi/internet",
	authority: "IMPLEMENTATION",
};

const LIVE_UPDATE_FILE_APPROVAL: StructuredApprovalFixture = {
	actionName: "update_file",
	isWrite: true,
	repositoryFullName: "tsuuanmi/internet",
	path: "README.md",
	branch: "internet-workflow/0123456789abcdef0123456789abcdef",
};

describe("ChatGPT GitHub approval card", () => {
	it("authorizes the live update_file action from structured tool metadata", async () => {
		const page = approvalPage(LIVE_UPDATE_FILE_APPROVAL);

		await expect(
			chatgptHandleWorkflowConfirmation(page.page, scope, "chatgpt-writer", "writer-session"),
		).resolves.toBe(true);
		expect(page.primary.click).toHaveBeenCalledWith({ timeout: 40_000 });
		expect(page.menu.click).not.toHaveBeenCalled();
		expect(page.reject.click).not.toHaveBeenCalled();
		expect(page.waitFor).toHaveBeenCalledWith({ state: "hidden", timeout: 10_000 });
	});

	it("validates structured workflow scope before resolving the primary control", async () => {
		const page = approvalPage({
			...LIVE_UPDATE_FILE_APPROVAL,
			branch: "internet-workflow/ffffffffffffffffffffffffffffffff",
		});

		await expect(
			chatgptHandleWorkflowConfirmation(page.page, scope, "chatgpt-writer", "writer-session"),
		).rejects.toThrow("confirmation branch does not match the workflow branch");
		expect(page.primary.click).not.toHaveBeenCalled();
		expect(page.menu.click).not.toHaveBeenCalled();
		expect(page.reject.click).not.toHaveBeenCalled();
	});

	it("fails closed when structured tool metadata is unavailable", async () => {
		const page = approvalPage(undefined);

		await expect(
			chatgptHandleWorkflowConfirmation(page.page, scope, "chatgpt-writer", "writer-session"),
		).rejects.toThrow("structured tool metadata is unavailable");
		expect(page.primary.click).not.toHaveBeenCalled();
	});

	it("fails closed for an unsupported structured tool action", async () => {
		const page = approvalPage({
			...LIVE_UPDATE_FILE_APPROVAL,
			actionName: "delete_repository",
		});

		await expect(
			chatgptHandleWorkflowConfirmation(page.page, scope, "chatgpt-writer", "writer-session"),
		).rejects.toThrow("Website confirmation tool action is unsupported: delete_repository");
		expect(page.primary.click).not.toHaveBeenCalled();
	});

	it("fails closed when the split approval topology is ambiguous", async () => {
		const page = approvalPage(LIVE_UPDATE_FILE_APPROVAL, { extraSplitButton: true });

		await expect(
			chatgptHandleWorkflowConfirmation(page.page, scope, "chatgpt-writer", "writer-session"),
		).rejects.toThrow("approval action topology is ambiguous");
		expect(page.primary.click).not.toHaveBeenCalled();
		expect(page.menu.click).not.toHaveBeenCalled();
		expect(page.reject.click).not.toHaveBeenCalled();
	});
});
