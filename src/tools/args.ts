import { ACCOUNT_IDS, type AccountId, isAccountId } from "#internet/core/accounts";

/** Validated `internet_chat` arguments. */
export interface ChatInput {
	accountId: AccountId;
	prompt: string;
	visible?: boolean;
}

/** Validate and normalize model-facing `internet_chat` arguments. */
export function parseChatArgs(args: Record<string, unknown>): ChatInput {
	const account = args.account;
	if (!isAccountId(account)) {
		throw new Error(`internet_chat account must be one of ${ACCOUNT_IDS.join(", ")}`);
	}
	const prompt = args.prompt;
	if (typeof prompt !== "string" || prompt.trim().length === 0) {
		throw new Error("internet_chat prompt must be a non-empty string");
	}
	const visible = args.visible;
	if (visible !== undefined && typeof visible !== "boolean") {
		throw new Error("internet_chat visible must be a boolean");
	}
	return { accountId: account, prompt, ...(visible === undefined ? {} : { visible }) };
}

/** Validated `internet_research` arguments. */
export interface ResearchInput {
	query: string;
	name?: string;
	accounts?: AccountId[];
	visible?: boolean;
}

/** Validate research arguments without coupling the parser to DSH packages. */
export function parseResearchArgs(args: Record<string, unknown>): ResearchInput {
	const query = args.query;
	if (typeof query !== "string" || query.trim().length === 0) {
		throw new Error("internet_research query must be a non-empty string");
	}
	const name = args.name;
	if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
		throw new Error("internet_research name must be a non-empty string");
	}
	const visible = args.visible;
	if (visible !== undefined && typeof visible !== "boolean") {
		throw new Error("internet_research visible must be a boolean");
	}
	const accounts = parseOptionalAccountArray(args.accounts, "internet_research", 1);
	return {
		query,
		...(name === undefined ? {} : { name }),
		...(accounts === undefined ? {} : { accounts }),
		...(visible === undefined ? {} : { visible }),
	};
}

/** Validated `internet_team` arguments. */
export interface TeamInput {
	task: string;
	team?: string;
	rounds?: number;
	synthesize?: boolean;
	includeTranscript?: boolean;
	accounts?: AccountId[];
	visible?: boolean;
}

/** Validate and normalize the model-facing `internet_team` arguments. */
export function parseTeamArgs(args: Record<string, unknown>): TeamInput {
	const task = args.task;
	if (typeof task !== "string" || task.trim().length === 0) {
		throw new Error("internet_team task must be a non-empty string");
	}
	const team = args.team;
	if (team !== undefined && (typeof team !== "string" || team.trim().length === 0)) {
		throw new Error("internet_team team must be a non-empty string");
	}
	const rounds = args.rounds;
	if (rounds !== undefined && (typeof rounds !== "number" || !Number.isInteger(rounds) || rounds <= 0)) {
		throw new Error("internet_team rounds must be a positive integer");
	}
	const synthesize = args.synthesize;
	if (synthesize !== undefined && typeof synthesize !== "boolean") {
		throw new Error("internet_team synthesize must be a boolean");
	}
	const includeTranscript = args.includeTranscript;
	if (includeTranscript !== undefined && typeof includeTranscript !== "boolean") {
		throw new Error("internet_team includeTranscript must be a boolean");
	}
	const visible = args.visible;
	if (visible !== undefined && typeof visible !== "boolean") {
		throw new Error("internet_team visible must be a boolean");
	}
	const accounts = parseOptionalAccountArray(args.accounts, "internet_team", 2);
	return {
		task,
		...(team === undefined ? {} : { team }),
		...(rounds === undefined ? {} : { rounds }),
		...(synthesize === undefined ? {} : { synthesize }),
		...(includeTranscript === undefined ? {} : { includeTranscript }),
		...(accounts === undefined ? {} : { accounts }),
		...(visible === undefined ? {} : { visible }),
	};
}

function parseOptionalAccountArray(value: unknown, toolName: string, minimumLength: number): AccountId[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.length < minimumLength) {
		throw new Error(`${toolName} accounts must be an array of at least ${minimumLength} account(s)`);
	}
	const seen = new Set<AccountId>();
	const accounts: AccountId[] = [];
	for (const account of value) {
		if (!isAccountId(account)) {
			throw new Error(`${toolName} accounts must be one of ${ACCOUNT_IDS.join(", ")}`);
		}
		if (seen.has(account)) throw new Error(`${toolName} accounts must not contain duplicates`);
		seen.add(account);
		accounts.push(account);
	}
	return accounts;
}
