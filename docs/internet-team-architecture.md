# Internet Team Architecture

> **Status:** Design proposal; ChatGPT GitHub terminal capability validated on 2026-09-08
> **Scope:** Target architecture for evolving `@tsuuanmi/internet` from browser-backed ChatGPT/Gemini tools into a general-purpose, artifact-coordinated Internet Team runtime.
>
> This document intentionally describes a target architecture rather than current implemented behavior. Existing implementation details remain documented separately in `docs/how-it-works.md`.
>
> **Validated capability update:** a separate ChatGPT Website account connected to GitHub can read private repositories and perform repository writes through the GitHub integration. The validated flow includes fetching repository content, creating a branch, creating a file/commit, and opening a draft pull request against a private repository. The connected GitHub capability also exposes merge actions. Therefore, this architecture distinguishes **technical capability** from **workflow authority**: the terminal Website Agent may be technically able to merge, while Local remains the policy/approval gate for merge unless the user explicitly chooses a different policy.

---

## 1. Purpose

`@tsuuanmi/internet` already provides several useful primitives:

* browser-backed ChatGPT and Gemini conversations;
* durable native conversation state;
* ordinary website-model chat;
* provider-native Deep Research;
* multi-provider debate and synthesis through `internet_team`;
* browser/account lifecycle management;
* Git-aware local workflows.

The next step is not simply to make `internet_team` perform larger debates.

The larger opportunity is to treat authenticated website conversations as **persistent cognitive workers** behind a local DeepSeek Harness (DSH) agent.

The resulting system should support not only software development, but also:

* research;
* scientific investigation;
* design review;
* planning;
* automation;
* document production;
* external-source analysis;
* iterative experiment workflows;
* other multi-agent processes.

The architecture should exploit several properties of Website Agents:

1. Website quotas can be large and independent from the Local Agent's model quota.
2. A native website conversation can retain a large context without placing that entire context into the Local Agent's prompt.
3. Multiple conversations can behave as separate agents, including multiple agents from the same provider.
4. Different providers add further reasoning diversity.
5. Website Agents may be able to use capabilities such as:

   * web search;
   * GitHub repository browsing;
   * GitHub branch/file/commit/PR actions when write permission is connected;
   * GitHub merge actions when the connected account is permitted to merge;
   * plugins;
   * MCP;
   * subagents;
   * provider-native research;
   * connected services;
   * large context and long output.
6. Website-to-Website reasoning can therefore be much cheaper than moving all intermediate reasoning through Local.

The core optimization principle is:

> **Spend Website intelligence freely when it improves quality, but minimize the information that must cross into Local Agent context.**

---

# 2. Resource Model

This architecture assumes an asymmetric resource model.

## 2.1 Website resources

Website Agents generally provide:

* relatively large quotas;
* long-lived conversation context;
* long outputs;
* native search/research;
* external information access;
* multiple conversations;
* multiple providers;
* plugins/MCP/subagents;
* connected GitHub access whose effective permissions depend on the account and installation.

A capability-bearing ChatGPT Website account may therefore be able to do more than cognition. With an appropriately connected GitHub installation it can act on a repository directly, including private repositories.

These resources should be used aggressively when their expected value is high.

## 2.2 Local resources

The Local Agent provides:

* user interaction;
* authoritative workflow control;
* filesystem access;
* local/private repository access;
* shell commands;
* runtime access;
* tests and benchmarks;
* Git;
* privileged credentials or services;
* final verification;
* merge authorization / policy authority.

Local does **not** need to be the only component technically capable of merging. The terminal GitHub Agent may also possess that technical capability. What remains Local-owned by default is the decision that the concrete result is acceptable and may be merged.

Local model context and Local output tokens are comparatively valuable.

The system therefore should not optimize primarily for:

```text
minimum Website calls
```

It should optimize closer to:

```text
maximum useful verified intelligence
------------------------------------
       Local context cost
```

---

# 3. High-Level Architecture

The user interacts with exactly one coordinator:

> **The Local Agent.**

Users do not need to manage individual Website Agents.

```text
                               USER
                                |
                                v
                       +------------------+
                       |   LOCAL AGENT    |
                       |                  |
                       | user interface   |
                       | orchestrator     |
                       | task authority   |
                       | decision owner   |
                       | verifier         |
                       | merge policy gate|
                       +---------+--------+
                                 |
                     authoritative artifacts
                                 |
              +------------------+------------------+
              |                                     |
              v                                     v
     +----------------------+              +-----------------------+
     | WEBSITE THINKING     |              | TERMINAL GITHUB AGENT |
     | TEAM                 |              |                       |
     | ChatGPT account #1   |              | ChatGPT Website #2    |
     | Gemini account #1    |              | GitHub integration    |
     | many conversations   |              | private repo access   |
     | research             |              | branch / edit / commit|
     | plugins / MCP        |              | pull request          |
     | subagents            |              | merge-capable         |
     +----------+-----------+              +-----------+-----------+
                |                                      |
                +-------------------+------------------+
                                    |
                                    v
                                 RESULT
                            artifact / GitHub PR
                                    |
                                    v
                              LOCAL REVIEW
                                    |
                         authorize / request fix
                                    |
                      +-------------+-------------+
                      |                           |
                      v                           v
             TERMINAL MERGE                LOCAL MERGE
             (if authorized)               (if preferred)
```

The system separates three concerns:

### Control

Owned by Local.

### Cognition

Heavily delegated to Website Agents.

### Terminal action

Optionally delegated to a specialized capability-bearing Website Agent.

### Execution vs authority

A critical distinction is:

```text
technical ability to perform an action
!=
authority to decide that the action should happen
```

For example, ChatGPT Website #2 may technically be able to call a merge action, while Local still owns the default merge approval gate.

---

# 4. Local Agent

