# 📄 Document 3 — Pipeline Stages Specification (A → D)

**Project:** Forge  
**Version:** 1.1  
**Status:** CORE – NON-NEGOTIABLE  
**Audience:** Autonomous Agents, Orchestrator, Human Owner (Khaled)

---

## 1. Purpose

This document defines the **deterministic execution stages** of Forge.

It enforces:
- Strict stage separation
- Autonomous forward execution
- Fail-closed behavior
- Human interruption only when mandatory

No stage may:
- Be skipped
- Be merged
- Be reordered
- Proceed without passing its gate

---

## 2. Global Execution Rules

- The pipeline executes continuously by default
- The pipeline never waits for human input unless a Human Interrupt is triggered by contract
- Human interruption is allowed ONLY under explicit, contract-defined conditions
- Every stage produces CLOSED, reviewable artifacts
- Failures are explicit, classified, and logged
- Execution activity has ZERO authority unless it results in artifact closure and gate PASS

---

## 2.1 Artifact Closure Rule

An artifact is considered CLOSED when:
- It is produced by its owning stage, AND
- It passes the stage validation gate, AND
- It passes Boundary Audit, AND
- It is not marked as Draft or Pending

Artifact closure:
- Does NOT imply correctness
- Does NOT imply acceptance
- Does NOT imply approval
- Does NOT imply task success
- Does NOT grant decision authority

Artifact closure means ONLY:
- The owning stage has exhausted its authority over that artifact
- The artifact is immutable
- The artifact may be consumed by downstream stages ONLY when Boundary Audit PASS has been achieved for the relevant transition

No artifact closure
MUST EVER be interpreted
as a Decision.

---

### 2.1.1 Mandatory Boundary Audit on Stage Exit

No pipeline stage may exit, close, rollback, retry,
or transition to another stage
without invoking a Boundary Audit.

This applies to:
- Successful stage completion (closure)
- Failed stage termination
- Retry exhaustion
- Rollback initiation
- Return-to-owning-stage due to upstream defects
- Early execution halt (Execution Abort)

Audit invocation is mandatory and non-optional.
It MUST occur at the contract-defined audit points
as specified by the HALO Boundary Audit Rules.

Deferred, implicit, bypassed,
or inferred audits are strictly forbidden.

Boundary Audit PASS is required ONLY to:
- Mark a stage as CLOSED, OR
- Advance artifacts to a downstream stage

If Boundary Audit FAILS:
- The stage MUST NOT be marked CLOSED
- No downstream transition is permitted
- Execution MUST Fail-Closed via:
  - Return to the owning stage, OR
  - Execution Abort (if no valid continuation path exists)

Stage closure or downstream transition
without a Boundary Audit PASS
is a critical system violation.

---

### 2.1.2 Closed Artifact Non-Reinterpretation Rule (Hard)

Once an artifact is CLOSED within a stage:

- Its content is immutable
- Its meaning is frozen
- Its authority is exhausted

The owning stage MUST NOT:
- Re-read the artifact to extract new meaning
- Re-contextualize the artifact under evolving execution state
- Use the artifact as an interpretive reference
- Treat the artifact as a dynamic input

Closed artifacts exist ONLY as static inputs
for downstream stages.

Any attempt to reinterpret a closed artifact
within the same stage
constitutes retroactive interpretation
and MUST halt execution immediately.

---

## 2.2 Stage Authority Lock (Hard Rule)

Each pipeline stage operates under **strict authority isolation**.

A stage is bound exclusively by:
- The closed artifacts of all previous stages
- The explicit intent and scope frozen upstream
- Its own declared inputs and outputs

A stage MUST NOT:
- Reinterpret upstream intent
- Extend or narrow upstream scope
- Introduce new assumptions
- Resolve ambiguity not explicitly delegated to it
- Compensate for upstream defects

If a stage detects ambiguity, insufficiency,
or inconsistency in upstream artifacts:

