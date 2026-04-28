# 📘 Decision Logging & Change Traceability Specification

**System:** Forge  
**Document Type:** Governance / Audit / Control  
**Status:** BINDING (Governance Core)  
**Applies To:** All pipeline stages (A → D)  
**Version:** 1.0

---

## 1. Purpose

This document defines a **mandatory, deterministic system** for:

- Logging all decisions taken by the pipeline
- Tracing every decision to:
  - The triggering artifact
  - The resulting change
- Enabling full audit, rollback, and accountability
- Preventing silent or undocumented behavior

This system exists to ensure that **nothing changes without a reason, and nothing happens without a trace**.

---

### 1.1 Decision Is Fork Resolution Only (Hard)

A Decision exists for ONE purpose only:
to resolve a selectable execution fork.

A Decision MUST NOT:
- Justify outcomes
- Explain failures
- Document reasoning
- Improve clarity retroactively
- Validate correctness

If no selectable fork exists,
a Decision MUST NOT be created.

Decision logs are control artifacts,
not narrative records.

---

## 2. What Qualifies as a Decision

A Decision is a **human-authoritative, execution-binding act**
that selects ONE option
among multiple valid, contract-compliant alternatives.

A Decision MUST:
- Be human-issued
- Resolve a real execution fork
- Select exactly ONE option
- Have irreversible downstream impact
- Be required to unblock execution

A Decision MUST NOT:
- Explain rationale or background
- Justify correctness
- Summarize context
- Describe implementation details
- Replace validation, verification, or enforcement

If execution does NOT require a choice
between multiple valid alternatives,
a Decision MUST NOT be logged.

---

## 2.1 Decision Authority Rule

Decision authority is strictly HUMAN.

Only a human may:
- Select an option among a valid execution fork
- Resolve ambiguity between multiple compliant paths

The pipeline orchestrator is authorized ONLY to:
- Capture the human decision
- Create the Decision artifact
- Assign the Decision ID
- Enforce decision binding on execution
- Track decision application status

Individual agents MAY:
- Detect execution forks
- Propose candidate options
- Reference existing Decision IDs

Agents MUST NOT:
- Select options
- Resolve forks
- Log decisions independently
- Continue execution past a fork without a logged Decision

Any human response has ZERO execution authority
until it is captured
as a Decision artifact
by the orchestrator.

Continuation without a Decision
after a fork is detected
is forbidden.

---

### 2.1.1 Decision Proposal vs Decision Existence (Hard Rule)

A proposed decision has ZERO authority.

A decision exists ONLY when:
- A Decision ID is assigned
- The decision file is created
- The decision status is explicitly set

Any reference to:
- “Decided”
- “Chosen”
- “Accepted”
- “Rejected”

without an existing Decision artifact
is invalid and constitutes
a silent decision violation.

---

## 2.2 What Is NOT a Decision

The following are explicitly NOT Decisions:

- Execution Abort
- Validation failure
- Boundary enforcement
- Retry exhaustion
- Error handling
- Clarification of existing intent
- Explanation or justification of behavior
- Acceptance of a deterministically correct outcome

Logging any of the above
as a Decision
constitutes authority inflation
and is a system violation.

---

## 3. What Counts as a Decision

A Decision exists ONLY when a selectable execution fork exists.

A selectable execution fork exists ONLY if ALL of the following are true:

- More than one option is valid and contract-compliant
- Each option would produce materially different downstream artifacts or behavior
- The pipeline cannot proceed deterministically without choosing exactly one option
- The choice is required to unblock execution

If these conditions are not met:
- The action MUST proceed deterministically under existing contracts
- NO Decision MUST be logged

Examples of cases that MAY be Decisions ONLY IF they form a real selectable fork:

- Selecting one approach among multiple valid approaches
- Accepting one assumption vs rejecting it (when both are valid paths)
- Skipping a step ONLY if skipping is contract-allowed and alternatives exist
- Initiating rollback ONLY if multiple rollback paths exist
- Choosing to take no action ONLY if action is optional and multiple valid paths exist

The mere fact that something "could have been done differently"
does NOT qualify as a Decision.

Only selectable, execution-unblocking forks qualify.

---

### 3.0 Alternative Evaluation Before Decision (Hard Rule)

