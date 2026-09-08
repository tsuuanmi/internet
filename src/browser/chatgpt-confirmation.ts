import type { Locator, Page } from "patchright-core";
import type { AccountId } from "#internet/core/accounts";
import {
	classifyWorkflowConfirmation,
	type WorkflowApprovalContext,
	type WorkflowApprovalScope,
	type WorkflowConfirmationAction,
	WorkflowConfirmationError,
	type WorkflowConfirmationObservation,
} from "#internet/workflow/approval-policy";

const CHATGPT_CONFIRMATION_ROOT_SELECTORS = [
	'[data-testid*="confirmation"]',
	'[data-testid*="approval"]',
	'[role="dialog"]',
] as const;

const ALLOW_BUTTON_NAME = /^Allow$/u;
const DENY_BUTTON_NAME = /^(?:Cancel|Deny|Reject|Don't allow|Don’t allow)$/u;

function uniqueAction(text: string): WorkflowConfirmationAction | undefined {
	const lower = text.toLowerCase();
	const matches: WorkflowConfirmationAction[] = [];
	if (/\bmerge(?: this)? pull request\b|\bmerge pull request\b/u.test(lower)) matches.push("merge_pull_request");
	if (/\bcreate pull request\b|\bopen pull request\b/u.test(lower)) matches.push("create_pull_request");
	if (/\bupdate pull request\b|\bedit pull request\b/u.test(lower)) matches.push("update_pull_request");
	if (/\bcreate branch\b/u.test(lower)) matches.push("create_branch");
	if (/\b(?:create|update|edit) file\b/u.test(lower)) matches.push("write_file");
	if (/\bcreate commit\b|\bcommit changes\b/u.test(lower)) matches.push("create_commit");
	if (/\bpush(?: changes| branch)?\b/u.test(lower)) matches.push("push_branch");
	return matches.length === 1 ? matches[0] : undefined;
}

function repositoryFromText(text: string): string | undefined {
	const url = text.match(/https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/u);
	if (url) return `${url[1]}/${url[2].replace(/\.git$/u, "")}`;
	const label = text.match(/(?:repository|repo)\s*[:=]\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/iu);
	return label?.[1];
}

function branchFromText(text: string): string | undefined {
	return text.match(/(?:branch|head)\s*[:=]\s*([A-Za-z0-9._/-]+)/iu)?.[1];
}

function prNumberFromText(text: string): number | undefined {
	const match = text.match(/(?:pull request|pr)\s*[:#=]?\s*#?(\d+)/iu);
	if (!match) return undefined;
	const value = Number(match[1]);
	return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function parseChatGptConfirmationText(text: string): WorkflowConfirmationObservation {
	return {
		action: uniqueAction(text),
		repository: repositoryFromText(text),
		branch: branchFromText(text),
		prNumber: prNumberFromText(text),
	};
}

async function visibleGitHubRoots(page: Page): Promise<Locator[]> {
	for (const selector of CHATGPT_CONFIRMATION_ROOT_SELECTORS) {
		const roots = page.locator(selector).filter({ visible: true });
		const count = await roots.count();
		const matches: Locator[] = [];
		for (let index = 0; index < count; index += 1) {
			const root = roots.nth(index);
			const text = await root.innerText().catch(() => "");
			if (/\bgithub\b/iu.test(text)) matches.push(root);
		}
		if (matches.length > 0) return matches;
	}
	return [];
}

async function exactAllowButton(root: Locator): Promise<Locator> {
	const allow = root.getByRole("button", { name: ALLOW_BUTTON_NAME }).filter({ visible: true });
	const deny = root.getByRole("button", { name: DENY_BUTTON_NAME }).filter({ visible: true });
	const [allowCount, denyCount] = await Promise.all([allow.count(), deny.count()]);
	if (allowCount !== 1 || denyCount < 1) {
		throw new WorkflowConfirmationError(
			"unknown",
			"GitHub confirmation does not expose one exact Allow action and an explicit deny action",
		);
	}
	return allow.first();
}

/**
 * Inspect one visible ChatGPT Website GitHub confirmation and either approve
 * the exact in-scope action or fail closed. Actual account/session identity is
 * supplied by BrowserManager rather than asserted by the workflow caller.
 */
export async function chatgptHandleWorkflowConfirmation(
	page: Page,
	scope: WorkflowApprovalScope,
	accountId: AccountId,
	sessionId: string,
): Promise<boolean> {
	const roots = await visibleGitHubRoots(page);
	if (roots.length === 0) return false;
	if (roots.length !== 1) {
		throw new WorkflowConfirmationError("unknown", "multiple GitHub Website confirmations are visible");
	}
	const root = roots[0]!;
	const allow = await exactAllowButton(root);
	const context: WorkflowApprovalContext = { ...scope, accountId, sessionId };
	const decision = classifyWorkflowConfirmation(context, parseChatGptConfirmationText(await root.innerText()));
	if (decision.kind === "merge-requires-user") {
		throw new WorkflowConfirmationError("merge-requires-user", decision.reason);
	}
	if (decision.kind === "unknown") throw new WorkflowConfirmationError("unknown", decision.reason);
	await allow.press("Enter");
	await root.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {
		throw new WorkflowConfirmationError("unknown", "Website confirmation remained visible after scoped approval");
	});
	return true;
}