- Execution MUST halt immediately
- The pipeline MUST return to the owning stage
- The condition MUST be logged
- No corrective action is permitted in the current stage

Silent interpretation,
implicit correction,
or compensatory behavior
is strictly forbidden.

---

### 2.2.1 Prohibition of Cross-Stage Repair (Hard)

A pipeline stage MUST NOT attempt to
repair, compensate for, or workaround
defects originating in another stage.

If a defect is detected that originates upstream:

- Execution MUST stop
- The pipeline MUST return to the owning stage
- No corrective action is permitted in the current stage
- No partial repair or local workaround is allowed

Downstream stages exist to EXECUTE,
not to heal upstream failures.

Any attempt to silently repair upstream defects
inside a downstream stage
is a system violation.

---

## 2.2.2 No Forward Knowledge Rule (Hard)

A pipeline stage MUST operate
as if no downstream stage exists.

A stage MUST NOT:
- Anticipate downstream validation outcomes
- Shape artifacts to “help” future stages
- Encode hints, assumptions, or safeguards
  intended for later execution
- Pre-compensate for expected failures

Each stage is strictly limited to:
- Its declared inputs
- Its declared outputs
- Its own validation gates

Any behavior that embeds
downstream awareness
into upstream artifacts
constitutes implicit coordination
and is a system violation.

---

## 2.3 Stage Re-entry Rule (Hard Constraint)

When execution returns to a previous stage
due to failure, ambiguity, rollback, or abort escalation:

- Re-entry MUST occur ONLY at the owning stage
- All downstream artifacts MUST be invalidated
- No downstream artifact may survive re-entry
- Progress MUST be recalculated deterministically
- Progress MUST NOT be estimated or preserved

Stage re-entry:
- Is NOT continuation
- Is NOT partial recovery
- Is a controlled authority reset

Any attempt to:
- Preserve downstream progress
- Retain partial completion credit
- Resume execution mid-stage

constitutes a system violation.

---

## 2.4 Execution Abort Handling (Hard Rule)

Any pipeline stage may trigger an Execution Abort ONLY if it deterministically
detects that execution cannot continue due to:

- Missing mandatory input
- Missing authority
- Invalid or unverifiable assumptions
- Impossible success conditions

Execution Abort is a terminal enforcement state.

Abort MUST be triggered ONLY when ALL are true:
- No contract-compliant retry path exists, AND
- No contract-compliant rollback or re-entry path exists, AND
- No selectable execution fork exists

A selectable execution fork exists ONLY if:
- More than one contract-compliant continuation or recovery path exists, AND
- The pipeline cannot proceed deterministically without selecting exactly one path

If a selectable execution fork exists:
- Execution MUST be classified as BLOCKED (not ABORTED)
- Human interrupt handling MUST follow the Autonomy Policy & Human Interrupt Protocol
- The block MUST be represented in governed runtime authority artifacts and mirrored in `progress/status.json` per the Progress Tracking Contract

If no selectable execution fork exists:
- Execution MUST be classified as ABORTED
- NO Decision MUST be logged
- NO questions MUST be asked
- The abort MUST be represented in governed runtime authority artifacts and mirrored in `progress/status.json` per the Progress Tracking Contract

Execution Abort MUST NOT be treated as a Decision
and MUST NOT produce a Decision artifact.

---

## 2.5 Iterative Loop Rule (Hard, Cross-Stage)

The pipeline supports iterative execution ONLY as contract-defined cycles within a stage.

A loop iteration is permitted ONLY if:
- The stage contract declares iteration as a valid action, AND
- The iteration outcome is recorded as an artifact, AND
- Stage closure criteria are evaluated deterministically after each iteration

Loops MUST NOT:
- Be open-ended without deterministic termination criteria
- Depend on subjective quality judgment
- Be driven by “improve further” reasoning