If more than one valid, contract-compliant alternative exists,
the pipeline MUST evaluate the alternatives
against explicit objective authority
BEFORE decision escalation occurs.

This evaluation MUST:

- remain inside accepted scope
- remain bounded by declared constraints
- avoid introducing new behavior
- avoid modifying success criteria
- avoid selecting a final option autonomously

The purpose of this evaluation is ONLY to:

- compare valid alternatives
- detect tradeoffs
- disqualify constraint-violating paths
- prepare a recommendation artifact for human escalation

If explicit objective authority is missing,
alternative evaluation is forbidden
and execution MUST escalate
per the governing fail-closed contracts.

---

### 3.0.1 Cognitive Engine Configuration Fork Clarification

Changing Cognitive Engine configuration
(provider, model_id, enable/disable state)
does NOT automatically qualify as a Decision.

A Decision is REQUIRED ONLY IF:

- The change introduces a selectable execution fork, AND
- Multiple valid Cognitive Engine configurations are contract-compliant, AND
- The pipeline cannot proceed deterministically without selecting exactly one configuration.

If the configuration is:

- Mandated by contract, OR
- Deterministically derived from environment policy, OR
- The only valid compliant option

Then:

- NO Decision MUST be logged
- The change is treated as rule-driven execution

Artificially logging Cognitive Engine changes
without a real execution fork
constitutes Decision inflation
and is a governance violation.

---

### 3.1 Decision Content Minimality Rule (Hard)

A Decision file MUST contain ONLY the minimum information
required to resolve a selectable execution fork.

Mandatory fields:
- Decision ID
- Fork description
- Available options
- Selected option
- Immediate execution effect

A Decision file MUST NOT contain:
- Background context
- Narrative explanation
- Analysis or reasoning
- Risk discussion
- Quality evaluation
- Historical justification

Decision logs are execution control artifacts,
not documentation,
not analysis,
and not explanation.

If justification, reasoning, or context
is required for understanding,
it belongs in documentation,
NOT in a Decision file.

---

### 3.1.1 Recommendation Artifact Is NOT a Decision (Hard Rule)

A Recommendation Artifact is NOT a Decision.

It MAY exist only when:

- multiple valid alternatives exist
- objective-governed evaluation is required before escalation

A Recommendation Artifact MAY include:

- evaluated alternatives
- comparison against objective authority
- constraint validation results
- tradeoff analysis
- recommended option

A Recommendation Artifact MUST NOT:

- select the final option
- carry execution authority
- replace the Decision artifact
- justify execution beyond accepted scope

The Recommendation Artifact exists only
to support human decision escalation.

Final execution authority remains with the Decision artifact only.

---

### 3.2 Execution Abort Is NOT a Decision (Hard Rule)

Execution Abort MUST NOT be logged as a Decision.

If execution terminates because:
- No valid execution path exists
- No selectable alternative is available
- Boundaries are enforced without choice

Then:
- No Decision MUST be created
- No Decision ID MUST be assigned
- The termination MUST be logged as an Abort event only

Logging an Abort as a Decision
without an execution fork
is a contract violation.

---

### 3.3 Decision Is NOT Approval (Hard Rule)

A Decision does NOT:
- Approve quality
- Confirm correctness
- Validate implementation
- Certify success

A Decision ONLY:
- Resolves a selectable execution fork

Verification and validation
remain the sole authority
of Stage D (Verification).

A verified, correct, or successful outcome
that was reached deterministically
MUST NOT produce a Decision.

Using Decisions as approval signals
is strictly forbidden.

---

## 4. Decision Types

Each decision MUST be classified as one of the following:

- **ARCH** — Architectural
- **SCOPE** — Scope inclusion / exclusion
- **EXEC** — Execution strategy
- **DATA** — Data structure or schema
- **RISK** — Accepted risk
- **FIX** — Bug fix or correction
- **ROLLBACK** — Reversion or undo

A Decision MUST NOT be amended,
extended,
or reinterpreted after issuance.

If new circumstances arise
that require a different outcome:

- A NEW Decision MUST be logged
- The original Decision remains immutable
- Execution MUST reference both Decisions explicitly

Silent correction,
reinterpretation,
or retroactive adjustment
of a Decision
is strictly forbidden.

---

