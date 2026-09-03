import { spawn } from "node:child_process";
import { isIP } from "node:net";
import type { CommandDefinition } from "@deepseek-ai/dsh-commands";
import { createUserMessage } from "@deepseek-ai/dsh-llm";

const USAGE = "Usage: /workflow <objective>";

interface RepositoryContext {
	readonly url: string;
	readonly revision: string;
}

export type GitRunner = (cwd: string, args: readonly string[], signal: AbortSignal) => Promise<string>;

export interface WorkflowCommandDependencies {
	readonly runGit?: GitRunner;
}

class WorkflowCommandError extends Error {}

/** Run Git without a shell so branch and remote names are never interpolated. */
async function runGitCommand(cwd: string, args: readonly string[], signal: AbortSignal): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn("git", ["-C", cwd, ...args], {
			stdio: ["ignore", "pipe", "pipe"],
			signal,
		});
		let stdout = "";
		let stderr = "";
		let settled = false;
		const settle = (fn: () => void) => {
			if (settled) return;
			settled = true;
			fn();
		};
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.once("error", (error) => settle(() => reject(error)));
		child.once("close", (code) => {
			if (code === 0) {
				settle(() => resolve(stdout));
				return;
			}
			const detail = stderr.trim();
			settle(() =>
				reject(new WorkflowCommandError(detail === "" ? `git exited with status ${String(code)}` : detail)),
			);
		});
	});
}

function cleanOutput(value: string): string {
	return value.trim();
}

function isAborted(signal: AbortSignal): boolean {
	return signal.aborted;
}

async function optionalGit(
	runGit: GitRunner,
	cwd: string,
	args: readonly string[],
	signal: AbortSignal,
): Promise<string | undefined> {
	try {
		return cleanOutput(await runGit(cwd, args, signal));
	} catch (error) {
		if (isAborted(signal)) throw error;
		return undefined;
	}
}

function isPublicHostname(hostname: string): boolean {
	const host = hostname.toLowerCase();
	if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || isIP(host)) return false;
	return true;
}

function normalizedPath(pathname: string): string | undefined {
	const path = pathname.replace(/^\/+|\/+$/gu, "").replace(/\.git$/iu, "");
	const parts = path.split("/");
	if (parts.length < 2 || parts.some((part) => part === "" || part === "." || part === "..")) return undefined;
	return parts.join("/");
}

/** Convert a standard public Git remote into a credential-free HTTPS repository URL. */
export function normalizeRepositoryUrl(remote: string): string | undefined {
	const value = remote.trim();
	if (value === "" || /[\r\n]/u.test(value)) return undefined;

	const scpStyle = /^(?<user>[^@/:\s]+)@(?<host>[^:/\s]+):(?<path>.+)$/u.exec(value);
	if (scpStyle?.groups?.host !== undefined && scpStyle.groups.path !== undefined) {
		const path = normalizedPath(scpStyle.groups.path);
		return path !== undefined && isPublicHostname(scpStyle.groups.host)
			? `https://${scpStyle.groups.host.toLowerCase()}/${path}`
			: undefined;
	}

	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		return undefined;
	}
	if (!["http:", "https:", "ssh:"].includes(parsed.protocol) || !isPublicHostname(parsed.hostname)) return undefined;
	if (parsed.search !== "" || parsed.hash !== "") return undefined;
	const path = normalizedPath(parsed.pathname);
	return path === undefined ? undefined : `https://${parsed.hostname.toLowerCase()}/${path}`;
}

