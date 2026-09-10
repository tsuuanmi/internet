import { spawn } from "node:child_process";
import { isIP } from "node:net";
export class WorkflowRepositoryError extends Error {
}
export const WORKFLOW_BASE_BRANCH = "main";
/** Run Git without a shell so branch and remote names are never interpolated. */
export async function runGitCommand(cwd, args, signal) {
    return new Promise((resolve, reject) => {
        const child = spawn("git", ["-C", cwd, ...args], {
            stdio: ["ignore", "pipe", "pipe"],
            signal,
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        const settle = (fn) => {
            if (settled)
                return;
            settled = true;
            fn();
        };
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        child.once("error", (error) => settle(() => reject(error)));
        child.once("close", (code) => {
            if (code === 0) {
                settle(() => resolve(stdout));
                return;
            }
            const detail = stderr.trim();
            settle(() => reject(new WorkflowRepositoryError(detail === "" ? `git exited with status ${String(code)}` : detail)));
        });
    });
}
function cleanOutput(value) {
    return value.trim();
}
async function optionalGit(runGit, cwd, args, signal) {
    try {
        return cleanOutput(await runGit(cwd, args, signal));
    }
    catch (error) {
        if (signal.aborted)
            throw error;
        return undefined;
    }
}
function isPublicHostname(hostname) {
    const host = hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || isIP(host))
        return false;
    return true;
}
function normalizedPath(pathname) {
    const path = pathname.replace(/^\/+|\/+$/gu, "").replace(/\.git$/iu, "");
    const parts = path.split("/");
    if (parts.length < 2 || parts.some((part) => part === "" || part === "." || part === ".."))
        return undefined;
    return parts.join("/");
}
/** Convert a standard public Git remote into a credential-free HTTPS repository URL. */
export function normalizeRepositoryUrl(remote) {
    const value = remote.trim();
    if (value === "" || /[\r\n]/u.test(value))
        return undefined;
    const scpStyle = /^(?<user>[^@/:\s]+)@(?<host>[^:/\s]+):(?<path>.+)$/u.exec(value);
    if (scpStyle?.groups?.host !== undefined && scpStyle.groups.path !== undefined) {
        const path = normalizedPath(scpStyle.groups.path);
        return path !== undefined && isPublicHostname(scpStyle.groups.host)
            ? `https://${scpStyle.groups.host.toLowerCase()}/${path}`
            : undefined;
    }
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        return undefined;
    }
    if (!["http:", "https:", "ssh:"].includes(parsed.protocol) || !isPublicHostname(parsed.hostname))
        return undefined;
    if (parsed.search !== "" || parsed.hash !== "")
        return undefined;
    const path = normalizedPath(parsed.pathname);
    return path === undefined ? undefined : `https://${parsed.hostname.toLowerCase()}/${path}`;
}
/** Resolve a session worktree to one public upstream repository and exact local HEAD. */
export async function resolveWorkflowRepository(cwd, signal, runGit = runGitCommand, source = "/workflow") {
    try {
        await runGit(cwd, ["rev-parse", "--show-toplevel"], signal);
    }
    catch (error) {
        if (signal.aborted)
            throw error;
        throw new WorkflowRepositoryError(`${source} requires the current session to be inside a Git worktree.`);
    }
    const remotes = cleanOutput((await optionalGit(runGit, cwd, ["remote"], signal)) ?? "")
        .split(/\r?\n/u)
        .map((remote) => remote.trim())
        .filter((remote) => remote !== "");
    if (remotes.length === 0)
        throw new WorkflowRepositoryError(`${source} requires a Git remote for the upstream repository.`);
    const branch = await optionalGit(runGit, cwd, ["rev-parse", "--abbrev-ref", "HEAD"], signal);
    const trackingRemote = branch === undefined || branch === "HEAD"
        ? undefined
        : await optionalGit(runGit, cwd, ["config", "--get", `branch.${branch}.remote`], signal);
    const remote = trackingRemote !== undefined && remotes.includes(trackingRemote)
        ? trackingRemote
        : remotes.includes("origin")
            ? "origin"
            : remotes.length === 1
                ? remotes[0]
                : undefined;
    if (remote === undefined) {
        throw new WorkflowRepositoryError(`${source} could not select an upstream remote. Configure the current branch's remote or use an origin remote (found: ${remotes.join(", ")}).`);
    }
    const remoteUrl = await optionalGit(runGit, cwd, ["remote", "get-url", "--", remote], signal);
    const url = remoteUrl === undefined ? undefined : normalizeRepositoryUrl(remoteUrl);
    if (url === undefined) {
        throw new WorkflowRepositoryError(`${source} requires a publicly addressable Git remote for "${remote}"; local, private-network, and malformed remote URLs are not supported.`);
    }
    const expectedRef = `refs/heads/${WORKFLOW_BASE_BRANCH}`;
    const remoteHead = await optionalGit(runGit, cwd, ["ls-remote", "--exit-code", "--heads", remote, expectedRef], signal);
    const remoteHeadLines = remoteHead
        ?.split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line !== "");
    if (remoteHeadLines === undefined || remoteHeadLines.length !== 1) {
        throw new WorkflowRepositoryError(`${source} could not resolve upstream ${WORKFLOW_BASE_BRANCH} HEAD.`);
    }
    const [revision, ref] = remoteHeadLines[0].split(/\s+/u);
    if (revision === undefined || ref !== expectedRef || !/^[0-9a-f]{40}$/iu.test(revision)) {
        throw new WorkflowRepositoryError(`${source} could not resolve a valid upstream ${WORKFLOW_BASE_BRANCH} HEAD.`);
    }
    return { url, revision: revision.toLowerCase() };
}
//# sourceMappingURL=repository-context.js.map