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

const CHATGPT_APPROVAL_CARD_SELECTOR = '[data-testid="tool-approval-card"]';
const CHATGPT_ACTION_BUTTONS_SELECTOR = '[data-testid="tool-action-buttons"]';
const ACTIONABLE_CONTROL_TIMEOUT_MS = 40_000;
const ACTIONABLE_CONTROL_POLL_MS = 200;

function uniqueAction(text: string): WorkflowConfirmationAction | undefined {
	const lower = text.toLowerCase();
	const matches: WorkflowConfirmationAction[] = [];
	if (/\bmerge(?: this)? pull request\b|\bmerge pull request\b/u.test(lower)) matches.push("merge_pull_request");
	if (/\b(?:create|open)(?: a)? pull request\b/u.test(lower)) matches.push("create_pull_request");
	if (/\bupdate pull request\b|\bedit pull request\b/u.test(lower)) matches.push("update_pull_request");
	if (/\bcreate branch\b/u.test(lower)) matches.push("create_branch");
	if (
		/\b(?:create|update|edit) file\b|\bupdates?\s+(?:the\s+)?\S+\s+file\b|\bupdates?\s+(?:the\s+)?(?:public\s+)?[A-Za-z0-9._/-]+\s+in\s+the\b/u.test(
			lower,
		)
	)
		matches.push("write_file");
	if (/\bcreate commit\b|\bcommit changes\b/u.test(lower)) matches.push("create_commit");
	if (/\bpush(?: changes| branch)?\b/u.test(lower)) matches.push("push_branch");
	return matches.length === 1 ? matches[0] : undefined;
}

function repositoryFromText(text: string): string | undefined {
	const url = text.match(/https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/u);
	if (url) return `${url[1]}/${url[2].replace(/\.git$/u, "")}`;
	const label = text.match(/(?:repository|repo)\s*[:=]\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/iu);
	if (label) return label[1];
	const naturalLanguage = text.match(/\bin\s+the\s+(?:github\s+)?repository\s+([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/iu);
	if (naturalLanguage) return naturalLanguage[1];
	return text.match(/\bin\s+the\s+([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\s+repository\b/iu)?.[1];
}

function branchFromText(text: string): string | undefined {
	const label = text.match(/(?:branch|head)\s*[:=]\s*([A-Za-z0-9._/-]+)/iu);
	if (label) return label[1];
	return text.match(/\bon\s+branch\s+([A-Za-z0-9._/-]+)/iu)?.[1];
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

async function visibleMatches(locator: Locator): Promise<Locator[]> {
	const count = await locator.count();
	const matches: Locator[] = [];
	for (let index = 0; index < count; index += 1) {
		const candidate = locator.nth(index);
		if (await candidate.isVisible().catch(() => false)) matches.push(candidate);
	}
	return matches;
}

async function visibleGitHubRoots(page: Page): Promise<Locator[]> {
	const roots = await visibleMatches(page.locator(CHATGPT_APPROVAL_CARD_SELECTOR));
	const matches: Locator[] = [];
	for (const root of roots) {
		const text = await root.innerText().catch(() => "");
		if (/\bgithub\b/iu.test(text)) matches.push(root);
	}
	return matches;
}

async function primaryApprovalButton(root: Locator): Promise<Locator> {
	const deadline = Date.now() + ACTIONABLE_CONTROL_TIMEOUT_MS;
	let lastTopology = "actionBars=0 buttons=0 directButtons=0 splitGroups=0 splitButtons=0";
	while (true) {
		const actionBars = await visibleMatches(root.locator(CHATGPT_ACTION_BUTTONS_SELECTOR));
		if (actionBars.length > 1) {
			throw new WorkflowConfirmationError("unknown", "multiple Website tool action bars are visible");
		}
		if (actionBars.length === 1) {
			const actionBar = actionBars[0]!;
			const [buttons, directButtons, splitGroups] = await Promise.all([
				visibleMatches(actionBar.locator("button")),
				visibleMatches(actionBar.locator(":scope > button")),
				visibleMatches(actionBar.locator(":scope > div")),
			]);
			if (splitGroups.length > 1 || buttons.length > 3 || directButtons.length > 1) {
				throw new WorkflowConfirmationError("unknown", "Website approval action topology is ambiguous");
			}
			if (splitGroups.length === 1) {
				const splitButtons = await visibleMatches(splitGroups[0]!.locator(":scope > button"));
				lastTopology = `actionBars=1 buttons=${buttons.length} directButtons=${directButtons.length} splitGroups=1 splitButtons=${splitButtons.length}`;
				if (splitButtons.length > 2) {
					throw new WorkflowConfirmationError("unknown", "Website approval split control is ambiguous");
				}
				if (buttons.length === 3 && directButtons.length === 1 && splitButtons.length === 2) {
					const primary = splitButtons[0]!;
					const menu = splitButtons[1]!;
					const [primaryPopup, menuPopup] = await Promise.all([
						primary.getAttribute("aria-haspopup"),
						menu.getAttribute("aria-haspopup"),
					]);
					if (primaryPopup !== null || menuPopup !== "menu") {
						throw new WorkflowConfirmationError("unknown", "Website approval split control semantics are invalid");
					}
					return primary;
				}
			} else {
				lastTopology = `actionBars=1 buttons=${buttons.length} directButtons=${directButtons.length} splitGroups=0 splitButtons=0`;
			}
		} else {
			lastTopology = "actionBars=0 buttons=0 directButtons=0 splitGroups=0 splitButtons=0";
		}
		if (Date.now() >= deadline) {
			throw new WorkflowConfirmationError(
				"unknown",
				`GitHub confirmation action topology did not match the expected split approval control (${lastTopology})`,
			);
		}
		await new Promise<void>((resolve) => setTimeout(resolve, ACTIONABLE_CONTROL_POLL_MS));
	}
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
	const primary = await primaryApprovalButton(root);
	const context: WorkflowApprovalContext = { ...scope, accountId, sessionId };
	const decision = classifyWorkflowConfirmation(context, parseChatGptConfirmationText(await root.innerText()));
	if (decision.kind === "merge-requires-user") {
		throw new WorkflowConfirmationError("merge-requires-user", decision.reason);
	}
	if (decision.kind === "unknown") throw new WorkflowConfirmationError("unknown", decision.reason);
	await primary.click({ timeout: ACTIONABLE_CONTROL_TIMEOUT_MS }).catch((error: unknown) => {
		throw new WorkflowConfirmationError(
			"unknown",
			`Website primary approval action was not actionable: ${error instanceof Error ? error.message : String(error)}`,
		);
	});
	await root.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {
		throw new WorkflowConfirmationError("unknown", "Website confirmation remained visible after scoped approval");
	});
	return true;
}