The Local Agent is the authoritative coordinator.

It is the only agent with which the user is expected to interact directly.

Its responsibilities include:

* understanding the user's objective;
* maintaining authoritative Tasks;
* maintaining authoritative Decisions;
* maintaining constraints and acceptance criteria;
* deciding when to launch Internet Team jobs;
* supplying Local/private evidence when required;
* independently verifying decision-critical claims;
* reviewing resulting code, artifacts, or actions;
* accepting or rejecting Website suggestions;
* handling privileged execution where appropriate;
* authorizing merge or other high-impact operations.

The Local Agent should be considered:

```text
control plane
+
authority
+
privileged verifier
```

It should **not** be considered:

```text
a message relay between Website Agents
```

For example, Local should not need to:

1. receive a 20,000-character ChatGPT analysis;
2. receive a 20,000-character Gemini analysis;
3. summarize them;
4. paste the summary into another ChatGPT conversation.

That communication should remain inside the Internet runtime.

The same rule applies to implementation handoff: Local should not need to read and retype an update-ready plan merely so a GitHub-capable terminal Website Agent can act on it.

---

# 5. Website Agents

A Website Agent is conceptually:

```text
provider
+
account
+
conversation identity
+
conversation history
+
role
+
available website capabilities
```

A conversation is therefore not merely a single tool call.

It is a **persistent cognitive worker**.

Examples include:

```text
ChatGPT / architect
ChatGPT / bug-hunter
ChatGPT / scientific-research
Gemini / test-reviewer
Gemini / skeptic
Gemini / external-research
ChatGPT Website #2 / GitHub terminal writer
```

Multiple conversations from the same provider are useful because they can have:

* different roles;
* different histories;
* different prompts;
* different assumptions;
* different search paths.

Different **accounts** may additionally expose different connected capabilities and security boundaries.

Reasoning diversity should therefore be modeled as:

```text
provider
x account
x conversation
x role
x prompt
x available tools
```

rather than simply:

```text
ChatGPT vs Gemini
```

---

# 6. Website Thinking Team

The Website Thinking Team performs expensive or broad cognition.

Possible responsibilities include:

* broad repository inspection;
* architecture analysis;
* root-cause analysis;
* current web research;
* academic or scientific research;
* reading related repositories;
* reviewing upstream issues;
* comparing implementation strategies;
* checking documentation;
* adversarial review;
* security review;
* test design;
* investigating external dependencies;
* using plugins;
* using MCP;
* calling subagents;
* provider-native research.

Website Thinking Agents are advisory.

They can:

```text
observe
reason
suggest
challenge
request changes
```

They should not silently alter authoritative Tasks or Decisions.

A write-capable terminal Website Agent is intentionally a different role from these thinking workers.

---

# 7. Terminal Agent

A Terminal Agent is a special final member of an Internet Team job.

Its purpose is to turn Website cognition into a concrete result.

Different workflows can have different terminal agents.

Examples:

| Workflow      | Terminal Agent          |
| ------------- | ----------------------- |
| Coding        | GitHub PR writer        |
| Research      | report synthesizer      |
| Automation    | action planner/executor |
| Documentation | document writer         |
| Review        | final judge             |

For the coding workflow described in this architecture, the intended terminal agent is:

> **ChatGPT Website account #2 with the GitHub integration connected for repository write operations.**

`Work` can still be useful when a task benefits from a longer cloud-computer workflow, but it is **not a prerequisite** for the GitHub branch/edit/commit/PR path described here. The GitHub integration itself has been validated to perform the required repository mutations.

This account is separate from the normal Website Thinking account.

## 7.1 Validated GitHub operation path

The following end-to-end path has been validated against a private repository:

```text
fetch repository / file
        |
        v
create branch
        |
        v
create or update file
        |
        v
commit
        |
        v
create draft pull request
```

The connected GitHub capability also exposes operations for:

* updating a PR;
* reviewing/commenting on a PR;
* reading CI/repository state;
* merging a pull request when permissions allow it.

This removes the earlier assumption that the coding terminal necessarily needs a separate Work-mode implementation path.

---

# 8. Writer Account Security Boundary

The coding setup intentionally uses separate accounts.

Example:

```text
ChatGPT Account #1
  research / reasoning / review
  GitHub read access where available

Gemini Account #1
  research / reasoning / review
  GitHub read access where available

ChatGPT Website Account #2
  GitHub integration
  repository read/write
  private repository access
  branch creation
  file updates / commits
  PR creation and updates
  merge-capable

Local Agent
  local/private access
  final review
  authoritative merge approval
```

This separation is important.

Conversation identity alone should not be treated as the security boundary.

The boundary is:

```text
account
+
connected capabilities
+
GitHub installation scope
+
workflow policy
```

## 8.1 Repository scope

GitHub installations may be configured for either selected repositories or all repositories.

The validated account is capable of operating with an `All repositories` installation. That is useful for a general terminal writer, but it means repository isolation can no longer rely only on the GitHub installation scope.

When `All repositories` is used, the runtime must enforce a task-scoped target such as:

```text
allowed_repository = owner/repo from the authoritative job
allowed_base       = expected base branch / revision
allowed_action     = implementation / PR for that job
```

For deployments that do not need cross-repository terminal work, selected-repository installation remains the stronger least-privilege option.

## 8.2 Merge capability is not merge authority

The terminal account may technically be able to merge.

That does **not** mean it should merge automatically.

Default policy:

```text
Terminal GitHub Agent
    may create/update PR
    may prepare merge
    must not merge without explicit authorization

Local
    reviews concrete result
    authorizes or rejects merge
```

After authorization, either:

1. Local performs the merge; or
2. the terminal GitHub Agent executes the merge on Local's behalf.

The important separation is therefore not necessarily separate credentials for `WRITE` and `MERGE`.

