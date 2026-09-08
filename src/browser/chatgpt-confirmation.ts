import type { Locator, Page } from "patchright-core";
import {
	classifyWorkflowConfirmation,
	type WorkflowApprovalContext,
	type WorkflowConfirmationAction,
	type WorkflowConfirmationObservation,
} from "#internet/workflow/approval-policy";

/**
 * Keep confirmation roots deliberately narrow. Generic tool-call containers are
 * not roots: they may wrap the real dialog and would create ambiguous duplicate
 * candidates, which must fail closed rather than be guessed through.
 */
export const CHATGPT_CONFIRMATION_ROOT_SELECTOR = [
	'[role="dialog"]',
	'[data-testid*="confirmation"]',
	'[data-testid*="approval"]',
].join(", ");

const ALLOW_BUTTON_NAME = /^Allow$/u;
const DENY_BUTTON_NAME = /^(?:Cancel|Deny|Reject|Don't allow|Don’t allow)$/u;

export class ChatGptUnknownConfirmationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ChatGptUnknownConfirmationError";
	}
}

export class ChatGptMergeConfirmationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ChatGptMergeConfirmationError";
	}
}

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

async function candidateRoot(root: Locator): Promise<boolean> {
	const text = await root.innerText().catch(() => "");
	if (!/\bgithub\b/iu.test(text)) return false;
	const buttons = root.getByRole("button");
	const count = await buttons.count();
	let allow = 0;
	let deny = 0;
	for (let index = 0; index < count; index += 1) {
		const button = buttons.nth(index);
		if (!(await button.isVisible().catch(() => false))) continue;
		const name = (await button.innerText().catch(() => "")).trim();
		if (ALLOW_BUTTON_NAME.test(name)) allow += 1;
		if (DENY_BUTTON_NAME.test(name)) deny += 1;
	}
	return allow === 1 && deny >= 1;
}

async function visibleConfirmationRoots(page: Page): Promise<Locator[]> {
	const roots = page.locator(CHATGPT_CONFIRMATION_ROOT_SELECTOR).filter({ visible: true });
	const count = await roots.count();
	const candidates: Locator[] = [];
	for (let index = 0; index < count; index += 1) {
		const root = roots.nth(index);
		if (await candidateRoot(root)) candidates.push(root);
	}
	return candidates;
}

async function exactAllowButton(root: Locator): Promise<Locator> {
	const buttons = root.getByRole("button");
	const count = await buttons.count();
	const matches: Locator[] = [];
	for (let index = 0; index < count; index += 1) {
		const button = buttons.nth(index);
		if (!(await button.isVisible().catch(() => false))) continue;
		if (ALLOW_BUTTON_NAME.test((await button.innerText().catch(() => "")).trim())) matches.push(button);
	}
	if (matches.length !== 1)
		throw new ChatGptUnknownConfirmationError("recognized confirmation does not expose one exact Allow action");
	return matches[0]!;
}

/**
 * Inspect one visible Website confirmation and either safely approve the exact
 * in-scope writer action or fail closed. Returns false when no confirmation is visible.
 */
export async function chatgptHandleWorkflowConfirmation(
	page: Page,
	context: WorkflowApprovalContext,
): Promise<boolean> {
	const roots = await visibleConfirmationRoots(page);
	if (roots.length === 0) return false;
	if (roots.length !== 1) {
		throw new ChatGptUnknownConfirmationError("multiple recognized Website confirmations are visible");
	}
	const root = roots[0]!;
	const observation = parseChatGptConfirmationText(await root.innerText());
	const decision = classifyWorkflowConfirmation(context, observation);
	if (decision.kind === "merge-requires-user") {
		throw new ChatGptMergeConfirmationError(decision.reason);
	}
	if (decision.kind === "unknown") throw new ChatGptUnknownConfirmationError(decision.reason);
	const allow = await exactAllowButton(root);
	await allow.press("Enter");
	await root.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {
		throw new ChatGptUnknownConfirmationError("Website confirmation remained visible after the scoped Allow action");
	});
	return true;
}