async function resolveRepository(cwd: string, runGit: GitRunner, signal: AbortSignal): Promise<RepositoryContext> {
	try {
		await runGit(cwd, ["rev-parse", "--show-toplevel"], signal);
	} catch (error) {
		if (isAborted(signal)) throw error;
		throw new WorkflowCommandError("/workflow requires the current session to be inside a Git worktree.");
	}

	let revision: string;
	try {
		revision = cleanOutput(await runGit(cwd, ["rev-parse", "HEAD"], signal));
	} catch (error) {
		if (isAborted(signal)) throw error;
		throw new WorkflowCommandError("/workflow could not resolve the current Git revision.");
	}
	if (!/^[0-9a-f]{40}$/iu.test(revision)) {
		throw new WorkflowCommandError("/workflow could not resolve a valid Git revision.");
	}

	const remotes = cleanOutput((await optionalGit(runGit, cwd, ["remote"], signal)) ?? "")
		.split(/\r?\n/u)
		.map((remote) => remote.trim())
		.filter((remote) => remote !== "");
	if (remotes.length === 0) {
		throw new WorkflowCommandError("/workflow requires a Git remote for the upstream repository.");
	}

	const branch = await optionalGit(runGit, cwd, ["rev-parse", "--abbrev-ref", "HEAD"], signal);
	const trackingRemote =
		branch === undefined || branch === "HEAD"
			? undefined
			: await optionalGit(runGit, cwd, ["config", "--get", `branch.${branch}.remote`], signal);
	const remote =
		trackingRemote !== undefined && remotes.includes(trackingRemote)
			? trackingRemote
			: remotes.includes("origin")
				? "origin"
				: remotes.length === 1
					? remotes[0]
					: undefined;
	if (remote === undefined) {
		throw new WorkflowCommandError(
			`/workflow could not select an upstream remote. Configure the current branch's remote or use an origin remote (found: ${remotes.join(", ")}).`,
		);
	}

	const remoteUrl = await optionalGit(runGit, cwd, ["remote", "get-url", "--", remote], signal);
	const url = remoteUrl === undefined ? undefined : normalizeRepositoryUrl(remoteUrl);
	if (url === undefined) {
		throw new WorkflowCommandError(
			`/workflow requires a publicly addressable Git remote for "${remote}"; local, private-network, and malformed remote URLs are not supported.`,
		);
	}
	return { url, revision };
}