It is:

```text
Thinking Agents
    THINK

Terminal GitHub Agent
    WRITE / PR
    MERGE only when authorized

Local
    APPROVE / REJECT
```

The writer should still not automatically receive or use unrelated high-impact capabilities such as:

* repository administration;
* secret-management permissions;
* production deployment;
* release authority.

---

# 9. Artifact-Based Coordination

Conversation history should not be the source of truth.

Important shared state should be externalized into artifacts.

The initial implementation should stay lightweight and docs-native.

For example:

```text
.agent/
├── STATE.md
├── TASKS.md
├── DECISIONS.md
├── FINDINGS.md
├── REQUESTS.md
├── NOTES/
└── HANDOFFS/
```

The exact paths can change later.

The important architecture is that artifacts provide:

* shared state;
* stable references;
* agent-to-agent communication;
* Local authority;
* Website visibility;
* low-token handoff;
* future documentation history.

---

# 10. Artifact Authority

Not every artifact has the same authority.

## 10.1 Authoritative artifacts

Local owns authoritative updates to:

* Tasks;
* Decisions;
* accepted requirements;
* important constraints;
* acceptance criteria;
* final workflow state.

Website Agents can read these artifacts.

They may propose changes, but they do not silently mutate authoritative state.

A terminal GitHub Agent may write repository files as part of an approved implementation without gaining authority to redefine these artifacts semantically.

## 10.2 Advisory artifacts

Website Agents can create:

* Findings;
* research notes;
* evidence;
* review results;
* Requests;
* suggestions.

These are inputs to Local judgment.

---

# 11. Tasks

Task management belongs to Local.

This is necessary because:

* many Website Agents may exist simultaneously;
* individual Website Agents are not the authoritative system coordinator;
* only Local sees the full user interaction;
* Local may also know private/local constraints.

However, Tasks must be shared through artifacts so Website Agents know what the system is currently trying to accomplish.

The initial Task lifecycle should remain simple.

For example:

```text
TODO
DOING
BLOCKED
DONE
```

or simply:

```text
Active
Blocked
Done
```

A sophisticated task workflow engine is not required initially.

The priority is:

> **clear communication before complex lifecycle automation.**

---

# 12. Decisions

Decisions also belong to Local authority.

A simple Decision can contain:

```markdown
## D-007 — Use locus-aware NUMT filtering

Status: accepted

Related Task:
T-014

Context:
...

Decision:
...

Rationale:
...

Alternatives:
...

Evidence:
- F-021
- F-024
```

All Website Agents can read `D-007`.

If a Website Agent disagrees, it should not overwrite the decision.

Instead it creates a Request.

---

# 13. Requests

Requests are the mechanism through which Website Agents propose authoritative changes.

Example:

```markdown
## R-034 — Reconsider D-007

Target:
D-007

Reason:
F-029 contradicts the assumption that known NUMT loci
are sufficient.

Suggested change:
Include alignment ambiguity rather than relying only
on a fixed known-locus list.
```

Local may:

```text
accept
reject
modify
```

If accepted, Local updates the authoritative Decision.

This makes permissions very clear:

```text
Website:
    propose

Local:
    commit authoritative state
```

---

# 14. Findings

Findings should be concrete and evidence-oriented.

For coding:

```markdown
## F-021 — Snapshot revision can become stale

Repository:
owner/repository

Revision:
abc123

Path:
src/browser/runtime.ts

Symbol:
commitSnapshot

Confidence:
high

Observation:
The commit path can use a revision captured before
a later provider refresh.

Local proof obligation:
Verify whether another caller can commit the same
snapshot after the newer revision is installed.
```

A useful distinction is:

```text
Website Finding != Truth
```

It is:

```text
candidate evidence
```

until appropriate verification occurs.

---

# 15. Stable Artifact References

Stable IDs make communication cheap.

Initially:

```text
T-* = Task
D-* = Decision
F-* = Finding
R-* = Request
```

Then agents can communicate using:

```text
Review T-014 against D-007 and D-011
using F-021 and F-024.
```

instead of repeatedly embedding full history.

More artifact types should only be introduced when actual usage requires them.

---

# 16. Working Artifacts vs Persistent Documentation

Artifacts are initially short-term working documents.

They can contain:

* hypotheses;
* current decisions;
* temporary conclusions;
* research notes;
* open questions;
* implementation ideas;
* review findings.

They are not automatically permanent project documentation.

The knowledge lifecycle is:

```text
conversation
    |
    v
working artifact
    |
    v
review / validation / refinement
    |
    v
stable knowledge
    |
    v
persistent documentation
```

Persistent documentation can include:

| Stable knowledge            | Long-term document             |
| --------------------------- | ------------------------------ |
| architecture decision       | ADR                            |
| requirement                 | SRS                            |
| design                      | Design document                |
| scientific findings         | Research report                |
| operational procedure       | Runbook                        |
| repeated failure resolution | Troubleshooting guide          |
| security reasoning          | Threat model / security design |
| API contract                | API specification              |

Promotion should be based on:

> **knowledge stability**

rather than merely:

> task completion.

One Task may create no long-term document.

Another may update:

* an ADR;
* an SRS;
* a design document;
* a research report.

---

# 17. Conversation, Artifact, and Persistent Memory

The architecture therefore has three memory levels.

```text
Conversation
    =
ephemeral cognitive memory

Working Artifact
    =
shared short-term project memory

Persistent Documentation
    =
durable organizational/project memory
```

This prevents the project from depending permanently on a provider-specific conversation.

---

# 18. The Local Context Boundary

Local context should be treated as a narrow, high-value communication bus.

Suppose a team produces:

```text
ChatGPT architecture analysis    15K
Gemini review                    15K
Deep Research                    30K
security critique                10K
team debate                      20K
```

