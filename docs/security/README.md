# Security and Trust Boundaries

`@tsuuanmi/internet` drives authenticated provider sessions and can perform scoped GitHub mutations, so authentication state and workflow authority are security boundaries.

- Portable account-state files are bearer-equivalent secrets and must remain private.
- `chatgpt-writer` is the dedicated workflow mutation authority; reasoning accounts do not inherit that authority.
- Unknown or scope-mismatched Website confirmations fail closed.
- Merge authority remains an explicit user-owned gate bound to exact repository, PR, head, review cycle, and live health evidence.
- Provider UI automation follows the fail-closed [provider inspection contracts](../reference/providers/README.md).

Security details that change with implementation must be updated with the owning architecture/design/reference documentation and tests.
