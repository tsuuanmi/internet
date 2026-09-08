import { spawn } from "node:child_process";
import { isIP } from "node:net";
import type { CommandDefinition } from "@deepseek-ai/dsh-commands";
import type { StartWorkflowInput, WorkflowJob } from "#internet/workflow/types";

const USAGE = "Usage: /workflow <objective>";

interface RepositoryContext {
	readonly url: string;
	readonly revision: string;
}

export type GitRunner = (cwd: string, args: readonly string[], signal: AbortSignal) => Promise<string>;

export interface WorkflowStarter {
	start(input: StartWorkflowInput): WorkflowJob;
}

export interface WorkflowCommandDependencies {
	readonly engine: WorkflowStarter;
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
			settle(() => reject(new WorkflowCommandError(detail === "" ? `git exited with status ${String(code)}` : detail)));
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
	if (!/^[0-9a-f]{40}$/iu.test(revision)) throw new WorkflowCommandError("/workflow could not resolve a valid Git revision.");

	const remotes = cleanOutput((await optionalGit(runGit, cwd, ["remote"], signal)) ?? "")
		.split(/\r?\n/u)
		.map((remote) => remote.trim())
		.filter((remote) => remote !== "");
	if (remotes.length === 0) throw new WorkflowCommandError("/workflow requires a Git remote for the upstream repository.");

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
	return { url, revision: revision.toLowerCase() };
}

/** Define the Git-aware `/workflow <objective>` command as a thin engine adapter. */
export function defineWorkflowCommand(dependencies: WorkflowCommandDependencies): CommandDefinition {
	const runGit = dependencies.runGit ?? runGitCommand;
	return {
		name: "workflow",
		description: "start a durable reviewed implementation workflow",
		input: { hint: "<objective>" },
		async handler(invocation) {
			const objective = invocation.rawInput.trim();
			if (objective === "") return { kind: "error", text: `An objective is required. ${USAGE}` };
			const cwd = invocation.agent.session.header.cwd;
			if (cwd === undefined) return { kind: "error", text: "/workflow requires a session working directory." };
			try {
				const repository = await resolveRepository(cwd, runGit, invocation.signal);
				const job = dependencies.engine.start({
					objective,
					repository: repository.url,
					baseRevision: repository.revision,
					ownerSessionId: String(invocation.agent.id),
				});
				return {
					kind: "success",
					text: `Workflow ${job.jobId} created for ${repository.url} at ${repository.revision.slice(0, 12)}.`,
				};
			} catch (error) {
				if (isAborted(invocation.signal)) throw error;
				if (error instanceof WorkflowCommandError) return { kind: "error", text: error.message };
				throw error;
			}
		},
	};
}
