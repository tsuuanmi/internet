# ADR-0002 — Preserve Team and Review Outputs Verbatim

- **Status:** Accepted
- **Date:** 2026-09-08

## Context

The current `internet_team` flow returns a final answer to Local. A Local agent may then summarize or reinterpret that answer before giving it to another agent.

For the target coding workflow this introduces an unnecessary transformation layer:

```text
Team result
  -> Local summary
  -> Writer
```

That layer can omit implementation details, change priorities, blur uncertainty, or otherwise create drift between what the thinking team concluded and what the writer receives.

The same problem exists after PR review if Local summarizes reviewer findings before asking the writer to remediate them.

## Decision

Final outputs from thinking teams and post-PR review teams are delivered **verbatim** to the writer account.

Local may route them, persist them, order them, and attach metadata, but must not rewrite their payload in the normal path.

For two parallel teams:

```text
Team A final output ---------------------> Writer #2
Team B final output ---------------------> Writer #2

Local only sends a later control message:
"All required team results are delivered. Begin implementation."
```

The same rule applies to review:

```text
Review Team A final output --------------> Writer #2
Review Team B final output --------------> Writer #2

Local only sends a later control message:
"All review results are delivered. Apply required fixes."
```

## Handoff envelope

Metadata may be added outside the payload:

```text
handoff_id
source_job
source_team
sequence
repository
base_revision
created_at
payload_hash
payload
```

The payload itself must remain unchanged.

Conceptual invariant:

```text
handoff.payload == source.final_output
```

For text payloads, the implementation should preserve the exact Unicode string. If serialization requires normalization, the system must document it and verify the payload hash over the canonical form.

## Delivery ordering

Parallel teams may finish in any order, but delivery to the writer should be deterministic.

Example:

```text
required_handoffs = [team-a, team-b]
received = { team-b, team-a }
writer_delivery_order = [team-a, team-b]
```

The writer must not begin implementation until all required pre-implementation handoffs are confirmed delivered.

## Separation of data and control messages

Knowledge payloads and workflow instructions are separate message classes.

### Data messages

- team final output;
- review final output;
- empirical evidence packets;
- PR metadata/receipts.

### Control messages

- start implementation;
- start review;
- apply fixes;
- retry;
- stop;
- request escalation;
- merge authorization.

This prevents Local control instructions from being mistaken for the team's technical synthesis.

## Exceptions

Local may deliberately create a new synthesis only when the workflow explicitly requests one, for example:

- conflicting team outputs need arbitration;
- user asks Local to summarize;
- an authority decision must be made before implementation can proceed.

Such a synthesis is a new artifact and must not be represented as the original team output.

## Consequences

- Writer intent fidelity improves.
- Local context use falls.
- Debugging becomes easier because the source output and delivered output can be compared directly.
- Durable handoff storage becomes a first-class runtime primitive.

## Invariant

> Routing may add metadata, but must not silently modify the reasoning payload being handed from one agent to another.