There is no reason for all 90K of intermediate material to enter Local context.

Instead:

```text
Website workers
      |
      v
internal synthesis
      |
      v
compact artifact
      |
      v
Local
```

This boundary acts as a:

> **Token Firewall**

The important optimization is not to prevent Website Agents from thinking extensively.

It is to prevent unnecessary reasoning from crossing the boundary.

---

# 19. Progressive Disclosure

Website Agents should retain detail remotely and expose it only when Local needs it.

Example result:

```text
Recommendation:
Move snapshot commit ownership into BrowserManager.

Evidence:
F-021
F-024
F-031

Local verification:
V1
V2
V3
```

If Local needs more detail:

```text
Expand F-031 with the exact caller chain.
```

Only that information enters Local context.

This is preferable to returning an entire research report by default.

---

# 20. Proof Obligations

Website reasoning should make Local verification inexpensive.

Instead of only:

```text
Recommendation:
Change X.
```

prefer:

```text
Recommendation:
Change X.

Proof obligations:
V1. Confirm no external caller depends on the old behavior.
V2. Confirm research() uses the same lifecycle.
V3. Confirm persisted state remains monotonic.
```

Local can then perform targeted verification.

This preserves independent judgment without requiring Local to repeat the entire investigation.

---

# 21. Asymmetric Code Reading

Both Website and Local may read source code.

They should not perform identical exploration.

## Website: breadth-first

Website Agents should handle broad inspection where possible:

* repository structure;
* architecture;
* many files;
* external repositories;
* current documentation;
* issues;
* dependencies;
* academic literature;
* upstream implementations.

A GitHub-connected Website Agent can additionally inspect private repositories that the connected installation is allowed to access.

## Local: decision-focused

Local should read what it needs to retain independent technical judgment:

* critical files;
* changed symbols;
* important callers;
* high-risk boundaries;
* private/local-only code that Website cannot access;
* final diff;
* code necessary to verify external claims.

## Runtime: empirical verification

Runtime evidence includes:

* tests;
* build output;
* benchmarks;
* logs;
* integration behavior.

The three-layer model is:

```text
Website
    broad semantic analysis

Local
    targeted independent verification

Runtime
    empirical truth
```

---

# 22. Private Repositories

Private repository access is now a **capability-routing question**, not a fundamental architectural limitation.

A Website Agent's access depends on:

```text
provider account
+
connected GitHub installation
+
repository selection
+
repository permissions
```

The ChatGPT terminal account has been validated to fetch from and write to a private repository through the GitHub integration.

Therefore, when the target repository is private:

1. route the job to an account whose GitHub installation can access that repository; or
2. if no Website account has access, Local supplies a compact sanitized Code Evidence Packet.

The fallback packet can contain only relevant material:

```text
objective
relevant symbols
caller relationships
selected implementation
tests
diff summary
runtime behavior
questions
```

Local should avoid copying an entire private repository into Website context when a smaller evidence packet is sufficient.

Private access should never be assumed merely because another account can access the same repository. Capability routing must be explicit.

---

# 23. Internet Team Strategies

The existing `internet_team` is an ordered debate followed by optional synthesis.

That should become one strategy among several.

## Parallel

```text
       TASK
     /  |  \
    A   B   C
```

Agents work independently.

Useful for:

* bug discovery;
* independent review;
* brainstorming;
* competing hypotheses.

## Specialists

```text
architecture
tests
security
research
     \  |  /
    synthesis
```

Each agent receives a distinct role.

## Review

```text
proposal
   |
   v
critic
   |
   v
response
```

## Debate

```text
A -> B -> A -> B -> synthesis
```

This resembles the current implementation.

## Red Team

```text
builder
   |
   v
attacker
   |
   v
rebuttal
   |
   v
judge
```

Useful for:

* security;
* authentication;
* persistence;
* migrations;
* high-impact architecture.

The runtime should choose a strategy based on the task rather than applying multi-round debate everywhere.

---

# 24. Local Manages Jobs, Not Workers

Local should not spend context tracking every agent interaction.

Avoid:

```text
Local:
spawn A
read A
spawn B
copy A to B
ask C
merge B + C
```

Prefer:

```text
Local:
launch job "validate architecture X"
```

Inside the job, the Internet Team runtime can decide to use:

* ChatGPT;
* Gemini;
* multiple conversations;
* research;
* plugins;
* MCP;
* subagents;
* specialist roles;
* a capability-bearing GitHub terminal agent.

The separation is:

```text
Local
    job-level orchestration

Internet Team
    worker-level cognition and terminal routing
```

Task authority still remains Local.

---

# 25. Direct Team-to-Terminal Handoff

This is one of the most important design decisions.

After Website Team reasoning completes, the result should **not** necessarily return to Local first.

For coding:

```text
Local
  |
  | Task / Decisions / constraints
  v
Internet Team
  |
  | research
  | debate
  | review
  | convergence
  v
ChatGPT Website #2
Terminal GitHub Agent
  |
  | inspect repository
  | implementation
  | validation
  | branch / commit / PR
  v
GitHub PR
  |
  v
Local review / merge authorization
```

Local does not need to act as:

```text
Team -> Local -> Writer
```

message transport.

Instead:

```text
Team -> Writer
```

can happen internally.

Local retains authority without participating in every handoff.

---

# 26. Terminal Agent as the Final Team Member

Conceptually, the Terminal Agent generalizes the existing final synthesis step.

Current pattern:

```text
worker
worker
worker
    |
    v
final synthesis agent
```

Target coding pattern:

```text
research worker
architecture worker
review worker
      |
      v
Terminal GitHub Agent
      |
      +-- synthesize implementation intent
      +-- inspect current repository
      +-- modify code
      +-- validate where possible
      +-- create/update PR
      +-- merge only after authorization
```

