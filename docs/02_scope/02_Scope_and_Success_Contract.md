# Scope & Success Contract (v1)

**Document ID:** DOC-02  
**Project:** Forge  
**Document Type:** Binding Scope & Success Definition  
**Status:** FINAL — EXECUTION-BOUND  
**Applies To:** All pipeline executions, documents, code, and verification artifacts

---

## 1. Purpose of This Document

This document defines the **explicit scope boundaries**, **success criteria**, and **completion rules**
for the Forge.

Its purpose is to:
- Prevent scope creep
- Eliminate ambiguity during governed execution
- Define what “done” actually means
- Protect the user from unnecessary execution drift
- Enable long-running Forge execution after approval and scope lock

This contract is **binding** on all pipeline stages and agents.

---

### 1.1 Contract Supremacy Rule (Hard)

This document is a **binding execution contract**, not guidance.

No optimization, enhancement, correction, or improvement
— even if objectively beneficial —
is permitted unless it is:

- Explicitly required by this contract, OR
- Introduced as a new task with a new Scope & Success Contract

Perceived quality improvement
does NOT grant execution authority.

This contract overrides:
- Best practices
- Engineering judgment
- AI “helpfulness”
- Assumed completeness

Execution correctness is defined
ONLY by adherence to this document.

---

### 1.1.1 Draft Has No Execution Authority (Hard)

If this document is not in **FINAL — EXECUTION-BOUND** status,
it MUST be treated as having ZERO execution authority.

No pipeline stage may proceed
based on a DRAFT scope or success contract.

---

### 1.2 Terminology (Binding)

For execution purposes, the term **Review** in this contract means:

- Read-only analysis of existing artifacts
- No modification of documents
- No code changes
- No execution of commands or tests

If a Review requires changing any artifact, it MUST be handled as an explicit **Edit** under an authorized stage workflow, and MUST NOT be performed implicitly.

---

## 2. In-Scope

The pipeline IS responsible for the following:

### 2.1 Idea → Executable Outcome

Transform any accepted task into:

- Closed, executable documentation
- Deterministic technical specifications
- Code that strictly follows the written documents
- Basic verification and validation
- Clear progress tracking at all times.

This document defines WHAT must be achieved
and WHEN success is considered valid.

It does NOT define:
- How decisions are logged
- What a decision contains
- How alternatives are documented
- How rationale is recorded

Decision structure, content, authority,
and traceability are governed EXCLUSIVELY by:

- Decision Logging & Change Traceability Specification

This document MUST NOT be used
to infer, expand, or justify
decision content or structure.

If any conflict exists:
- This document MUST defer
- The Decision Logging Specification MUST prevail

---

### 2.1.0 Project Objective Binding Rule (Hard)

Before Scope Freeze Point is reached,
the active task MUST have an explicit objective authority
that defines what outcome the system is trying to optimize for
within the accepted task scope.

This objective authority MUST include:

- Primary objective
- Secondary objectives (if any)
- Declared constraints
- Declared priority order for tradeoff evaluation

This contract grants ZERO authority
to infer project objective implicitly.

If multiple valid implementation, documentation,
or architectural paths exist
and no explicit objective authority is available:

- deterministic execution is forbidden
- autonomous recommendation is forbidden
- escalation is required per governing decision contracts

Project objective authority governs evaluation only.
It MUST NOT expand scope,
modify success criteria,
or override stage governance.

---

### 2.1.1 Scope Freeze Point (Hard Constraint)

The execution scope is considered **FINAL and NON-INTERPRETABLE**
ONLY when Stage A (Architecture & Task Decomposition) is:

- CLOSED per the Stage Exit rules, AND
- has a Boundary Audit result of PASS.

This moment is the **Scope Freeze Point**.

Before the Scope Freeze Point,
the pipeline MAY perform controlled Design Exploration
for the sole purpose of:

- comparing valid alternatives
- analyzing proposal impact
- detecting harmful tradeoffs
- producing bounded recommendation artifacts