If termination criteria cannot be met deterministically:
- Execution MUST classify as BLOCKED (selectable fork) or ABORTED (no path),
  per the Autonomy Policy & Human Interrupt Protocol and Execution Abort Handling.

---

## 2.6 Mandatory Human Approval Gate for Idea Finalization (Hard)

The pipeline MUST obtain an explicit Human Approval ONLY for:
- Final acceptance of the Stage A “Idea Final Spec” prior to Stage B initiation

This approval gate:
- Does NOT apply to documentation or implementation quality judgment
- Exists ONLY to freeze intent and scope before specification generation

If approval is required and not available:
- Execution MUST enter BLOCKED
- The block MUST be represented in governed runtime authority artifacts and mirrored in `progress/status.json`
- No downstream stage may begin

Approval MUST be captured as a CLOSED artifact.
No implicit approval is allowed.

---

## 3. Stage A — Architecture & Task Decomposition (Idea Finalization)

### 3.1 Objective

> **Admission Gate Notice:**  
> Stage A may only initialize after a valid Admission-Ready Project Definition exists
> per the Idea Structuring & Admission Layer Contract (DOC-01).
>
> Direct entry into Stage A without a compliant admission artifact
> constitutes a Contract Violation.

Transform a raw idea, request, or instruction into a **fully scoped execution plan**
AND produce a **frozen, approval-bound final idea specification**.

No coding, no documents, no assumptions beyond what is explicitly inferable.

---

### 3.2 Inputs

- User intent (free text or command)
- Existing HALO documents (if referenced)
- Known constraints and rules
- Project context (if any)

---

### 3.3 Outputs

Stage A MUST produce the following CLOSED artifacts:

- `artifacts/stage_A/task_plan.md` — a fully scoped execution plan containing:
  - atomic task breakdown
  - explicit dependencies
  - non-overlap guarantees
  - required downstream artifacts (by name and location)

- `artifacts/stage_A/validated_assumptions.md` — assumptions explicitly listed,
  justified,
  and either:
  - deterministically validated, OR
  - explicitly marked as requiring human decision

- `artifacts/stage_A/idea_evaluation.md` — deterministic evaluation of the idea containing:
  - scope boundaries (in-scope / out-of-scope)
  - constraints and non-negotiables
  - risks and failure modes (classified, non-subjective)
  - unresolved ambiguities (if any) and their class

- `artifacts/stage_A/idea_final_spec.md` — the final, frozen idea specification containing:
  - intent statement
  - frozen scope
  - success contract summary (must map to docs in Stage B)
  - explicit glossary (only if required by intent)
  - explicit exclusions

- `artifacts/stage_A/idea_approval_record.md` — explicit human approval outcome containing:
  - APPROVE / REJECT / REQUEST_CHANGES
  - immutable timestamp
  - link to the approved `idea_final_spec.md` version

Unvalidated assumptions have ZERO execution authority
and MUST block stage closure
unless resolved or escalated.

Stage A MUST NOT be marked CLOSED
without `idea_approval_record.md` indicating APPROVE.

---

### 3.4 Validation Gates

Stage A **passes only if**:
- Scope is fully defined
- All tasks are atomic and non-overlapping
- Dependencies are explicit
- Assumptions are listed and justified
- `idea_final_spec.md` exists and is internally consistent with `task_plan.md`
- `idea_approval_record.md` exists and indicates APPROVE

---

### 3.5 Failure Handling

If Stage A fails:
- Execution stops
- Failure reason is logged
- No downstream stages may start

---

### 3.6 Human Interrupt Conditions

Human input is required ONLY if:
- Multiple valid architectural options exist
- A core assumption cannot be validated deterministically
- A boundary or authority risk is detected
- Stage A approval is required (mandatory approval gate)

Human input MUST NOT be requested for:
- Preference confirmation
- Quality judgment
- “Best practice” selection
- Confidence or reassurance

