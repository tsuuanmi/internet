import type { Locator, Page } from "patchright-core";
import type { AccountId } from "#internet/core/accounts";
import {
	classifyWorkflowConfirmation,
	type WorkflowApprovalContext,
	type WorkflowApprovalScope,
	WorkflowConfirmationError,
	type WorkflowConfirmationObservation,
} from "#internet/workflow/approval-policy";

const CHATGPT_APPROVAL_CARD_SELECTOR = '[data-testid="tool-approval-card"]';
const CHATGPT_ACTION_BUTTONS_SELECTOR = '[data-testid="tool-action-buttons"]';
const ACTIONABLE_CONTROL_TIMEOUT_MS = 40_000;
const ACTIONABLE_CONTROL_POLL_MS = 200;

interface StructuredToolApproval {
	readonly actionName: string;
	readonly isWrite: boolean;
	readonly repositoryFullName?: string;
	readonly branch?: string;
	readonly branchName?: string;
	readonly head?: string;
	readonly headBranch?: string;
	readonly prNumber?: number;
	readonly path?: string;
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

async function structuredToolApproval(root: Locator): Promise<StructuredToolApproval | undefined> {
	return root.evaluate((element) => {
		type Fiber = {
			readonly memoizedProps?: unknown;
			readonly return?: Fiber | null;
		};

		const isRecord = (value: unknown): value is Record<string, unknown> =>
			typeof value === "object" && value !== null && !Array.isArray(value);
		const stringField = (value: Record<string, unknown>, key: string): string | undefined => {
			const field = value[key];
			return typeof field === "string" && field.length > 0 ? field : undefined;
		};
		const positiveIntegerField = (value: Record<string, unknown>, key: string): number | undefined => {
			const field = value[key];
			return typeof field === "number" && Number.isSafeInteger(field) && field > 0 ? field : undefined;
		};

		const fiberKey = Reflect.ownKeys(element).find(
			(key) => typeof key === "string" && key.startsWith("__reactFiber$"),
		);
		if (typeof fiberKey !== "string") return undefined;

		let fiber = (element as unknown as Record<string, unknown>)[fiberKey] as Fiber | null | undefined;
		for (let depth = 0; fiber !== undefined && fiber !== null && depth < 64; depth += 1) {
			const props = fiber.memoizedProps;
			if (
				isRecord(props) &&
				isRecord(props.connector) &&
				typeof props.actionName === "string" &&
				typeof props.isWrite === "boolean" &&
				isRecord(props.params)
			) {
				const params = props.params;
				return {
					actionName: props.actionName,
					isWrite: props.isWrite,
					repositoryFullName: stringField(params, "repository_full_name"),
					branch: stringField(params, "branch"),
					branchName: stringField(params, "branch_name"),
					head: stringField(params, "head"),
					headBranch: stringField(params, "head_branch"),
					prNumber: positiveIntegerField(params, "pr_number"),
					path: stringField(params, "path"),
				};
			}
			fiber = fiber.return;
		}
		return undefined;
	});
}

function observationFromStructuredApproval(approval: StructuredToolApproval): WorkflowConfirmationObservation {
	const repository = approval.repositoryFullName;
	switch (approval.actionName) {
		case "create_branch":
			return { action: "create_branch", repository, branch: approval.branchName };
		case "create_file":
		case "update_file":
			return { action: "write_file", repository, branch: approval.branch };
		case "create_pull_request":
			return {
				action: "create_pull_request",
				repository,
				branch: approval.head ?? approval.headBranch,
			};
		case "update_pull_request":
			return {
				action: "update_pull_request",
				repository,
				branch: approval.branch ?? approval.head ?? approval.headBranch,
				prNumber: approval.prNumber,
			};
		case "merge_pull_request":
			return {
				action: "merge_pull_request",
				repository,
				branch: approval.branch ?? approval.head ?? approval.headBranch,
				prNumber: approval.prNumber,
			};
		default:
			return {};
	}
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
						throw new WorkflowConfirmationError(
							"unknown",
							"Website approval split control semantics are invalid",
						);
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
	const roots = await visibleMatches(page.locator(CHATGPT_APPROVAL_CARD_SELECTOR));
	if (roots.length === 0) return false;
	if (roots.length !== 1) {
		throw new WorkflowConfirmationError("unknown", "multiple Website tool confirmations are visible");
	}
	const root = roots[0]!;
	const approval = await structuredToolApproval(root);
	if (approval === undefined) {
		throw new WorkflowConfirmationError("unknown", "Website confirmation structured tool metadata is unavailable");
	}
	if (!approval.isWrite) {
		throw new WorkflowConfirmationError("unknown", "Website confirmation is not a write action");
	}
	const observation = observationFromStructuredApproval(approval);
	if (observation.action === undefined) {
		throw new WorkflowConfirmationError(
			"unknown",
			`Website confirmation tool action is unsupported: ${approval.actionName}`,
		);
	}
	const context: WorkflowApprovalContext = { ...scope, accountId, sessionId };
	const decision = classifyWorkflowConfirmation(context, observation);
	if (decision.kind === "merge-requires-user") {
		throw new WorkflowConfirmationError("merge-requires-user", decision.reason);
	}
	if (decision.kind === "unknown") throw new WorkflowConfirmationError("unknown", decision.reason);
	const primary = await primaryApprovalButton(root);
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
