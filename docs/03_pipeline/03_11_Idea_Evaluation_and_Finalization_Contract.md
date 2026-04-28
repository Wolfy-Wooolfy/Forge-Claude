# 📄 Document — Idea Evaluation & Finalization Contract

> **Precondition Notice:**  
> This contract operates only after a valid Admission-Ready Project Definition
> has been produced per DOC-01 (Idea Structuring & Admission Layer Contract).
>
> This contract does not replace the Admission Layer
> and must not be used as an entry point into the pipeline.

**Document ID:** HALO-DOC-11
**Status:** BINDING — EXECUTION CONTRACT
**Applies To:** Stage A — Idea Engine
**Enforcement Level:** Fail-Closed
**Authority Type:** Deterministic Stage Contract

---

## 1. Purpose

This document defines the deterministic contract governing:

* Raw Idea Intake
* Idea Evaluation
* Structured Refinement
* Final Idea Specification
* Approval Gate behavior

This contract transforms Stage A from:

> Free-form idea processing

into:

> A bounded, iterative, contract-governed Idea Engine

No Idea may progress to Stage B unless this contract is fully satisfied.

---

## 2. Scope of Stage A

Stage A is responsible ONLY for:

1. Accepting raw idea input
2. Structurally reconstructing it
3. Evaluating feasibility and structural completeness
4. Detecting ambiguity
5. Producing a Final Idea Specification artifact
6. Requesting approval ONLY if deterministically required

Stage A MUST NOT:

* Generate documentation packs
* Generate implementation details
* Assume missing intent
* Expand scope
* Optimize beyond explicit idea content

---

## 3. Inputs

Stage A accepts exactly ONE authoritative input artifact:

```
artifacts/stage_A/raw_idea.json
```

This artifact MUST contain:

* idea_id
* timestamp_utc
* raw_content (string)
* declared_scope (string)
* constraints (array)
* assumptions (array)

If any required field is missing → EXECUTION MUST FAIL CLOSED.

---

## 4. Structural Reconstruction Phase

Raw content MUST be transformed into a structured artifact:

```
artifacts/stage_A/idea_structured.json
```

This artifact MUST contain:

* problem_statement
* target_users
* core_value_proposition
* explicit_constraints
* explicit_non_goals
* measurable_success_criteria
* system_boundaries
* unresolved_questions (array)

Rules:

* All narrative must be converted into field-addressable structure
* No raw free-text paragraphs allowed
* No inference beyond raw input
* No scope expansion

If structural reconstruction cannot be deterministic → FAIL CLOSED.

---

## 5. Idea Evaluation Phase

Evaluation is NOT quality scoring.

Evaluation MUST check only:

* Structural completeness
* Internal contradiction
* Ambiguity detection
* Missing mandatory fields
* Scope leakage
* Implicit assumption detection

Output artifact:

```
artifacts/stage_A/idea_evaluation_report.json
```

Fields:

* evaluation_id
* completeness_status ("COMPLETE" | "INCOMPLETE")
* contradiction_detected (boolean)
* scope_leak_detected (boolean)
* ambiguity_detected (boolean)
* missing_fields (array)
* blocking_questions (array)
* result ("PASS" | "BLOCKED")

Rules:

If:

* missing_fields NOT empty
* ambiguity_detected = true
* contradiction_detected = true

Then:

* result MUST be "BLOCKED"
* blocking_questions MUST contain exactly ONE minimal structural question
* Execution MUST trigger Human Interrupt (Doc-04 compliant)

If no structural issues → result = "PASS"

---

## 6. Final Idea Specification

If evaluation result = PASS:

Stage A MUST generate:

```
artifacts/stage_A/idea_final_spec.json
```

This artifact MUST contain:

* idea_id
* normalized_problem_statement
* validated_scope
* validated_constraints
* validated_non_goals
* validated_success_metrics
* approved_boundaries
* ready_for_documentation (boolean = true)

Rules:

* No new information may be introduced
* No optimization allowed
* Must reflect structured artifact only
* Must remove unresolved questions
* Must be deterministic

If unresolved_questions exist → FAIL CLOSED.

---

## 7. Approval Gate Logic

Approval is required ONLY if:

* raw idea declared "requires explicit confirmation"
* OR structural ambiguity required clarification
* OR scope refinement materially altered meaning

If approval required:

* Execution MUST enter BLOCKED
* A Human Interrupt MUST be triggered
* Approval MUST be logged as Decision artifact (Doc-07)

If approval NOT required:

* Stage A may close autonomously
* Stage transition to Stage B permitted

---

## 8. Exit Criteria (Hard)

Stage A may close ONLY if ALL are true:

* idea_structured.json exists
* idea_evaluation_report.json result = PASS
* idea_final_spec.json exists
* No unresolved_questions remain
* No blocking_questions remain
* Boundary Audit PASS recorded
* Verification PASS recorded

If ANY condition fails → Stage A MUST NOT close.

---

## 9. Prohibited Behaviors

Stage A MUST NOT:

* Score idea attractiveness
* Suggest improvements
* Optimize business model
* Add features
* Expand scope
* Introduce speculative architecture
* Convert idea into documentation format
* Generate implementation-level content

Violation → Boundary Audit FAIL.

---

## 10. Fail-Closed Enforcement

If at any point:

* Determinism cannot be proven
* Structural mapping is ambiguous
* Evaluation cannot produce binary outcome

Then:

* Execution MUST halt
* Human Interrupt required
* No continuation allowed

---

## 11. Authority Separation

Artifacts produced in Stage A:

Have ZERO implementation authority.

They:

* Cannot generate code
* Cannot modify documentation
* Cannot alter pipeline state directly

They serve ONLY as input to Stage B under contract.

---

## 12. Definition of Stage A Completion

Stage A is complete ONLY when:

* idea_final_spec.json exists
* Evaluation PASS
* All audits PASS
* No blocking state
* Stage transition performed by orchestrator

Any other condition → Stage A incomplete.

---

**END OF DOCUMENT**