Human interruption exists to resolve ambiguity
or freeze intent via approval,
not to improve outcomes.

Otherwise, execution continues automatically.

---

### 3.7 Ownership

- Primary: AI (Architect Agent)
- Authority: System Rules
- Human Role: Decision only if interrupted + Stage A approval gate

---

## 4. Stage B — Documentation & Specification (Documentation Refinement Loop)

### 4.1 Objective

Convert Stage A frozen intent into **execution-grade documentation**.

Documentation must be sufficient for deterministic code generation.
Stage B includes a deterministic refinement loop to eliminate specification gaps.

---

### 4.2 Inputs

- All Stage A artifacts (especially `idea_final_spec.md`)
- HALO governance rules
- Existing standards and templates (if allowed)

---

### 4.3 Outputs

Stage B MUST produce the following CLOSED artifacts:

- `artifacts/stage_B/specifications.md` — complete technical specifications
- `artifacts/stage_B/data_schemas.md` — all required data schemas
- `artifacts/stage_B/interface_contracts.md` — interface definitions and contracts
- `artifacts/stage_B/validation_rules.md` — validation logic and constraints
- `artifacts/stage_B/edge_cases.md` — explicitly documented edge cases

Stage B MUST also produce the following CLOSED artifacts:

- `artifacts/stage_B/docs_gap_report.md` — deterministic gap/contradiction report containing:
  - missing MUST-level requirements (by reference)
  - contradictions between documents (by clause reference)
  - underspecified behaviors (by clause reference)
  - authority violations (e.g., scope expansion signals)

- `artifacts/stage_B/docs_coverage_matrix.md` — coverage mapping containing:
  - Stage A frozen requirements → Stage B document sections
  - coverage status: COVERED / MISSING / CONFLICT

- `artifacts/stage_B/spec_pack_manifest.md` — explicit manifest of Stage B outputs containing:
  - artifact list with paths
  - version identifiers
  - dependency ordering (consumption order for Stage C)

All artifacts:
- MUST be Markdown
- MUST be standalone
- MUST be versioned
- MUST conform to the Artifact Schema & Repository Layout Standard

---

### 4.4 Validation Gates

Stage B **passes only if**:
- No ambiguity remains for MUST-level behaviors
- All behaviors are specified deterministically
- Inputs and outputs are deterministic
- No missing sections exist
- `docs_gap_report.md` indicates ZERO unresolved MUST-level gaps
- `docs_coverage_matrix.md` indicates 100% coverage of MUST-level requirements
- `spec_pack_manifest.md` is complete and consistent with produced artifacts

---

### 4.4.1 Specification Finality Rule (Hard)

Stage B documents MUST be:
- Complete
- Explicit
- Non-interpretive

Any behavior, edge case, or rule
not explicitly written
is considered NON-EXISTENT.

Stage C MUST NOT:
- Infer missing behavior
- Complete implied logic
- Resolve underspecified cases

Underspecification is a documentation failure,
not an implementation opportunity.

---

### 4.4.2 Prohibition of Specification Over-Completion (Hard)

Stage B documentation MUST include
ONLY what is explicitly required
by Stage A outputs.

Stage B MUST NOT:
- Add speculative edge cases
- Introduce anticipatory safeguards
- Expand behavior “for safety”
- Encode assumptions about implementation convenience

Completeness does NOT mean exhaustiveness.

Any specification element not strictly required
by validated Stage A artifacts
constitutes scope expansion
and MUST cause Stage B to fail.

---

### 4.4.3 Documentation Refinement Loop Termination Criteria (Hard)

Stage B refinement iterations are permitted ONLY until all are true:
- `docs_gap_report.md` contains ZERO MUST-level gaps
- `docs_gap_report.md` contains ZERO contradictions
- `docs_coverage_matrix.md` indicates 100% coverage of MUST-level requirements
- No authority violations are present