Such exploration is permitted ONLY if:

- it remains artifact-bound
- it does not modify frozen scope
- it does not introduce new goals
- it does not add undocumented behavior

Design Exploration is evaluation-only.
It does NOT grant authority to implement changes.

After scope freeze:
- No new goals may be introduced
- No requirements may be expanded
- No behaviors may be added
- No clarifications may be inferred
- No ambiguity may be resolved retroactively
- No interpretation of intent is permitted

Any attempt to:
- “Clarify” intent
- “Refine” requirements
- “Complete” missing logic
- “Resolve” perceived ambiguity

after scope freeze
constitutes a **Scope Violation**
and MUST trigger an immediate execution halt.

Intent is considered **authoritatively exhausted**
at the Scope Freeze Point.

---

### 2.1.2 Scope Freeze Enforcement Rule (Hard)

After scope freeze, the pipeline MUST treat
ANY of the following as a **hard violation**:

- Rephrasing requirements under any label, including “clarification”
- Introducing implicit behaviors, even if logically inferred
- Completing “obvious”, “missing”, or “assumed” details
- Resolving ambiguity that was not explicitly closed before freeze
- Improving precision, quality, or structure beyond frozen scope

Intent is considered FINAL at scope freeze.

Any perceived lack of clarity after freeze
is NOT a documentation problem,
it is a scope violation.

Post-freeze evaluation MAY compare
already-authorized implementation paths only.

Post-freeze evaluation MUST NOT:

- introduce a new option
- refine scope
- reinterpret intent
- generate improvement proposals outside frozen authority

If evaluation requires a new option or changed objective,
the request MUST be classified as a New Task.

---

### 2.1.3 Scope Freeze → Artifact Authority Invalidation (Hard Rule)

Any artifact produced after a Scope Freeze violation:

- Has ZERO execution authority
- MUST NOT be consumed by any downstream stage
- MUST NOT influence progress, retries, or verification
- MUST be treated as NON-EXISTENT for execution purposes

Producing artifacts after a scope freeze violation
does NOT constitute partial progress,
recovery,
or corrective action.

Such artifacts may be preserved for audit only,
but are permanently disqualified from execution authority.

Attempting to continue execution
by producing artifacts after scope freeze
constitutes a critical scope violation
and MUST trigger immediate Execution Abort.

---

### 2.2 Autonomous Execution

The pipeline is allowed to:

- Work independently for hours or days
- Make deterministic decisions when rules are clear
- Retry failed steps up to defined limits
- Continue execution without waiting for human input

As long as:
- No required information is missing
- No multiple valid options exist
- No HALO boundary is at risk

---

### 2.2.1 Controlled Alternative Evaluation

The pipeline IS allowed to:

- compare multiple valid paths
- evaluate tradeoffs deterministically
- produce recommendation artifacts
- escalate one bounded decision packet for final human selection

ONLY if:

- the alternatives are inside accepted scope
- project objective authority exists
- no implicit scope expansion occurs
- final selection remains outside autonomous authority when multiple valid paths remain

Alternative evaluation is not an authority to optimize freely.
It is a bounded analytical activity.

---

### 2.3 Documentation Ownership

The pipeline owns the creation and maintenance of execution artifacts, including:

- System documents
- Execution specifications
- Progress reports
- Verification artifacts
- Decision artifacts ONLY as defined and authorized by the Decision Logging & Change Traceability Specification

All documents and artifacts must be:
- Written in Markdown (for documents) or JSON (for state/verification/decision artifacts where applicable)
- Deterministic
- Self-contained
- Versioned
- Traceable to authoritative inputs

This contract grants ZERO authority to redefine:
- Decision structure
- Decision authority
- Decision triggers

Decision structure, authority, and traceability are governed EXCLUSIVELY by:
- Decision Logging & Change Traceability Specification

---

### 2.4 Progress Transparency

