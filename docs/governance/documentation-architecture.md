# Documentation Architecture Standard

This repository follows the same role- and lifecycle-based documentation model used by DNA.

The goal is a knowledge system where a reader can answer: what must be true, what is current structure, how mechanisms work, why durable choices were made, what change is proposed, what evidence is exploratory, what contracts are exact, how behavior is validated, and how the software is delivered and operated.

## Core principles

### One fact, one canonical home

A fact has one authoritative location. Other documents link to it rather than restating it.

### Documentation changes with the system

Behavior, contract, architecture, operational, security, or validation changes update the affected documentation in the same change.

### Keep knowledge classes separate

- **canonical / living** — current requirements, architecture, design, reference, validation, engineering, operations, security, governance;
- **historical / durable** — accepted ADRs and other retained rationale;
- **evolutionary** — proposals and proposed ADRs;
- **exploratory** — research and experiments;
- **executable reality** — source and tests.

A proposal is not a specification for current production behavior. A proposed ADR is not an accepted decision. Research is not production authority.

## Repository layout

```text
docs/
├── README.md
├── requirements/
├── architecture/
├── design/
├── decisions/
│   └── adr/
├── proposals/
├── research/
├── validation/
├── engineering/
├── operations/
├── security/
├── reference/
└── governance/
```

Create subdirectories when real knowledge needs them; do not add empty categories merely for symmetry.

## Knowledge areas

- `requirements/`: normative current behavior and constraints.
- `architecture/`: current structure, boundaries, dependency direction, and invariants.
- `design/`: current mechanisms and implementation-facing design.
- `decisions/`: accepted durable rationale.
- `proposals/`: reviewed change that is not yet current truth.
- `research/`: non-normative evidence and experiments.
- `validation/`: acceptance strategy and evidence.
- `engineering/`: build, test, CI/CD, dependency, and release process.
- `operations/`: runtime procedures, support, recovery, and observability.
- `security/`: trust boundaries and security controls.
- `reference/`: exact operator, configuration, schema, and provider contracts.
- `governance/`: documentation lifecycle, ownership, naming, and repository-wide policy.

## README files are routers

The repository README routes users to the project. `docs/README.md` routes by knowledge role. Folder READMEs explain scope, authority, and canonical entry points without duplicating the underlying documents.

## Lifecycle

```text
need/problem
  -> requirements/research
  -> proposal
  -> accepted decision when durable rationale is needed
  -> architecture/design/reference
  -> source + tests
  -> validation
  -> engineering/release
  -> operations feedback
```

Not every change requires every stage. A lower-authority artifact must never silently become production truth.

## Migration and cleanup

When reorganizing documentation:

1. inventory and classify existing docs;
2. choose one canonical home per fact;
3. move current truth first;
4. preserve accepted durable decision history;
5. keep proposed decisions with their proposal;
6. add README routers;
7. update links;
8. remove temporary or duplicate paths when their knowledge is represented canonically.

Git history is the archive. Do not maintain generic legacy/current parallel trees only for path compatibility.