If these criteria cannot be met deterministically due to:
- missing upstream intent
- multiple equally valid interpretations
- external constraints missing

Execution MUST return to Stage A
or enter Human Interrupt per the Autonomy Policy & Human Interrupt Protocol,
as determined by failure classification rules.

---

### 4.5 Failure Handling

If Stage B fails, the pipeline MUST determine
the failure class deterministically:

- If failure is due to missing or ambiguous architecture
  → Return to Stage A
- If failure is due to incomplete, unclear, or inconsistent specification
  → Remain in Stage B and regenerate documentation
- If failure reveals invalid assumptions
  → Escalate per Autonomy Policy

Blind rollback to Stage A is forbidden.

---

### 4.6 Human Interrupt Conditions

Human input is required **only if**:
- Conflicting interpretations are equally valid
- A business decision is required
- External constraints are missing

---

### 4.7 Ownership

- Primary: AI (Docs Writer Agent)
- Authority: Documentation Contract
- Human Role: Clarification only if interrupted

---

## 5. Stage C — Code Generation & Implementation (Code Compliance Loop)

### 5.1 Objective

Generate **production-aligned code** strictly from documentation.

Stage C includes a deterministic compliance loop:
- detect mismatches
- stop
- return upstream when required
- and only proceed when compliance is proven

No creative interpretation is allowed.

---

### 5.2 Inputs

- All Stage B documents (as listed in `spec_pack_manifest.md`)
- Repository structure rules
- Existing codebase (if any)

---

### 5.3 Outputs

Stage C MUST produce the following artifacts:

- Source code under the approved repository structure
- Configuration files colocated with their owning modules
- Scripts placed under deterministic, documented paths
- Inline documentation ONLY if explicitly allowed by Stage B specifications

Stage C MUST also produce the following CLOSED artifacts:

- `artifacts/stage_C/code_trace_matrix.md` — mapping containing:
  - Stage B requirement clause → file path → symbol/section → justification
  - MUST-level clause coverage status

- `artifacts/stage_C/code_mismatch_report.md` — deterministic mismatch report containing:
  - undocumented behaviors found in code (by file/section)
  - missing behaviors required by specs (by clause)
  - interface mismatches (by contract reference)
  - data schema mismatches (by schema reference)

- `artifacts/stage_C/test_evidence.md` — test evidence containing:
  - executed test commands
  - deterministic output references (paths to logs)
  - PASS/FAIL declaration per test suite
  - build/run evidence if applicable

All code artifacts MUST:
- Be traceable 1:1 to Stage B documents
- Conform to repository layout rules
- Be auditable and deterministic

---

### 5.3.1 One-to-One Mapping Rule (Hard)

Every code artifact produced in Stage C
MUST map directly to:
- A specific document
- A specific section
- A specific requirement

Unmapped code is forbidden.

If a code line cannot be traced
to an explicit specification clause:
- Code generation MUST stop
- Execution MUST return to Stage B

---

### 5.4 Validation Gates

Stage C **passes only if**:
- Code matches specs exactly
- No undocumented behavior exists
- Build succeeds (if applicable)
- `code_trace_matrix.md` indicates 100% coverage of MUST-level requirements
- `code_mismatch_report.md` indicates ZERO unresolved mismatches
- `test_evidence.md` indicates required tests PASS (as applicable)

---

### 5.4.1 Specification Completeness Enforcement

If any required behavior, edge case, or interface
is not explicitly defined in Stage B documents:

- Code generation MUST stop
- No inference or creative completion is allowed
- Execution MUST return to Stage B

Spec gaps are not implementation problems.
They are documentation failures.

---

### 5.4.2 No-Refactor Rule (Hard Constraint)

Stage C MUST NOT:
- Refactor for cleanliness
- Optimize performance
- Improve readability
- Modify structure beyond what is explicitly specified

If code improvement appears necessary,
the pipeline MUST:
- Log the need as an issue
- Complete the current task as specified
- Propose improvement only as a NEW task