The terminal agent is therefore a:

> **capability-bearing final team member**

rather than an unrelated downstream system.

---

# 27. Update-Ready Handoff

The Website Team should give the terminal writer an **update-ready** result.

This handoff can be ephemeral.

It does not need to enter Local context.

A useful logical structure is:

```text
Objective

Repository
Base revision

Authoritative Tasks

Authoritative Decisions

Root cause

Required behavior

Likely files/symbols

Required changes

Required deletions

Required tests

Behavior that must remain unchanged

Known risks

Acceptance criteria

Validation commands

Open blockers
```

The important property is:

> **The writer should not need to repeat the broad reasoning performed by the Website Team.**

For GitHub-connected terminal execution, the handoff should also include the exact target repository and base branch/revision so broad GitHub access cannot accidentally select a different repository.

---

# 28. Writer Scope

ChatGPT Website #2 should not behave as an unconstrained autonomous architect.

Its job is closer to:

> **implementation translator / PR applicator**

The Website Team performs most high-level reasoning.

The writer:

1. reads the update-ready handoff;
2. confirms the target repository and base revision;
3. inspects the relevant current code;
4. resolves small implementation details;
5. implements;
6. validates as far as its execution environment permits;
7. creates or updates the PR;
8. executes merge only after explicit authorization if the workflow delegates merge execution to it.

The writer should avoid:

* redesigning architecture unnecessarily;
* reopening settled product requirements;
* expanding scope;
* replacing accepted Decisions silently;
* touching repositories outside the authoritative job target;
* merging its own result before the configured review/approval gate.

---

# 29. Writer Blockers

If implementation conflicts with authoritative intent, the writer should not invent a new Decision.

Example:

```text
BLOCKED

Expected:
The update-ready handoff assumes foo() owns lifecycle X.

Observed:
At revision abc123, foo() no longer exists.
bar() owns this path.

Request:
Confirm whether D-018 should apply to bar()
or revise the Decision.
```

This becomes a Request.

The Website Team can investigate the blocker.

If an authoritative change is necessary:

```text
Website Team
    |
    v
R-041
    |
    v
Local
    |
    +-- accept
    +-- reject
    +-- modify
```

After Local updates Task/Decision state, the job resumes.

Local is therefore involved when **authority** is needed, not simply when information is being transported.

---

# 30. Local Gates

A normal coding workflow can have two primary Local gates.

## Gate 1 — Intent

Before launching the job, Local establishes:

* Task;
* Decisions;
* constraints;
* acceptance criteria;
* target repository;
* expected base branch/revision.

## Gate 2 — Concrete Result

After implementation, Local reviews:

* PR;
* Task compliance;
* Decision compliance;
* critical diff;
* test/CI evidence;
* unresolved findings;
* high-risk code.

Then Local decides whether to:

```text
authorize merge
request fixes
reject
escalate
```

If merge is authorized, execution can be performed either by Local or by the merge-capable terminal GitHub Agent.

High-risk work can add an optional intermediate plan gate.

But Local should not be forced into every intermediate reasoning turn.

---

# 31. Pull Request as a Shared Artifact

Once the writer creates a PR, the PR becomes one of the best shared artifacts available.

It provides:

* exact base;
* exact head;
* diff;
* changed files;
* commits;
* CI;
* comments;
* review discussions;
* remediation history.

This means reviewers do not need Local to paste code.

The workflow can become:

```text
Website Team
     |
     v
Terminal GitHub Writer
     |
     v
GitHub PR
   /   |    \
  /    |     \
ChatGPT Gemini Local
review   review review
   \      |    /
       findings
          |
          v
      Writer fixes
          |
          v
      updated PR
          |
          v
   Local merge approval
          |
          v
 terminal/local merge
```

---

# 32. PR-Centric Local Review

Local should not re-read the whole repository after Website Agents already performed broad analysis.

Local review should be risk-based.

For a low-risk PR:

```text
Task compliance
Decision compliance
critical diff
tests
CI
review findings
```

may be sufficient.

For:

* authentication;
* authorization;
* security;
* persistence;
* concurrency;
* migrations;
* cross-cutting state;

Local should inspect more deeply.

The goal is:

> **independent verification without duplicated broad exploration.**

---

# 33. Read-Only Website Reviewers

After PR creation, read-only Website Agents can independently review the actual implementation.

For example:

```text
ChatGPT Account #1
    independent PR review

Gemini Account #1
    independent PR review
```

Their findings may be consolidated before Local sees them.

A useful result:

```text
PASS
```

or:

```text
NEEDS_FIX

Major:
F-044

Minor:
F-045

Unverified:
F-046
```

Local can verify only material findings.

Confirmed fixes can go directly back to the writer.

The writer's merge capability does not weaken reviewer independence because merge remains gated by explicit policy authorization.

---

# 34. Research and Coding Form a Feedback Loop

The architecture should support iterative reasoning.

The desired workflow is not:

```text
research
  ->
implementation
  ->
done
```

It is:

```text
Website research
       |
       v
implementation
       |
       v
tests / benchmark
       |
       v
new empirical evidence
       |
       v
Website re-evaluation
       |
       v
feedback
       |
       v
next implementation
```

This is particularly useful in:

* scientific software;
* performance work;
* data pipelines;
* model evaluation;
* algorithms;
* uncertain engineering work.

Persistent Website Agents can continue the same investigation without requiring Local to re-send all previous research.

---

# 35. Local-to-Website Evidence Packets

The communication boundary works in both directions.

Local should send the minimum Local-only information required by Website reasoning.

Example:

```text
Task:
T-014

Revision:
def456

Observed benchmark:
precision +4.1%
recall -0.8%
runtime +12%

Questions:
1. Is this tradeoff expected?
2. Does the result contradict the current methodology?
3. What experiment should run next?
```