At any moment, the pipeline MUST be able to expose
the current execution state without interrupting execution.

This document does NOT define:
- Progress semantics
- Progress calculation
- Progress percentages
- Progress authority
- Status report structure

It declares ONLY the obligation
that execution state MUST be observable.

All progress definition, calculation,
state derivation, reporting format,
and authority
are governed EXCLUSIVELY by:

- Progress Tracking & Status Report Contract (v1)

Any attempt to infer, supplement,
or reinterpret progress meaning
from this document
constitutes an authority violation
and MUST halt execution.

---

### 2.5 Deployment Modes & Productization Readiness (Hard)

Forge is allowed to start as a **personal system** (single-user, local-first).

However, the Forge Core MUST be built as an **engine** that is structurally compatible with future productization.

#### 2.5.1 Supported Deployment Modes (Binding)

Forge MUST support these modes at the architecture level:

- **Mode A — Personal Local (Default):**
  - Single user
  - Local execution
  - No external exposure by default

- **Mode B — Team / On-Prem (Future-Ready):**
  - Multiple workspaces
  - Access control
  - Isolated project state per workspace

- **Mode C — SaaS Multi-Tenant (Future-Ready):**
  - Tenant isolation
  - Strong authentication & authorization boundaries
  - Rate limits, quotas, and audit separation per tenant

#### 2.5.2 Productization Readiness Requirements (Hard)

Even in Mode A, the system MUST be built to avoid redesign later:

- Forge Core MUST be independent from any UI (CLI/UI are shells)
- Project state MUST be isolated and addressable by a workspace/project identifier
- No hard-coded personal paths, identities, or assumptions inside the engine
- Provider logic MUST remain behind the Cognitive Adapter + Driver contract
- Artifacts MUST remain deterministic and traceable regardless of deployment mode

#### 2.5.3 Scope Clarification (Hard)

- Implementing **Mode A** runtime behavior is IN-SCOPE.
- Operating **Mode B / Mode C** in production (hosting, billing, external exposure) is OUT-OF-SCOPE unless introduced as a new task with a new scope contract.

---

## 3. Out of Scope

The pipeline MUST NOT:

### 3.1 Make Strategic or Subjective Decisions

The pipeline MUST NOT make any decision that is:

- Preference-based
- Strategic in nature
- Dependent on human judgment without explicit rules

However, the pipeline IS allowed to proceed autonomously when:

- A single deterministic rule applies
- Behavior is explicitly defined by contract
- No alternative valid paths exist

Rule-driven continuation is NOT a decision
and does NOT require decision logging or human interruption
ONLY if the rule was explicitly defined
before execution began.

Any rule interpretation, prioritization,
or contextual adaptation during execution
constitutes a decision
and MUST trigger escalation.

---

### 3.2 Invent Missing Inputs

The pipeline must NOT:
- Guess API keys
- Assume credentials
- Fabricate configurations
- Infer business rules not documented

Missing inputs MUST trigger a human interrupt.

---

### 3.2.1 Early Impossibility Detection Rule

If, at any point during execution, the pipeline can deterministically conclude
that task success is impossible due to missing inputs, authority, or intent:

1. Execution MUST stop immediately
2. All produced artifacts MUST be preserved
3. The condition MUST be classified deterministically as exactly ONE of:
   - BLOCKED (ONLY if a selectable execution fork exists), OR
   - ABORTED (if no selectable execution fork exists)

A selectable execution fork exists ONLY if:
- More than one contract-compliant recovery path exists, AND
- The pipeline cannot proceed deterministically without selecting exactly one path

If BLOCKED:
- Human interrupt is REQUIRED under the Autonomy Policy & Human Interrupt Protocol
- The block MUST be represented in governed runtime authority artifacts and mirrored in `progress/status.json` per the Progress Tracking Contract

If ABORTED:
- NO Decision MUST be logged
- NO questions MUST be asked
- The abort MUST be represented in governed runtime authority artifacts and mirrored in `progress/status.json` per the Progress Tracking Contract

