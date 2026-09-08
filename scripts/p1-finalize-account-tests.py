from pathlib import Path

runtime = Path("src/browser/runtime.ts")
text = runtime.read_text()
text = text.replace(
    """\tprivate async handleSignedOut(\n\t\taccountId: AccountId,\n\t\tprovider: WebProvider,\n\t\tlease: ProviderLease,""",
    """\tprivate async handleSignedOut(\n\t\taccountId: AccountId,\n\t\tlease: ProviderLease,""",
)
text = text.replace("this.handleSignedOut(accountId, provider, lease,", "this.handleSignedOut(accountId, lease,")
runtime.write_text(text)

test = Path("test/browser-runtime.test.ts")
text = test.read_text().replace(
    'handleSignedOut("chatgpt-writer", "chatgpt-web", lease, writerRevision, "login-url")',
    'handleSignedOut("chatgpt-writer", lease, writerRevision, "login-url")',
)
test.write_text(text)
