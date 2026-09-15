from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise RuntimeError(f"missing patch anchor in {path}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "src/core/errors.ts",
    '\t| "provider_stalled"\n\t| "aborted"',
    '\t| "provider_stalled"\n\t| "provider_reconciliation_failed"\n\t| "aborted"',
)

replace_once(
    "src/workflow/recovery.ts",
    '\t\t\tcase "provider_stalled":\n\t\t\t\treturn { class: "PROVIDER", code: "PROVIDER_STALLED", message, retry: "RECREATE_SESSION", at };\n\t\t\tcase "browser_unavailable":',
    '\t\t\tcase "provider_stalled":\n\t\t\t\treturn { class: "PROVIDER", code: "PROVIDER_STALLED", message, retry: "RECREATE_SESSION", at };\n\t\t\tcase "provider_reconciliation_failed":\n\t\t\t\treturn { class: "OUTPUT", code: "RESULT_RECONCILIATION_AMBIGUOUS", message, retry: "USER_ACTION", at };\n\t\t\tcase "browser_unavailable":',
)

replace_once(
    "src/team/executor.ts",
    '\treadonly sessionId: string;\n\treadonly visible?: boolean;',
    '\treadonly sessionId: string;\n\treadonly requestKey?: string;\n\treadonly visible?: boolean;',
)
replace_once(
    "src/team/executor.ts",
    '\t\tsessionId: options.sessionId,\n\t\tvisible: options.visible,',
    '\t\tsessionId: options.sessionId,\n\t\trequestKey: options.requestKey,\n\t\tvisible: options.visible,',
)

replace_once(
    "src/workflow/team-runner.ts",
    '\treadonly sessionId: string;\n\treadonly signal?: AbortSignal;',
    '\treadonly sessionId: string;\n\treadonly requestKey: string;\n\treadonly signal?: AbortSignal;',
)
replace_once(
    "src/workflow/team-runner.ts",
    '\t\t\tsessionId: request.sessionId,\n\t\t\tvisible: false,',
    '\t\t\tsessionId: request.sessionId,\n\t\t\trequestKey: request.requestKey,\n\t\t\tvisible: false,',
)

replace_once(
    "src/workflow/writer-runner.ts",
    '\treadonly sessionId: string;\n\treadonly signal?: AbortSignal;',
    '\treadonly sessionId: string;\n\treadonly requestKey: string;\n\treadonly signal?: AbortSignal;',
)
replace_once(
    "src/workflow/writer-runner.ts",
    '\t\t\tsessionId: request.sessionId,\n\t\t\ttimeoutMs: this.policy.hardTimeoutMs,',
    '\t\t\tsessionId: request.sessionId,\n\t\t\trequestKey: request.requestKey,\n\t\t\ttimeoutMs: this.policy.hardTimeoutMs,',
)

replace_once(
    "src/browser/runtime.ts",
    '} from "#internet/browser/conversations";\nimport { BrowserDisplayManager, browserViewport, headedWindowArgs } from "#internet/browser/display";',
    '} from "#internet/browser/conversations";\nimport { BrowserDisplayManager, browserViewport, headedWindowArgs } from "#internet/browser/display";\nimport {\n\thashProviderTurnText,\n\tProviderTurnReceiptStore,\n\treconcileProviderTurn,\n} from "#internet/browser/turn-receipts";',
)
replace_once(
    "src/browser/runtime.ts",
    '\t/** Durable owner key: the current DSH agent/session ID. */\n\tsessionId: string;\n\t/** Show automated Chrome',
    '\t/** Durable owner key: the current DSH agent/session ID. */\n\tsessionId: string;\n\t/** Stable logical request identity used to reconcile workflow retries. */\n\trequestKey?: string;\n\t/** Show automated Chrome',
)
replace_once(
    "src/browser/runtime.ts",
    '\tprivate readonly conversations = new Map<AccountId, ConversationStore>();\n\tprivate readonly pendingCloses',
    '\tprivate readonly conversations = new Map<AccountId, ConversationStore>();\n\tprivate readonly turnReceipts = new Map<AccountId, ProviderTurnReceiptStore>();\n\tprivate readonly pendingCloses',
)
replace_once(
    "src/browser/runtime.ts",
    '\tprivate scheduler(accountId: AccountId): ProviderScheduler {',
    '''\tprivate turnReceiptStore(accountId: AccountId): ProviderTurnReceiptStore {
\t\tlet store = this.turnReceipts.get(accountId);
\t\tif (store === undefined) {
\t\t\tstore = new ProviderTurnReceiptStore(this.config.dataDir, accountId);
\t\t\tthis.turnReceipts.set(accountId, store);
\t\t}
\t\treturn store;
\t}

\tprivate scheduler(accountId: AccountId): ProviderScheduler {''',
)
replace_once(
    "src/browser/runtime.ts",
    '''\t\t\t\tpersist: (url) => {
\t\t\t\t\ttry {
\t\t\t\t\t\treturn this.conversationStore(accountId).bind(request.sessionId, url);
\t\t\t\t\t} catch (error) {''',
    '''\t\t\t\tpersist: (url) => {
\t\t\t\t\ttry {
\t\t\t\t\t\tconst persisted = this.conversationStore(accountId).bind(request.sessionId, url);
\t\t\t\t\t\tif (request.requestKey !== undefined) {
\t\t\t\t\t\t\tthis.turnReceiptStore(accountId).bindConversation(
\t\t\t\t\t\t\t\trequest.sessionId,
\t\t\t\t\t\t\t\trequest.requestKey,
\t\t\t\t\t\t\t\tpersisted.conversationUrl,
\t\t\t\t\t\t\t);
\t\t\t\t\t\t}
\t\t\t\t\t\treturn persisted;
\t\t\t\t\t} catch (error) {''',
)

