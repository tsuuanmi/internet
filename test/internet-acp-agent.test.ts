import * as acp from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";
import { createInternetAcpAgent } from "#internet/acp/agent";

function testClient(updates: acp.SessionNotification[]) {
	return acp
		.client({ name: "internet-acp-test-client" })
		.onNotification(acp.methods.client.session.update, (ctx) => {
			updates.push(ctx.params);
		});
}

describe("Internet Website ACP Agent", () => {
	it("negotiates native ACP v1 and creates a session with standard chat/research modes", async () => {
		const agent = createInternetAcpAgent({
			chat: { execute: vi.fn() } as never,
			research: { execute: vi.fn() } as never,
			chatAccountId: "chatgpt-thinker",
			researchAccountIds: ["chatgpt-thinker"],
		});
		const updates: acp.SessionNotification[] = [];

		await testClient(updates).connectWith(agent, async (ctx) => {
			const initialized = await ctx.request(acp.methods.agent.initialize, {
				protocolVersion: acp.PROTOCOL_VERSION,
				clientCapabilities: {},
			});
			expect(initialized).toMatchObject({
				protocolVersion: acp.PROTOCOL_VERSION,
				agentCapabilities: {
					promptCapabilities: {
						image: false,
						audio: false,
						embeddedContext: false,
					},
				},
			});
			expect(initialized.agentCapabilities?.loadSession).not.toBe(true);

			const session = await ctx.request(acp.methods.agent.session.new, {
				cwd: "/workspace/project",
				mcpServers: [],
			});
			expect(session.sessionId).toEqual(expect.any(String));
			expect(session.modes).toEqual({
				currentModeId: "chat",
				availableModes: [
					{ id: "chat", name: "Chat", description: expect.any(String) },
					{ id: "research", name: "Research", description: expect.any(String) },
				],
			});
		});
		expect(updates).toEqual([]);
	});

	it("uses the ACP session id as Website owner identity and an adapter-local logical turn id", async () => {
		const execute = vi.fn(async () => ({
			answer: "website answer",
			accountId: "chatgpt-thinker" as const,
			provider: "chatgpt-web" as const,
			artifactId: "a".repeat(64),
			totalChars: 14,
			truncated: false,
		}));
		const agent = createInternetAcpAgent({
			chat: { execute } as never,
			research: { execute: vi.fn() } as never,
			chatAccountId: "chatgpt-thinker",
			researchAccountIds: ["chatgpt-thinker"],
		});
		const updates: acp.SessionNotification[] = [];

		await testClient(updates).connectWith(agent, async (ctx) => {
			await ctx.request(acp.methods.agent.initialize, {
				protocolVersion: acp.PROTOCOL_VERSION,
				clientCapabilities: {},
			});
			const session = await ctx.request(acp.methods.agent.session.new, {
				cwd: "/workspace/project",
				mcpServers: [],
			});
			await expect(
				ctx.request(acp.methods.agent.session.prompt, {
					sessionId: session.sessionId,
					prompt: [{ type: "text", text: "Inspect the architecture" }],
				}),
			).resolves.toEqual({ stopReason: "end_turn" });

			expect(execute).toHaveBeenCalledWith(
				{
					ownerSessionId: session.sessionId,
					requestId: `${session.sessionId}:turn:1`,
					signal: expect.any(AbortSignal),
				},
				{
					accountId: "chatgpt-thinker",
					prompt: "Inspect the architecture",
				},
			);
			expect(updates).toEqual([
				{
					sessionId: session.sessionId,
					update: {
						sessionUpdate: "agent_message_chunk",
						content: { type: "text", text: "website answer" },
					},
				},
			]);
		});
	});

	it("switches to provider-native research through standard ACP session/set_mode", async () => {
		const research = vi.fn(async () => ({
			state: "completed" as const,
			results: [
				{
					accountId: "gemini-thinker" as const,
					provider: "gemini-web" as const,
					state: "completed" as const,
					report: "research report",
				},
			],
		}));
		const agent = createInternetAcpAgent({
			chat: { execute: vi.fn() } as never,
			research: { execute: research } as never,
			chatAccountId: "chatgpt-thinker",
			researchAccountIds: ["gemini-thinker"],
		});
		const updates: acp.SessionNotification[] = [];

		await testClient(updates).connectWith(agent, async (ctx) => {
			await ctx.request(acp.methods.agent.initialize, {
				protocolVersion: acp.PROTOCOL_VERSION,
				clientCapabilities: {},
			});
			const session = await ctx.request(acp.methods.agent.session.new, {
				cwd: "/workspace/project",
				mcpServers: [],
			});
			await ctx.request(acp.methods.agent.session.setMode, {
				sessionId: session.sessionId,
				modeId: "research",
			});
			await expect(
				ctx.request(acp.methods.agent.session.prompt, {
					sessionId: session.sessionId,
					prompt: [{ type: "text", text: "Research ACP interoperability" }],
				}),
			).resolves.toEqual({ stopReason: "end_turn" });

			expect(research).toHaveBeenCalledWith(
				{
					ownerSessionId: session.sessionId,
					requestId: `${session.sessionId}:turn:1`,
					signal: expect.any(AbortSignal),
				},
				{
					query: "Research ACP interoperability",
					accountIds: ["gemini-thinker"],
				},
			);
			expect(updates.at(-1)).toEqual({
				sessionId: session.sessionId,
				update: {
					sessionUpdate: "agent_message_chunk",
					content: { type: "text", text: "research report" },
				},
			});
		});
	});

	it("bridges native session/cancel to the shared Website application AbortSignal", async () => {
		let started: (() => void) | undefined;
		const startedPromise = new Promise<void>((resolve) => {
			started = resolve;
		});
		const execute = vi.fn(
			(context: { signal?: AbortSignal }) =>
				new Promise<{
					answer: string;
					accountId: "chatgpt-thinker";
					provider: "chatgpt-web";
					isError: true;
				}>((resolve) => {
					started?.();
					context.signal?.addEventListener(
						"abort",
						() =>
							resolve({
								answer: "cancelled",
								accountId: "chatgpt-thinker",
								provider: "chatgpt-web",
								isError: true,
							}),
						{ once: true },
					);
				}),
		);
		const agent = createInternetAcpAgent({
			chat: { execute } as never,
			research: { execute: vi.fn() } as never,
			chatAccountId: "chatgpt-thinker",
			researchAccountIds: ["chatgpt-thinker"],
		});

		await testClient([]).connectWith(agent, async (ctx) => {
			await ctx.request(acp.methods.agent.initialize, {
				protocolVersion: acp.PROTOCOL_VERSION,
				clientCapabilities: {},
			});
			const session = await ctx.request(acp.methods.agent.session.new, {
				cwd: "/workspace/project",
				mcpServers: [],
			});
			const prompt = ctx.request(acp.methods.agent.session.prompt, {
				sessionId: session.sessionId,
				prompt: [{ type: "text", text: "Long-running Website work" }],
			});

			await startedPromise;
			await ctx.notify(acp.methods.agent.session.cancel, {
				sessionId: session.sessionId,
			});

			await expect(prompt).resolves.toEqual({ stopReason: "cancelled" });
			expect((execute.mock.calls[0]?.[0] as { signal?: AbortSignal }).signal?.aborted).toBe(true);
		});
	});
});
