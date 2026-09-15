from pathlib import Path

path = Path("src/browser/runtime.ts")
text = path.read_text()
text = text.replace(
    'import { hashProviderTurnText, ProviderTurnReceiptStore, reconcileProviderTurn } from "#internet/browser/turn-receipts";',
    'import {\n\thashProviderTurnText,\n\tProviderTurnReceiptStore,\n\treconcileProviderTurn,\n\tworkflowJobIdFromRequestKey,\n} from "#internet/browser/turn-receipts";',
    1,
)
text = text.replace(
    'private readonly turnReceipts = new Map<AccountId, ProviderTurnReceiptStore>();',
    'private readonly turnReceipts = new Map<string, ProviderTurnReceiptStore>();',
    1,
)
old = '''\tprivate turnReceiptStore(accountId: AccountId): ProviderTurnReceiptStore {
\t\tlet store = this.turnReceipts.get(accountId);
\t\tif (store === undefined) {
\t\t\tstore = new ProviderTurnReceiptStore(this.config.dataDir, accountId);
\t\t\tthis.turnReceipts.set(accountId, store);
\t\t}
\t\treturn store;
\t}
'''
new = '''\tprivate turnReceiptStore(accountId: AccountId, requestKey: string): ProviderTurnReceiptStore {
\t\tconst workflowJobId = workflowJobIdFromRequestKey(requestKey);
\t\tconst key = `${workflowJobId}:${accountId}`;
\t\tlet store = this.turnReceipts.get(key);
\t\tif (store === undefined) {
\t\t\tstore = new ProviderTurnReceiptStore(this.config.dataDir, workflowJobId, accountId);
\t\t\tthis.turnReceipts.set(key, store);
\t\t}
\t\treturn store;
\t}
'''
if old not in text:
    raise RuntimeError("turnReceiptStore anchor changed")
text = text.replace(old, new, 1)
text = text.replace(
    'this.turnReceiptStore(accountId).bindConversation(',
    'this.turnReceiptStore(accountId, request.requestKey).bindConversation(',
)
text = text.replace(
    'const receipts = this.turnReceiptStore(accountId);',
    'const receipts = this.turnReceiptStore(accountId, request.requestKey);',
)
text = text.replace(
    'this.turnReceiptStore(accountId).complete(',
    'this.turnReceiptStore(accountId, request.requestKey).complete(',
)
path.write_text(text)