old_turn = '''\t\t\tlet result: { text: string; binding: ConversationBinding };
\t\t\tif (provider === "chatgpt-web") {
\t\t\t\tconst previousTurnText = await chatgptLastAssistantTurnText(page);
\t\t\t\tconst previousResearchText =
\t\t\t\t\trequest.research === true ? (await chatgptDeepResearchSnapshot(page)).text : undefined;
\t\t\t\tif (request.research === true) {
\t\t\t\t\tawait chatgptEnableDeepResearch(page);
\t\t\t\t\tawait chatgptSendDeepResearch(page, request.prompt);
\t\t\t\t} else {
\t\t\t\t\tawait chatgptSelectThinkingLevel(page, this.config.chatgptThinkingLevel);
\t\t\t\t\tawait chatgptSend(page, request.prompt);
\t\t\t\t}
\t\t\t\tresult = await observeBoundTurn((signal, remainingMs) =>
\t\t\t\t\twaitForStableCompletion(
\t\t\t\t\t\t() =>
\t\t\t\t\t\t\trequest.research === true
\t\t\t\t\t\t\t\t? chatgptDeepResearchSnapshot(page!, previousResearchText)
\t\t\t\t\t\t\t\t: (async () => {
\t\t\t\t\t\t\t\t\t\tif (request.confirmation !== undefined) {
\t\t\t\t\t\t\t\t\t\t\tawait chatgptHandleWorkflowConfirmation(
\t\t\t\t\t\t\t\t\t\t\t\tpage!,
\t\t\t\t\t\t\t\t\t\t\t\trequest.confirmation,
\t\t\t\t\t\t\t\t\t\t\t\taccountId,
\t\t\t\t\t\t\t\t\t\t\t\trequest.sessionId,
\t\t\t\t\t\t\t\t\t\t\t);
\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\treturn chatgptSnapshot(page!, previousTurnText);
\t\t\t\t\t\t\t\t\t})(),
\t\t\t\t\t\t{ ...waitOptions, signal, timeoutMs: remainingMs() },
\t\t\t\t\t),
\t\t\t\t);
\t\t\t} else {
\t\t\t\tconst previousTurnText = await geminiLastResponseText(page);
\t\t\t\tconst previousResearchText =
\t\t\t\t\trequest.research === true ? await geminiLastDeepResearchReportText(page) : undefined;
\t\t\t\tif (request.research === true) await geminiEnableDeepResearch(page);
\t\t\t\telse await geminiSelectDefaultMode(page);
\t\t\t\tawait geminiSend(page, request.prompt);
\t\t\t\tresult = await observeBoundTurn(async (signal, remainingMs) => {
\t\t\t\t\tif (request.research === true) {
\t\t\t\t\t\tawait geminiStartResearchPlan(page!, { signal, timeoutMs: remainingMs() });
\t\t\t\t\t}
\t\t\t\t\treturn waitForStableCompletion(
\t\t\t\t\t\t() =>
\t\t\t\t\t\t\trequest.research === true
\t\t\t\t\t\t\t\t? geminiDeepResearchSnapshot(page!, previousResearchText)
\t\t\t\t\t\t\t\t: geminiSnapshot(page!, previousTurnText),
\t\t\t\t\t\t{ ...waitOptions, signal, timeoutMs: remainingMs() },
\t\t\t\t\t);
\t\t\t\t});
\t\t\t}
'''
new_turn = '''\t\t\tlet result: { text: string; binding: ConversationBinding };
\t\t\tconst currentSnapshot = () =>
\t\t\t\tprovider === "chatgpt-web" ? chatgptSnapshot(page!) : geminiSnapshot(page!);
\t\t\tlet resumeSubmittedTurn = false;
\t\t\tlet previousResponseText: string | undefined;
\t\t\tif (request.requestKey !== undefined) {
\t\t\t\tif (request.research === true) {
\t\t\t\t\tthrow new InternetError("config_error", "provider turn reconciliation is only supported for ordinary workflow turns");
\t\t\t\t}
\t\t\t\tconst receipts = this.turnReceiptStore(accountId);
\t\t\t\tconst snapshot = await currentSnapshot();
\t\t\t\tpreviousResponseText = snapshot.text;
\t\t\t\tconst existing = receipts.read(request.sessionId, request.requestKey);
\t\t\t\tif (existing !== undefined) {
\t\t\t\t\tif (existing.promptHash !== hashProviderTurnText(request.prompt)) {
\t\t\t\t\t\tthrow new InternetError("config_error", "workflow request key was reused with different provider input");
\t\t\t\t\t}
\t\t\t\t\tconst reconciliation = reconcileProviderTurn(existing, snapshot);
\t\t\t\t\tif (reconciliation === "AMBIGUOUS") {
\t\t\t\t\t\tthrow new InternetError(
\t\t\t\t\t\t\t"provider_reconciliation_failed",
\t\t\t\t\t\t\t"provider conversation no longer matches the durable workflow turn receipt; inspect before retrying",
\t\t\t\t\t\t);
\t\t\t\t\t}
\t\t\t\t\tif (reconciliation === "RECOVER") {
\t\t\t\t\t\tlet recoveredBinding = binding ?? this.conversationStore(accountId).read(request.sessionId);
\t\t\t\t\t\tif (recoveredBinding === undefined) {
\t\t\t\t\t\t\ttry {
\t\t\t\t\t\t\t\trecoveredBinding = this.conversationStore(accountId).bind(request.sessionId, page.url());
\t\t\t\t\t\t\t} catch {
\t\t\t\t\t\t\t\tthrow new InternetError(
\t\t\t\t\t\t\t\t\t"provider_reconciliation_failed",
\t\t\t\t\t\t\t\t\t"provider response completed but its canonical conversation identity could not be reconciled",
\t\t\t\t\t\t\t\t);
\t\t\t\t\t\t\t}
\t\t\t\t\t\t}
\t\t\t\t\t\treceipts.complete(request.sessionId, request.requestKey, snapshot.text, recoveredBinding.conversationUrl);
\t\t\t\t\t\tconst storageState = await this.captureAccountSnapshot(context, previousStorageState);
\t\t\t\t\t\tawait this.commitAccountSnapshot(accountId, lease, accountRevision, storageState);
\t\t\t\t\t\treturn {
\t\t\t\t\t\t\ttext: snapshot.text.slice(0, this.config.maxOutputChars),
\t\t\t\t\t\t\turl: recoveredBinding.conversationUrl,
\t\t\t\t\t\t\tconversationId: recoveredBinding.conversationId,
\t\t\t\t\t\t};
\t\t\t\t\t}
\t\t\t\t\tif (reconciliation === "WAIT") {
\t\t\t\t\t\tresumeSubmittedTurn = true;
\t\t\t\t\t} else {
\t\t\t\t\t\treceipts.submit({
\t\t\t\t\t\t\tsessionId: request.sessionId,
\t\t\t\t\t\t\trequestKey: request.requestKey,
\t\t\t\t\t\t\tprompt: request.prompt,
\t\t\t\t\t\t\tpreviousResponse: snapshot.text,
\t\t\t\t\t\t\tconversationUrl: binding?.conversationUrl,
\t\t\t\t\t\t});
\t\t\t\t\t}
\t\t\t\t} else {
\t\t\t\t\treceipts.submit({
\t\t\t\t\t\tsessionId: request.sessionId,
\t\t\t\t\t\trequestKey: request.requestKey,
\t\t\t\t\t\tprompt: request.prompt,
\t\t\t\t\t\tpreviousResponse: snapshot.text,
\t\t\t\t\t\tconversationUrl: binding?.conversationUrl,
\t\t\t\t\t});
\t\t\t\t}
\t\t\t}
\t\t\tif (provider === "chatgpt-web") {
\t\t\t\tconst previousTurnText = previousResponseText ?? (await chatgptLastAssistantTurnText(page));
\t\t\t\tconst previousResearchText =
\t\t\t\t\trequest.research === true ? (await chatgptDeepResearchSnapshot(page)).text : undefined;
\t\t\t\tif (!resumeSubmittedTurn) {
\t\t\t\t\tif (request.research === true) {
\t\t\t\t\t\tawait chatgptEnableDeepResearch(page);
\t\t\t\t\t\tawait chatgptSendDeepResearch(page, request.prompt);
\t\t\t\t\t} else {
\t\t\t\t\t\tawait chatgptSelectThinkingLevel(page, this.config.chatgptThinkingLevel);
\t\t\t\t\t\tawait chatgptSend(page, request.prompt);
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\tresult = await observeBoundTurn((signal, remainingMs) =>
\t\t\t\t\twaitForStableCompletion(
\t\t\t\t\t\t() =>
\t\t\t\t\t\t\trequest.research === true
\t\t\t\t\t\t\t\t? chatgptDeepResearchSnapshot(page!, previousResearchText)
\t\t\t\t\t\t\t\t: (async () => {
\t\t\t\t\t\t\t\t\t\tif (request.confirmation !== undefined) {
\t\t\t\t\t\t\t\t\t\t\tawait chatgptHandleWorkflowConfirmation(
\t\t\t\t\t\t\t\t\t\t\t\tpage!,
\t\t\t\t\t\t\t\t\t\t\t\trequest.confirmation,
\t\t\t\t\t\t\t\t\t\t\t\taccountId,
\t\t\t\t\t\t\t\t\t\t\t\trequest.sessionId,
\t\t\t\t\t\t\t\t\t\t\t);
\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\treturn resumeSubmittedTurn
\t\t\t\t\t\t\t\t\t\t\t? chatgptSnapshot(page!)
\t\t\t\t\t\t\t\t\t\t\t: chatgptSnapshot(page!, previousTurnText);
\t\t\t\t\t\t\t\t\t})(),
\t\t\t\t\t\t{ ...waitOptions, signal, timeoutMs: remainingMs() },
\t\t\t\t\t),
\t\t\t\t);
\t\t\t} else {
\t\t\t\tconst previousTurnText = previousResponseText ?? (await geminiLastResponseText(page));
\t\t\t\tconst previousResearchText =
\t\t\t\t\trequest.research === true ? await geminiLastDeepResearchReportText(page) : undefined;
\t\t\t\tif (!resumeSubmittedTurn) {
\t\t\t\t\tif (request.research === true) await geminiEnableDeepResearch(page);
\t\t\t\t\telse await geminiSelectDefaultMode(page);
\t\t\t\t\tawait geminiSend(page, request.prompt);
\t\t\t\t}
\t\t\t\tresult = await observeBoundTurn(async (signal, remainingMs) => {
\t\t\t\t\tif (request.research === true && !resumeSubmittedTurn) {
\t\t\t\t\t\tawait geminiStartResearchPlan(page!, { signal, timeoutMs: remainingMs() });
\t\t\t\t\t}
\t\t\t\t\treturn waitForStableCompletion(
\t\t\t\t\t\t() =>
\t\t\t\t\t\t\trequest.research === true
\t\t\t\t\t\t\t\t? geminiDeepResearchSnapshot(page!, previousResearchText)
\t\t\t\t\t\t\t\t: resumeSubmittedTurn
\t\t\t\t\t\t\t\t\t? geminiSnapshot(page!)
\t\t\t\t\t\t\t\t\t: geminiSnapshot(page!, previousTurnText),
\t\t\t\t\t\t{ ...waitOptions, signal, timeoutMs: remainingMs() },
\t\t\t\t\t);
\t\t\t\t});
\t\t\t}
\t\t\tif (request.requestKey !== undefined) {
\t\t\t\tthis.turnReceiptStore(accountId).complete(
\t\t\t\t\trequest.sessionId,
\t\t\t\t\trequest.requestKey,
\t\t\t\t\tresult.text,
\t\t\t\t\tresult.binding.conversationUrl,
\t\t\t\t);
\t\t\t}
'''
replace_once("src/browser/runtime.ts", old_turn, new_turn)