## 5. Decision Log Structure

All decisions are stored under the active project boundary:

<project_root>/decisions/


Each decision is a **single immutable Markdown file**.

### File Naming Convention

```

DEC-YYYYMMDD-XXX.md

```

Example:
```

DEC-20260206-004.md

```

---

### 5.0.1 Global Decision Folder Prohibition (Hard)

A global `/decisions/` directory at repository root is FORBIDDEN.

Decisions MUST exist inside the active project boundary only.

If a Decision is created outside:

- The Decision is INVALID
- Execution MUST halt
- Runtime readiness MUST FAIL

---

### 5.1 Decision Finality Rule (Hard)

A Decision file is immutable.

- Once created, it MUST NOT be edited
- It MUST NOT be reinterpreted
- It MUST NOT be overridden implicitly

Decision lifecycle rules (binding):

1) Fork detected but not yet resolved:
   - Decision MUST be logged with `Status: OPEN`

2) Human selects exactly ONE option to resolve the fork:
   - Decision MUST transition to `Status: ACCEPTED`
   - The selected option becomes execution-binding immediately

3) If the human explicitly rejects all presented options:
   - Decision MUST transition to `Status: REJECTED`
   - Execution MUST follow the owning-stage enforcement path (rollback, re-entry, or abort) as contract-governed

4) After the selected option is fully applied AND all decision-bound effects are completed:
   - The Decision MUST transition to `Status: CLOSED`

5) If a different outcome is required later (new fork or supersession):
   - A NEW Decision MUST be created (new Decision ID)
   - The OLD Decision MUST transition to `Status: SUPERSEDED`
   - The NEW Decision MUST reference the old Decision ID explicitly in `Fork` or `Triggering Artifact`
   - No silent reversal is permitted

Silent decision reversal, silent edits, or retroactive adjustment are system violations.

---

## 6. Mandatory Decision File Schema

Every decision file MUST follow this exact structure.

This schema is intentionally MINIMAL.

It contains ONLY the information required
to resolve a selectable execution fork.

No narrative sections are permitted.

