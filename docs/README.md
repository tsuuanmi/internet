# Internet Documentation

This is the canonical knowledge router for humans and coding agents.

The documentation follows the repository's [documentation architecture standard](governance/documentation-architecture.md): organize knowledge by role, authority, lifecycle, and ownership; keep one fact in one canonical home; link instead of duplicating.

## Read order for a change

1. [Requirements](requirements/README.md) — what must be true.
2. [Architecture](architecture/README.md) — where responsibilities and invariants belong.
3. [Design](design/README.md) — how current mechanisms work.
4. [Decisions](decisions/README.md) — why durable current choices were made.
5. [Proposals](proposals/README.md) and [research](research/README.md) — changes/evidence that are not current truth.
6. [Reference](reference/README.md) — exact operator/provider contracts.
7. Source and tests — executable behavior and evidence.
8. [Validation](validation/README.md) — acceptance and reliability evidence.
9. [Engineering](engineering/README.md), [operations](operations/README.md), and [security](security/README.md) — delivery and runtime support.
10. [Governance](governance/README.md) — documentation lifecycle and policy.

## Authority

| Area | Role | Class |
|---|---|---|
| [Requirements](requirements/README.md) | normative intended behavior | canonical / living |
| [Architecture](architecture/README.md) | stable structure and boundaries | canonical / living |
| [Design](design/README.md) | current mechanisms | canonical / living |
| [Reference](reference/README.md) | exact interfaces/contracts | canonical / living |
| source + tests | executable behavior/evidence | executable reality |
| [Validation](validation/README.md) | acceptance/evidence policy | canonical / living |
| [Engineering](engineering/README.md) | development/delivery process | canonical / living |
| [Operations](operations/README.md) | runtime/support procedures | canonical / living |
| [Security](security/README.md) | trust boundaries and controls | canonical / living |
| [Governance](governance/README.md) | lifecycle/ownership policy | canonical / living |
| [Decisions](decisions/README.md) | accepted historical rationale | historical / durable |
| [Proposals](proposals/README.md) | reviewed change under evolution | evolutionary |
| [Research](research/README.md) | evidence/experiments | exploratory |

If code and current normative documentation disagree, surface and reconcile the mismatch. Proposed vNext material does not override current production behavior until promoted.

## Layout

```text
docs/
├── README.md
├── requirements/
├── architecture/
├── design/
├── decisions/
│   └── adr/
├── proposals/
│   └── workflow-vnext/
│       └── adr/
├── research/
├── validation/
├── engineering/
├── operations/
├── security/
├── reference/
│   └── providers/
└── governance/
```

> Requirements define intent. Research provides evidence. Proposals explore change. Accepted ADRs preserve decisions. Architecture describes structure. Design describes mechanisms. Code realizes design. Tests and validation demonstrate behavior. Operations keep it supportable.