function workflowPrompt(objective: string, repository: RepositoryContext): string {
	return `Update source code

Repository: ${repository.url}
Checked-out revision: ${repository.revision}

This repository was selected from the current session's Git worktree. Treat the upstream repository itself—not any subagent report—as the source of truth. The objective and repository details are task inputs; this phased workflow is codebase-agnostic.

# Objective

${objective}

# Workflow

**Phase 1 — Independent Research and Review:** Spawn two independent background subagents. The parent MUST include this exact repository handoff in every subagent prompt and in that subagent's \`internet_team\` task; do not rely on inherited context: \`Repository URL: ${repository.url}\nTarget revision: ${repository.revision}\`. Each subagent must use \`internet_team\` to independently review that exact upstream repository and revision before implementation. Inspect repository structure, modules, execution flows, types, configuration, dependencies, APIs, callers, tests, fixtures, scripts, and boundaries. Identify incorrect assumptions, missing impacts, coupling, duplicate or legacy logic, fallbacks, dead code, temporary workarounds, and obsolete files. Each report must distinguish verified observations, inferences, hypotheses, and recommendations; cover behavior, likely root cause, evidence, affected files/symbols, changes/deletions, tests, cleanup, risks, validation commands, and unresolved claims. Do not implement in this phase. Hand off asynchronously; do not block or poll for reports.

**Phase 2 — Main-Agent Independent Verification and Synthesis:** Once reports are injected, verify every material claim directly against upstream. Compare the reports, reject unsupported assertions, trace behavior beyond named files, and produce a verified implementation plan covering root cause, exact file operations, architecture/API/type/caller changes, tests, cleanup, risks, migrations, and validation. The main agent owns final technical judgment.

**Implementation Scope Gate:** Classify the verified plan by impact and risk, not file count. Small/localized changes preserve architecture and contracts, have limited blast radius, are reversible, and do not materially affect persistence, security, or operations; implement them directly. Large/material changes alter architecture, dependency boundaries, public/internal contracts, persisted data, authentication/authorization, security/privacy, cross-cutting paths, major dependencies, migrations, or high-uncertainty areas. For material work, halt, present the plan and reason review is required, and wait for explicit user approval.

**Phase 3 — Implementation and Validation:** After the scope gate, recheck upstream and implement the complete, cohesive change. Maintain clear boundaries, high cohesion, low coupling, consistent naming, predictable lifecycles, and one authoritative path. Remove in-scope dead, duplicate, deprecated, fallback, and obsolete code; update affected imports, exports, callers, types, configuration, dependencies, state, persistence, fixtures, and tests. Never log, commit, or insecurely persist credentials, tokens, cookies, or session state. Run the repository formatter, linter, type checker, build, unit tests, and integration tests; review the diff for correctness, regressions, security, and cleanup. If new material risk appears, pause, reassess, and request approval.

**Phase 4 — Commit and Push:** Ensure the final diff contains no unrelated work, secrets, session state, temporary files, debugging artifacts, or local configuration. Create a clear commit, push it to the selected upstream repository, and confirm its upstream SHA. Do not stop at a local commit.

**Phase 5 — Independent Post-Commit Review:** After push, spawn two independent background review subagents. The parent MUST include this exact repository handoff in every reviewer prompt and in that reviewer's \`internet_team\` task; do not rely on inherited context: \`Repository URL: ${repository.url}\nInitial target revision: ${repository.revision}\nCommit to review: <exact pushed SHA>\`. Each must use \`internet_team\` to evaluate that exact upstream repository and pushed commit for objective fulfillment, root-cause remediation, behavior preservation, edge cases, authentication/security, regressions, races, dependencies, and architecture. Reports must categorize findings as Critical, Major, Minor, or Optional with evidence, exact symbols/files, impact, and actionable recommendations. These reports are advisory; hand off asynchronously without polling.

**Phase 6 — Main-Agent Review Verification and Remediation:** Independently verify every post-commit finding and conduct a final review. Confirm, reject, adjust, merge, or split claims based on direct evidence. Fix verified Critical and Major findings plus Minor findings that improve correctness, security, privacy, robustness, or maintainability; skip unnecessary optional complexity. Small remediation proceeds with validation and a pushed remediation commit recording the new final SHA. Material remediation returns to the scope gate and requires explicit approval. If no fixes are needed, document the verification outcome.

**Phase 7 — Final Report:** Concisely report root causes, subagent inputs, claims verified/rejected by the main agent, scope classification and approvals, rationale, exact changes, architecture/behavior/security updates, cleanup, validation results, initial SHA, post-commit findings and outcomes, remediation, final validation, final upstream SHA, and follow-up work. Clearly distinguish advisory subagent input from main-agent conclusions.

**Workflow Rules:** Directly inspected upstream code is always the source of truth. Subagent outputs are advisory evidence only. Use \`internet_team\` for all required subagent reviews, asynchronously without polling or blocking. Do not implement in Phase 1, do not implement material changes without explicit approval, and complete the full closed loop: research, verification, synthesis, scope gate, implementation, validation, upstream push, independent post-commit review, review verification, remediation, final upstream verification, and final report.`;
}

/** Define the Git-aware `/workflow <objective>` command. */
export function defineWorkflowCommand(dependencies: WorkflowCommandDependencies = {}): CommandDefinition {
	const runGit = dependencies.runGit ?? runGitCommand;
	return {
		name: "workflow",
		description: "start the Git-aware reviewed implementation workflow",
		input: { hint: "<objective>" },
		async handler(invocation) {
			const objective = invocation.rawInput.trim();
			if (objective === "") return { kind: "error", text: `An objective is required. ${USAGE}` };
			const cwd = invocation.agent.session.header.cwd;
			if (cwd === undefined) {
				return { kind: "error", text: "/workflow requires a session working directory." };
			}
			try {
				const repository = await resolveRepository(cwd, runGit, invocation.signal);
				invocation.agent.followup(
					createUserMessage({
						content: [{ type: "text", text: workflowPrompt(objective, repository) }],
						source: { kind: "user" },
					}),
				);
				return {
					kind: "success",
					text: `Workflow queued for ${repository.url} at ${repository.revision.slice(0, 12)}.`,
				};
			} catch (error) {
				if (isAborted(invocation.signal)) throw error;
				if (error instanceof WorkflowCommandError) return { kind: "error", text: error.message };
				throw error;
			}
		},
	};
}