Execution correctness has absolute priority
over elegance or quality improvements.

---

### 5.4.3 Code Compliance Loop Termination Criteria (Hard)

Stage C compliance iterations are permitted ONLY until all are true:
- `code_mismatch_report.md` contains ZERO unresolved mismatches
- `code_trace_matrix.md` indicates 100% MUST-level coverage
- required tests PASS (as applicable)

If compliance cannot be achieved because specs are insufficient:
- Stage C MUST stop
- Execution MUST return to Stage B
- No local workaround is permitted

If compliance cannot be achieved due to missing external inputs
(credentials, keys, non-derivable parameters):
- Execution MUST enter Human Interrupt per contract

---

### 5.5 Failure Handling

If Stage C fails:
- Identify spec mismatch
- Roll back code changes
- Return to Stage B

---

### 5.6 Human Interrupt Conditions

Human input is required **only if**:
- External credentials or secrets are missing
- Multiple implementation paths are equally valid

---

### 5.7 Ownership

- Primary: AI (Code Builder Agent)
- Authority: Documentation
- Human Role: Provider of missing data only

---

## 6. Stage D — Verification & Decision

### 6.1 Objective

Validate that the system:
- Matches documentation
- Behaves as intended
- Is safe to accept

---

### 6.2 Inputs

- Generated code
- Test definitions
- Verification rules

---

### 6.3 Outputs

Stage D MUST produce CLOSED verification artifacts
as defined by the Build & Verify Playbook (Local),
including at minimum:

- Verification report artifact
- Test result artifacts (as applicable)

Stage D MUST NOT require, assume,
or depend on the existence of a Decision artifact.

A Decision artifact may exist ONLY if:
- A selectable execution fork exists, AND
- A human-issued decision is required by contract, AND
- The decision is captured and logged by the orchestrator

Decision artifact structure, schema, naming,
and storage location
are governed EXCLUSIVELY by:
- Decision Logging & Change Traceability Specification

---

## 6.3.1 Decision Authority Clarification (Hard)

Stage D performs verification ONLY.

Verification PASS confirms:
- Structural correctness
- Contract compliance
- Boundary safety

Verification PASS does NOT:
- Grant acceptance authority
- Signal success
- Imply approval
- Conclude execution outcome
- Create a waiting state

A Decision in Stage D may be produced ONLY if:
- Verification PASS is achieved, AND
- More than one valid post-verification execution path exists, AND
- Acceptance authority is explicitly required by contract

If verification PASS deterministically mandates the outcome:
- NO Decision MUST be logged
- The outcome MUST be applied automatically
- Execution MUST continue without pause

If verification FAILS and:
- No retry is permitted, AND
- No valid execution alternative exists

Execution MUST Abort.

Verification outcome MUST NOT be reframed
as success,
completion,
acceptance,
or implicit approval
under any circumstances.

Stage D enforces boundaries.
It does NOT conclude value.

---

### 6.3.1.1 Prohibition of Recommendation Authority (Hard)

Stage D has ZERO authority to:
- Recommend an option
- Suggest a preferred outcome
- Frame one path as safer or better
- Rank alternatives
- Influence human choice

Stage D may ONLY:
- Enforce verification results
- Declare PASS or FAIL
- Trigger mandatory escalation when required

Any language, artifact, or output
that frames a “recommended” path
constitutes a violation
and MUST halt execution.

---

### 6.3.2 Finality Rule (Hard Final)

Stage D is an absolute execution boundary.

After Verification PASS is achieved and the post-verification outcome is applied
(deterministically or via a human-issued Decision when a selectable fork exists):

- No artifact may be modified
- No artifact may be regenerated
- No behavior may be adjusted
- No cleanup, refactor, or polish is allowed

Any perceived defect, improvement, or enhancement
after Stage D
constitutes a NEW TASK.

Stage D does not conclude execution quality.
It concludes execution authority.

