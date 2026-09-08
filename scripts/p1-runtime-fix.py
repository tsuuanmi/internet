from pathlib import Path

path = Path("src/browser/runtime.ts")
text = path.read_text()

replacements = [
    (
        """\t\t\tawait this.launchNormalLogin(provider);\n\t\t\tawait this.persistLoginProfile(provider);""",
        """\t\t\tawait this.launchNormalLogin(accountId);\n\t\t\tawait this.persistLoginProfile(accountId);""",
    ),
    (
        """\t/** Close the provider's managed inference browser, if one is open. */\n\tasync stop(provider: WebProvider): Promise<void> {\n\t\tawait this.runProviderExclusive(provider, () => this.closeProviderResources(provider));\n\t}\n\n\tprivate async closeProviderResources(provider: WebProvider): Promise<void> {\n\t\tthis.cancelPendingClose(accountId);\n\t\tconst remote = this.remoteLogins.get(provider);\n\t\tif (remote !== undefined) {\n\t\t\tawait remote.waitForFinalization();\n\t\t\tif (this.remoteLogins.get(accountId) === remote) this.remoteLogins.delete(accountId);\n\t\t\tawait remote.cancel();\n\t\t}\n\t\tawait this.closeBrowser(accountId);\n\t}""",
        """\t/** Close the account's managed inference browser, if one is open. */\n\tasync stop(accountId: AccountId): Promise<void> {\n\t\tawait this.runAccountExclusive(accountId, () => this.closeAccountResources(accountId));\n\t}\n\n\tprivate async closeAccountResources(accountId: AccountId): Promise<void> {\n\t\tthis.cancelPendingClose(accountId);\n\t\tconst remote = this.remoteLogins.get(accountId);\n\t\tif (remote !== undefined) {\n\t\t\tawait remote.waitForFinalization();\n\t\t\tif (this.remoteLogins.get(accountId) === remote) this.remoteLogins.delete(accountId);\n\t\t\tawait remote.cancel();\n\t\t}\n\t\tawait this.closeBrowser(accountId);\n\t}""",
    ),
    (
        """\t/** Cancel any pending delayed-close timer for a provider (the browser is needed now). */""",
        """\t/** Cancel any pending delayed-close timer for an account (the browser is needed now). */""",
    ),
]

for old, new in replacements:
    text = text.replace(old, new)

# Fail if provider-keyed lifecycle helpers remain after the account refactor.
for forbidden in ["runProviderExclusive", "closeProviderResources", "maxConcurrentTurnsPerProvider"]:
    if forbidden in text:
        raise SystemExit(f"runtime still contains forbidden provider-keyed lifecycle symbol: {forbidden}")

path.write_text(text)
