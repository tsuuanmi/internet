# Internet Documentation Policy

Internet adopts the [documentation architecture standard](documentation-architecture.md).

## Authority

- [Requirements](../requirements/README.md) define intended current production behavior.
- [Architecture](../architecture/README.md), [design](../design/README.md), and [reference](../reference/README.md) define current structure, mechanisms, and exact contracts.
- Source is executable reality; tests and [validation](../validation/README.md) provide evidence.
- [Accepted ADRs](../decisions/adr/README.md) preserve rationale but do not replace current-state docs.
- [Proposals](../proposals/README.md), proposed ADRs, and [research](../research/README.md) are non-authoritative until explicitly promoted.

If code and current normative documentation disagree, treat that as a defect to reconcile in the owning change.

## Navigation

- root `README.md` is the product/contributor router;
- `docs/README.md` is the knowledge router;
- every documentation directory has one `README.md` index;
- README files route rather than duplicate specifications.

## Change impact

- behavior/constraint change -> requirements + affected design/reference/tests;
- responsibility/dependency change -> architecture + affected design;
- exact command/provider contract change -> reference + tests/validation;
- durable accepted architectural choice -> accepted ADR or successor;
- unimplemented change -> proposal;
- exploratory evidence -> research;
- build/test/release process -> engineering;
- runtime/support procedure -> operations;
- trust-boundary change -> security.

## vNext boundary

Workflow vNext remains under `docs/proposals/workflow-vnext/` while it is evolutionary. Its proposed ADRs remain beside it. Implemented pieces become current truth only when the owning requirements/architecture/design/reference documentation is promoted with source and validation.

## Cleanup

Do not keep old/current compatibility copies or a generic legacy archive after a docs migration. Git preserves history. Delete temporary planning/status summaries when their durable knowledge is represented by canonical documentation.