```md
**Decision ID:** DEC-YYYYMMDD-XXX  
**Date:** YYYY-MM-DD  
**Workspace ID:** <string>  
**Project ID:** <string>  
**Stage:** A | B | C | D  
**Type:** ARCH | SCOPE | EXEC | DATA | RISK | FIX | ROLLBACK  
**Status:** OPEN | ACCEPTED | REJECTED | SUPERSEDED | CLOSED  

---

## Fork

A single factual statement describing:
- What execution fork exists
- What makes multiple options valid

---

## Options

A) <Option A>  
B) <Option B>  
C) <Option C>  

Rules:
- All options MUST be valid and contract-compliant
- Options MUST be mutually exclusive
- Options MUST be execution-unblocking

---

## Selected Option

<Exactly ONE: A | B | C>

---

## Immediate Execution Effect

A single factual statement describing
what MUST change immediately
as a direct result of the selected option.

---

## Triggering Artifact

The exact artifact (or failure output)
that exposed the fork.

Example:
- docs/03_pipeline/...
- verify/unit/...
- governed runtime authority artifacts
- progress/status.json

---

## Affected Artifacts

List all impacted items (paths only):

- docs/...
- code/...
- verify/...
- configs/...

---

## Linked Changes

Links to:
- Commits
- PRs
- Generated artifacts
- Tests

No additional sections are allowed.

If a Recommendation Artifact exists,
it MUST remain external to the Decision file.

Its contents MUST NOT be copied into the Decision artifact
as rationale, context, analysis, or justification.

If any additional section exists
(e.g., Context, Rationale, Consequences, Risk, Justification):

- The Decision file is INVALID
- Execution MUST halt
- The Decision MUST be regenerated

---

## 6.1 Decision Context Binding Rule (Hard)

Every Decision MUST be bound to exactly ONE project context.

Rules:

- `Workspace ID` MUST be present and non-empty.
- `Project ID` MUST be present and non-empty.
- A Decision MUST NOT apply across multiple projects.
- If workspace/project context cannot be resolved deterministically:
  - Execution MUST enter BLOCKED
  - A single blocking question MUST request the missing identifier(s)

In v1 (Personal Local Mode):

- `Workspace ID` MAY be a stable constant (e.g., `personal`)
- `Project ID` MUST still be explicitly declared
- The context MAY be implicit at runtime, but MUST be explicit inside the Decision artifact.

---

## 7. Change Traceability Rules

1. **Decision-Bound Changes MUST Reference a Decision**

   Any change that originates from
   a human-authoritative execution fork
   MUST reference a Decision ID.

   Rule-driven, deterministic changes
   that are fully mandated by existing contracts
   MUST NOT be associated with a Decision.

2. **Bidirectional Trace (When a Decision Exists)**

   When a Decision exists:

   - Decision → MUST list all affected artifacts
   - Affected artifacts or commit messages → MUST reference the Decision ID

3. **One Primary Decision per Change Set**

   - Multiple artifacts MAY map to one Decision
   - One change set MUST NOT map to multiple Decisions

4. **Prohibition of Artificial Decision Coupling (Hard Rule)**

   The pipeline MUST NOT:
   - Invent Decisions to justify mandatory changes
   - Attach Decision IDs to forced or deterministic behavior
   - Inflate decision count for traceability convenience

   Changes that do not originate from a selectable execution fork
   MUST proceed WITHOUT decision logging.

Decision traceability exists to control authority,
not to narrate execution.

---

### 7.1 Pre-Decision Recommendation Trace Rule

If a Recommendation Artifact exists before a Decision:

- the Recommendation Artifact MUST reference the triggering artifact(s)
- the resulting Decision MUST reference the same execution fork
- the Recommendation Artifact MUST NOT be treated as a Decision substitute

Recommendation traceability is analytical only.

Decision traceability remains the sole authority-binding trace
for human-selected execution forks.

---

## 7.1 Decision-to-Stage Exit Binding (Hard Rule)

A pipeline stage MUST NOT close if:

- A required Decision is not logged
- A logged Decision is still OPEN
- A Decision's effects are not fully applied

Conversely:

- No Decision may be logged
  without being bound to a specific stage

Decision logging and stage exit
are atomically coupled.

Breaking this coupling
is a system violation.

---

## 8. Decision Finality & Supersession

Decisions are immutable once ACCEPTED.

They may NEVER be edited, reworded,
or partially modified.

If a decision must be changed:
- A new Decision MUST be created
- The new Decision MUST explicitly SUPERSEDE the old one
- The old Decision remains permanently valid for its time

A decision is considered CLOSED when:
- Its effects are fully applied
- Its affected artifacts are closed
- No pending actions remain

An OPEN decision MUST block
stage completion.

---

## 8.1 Decision Application Pending (Deterministic Enforcement State)

Decision Application Pending is NOT an execution fork.
It is NOT a Human Interrupt.

It occurs when:
- A Decision artifact exists, AND
- The Decision status is `ACCEPTED`, AND
- One or more Decision effects are not yet fully applied

In Decision Application Pending:

- Execution MUST remain RUNNING (not BLOCKED)
- No stage may close
- No downstream stage may start
- Progress MUST remain unchanged until the decision effects are applied and the affected artifacts are closed/validated

Status representation rules (binding):

- `blocking_questions` MUST be an empty array
- `next_step` MUST be populated with exactly ONE deterministic action:
  - "Apply ACCEPTED decision effects deterministically (orchestrator apply step)."
- `issues` MAY include a non-narrative descriptor:
  - "Decision effects pending application"

Resolution:

- The orchestrator MUST apply the Decision effects deterministically
- Execution may proceed ONLY after:
  - All Decision effects are fully applied, AND
  - All affected artifacts are closed and validated, AND
  - The Decision status is set to `CLOSED`

---

## 9. Rollback Enforcement

If a decision is marked for rollback:

* A new **ROLLBACK** decision is created
* The rollback decision MUST reference:

  * Original Decision ID
  * Reason for rollback
* Rollback execution MUST be logged as well

---

## 10. Audit & Verification

At any time, the system must be able to deterministically answer the following audit questions
using ONLY authoritative artifacts (no narrative interpretation):

* Why does this behavior exist?
  - Answered by: `Fork` + `Immediate Execution Effect` + `Triggering Artifact` + `Linked Changes`
* Who/what approved it?
  - Answered by: Decision ID + Decision file presence under `/decisions`
* What alternatives were rejected?
  - Answered by: the `Options` list inside the Decision file
* How do we undo it?
  - Answered by: a `ROLLBACK` Decision that references the original Decision ID,
    and lists the explicit rollback targets under `Affected Artifacts`

If any answer cannot be derived deterministically from authoritative artifacts:
- The system is considered NON-COMPLIANT
- Execution MUST halt
- Human escalation is REQUIRED

---

## 11. Pipeline Gate Enforcement

No pipeline stage may pass its exit gate unless:

* Any REQUIRED Decision forks encountered in that stage are resolved by:
  - a logged Decision artifact (if and only if a selectable fork existed), AND
  - full application of the Decision effects (no Decision Block remaining)

* Any Decision-bound change set produced in that stage is traceable to exactly one Decision ID
  using the bidirectional trace rules in Section 7

Rule-driven, deterministic changes that are fully mandated by existing contracts:
- MUST proceed WITHOUT a Decision
- MUST NOT be artificially coupled to a Decision ID

Failure to satisfy these gate rules = HARD STOP.

---

### 11.0.1 Decision Trigger — Multiple Valid Alternatives After Evaluation

A Decision MUST be triggered when all of the following are true:

- more than one contract-compliant execution path exists
- objective-governed evaluation has been completed
- no deterministic rule selects exactly one remaining path
- exactly one human selection is required to unblock execution

In such a case:

- the pipeline MUST NOT choose autonomously
- the pipeline MUST generate a Recommendation Artifact
- the Recommendation Artifact MUST remain separate from the Decision file
- the Decision file MUST remain minimal per this contract

If evaluation reduces the fork to exactly one valid path
through explicit constraint disqualification,
then no Decision is required
and execution MUST proceed deterministically.

---

## 11.1 Decision Minimality Rule

Decisions MUST represent meaningful forks
in execution or authority.

The pipeline MUST NOT:
- Log stylistic or trivial choices
- Fragment a single logical decision into multiples
- Inflate decision count for coverage

Decision logs exist for control, not verbosity.

---

## 11.1.1 Decision Inflation Guard (Hard Constraint)

The pipeline MUST actively prevent
artificial inflation of decisions.

A decision MUST NOT be logged if:
- It exists only to justify an already forced rule
- It documents an obvious or mandatory action
- It does not introduce a real execution fork

If multiple decisions are logged
without closing artifacts or advancing stages:
- Execution MUST halt
- The condition MUST be logged as a system fault
- Human escalation is REQUIRED

Decisions exist to resolve forks,
not to narrate execution.

---

### 11.2 Decision Worthiness Gate (Mandatory)

Before logging any decision, the pipeline MUST verify
that the decision meets ALL of the following criteria:

- The execution could not continue deterministically
  without selecting one option over another
- The decision has a structural, behavioral, or authority impact
- The decision outcome cannot be trivially derived from an existing rule
- Reversing the decision would meaningfully alter execution or artifacts

If ALL criteria are not met:
- The action MUST proceed without decision logging
- The behavior is considered rule-driven, not decision-driven

Logging low-impact or mechanical choices
as decisions
is a contract violation.

---

## 11.3 Decision Saturation Guard

The pipeline MUST actively prevent
decision saturation.

If multiple consecutive decisions are logged
without advancing artifacts or stages:

- Execution MUST pause
- The condition MUST be flagged as a system fault
- Human escalation is REQUIRED

Decisions exist to resolve forks,
not to replace deterministic execution.

---

### 11.4 Decision Density Constraint (Hard)

The pipeline MUST enforce
a bounded decision density.

If more than one decision is logged
without closing at least one artifact
or advancing a stage:

- Execution MUST halt
- The condition MUST be logged as a system fault
- Human escalation is REQUIRED

Decisions exist to unlock execution,
not to replace it.

---

## 12. Summary

This document ensures that the system:

- Is auditable
- Is reversible
- Does not drift
- Does not improvise authority

Core rules:
- No selectable fork → No Decision
- Selectable fork → Decision REQUIRED (human-authoritative)
- Rule-driven deterministic changes → NO Decision (but MUST remain traceable through artifacts, gates, and linked changes)

Nothing may change silently.
Nothing may proceed without a trace.

---