Do not forward complete logs or terminal history unless needed.

If the Website account already has repository access, do not duplicate repository content into the packet merely to transport it.

---

# 36. Revision-Aware Review

Repository-related jobs should be revision-aware.

Website Agents should distinguish:

```text
requested_revision
observed_revision
access_state
```

Possible states:

```text
verified
unavailable
revision_mismatch
uncertain
```

A reviewer that cannot inspect the requested revision should not represent its conclusions as verified observations.

This becomes especially important when:

* Team reasoning happens at one SHA;
* the Terminal GitHub Agent implements later;
* upstream changes in between.

Before writing, the terminal agent should confirm that the observed base is compatible with the update-ready handoff. Before merging, the workflow should re-evaluate if the PR/base changed materially after review.

---

# 37. General-Purpose Terminal Agents

The architecture must not become coding-specific.

The generalized pattern is:

```text
workers
    |
    v
terminal agent
    |
    v
external result
```

Coding:

```text
workers -> GitHub PR writer -> PR
```

Research:

```text
workers -> report writer -> report
```

Automation:

```text
workers -> action executor -> result
```

Documentation:

```text
workers -> document synthesizer -> document
```

---

# 38. Research Workflow

Example:

```text
USER
  |
  v
LOCAL
define research objective
  |
  v
Website Research Team
  |
  +-- literature researcher
  +-- web/current-source researcher
  +-- skeptic
  +-- domain specialist
  |
  v
research synthesis
  |
  v
LOCAL/private analysis if needed
  |
  v
Website critique
  |
  v
final result
  |
  v
persistent research documentation
```

---

# 39. Automation Workflow

Example:

```text
USER
  |
  v
LOCAL
authoritative objective
  |
  v
Website Team
research / plan
  |
  v
Action Request
  |
  v
Local or specialized executor
perform privileged action
  |
  v
Result Evidence
  |
  v
Website evaluates outcome
  |
  v
next step
```

The same Task / Decision / Finding / Request model applies.

The GitHub terminal writer is one example of a specialized executor whose technical permissions may be broader than its policy authority.

---

# 40. Scientific Workflow

Example:

```text
hypothesis
    |
    v
Website research
    |
    v
Local experiment / implementation
    |
    v
empirical result
    |
    v
Website interpretation
    |
    v
new hypothesis or implementation
```

This loop may repeat many times.

---

# 41. Current `internet_team` vs Target Runtime

Current `internet_team` roughly implements:

```text
for each round:
    provider A
    provider B

optional:
    last provider synthesizes transcript
```

This remains useful.

But it should become one primitive inside a larger system.

Target model:

```text
Local Job
   |
   v
workers
   |
   +-- parallel
   +-- specialists
   +-- review
   +-- debate
   +-- red-team
   |
   v
terminal
   |
   v
external result
```

For coding, terminal capability routing should prefer the known GitHub-connected ChatGPT account when the job requires repository mutation.

---

# 42. Potential Future Primitives

These should be treated as design targets, not necessarily immediate implementation requirements.

## Persistent Agent

```text
create
resume
message
extract
```

A provider conversation becomes an addressable worker.

## Internet Job

Example conceptual API:

```json
{
  "objective": "Validate and implement T-014",
  "repository": "owner/repository",
  "base_revision": "abc123",
  "artifacts": [
    "T-014",
    "D-007",
    "D-011"
  ],
  "strategy": "specialists",
  "terminal": "github-pr-writer",
  "merge_policy": "local-approval-required"
}
```

Local does not need to know whether the runtime internally uses two agents or twelve.

The runtime does need to know which account has the required GitHub capability and which repository the job authorizes.

## Extract

Query a large remote context without returning all of it:

```text
Extract:
Only the three findings that can change the implementation.

Max output:
2000 characters.
```

## Request Local Evidence

Example:

```json
{
  "state": "needs_local_evidence",
  "requests": [
    {
      "id": "L1",
      "question": "Does the unpushed branch still call the legacy API?",
      "reason": "This determines whether D-011 remains valid."
    }
  ]
}
```

Local provides only the relevant evidence.

## Request Merge Authorization

A terminal GitHub Agent that has completed implementation can emit a compact authorization request:

```json
{
  "state": "awaiting_merge_authorization",
  "repository": "owner/repository",
  "pr": 123,
  "head": "def456",
  "checks": "pass",
  "unresolved_material_findings": 0
}
```

After Local authorizes, the runtime may ask the same terminal account to execute the merge.

---

# 43. Escalation to Local

Website jobs should return to Local when authority is required.

Examples:

* Task must change;
* Decision must change;
* user input is necessary;
* private evidence is required and no capable Website account can read it;
* privileged action requires approval;
* terminal agent cannot implement safely;
* unresolved high-risk issue remains;
* merge authorization or release authorization is required.

Do not escalate merely because two Website Agents disagree.

The Website Team can:

* debate;
* add another reviewer;
* search for evidence;
* use another provider.

Escalate when the disagreement affects authoritative state or cannot be resolved safely.

After Local grants merge authorization, the terminal GitHub Agent can execute the already-authorized action without turning Local into a transport layer.

---

# 44. Review Independence

Persistent agents are valuable for long context.

But persistent context can also introduce anchoring.

The runtime should support both:

### Persistent specialists

Examples:

```text
architecture agent
research agent
domain expert
```

These may stay throughout the task.

### Fresh auditors

Examples:

```text
fresh PR reviewer
fresh security reviewer
fresh final judge
```

A fresh reviewer should not automatically inherit the reasoning that produced the implementation.

This provides stronger independent verification.

The terminal writer should not be treated as an independent reviewer of its own patch merely because it can inspect the PR through the same GitHub integration.

---