---

### 6.4 Validation Gates

Stage D **passes only if**:
- All required tests pass
- No critical warnings exist
- System integrity is confirmed

---

### 6.5 Failure Handling

If Stage D fails:

- The failure reason MUST be classified
- Rollback MUST occur per Build & Verify Playbook
- Retries are allowed ONLY if:
  - Retry conditions are satisfied
  - Retry uniqueness can be guaranteed
  - No boundary or policy risk is involved

Retry behavior is governed exclusively by:
- Autonomy Policy & Human Interrupt Protocol
- Build & Verify Playbook (Local)

If retry conditions are not met
→ Human escalation is mandatory.

---

### 6.6 Human Interrupt Conditions

Human interruption is required **only if**:
- A selectable execution fork exists that cannot be resolved deterministically, OR
- Mandatory external input is missing (credentials, keys, non-derivable parameters), OR
- An explicit contract requires human acceptance authority for post-verification continuation

Human interruption MUST NOT be requested for:
- Preference confirmation
- “Best practice” selection
- Confidence or reassurance
- Cosmetic or quality judgment

---

### 6.7 Ownership

- Primary: AI (Verifier Agent)
- Authority: Verification rules and governing contracts
- Human Role: Respond ONLY to a contract-mandated Human Interrupt

---

## 6.8 Stage Completion Is Irreversible (Hard Rule)

Once a pipeline stage is CLOSED:

- Its artifacts are immutable
- Its assumptions are locked
- Its authority ends permanently

No stage may be:
- Reopened implicitly
- Reinterpreted retroactively
- Patched by downstream behavior

Reopening a closed stage is allowed ONLY via:
- Explicit rollback
- Logged decision (if applicable)
- Full downstream invalidation

Any attempt to treat a closed stage
as “soft closed” or “revisitable”
is a system violation.

Once a stage is closed,
its authority is permanently exhausted.

A closed stage MUST NOT be:
- Consulted for interpretation
- Reused for intent clarification
- Treated as advisory context

Closed artifacts exist ONLY
as execution inputs for downstream stages,
not as interpretive references.

Any attempt to extract new meaning
from closed artifacts
constitutes retroactive interpretation
and is a system violation.

---

## 7. Cross-Stage Guarantees

- No stage may override another stage’s output
- All stage transitions are explicitly logged
- Progress percentage is recalculated
  deterministically after each stage gate
- The pipeline MAY resume execution
  ONLY from the last CLOSED owning stage
  with full authority validity

The pipeline MUST NOT:
- Resume from a downstream stage
  after rollback, re-entry, or abort
- Preserve progress across invalidated stages
- Resume execution from a stage
  whose authority has been exhausted

Resumability is strictly constrained
by stage authority, scope validity,
and Boundary Audit results.

---

## 7.1 Prohibition of Improvement Suggestions During Execution

No pipeline stage may:

- Suggest improvements
- Propose optimizations
- Recommend refactors
- Enhance quality beyond explicit requirements

Execution stages exist to **implement**, not to improve.

Any perceived improvement opportunity MUST:
- Be logged as a non-blocking issue
- NOT alter current execution
- NOT delay stage closure
- Be treated as a potential NEW TASK only after execution completes

---

## 8. Status Reporting Contract

Status reporting, field definitions, execution state derivation,
and all progress semantics are governed EXCLUSIVELY by:

- Progress Tracking & Status Report Contract (v1)

This document MUST NOT:
- Define status fields
- Define status structure
- Define reporting format
- Permit summaries or derived representations

Any emitted human-visible status response MUST be a direct, lossless rendering of:
- `progress/status.json`

Execution authority itself MUST remain with governed runtime authority artifacts.

Any deviation constitutes a contract violation and MUST halt execution.

---

## 9. End of Document

This document is **binding** and supersedes any informal execution flow.

Any deviation is considered a system fault.