Logging impossibility as a Decision without a selectable execution fork is forbidden.

---

### 3.2.2 Missing Input ≠ Reduced Scope (Hard Rule)

Missing required input MUST NOT be handled by:
- Skipping dependent behavior
- Disabling related features
- Reducing execution expectations
- Declaring partial completion

Absence of input does NOT modify scope.

If required input is missing:
- Execution MUST halt
- The condition MUST be classified deterministically
- Execution Abort MUST be triggered if no valid alternative exists

Any attempt to “continue with what is available”
constitutes implicit scope modification
and is strictly forbidden.

---

### 3.3 Violate HALO Core Rules

The pipeline must never violate:

- Fail-Closed principle
- No Raw Text rule
- Consent enforcement
- Client-owned memory vault
- Identity-bound execution
- Source-of-Truth precedence

Any risk here triggers an immediate halt.

---

### 3.4 Optimize Beyond the Contract (Hard Prohibition)

The pipeline MUST NOT:
- Optimize scope, structure, or behavior
- Introduce improvements not explicitly required
- Reframe requirements under the label of “clarification”
- Enhance quality beyond what is contractually defined

Any change that:
- Improves quality
- Increases completeness
- Enhances performance
- Refines structure

is considered a **scope extension**,
regardless of perceived benefit or correctness.

Such changes MUST be treated as a **New Task**
and MUST NOT proceed within the current execution.

---

Exception:

Comparing already in-scope alternatives
for the purpose of deterministic recommendation
does NOT constitute optimization beyond the contract,
provided that:

- no new behavior is introduced
- no scope is expanded
- no success criteria are changed
- evaluation is governed by explicit project objective authority
- final implementation still follows approved decision flow

---

### 3.5 Misclassified Task Handling

If during execution a task is deterministically discovered to be:

- Out of scope
- Based on invalid assumptions
- Missing mandatory intent required for completion

The pipeline MUST:

1. Halt execution immediately
2. Preserve all produced artifacts
3. Classify the situation as one of the following:
   - Execution Abort (if no valid recovery path exists)
   - Decision-required misclassification (ONLY if multiple valid recovery paths exist)
4. Escalate to the human authority with:
   - Exact reason for misclassification
   - Whether re-entry is possible
   - What authority or intent is missing

The pipeline MUST NOT:
- Attempt to reshape or reinterpret the task
- Narrow or expand scope silently
- Continue execution under modified assumptions
- Suggest reframed objectives or alternative goals

Task reshaping is explicitly forbidden.
Only explicit new human intent may initiate a new task.

---

### 3.6 Execution Abort (Terminal Non-Success State)

Execution Abort represents a terminal enforcement state where:

- Execution cannot continue deterministically
- No valid execution alternatives exist
- No scope-preserving recovery path is available
- Authority is exhausted

Execution Abort is:

- NOT a form of success
- NOT a form of partial completion
- NOT a recoverable failure
- NOT a decision substitute
- NOT an incomplete outcome

An Execution Abort permanently classifies the task as:
NOT SUCCESSFUL.

No reporting, summary, or status output
may frame an Execution Abort
as:
- “Completed with issues”
- “Finished unsuccessfully”
- “Ended early”
- “Partially achieved”

Execution Abort is a correct enforcement of boundaries,
not an outcome to be interpreted.

---

#### 3.6.1 Abort Is a Dead End (Hard)

An Execution Abort permanently terminates
the current execution path.

No artifact produced before Abort
may be reused to justify continuation
of the same task.

A New Task MAY reuse content,
but MUST NOT reuse:
- Authority
- Progress
- Assumptions
- Decisions
- Validation results

Any attempt to resume execution
from a pre-abort state
without explicit new intent
is a system violation.

---

#### 3.6.2 Execution Abort vs Failure (Hard Distinction)

An Execution Abort is NOT a failure.