# 45. Compact Output Contracts

Cross-boundary outputs should prioritize information density.

A Website-to-Local result can contain:

```text
STATE

VERDICT

RECOMMENDATION

MUST_READ

PROOF_OBLIGATIONS

REQUESTS

RISKS

REFERENCES
```

A review result:

```text
PASS | NEEDS_FIX

Critical
Major
Minor
Unverified
Test gaps
```

A finding should ideally contain:

```text
severity
claim
evidence
path/symbol/source
impact
recommended action
confidence
```

A terminal PR receipt can contain:

```text
repository
base
head
PR number / URL
changed files
validation result
CI state
merge state
```

Markdown is sufficient initially.

Structured schemas can be introduced later.

---

# 46. Observability

The architecture should eventually measure more than number of Website calls.

Useful metrics include:

* Website turns per job;
* provider usage;
* Local-visible characters;
* raw vs compact output;
* findings generated;
* findings deduplicated;
* findings accepted/rejected;
* Local proof obligations;
* reviewer findings confirmed locally;
* PR remediation rounds;
* provider failures;
* research time;
* implementation time;
* review time;
* terminal GitHub write actions;
* merge authorization requests;
* merge executions and executor identity.

A useful optimization metric is:

```text
verified useful information
---------------------------
    Local context used
```

---

# 47. Security Principles

The system should follow these defaults:

1. Thinking accounts are read-only where practical.
2. Writer account is separate from ordinary thinking accounts.
3. Prefer selected-repository GitHub installations when practical; `All repositories` is acceptable only when intentionally required for a general writer and must be paired with explicit task-scoped repository checks.
4. Treat GitHub installation scope as a capability boundary, not the sole policy boundary.
5. A merge-capable writer must not merge by default; merge requires an explicit authorization gate.
6. Shared artifacts contain no secrets.
7. Private evidence is sanitized before Website handoff when the Website account cannot read it directly.
8. Repository and revision are explicit for every repository-mutating job.
9. Observation and inference are distinguished.
10. Task/Decision authority remains Local.
11. Production or other high-impact operations remain behind separate privileged gates.

Never persist in shared artifacts:

* passwords;
* access tokens;
* browser cookies;
* session bearer credentials;
* private authentication state.

For broad GitHub installations, add a runtime invariant:

```text
never mutate a repository that is not the authoritative target of the active job
```

---

# 48. Design Principles

## Local-First User Interaction

The user communicates with Local.

## Local Authority Without Micromanagement

Local controls Task and Decision state without reading every Website message.

## Artifact-Based Shared Memory

Important state lives outside provider conversations.

## Website-Heavy Cognition

Exploit Website quotas, search, context, plugins, MCP, subagents, and connected services.

## Capability-Aware Website Action

Treat connected GitHub permissions as first-class routing capabilities. A Website Agent may be a reader, writer, PR operator, or merge executor depending on its connected account.

## Narrow Local Context

Return only what Local needs.

## Direct Team-to-Terminal Handoff

Do not force Local to relay Website synthesis to the writer.

## Targeted Independent Local Verification

Local verifies critical claims and concrete outcomes.

## Empirical Feedback

Tests and benchmarks feed back into reasoning.

## Least Privilege and Explicit Authority

Prefer narrow technical permissions, but do not confuse technical capability with decision authority. If one GitHub account is technically write-and-merge capable, preserve separate policy gates for implementation and merge approval.

## Documentation Through Stabilization

Working artifacts become persistent docs only when their knowledge becomes stable.

---

# 49. Recommended Implementation Phases

The target architecture is intentionally larger than the first implementation.

It should be introduced incrementally.

## Phase A — Artifact Discipline

Highest ROI, lowest complexity.

Implement conventions for:

* Task;
* Decision;
* Finding;
* Request;
* stable IDs;
* proof obligations;
* compact Website outputs.

Keep raw transcripts opt-in.

---

## Phase B — Team Strategies

Generalize `internet_team` beyond fixed debate.

Add concepts such as:

```text
parallel
specialists
review
debate
red-team
```

Support Website-side synthesis without exposing every worker output to Local.

---

## Phase C — Persistent Website Agents

Treat named conversations as explicit worker identities.

Support:

```text
create/resume
message
extract
role
```

Improve conversation namespace management.

---

## Phase D — Terminal GitHub Agent

The underlying ChatGPT Website GitHub capability is now validated.

The remaining implementation work is primarily runtime integration and reliable handoff, not proving that repository writes are possible.

Implement:

```text
Website Team
    ->
update-ready handoff
    ->
ChatGPT Website #2 / GitHub terminal
    ->
branch + commit + PR
```

Add explicit job fields for:

* target repository;
* base revision;
* allowed action scope;
* merge policy.

Return only a compact receipt to Local.

---

## Phase E — Review Loop

After PR creation:

```text
PR
  -> ChatGPT reviewer
  -> Gemini reviewer
  -> consolidated findings
  -> writer remediation
  -> Local approval gate
```

Only unresolved or material issues should reach Local.

If Local authorizes merge, the terminal GitHub account may execute it.

---

## Phase F — Internet Job Runtime

Introduce first-class jobs:

```text
objective
repository
base_revision
artifacts
strategy
workers
terminal
merge_policy
state
```

Add:

* capability-aware routing;
* repository-target enforcement;
* local evidence requests;
* compact extraction;
* merge authorization state;
* observability;
* ROI metrics.

---

## Phase G — Persistent Documentation Promotion

Add conventions or tooling for promoting stable knowledge into:

* ADR;
* SRS;
* design docs;
* research reports;
* runbooks;
* troubleshooting docs;
* security documents.

---

# 50. Reference Coding Workflow

The target happy path is:

