# Documentation Lifecycle

Internet classifies documentation by authority and durability.

## Canonical / living

Current truth that changes with the system: requirements, architecture, design, reference, validation policy, engineering, operations, security, and governance.

## Historical / durable

Accepted ADRs preserve why a durable decision was made. Do not rewrite accepted history to look current; use a successor record when a decision changes materially.

## Evolutionary

Proposals and proposed ADRs describe changes under review or implementation. They do not override production behavior.

## Exploratory

Research records evidence and candidate ideas. It is non-normative until promoted.

## Promotion

```text
research -> proposal -> accepted decision when needed
        -> requirements/architecture/design/reference
        -> source + tests
        -> validation
        -> release/operations
```

Promoted content moves to its canonical home. Remove duplicate temporary text when it contains no unique durable evidence.