Failure implies:
- A correctable defect
- A retryable condition
- A recoverable execution path

Execution Abort implies:
- Deterministic impossibility
- Boundary enforcement
- Authority exhaustion
- No valid continuation path

Execution Abort:
- MUST NOT be retried
- MUST NOT be reframed as failure
- MUST NOT be treated as incomplete success
- MUST NOT be “fixed” or “resolved”

Any attempt to classify an Execution Abort
as a failure condition
is a contract violation.

---

#### 3.6.3 Execution Abort → Progress Contract Binding (Hard)

Upon Execution Abort, progress handling is governed EXCLUSIVELY by:

- Progress Tracking & Status Report Contract (v1)

This document grants ZERO authority to:
- Define progress fields
- Define progress values
- Define state derivation outcomes
- Emit alternative progress representations

Any progress behavior after Abort that deviates from the Progress Tracking Contract
constitutes an authority violation and MUST halt execution.

---

### 3.7 Success Is Binary (Hard Rule)

Task success in this pipeline is strictly binary
and artifact-provable.

A task is either:
- SUCCESSFUL — all success criteria are met deterministically, OR
- NOT SUCCESSFUL — any criterion is unmet, unverified, or ambiguous

There is NO concept of:
- Partial success
- Functional success
- Practical success
- “Good enough” completion
- Success by explanation or narrative

Success MUST be provable ONLY by:
- Closed artifacts
- Passed validation gates
- Boundary Audit PASS
- Deterministic checks

If success requires interpretation,
confidence,
or justification,
then success does NOT exist.

---

#### 3.7.1 No Interpretive Success Rule (Hard)

Success MUST be provable
without interpretation,
estimation,
or confidence-based judgment.

If success requires explanation,
justification,
or narrative defense,
then success does NOT exist.

Only artifact closure,
validation gates,
and deterministic checks
may declare success.

Any form of “practically done”
or “good enough”
is explicitly invalid.

---

#### 3.7.2 Success Definition Lock (Hard)

The definition of success is FINAL
at the moment this contract is accepted.

Success MUST NOT be:
- Reworded
- Reframed
- Reinterpreted
- Narrowed
- Expanded
- Contextualized

No stage, agent, or runtime component
may redefine success
“for execution purposes”,
“for verification purposes”,
or “given the circumstances”.

If success requires any form of reinterpretation,
then success does NOT exist.

Any attempt to reframe success
constitutes a scope violation
and MUST halt execution.

---

## 4. Success Criteria

A task is considered SUCCESSFUL
ONLY when ALL of the following are true simultaneously:

- All pipeline stages (A → D) are CLOSED
  according to their stage exit rules
- All required artifacts are CLOSED
  and have passed their validation gates
- All Boundary Audits have returned PASS
- Stage D (Verification) has completed
  WITHOUT triggering Execution Abort

- The Progress Tracking & Status Report Contract (v1)
  is satisfied by the governed runtime authority artifacts plus the reflected human-visible status file (`progress/status.json`),
  and the execution state is deterministically derived as COMPLETED
  according to the governed runtime state contracts and Doc-06 reporting rules

- No unresolved risks, ambiguities,
  blocking questions,
  or pending authority conditions exist

- If multiple valid alternatives existed during execution,
  project objective authority was explicitly defined
  and decision escalation was resolved through the governing decision flow

Execution Abort is a terminal NOT SUCCESSFUL state.
If execution state is ABORTED per the Progress Tracking Contract,
SUCCESS MUST NOT be declared under any circumstance.

Verification alone does NOT constitute success.
Artifact existence alone does NOT constitute success.
Narrative explanation or interpretation
has ZERO authority to declare success.

Documentation or code completion alone
does NOT constitute success without verification.

---

### 4.1 Stage Exit Authority Binding (Hard)

Stage exit rules, closure criteria, and stage gating definitions
are governed EXCLUSIVELY by:

- Pipeline Stages Specification (A→D)