```text
USER
  |
  v
LOCAL
  understand objective
  update Task / Decisions
  select target repository + revision
  launch Internet job
  |
  v
WEBSITE THINKING TEAM
  ChatGPT #1
  Gemini #1
  specialists
  plugins / MCP / subagents
  repository analysis
  research
  critique
  convergence
  |
  v
INTERNAL UPDATE-READY HANDOFF
  |
  v
CHATGPT WEBSITE #2
  terminal GitHub agent
  verify target repository / base
  inspect relevant current code
  create branch
  implement
  validate where possible
  commit
  create/update PR
  |
  v
GITHUB PR
  |
  +------> ChatGPT #1 independent review
  |
  +------> Gemini #1 independent review
  |
  v
LOCAL
  targeted review
  verify Task compliance
  verify Decision compliance
  inspect critical/high-risk diff
  inspect test / CI evidence
  |
  +------> request remediation
  |            |
  |            v
  |       Website #2 updates PR
  |
  v
AUTHORIZE MERGE
  |
  +------> Terminal GitHub Agent executes merge
  |              or
  +------> Local executes merge
  |
  v
PROMOTE STABLE KNOWLEDGE
ADR / SRS / Design / Research / Runbook
```

The key improvement over the earlier design is that no mandatory Work-mode hop is required to obtain repository mutation capability. The GitHub-connected Website account can itself be the terminal PR agent.

---

# 51. Exception Workflow

If the Website Team or writer discovers that authoritative intent is invalid:

```text
Team / Writer
    |
    v
Request R-*
    |
    v
Local
    |
    +-- reject
    |
    +-- modify
    |
    +-- accept
          |
          v
      update T-* / D-*
          |
          v
      resume Internet Job
```

If implementation is correct but merge is not yet authorized:

```text
Terminal GitHub Agent
    |
    v
awaiting_merge_authorization
    |
    v
Local
    |
    +-- authorize -> execute merge
    |
    +-- request fixes -> resume writer
    |
    +-- reject -> leave/close PR according to policy
```

Local therefore intervenes for **authority changes and approval gates**, not routine information transport.

---

# 52. Final System Model

The target division of labor is:

```text
Local Agent
  =
user-facing coordinator
+ Task authority
+ Decision authority
+ privileged verifier
+ final review
+ merge authorization gate
```

```text
Website Thinking Team
  =
distributed cognition
+ repository analysis
+ external research
+ plugins / MCP
+ subagents
+ debate
+ critique
+ long-lived remote context
```

```text
Terminal GitHub Agent
  =
ChatGPT Website account #2
+ GitHub-connected repository access
+ private repository read
+ code translation
+ branch / file mutation / commit
+ PR creation and remediation
+ validation where available
+ merge execution only when authorized
```

```text
Runtime / CI
  =
empirical evidence
```

```text
Working Artifacts
  =
shared short-term memory
+ coordination protocol
```

```text
Persistent Documentation
  =
durable project knowledge
```

The security model must explicitly distinguish:

```text
CAPABILITY
what an account can technically do

AUTHORITY
what the workflow permits it to decide/do now
```

This distinction is especially important because the terminal ChatGPT Website account may technically possess both write and merge actions.

---

# 53. Summary

The long-term purpose of `@tsuuanmi/internet` should be broader than exposing browser-backed ChatGPT and Gemini calls.

It can evolve into a distributed cognitive runtime where:

* the user interacts only with the Local Agent;
* Local owns authoritative Tasks and Decisions;
* Website conversations function as persistent cognitive workers;
* multiple conversations, accounts, and providers provide cheap parallel intelligence;
* Website Agents can leverage web search, repository access, plugins, MCP, subagents, native research, and connected services;
* a dedicated ChatGPT Website account can act as a capability-bearing GitHub terminal agent;
* private repository fetch and repository mutation are available when the connected GitHub installation permits them;
* branch creation, file updates, commits, and PR creation no longer require a mandatory Work-mode implementation hop;
* the terminal GitHub account may also be technically merge-capable;
* technical merge capability is separated from merge authorization, which remains a Local/user policy gate by default;
* important shared state is externalized into artifacts;
* Website Agents can propose Task/Decision changes but Local commits authoritative updates;
* most intermediate reasoning remains in Website context;
* Local receives compact, decision-relevant information;
* Website Agents read code broadly while Local verifies critical areas selectively;
* tests and runtime behavior provide empirical verification;
* the Website Team can hand its update-ready result directly to the separate GitHub-capable terminal agent;
* read-only Website Agents independently review the PR;
* Local performs targeted final verification and authorizes merge;
* the authorized merge can then be executed either by Local or by the terminal Website Agent;
* short-term working artifacts eventually crystallize into ADR, SRS, design documents, research reports, runbooks, and other persistent documentation.

The central architecture can be summarized as:

```text
                         USER
                          |
                          v
                    LOCAL CONTROL
                   Tasks / Decisions
                   Merge authorization
                          |
                          v
                 ARTIFACT-BASED STATE
                          |
                          v
                WEBSITE COGNITIVE TEAM
              reasoning / research / review
                          |
                          v
                TERMINAL GITHUB AGENT
           branch / edit / commit / PR / fix
                          |
                          v
                    GITHUB PR
                          |
                          v
                  LOCAL VERIFICATION
                          |
                          v
                    AUTHORIZE
                          |
                +---------+---------+
                |                   |
                v                   v
        TERMINAL MERGE          LOCAL MERGE
```

The defining principle is:

> **Local remains the coordinator and authority, while Website Agents provide a large, persistent and inexpensive cognitive layer whose internal reasoning does not need to consume Local context. A capability-specific terminal Website Agent can consume that reasoning directly and turn it into concrete GitHub work. Even when that terminal account is technically capable of both writing and merging, Local remains the default policy gate for accepting the concrete result and authorizing the merge.**