replace_once(
    "src/workflow/engine.ts",
    '\t\t\tpromptStrategy: context.promptStrategy,\n\t\t\tsessionId: context.sessionId,',
    '\t\t\tpromptStrategy: context.promptStrategy,\n\t\t\tsessionId: context.sessionId,\n\t\t\trequestKey: this.nodeRequestKey(job, node),',
)
replace_once(
    "src/workflow/engine.ts",
    '\t\t\t\t\tsessionId: job.writerConversation.sessionId,\n\t\t\t\t\tpayload: handoff.payload,',
    '\t\t\t\t\tsessionId: job.writerConversation.sessionId,\n\t\t\t\t\trequestKey: handoff.handoffId,\n\t\t\t\t\tpayload: handoff.payload,',
)
# The review handoff loop contains the same delivery block; patch its remaining occurrence.
replace_once(
    "src/workflow/engine.ts",
    '\t\t\t\t\tsessionId: job.writerConversation.sessionId,\n\t\t\t\t\tpayload: handoff.payload,',
    '\t\t\t\t\tsessionId: job.writerConversation.sessionId,\n\t\t\t\t\trequestKey: handoff.handoffId,\n\t\t\t\t\tpayload: handoff.payload,',
)
for control in ["START_IMPLEMENTATION", "APPLY_REVIEWS", "CHECK_PR_HEALTH", "MERGE_AUTHORIZED"]:
    anchor = '\t\t\tsessionId: job.writerConversation.sessionId,\n\t\t\tjob,\n\t\t\tcontrol: createWorkflowControlMessage("' + control + '"'
    replacement = '\t\t\tsessionId: job.writerConversation.sessionId,\n\t\t\trequestKey: this.nodeRequestKey(job, node),\n\t\t\tjob,\n\t\t\tcontrol: createWorkflowControlMessage("' + control + '"'
    replace_once("src/workflow/engine.ts", anchor, replacement)