No alternate definition of:
- “stage closed”
- “exit gate”
- “pass condition”

may be inferred from this contract.

If stage closure cannot be proven
by Doc-03 rules and closed artifacts:

- Success MUST NOT be declared
- Execution MUST Fail-Closed

---

### 4.2 Document Closure

- All required documents are written
- Documents are internally consistent
- Documents are implementation-ready
- No open TODOs or placeholders remain

---

### 4.3 Code Compliance

- Code strictly matches the documents
- No undocumented behavior exists
- No speculative logic is introduced
- All dependencies are explicit

---

### 4.4 Verification Passed

At minimum:
- Smoke checks pass
- Defined unit or contract checks pass
- Known failure paths are handled

Verification must be recorded.

---

### 4.5 Traceability

For every outcome, there must be:
- A source document
- A decision log (if applicable)
- A clear link between spec and code

No orphan artifacts.

---

## 4.6 No Deferred Success Rule

Success MUST be declared only
at the moment all criteria are satisfied.

The pipeline MUST NOT:
- Assume future completion
- Declare success “pending verification”
- Mark execution as successful with open follow-ups

If success cannot be proven NOW,
it does not exist.

---

## 5. Definition of Done (Global)

A task is **DONE** when:

- Scope requirements are met
- Success criteria are satisfied
- No blocking questions remain
- Progress status = 100%
- Artifacts are archived in their correct locations

Partial completion is NOT done.

---

### 5.1 No Partial Success Rule

The pipeline MUST NOT declare or record any form of partial success.

Artifacts, stages, or outputs that are incomplete,
unverified, or blocked MUST NOT be labeled as successful,
usable, or accepted in any form.

Only full end-to-end completion
as defined in this contract
constitutes success.

Any attempt to persist or report partial success
as an outcome
is a contract violation.

---

## 6. No Scope Creep Rule

Any request that:

- Expands the original intent
- Adds new features
- Changes assumptions
- Alters success criteria

MUST be treated as a **new task** and re-enter the pipeline from Stage A.

---

## 6.1 Definition of a New Task (Binding)

A New Task is any request or action that:

- Modifies frozen scope
- Alters assumptions
- Adds new behavior or output
- Changes success criteria
- Revisits a closed decision
- Improves or refines an accepted artifact

A New Task:
- MUST re-enter the pipeline from Stage A
- MUST generate its own Scope & Success Contract
- MUST NOT inherit progress from a previous task

Reusing artifacts is allowed.
Reusing authority is NOT.

A New Task MUST NOT be used
to bypass an Execution Abort.

If execution is aborted due to:
- Missing intent
- Missing authority
- Invalid assumptions

The original task MUST remain closed as aborted.

A New Task may be created ONLY if:
- The human explicitly submits a new intent
- The new intent is materially different
- It does not retroactively justify the aborted execution

---

### 6.1.1 Prohibition of Soft Task Revival (Hard Rule)

A task that reaches Execution Abort
is considered permanently terminated.

The pipeline MUST NOT:
- Resume the task under a different label
- Re-enter execution using preserved artifacts
- Treat clarification as renewed intent
- Continue execution without an explicit new task submission

Any attempt to revive an aborted task
without a formally declared new task
is a system violation.

New intent MUST be explicit,
materially different,
and submitted as a new task
entering Stage A from zero authority.

---

## 7. Enforcement

This contract overrides:
- Convenience
- Speed
- Assumptions
- Improvisation

If any ambiguity exists, the pipeline must **fail closed** and escalate.

---

## 7.1 Deterministic Completion Rule

Completion status is derived from artifacts and validation gates only.

The pipeline MUST NOT:
- Declare success based on intent
- Declare partial completion as acceptable
- Advance stages based on confidence or estimation

If success cannot be proven deterministically → Fail-Closed.

---

## 8. Approval & Versioning

- This document is versioned
- Any change requires explicit approval
- Older versions remain archived
- Execution always follows the latest approved version

---

**End of Document**