replace_once(
    "src/workflow/engine.ts",
    '\tprivate newExecution(node: WorkflowGraphNode, ownerInstanceId: string): WorkflowExecutionRecord {',
    '''\tprivate nodeRequestKey(job: WorkflowJob, node: WorkflowGraphNode): string {
\t\tif (node.input === undefined) throw new Error(`workflow node ${node.nodeId} has no exact input receipt`);
\t\treturn `${job.jobId}:${node.nodeId}:${node.input.inputHash}`;
\t}

\tprivate newExecution(node: WorkflowGraphNode, ownerInstanceId: string): WorkflowExecutionRecord {''',
)

# Public surface for tests and downstream diagnostics.
replace_once(
    "src/index.ts",
    'export { BrowserManager } from "#internet/browser/runtime";\n',
    'export { BrowserManager } from "#internet/browser/runtime";\nexport {\n\thashProviderTurnText,\n\tparseProviderTurnReceipt,\n\tProviderTurnReceiptStore,\n\tproviderTurnReceiptId,\n\treconcileProviderTurn,\n} from "#internet/browser/turn-receipts";\n',
)

# Existing writer-runner tests now provide the stable request identity required by workflow turns.
writer_test = Path("test/workflow-writer-runner.test.ts")
text = writer_test.read_text()
text = text.replace(
    '\t\t\tsessionId: writerSessionId,\n\t\t\tjob: current,',
    '\t\t\tsessionId: writerSessionId,\n\t\t\trequestKey: "writer-request",\n\t\t\tjob: current,',
)
text = text.replace(
    '\t\t\t\tsessionId: writerSessionId,\n\t\t\t\tjob: current,',
    '\t\t\t\tsessionId: writerSessionId,\n\t\t\t\trequestKey: `writer-${kind}`,\n\t\t\t\tjob: current,',
)
text = text.replace(
    '\t\tsessionId: writerSessionId,\n\t\tjob: job(),',
    '\t\tsessionId: writerSessionId,\n\t\trequestKey: "writer-retry-safe",\n\t\tjob: job(),',
)
text = text.replace(
    '\t\t\ttimeoutMs: policy.hardTimeoutMs,',
    '\t\t\trequestKey: "writer-request",\n\t\t\ttimeoutMs: policy.hardTimeoutMs,',
)
writer_test.write_text(text)
