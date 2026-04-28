# AI Cognitive Loop Execution Contract

**Document ID:** HALO-DOC-20  
**Applies To:** Stages A, B, C  
**Status:** CORE – NON-NEGOTIABLE  
**Enforcement:** Fail-Closed  

---

## 1. Purpose

This contract defines the deterministic execution model
for the HALO Cognitive Layer.

It formalizes the three mandatory intelligence loops:

1. Idea Finalization Loop (Stage A)
2. Documentation Refinement Loop (Stage B)
3. Code Compliance Loop (Stage C)

This document does NOT redefine stage authority.
It defines how intelligence operates inside stage boundaries.

The Cognitive Layer has ZERO authority
to bypass:
- Stage gates
- Boundary Audit
- Verification contracts
- Progress tracking rules

---

## 2. Cognitive Layer Definition

The Cognitive Layer is responsible ONLY for:

- Structured reasoning
- Deterministic comparison
- Gap detection
- Artifact transformation
- Loop execution within stage authority
- Exploration analysis
- Structured option comparison
- Recommendation generation

The Cognitive Layer MUST NOT:

- Modify progress
- Advance stages
- Override audit outcomes
- Interpret beyond explicit contract

It produces Candidates.
Only deterministic validators grant authority.

The Cognitive Layer MAY perform controlled proposal exploration
when multiple architectural or structural paths exist.

Exploration activities are limited to:

- impact analysis
- option generation
- deterministic comparison
- recommendation artifact production

Exploration results MUST remain artifact-bound
and MUST NOT alter execution state.

---

## 3. Idea Finalization Loop (Stage A)

### 3.1 Objective

Transform raw user idea
into a frozen, approval-bound final specification.

### 3.2 Loop Steps

1. Parse idea input
2. Generate structured evaluation artifact
3. Identify ambiguities
4. Perform proposal exploration if multiple valid interpretations exist
5. Generate option_comparison artifact if alternatives detected
6. Resolve deterministically if possible
7. If ambiguity remains → Human Interrupt
8. Generate idea_final_spec.md
9. Require explicit approval record

### 3.3 Termination Condition

Stage A may close ONLY if:

- idea_final_spec.md exists
- idea_approval_record.md exists
- approval = APPROVE
- No unresolved assumptions remain

Otherwise:
→ Stage A remains active
→ No downstream transition allowed

---

## 4. Documentation Refinement Loop (Stage B)

### 4.1 Objective

Convert frozen idea into execution-grade documentation
with ZERO MUST-level gaps.

### 4.2 Loop Steps

1. Generate documentation artifacts
2. Generate docs_coverage_matrix.md
3. Generate docs_gap_report.md
4. If multiple structural documentation strategies exist
   → generate option_matrix.md
5. Run Docs Gap Analyzer (Doc-19)
6. If FAIL → regenerate documentation
7. Repeat until PASS

### 4.3 Deterministic Termination Criteria

Loop terminates ONLY if:

- docs_gap_validation_report.json result = PASS
- coverage = 100% for MUST-level requirements
- zero contradictions
- zero underspecifications
- zero scope expansions

If resolution cannot be achieved deterministically:

→ Return to Stage A  
OR  
→ Human Interrupt (if selectable fork exists)

---

## 5. Code Compliance Loop (Stage C)

### 5.1 Objective

Generate code strictly from documentation
and enforce 1:1 traceability.

### 5.2 Loop Steps

1. Generate code from Stage B specs
2. Produce code_trace_matrix.md
3. Produce code_mismatch_report.md
4. If multiple implementation strategies exist
   → generate implementation_option_matrix.md
5. Run local build
6. Run verification (Build & Verify Playbook)
7. Run Code Trace Validator
8. If mismatch → regenerate code
9. If verification FAIL → classify:
   - Retry
   - Rollback
   - Abort
   - Human Interrupt

### 5.3 Deterministic Termination Criteria

Stage C may close ONLY if:

- code_trace_matrix.md indicates 100% MUST coverage
- code_mismatch_report.md contains ZERO unresolved mismatches
- verification_report.json result = PASS
- required stage closure artifact exists

Otherwise:
→ Stage C remains active

---

## 6. Loop Escalation Hierarchy

If a loop cannot converge deterministically:

Stage C → return to Stage B  
Stage B → return to Stage A  

Escalation upward is mandatory.
Downward patching is forbidden.

Cross-stage repair is strictly prohibited.

---

## 7. Loop Determinism Rule (Hard)

A loop iteration is valid ONLY if:

- It changes artifact content materially
- It removes at least one classified failure
- It does not introduce new scope

If iteration does not materially change state:
→ Loop classified as Local Execution Loop
→ Must follow Loop Detection rules (Build & Verify Playbook)

---

## 8. No Open-Ended Intelligence

The Cognitive Layer MUST NOT:

- Improve beyond requirements
- Optimize beyond specs
- Continue refinement without explicit failure classification
- Loop based on perceived quality

All loops are failure-driven.
Not improvement-driven.

---

## 9. Authority Separation

Cognitive Layer:
- Generates structured artifacts
- Detects issues
- Proposes deterministic corrections

Validators:
- Grant PASS/FAIL

Pipeline:
- Advances or halts

Boundary Audit:
- Enforces permission

Human:
- Resolves selectable forks only

No layer may absorb another layer's authority.

---

## 9.1 Exploration Artifacts

When architectural alternatives are detected,
the Cognitive Layer MUST generate structured comparison artifacts.

Allowed artifacts include:

- option_matrix.md
- proposal_analysis.json
- recommendation_report.md
- implementation_option_matrix.md

These artifacts serve analytical purposes only.

They MUST NOT:

- alter execution state
- advance stages
- modify artifacts outside the loop scope
- bypass Decision Gate or Human Interrupt

---

## 10. Cognitive Loop Completion Definition

The Cognitive Lifecycle is considered complete ONLY if:

Stage A:
- Final spec approved

Stage B:
- Gap validation PASS

Stage C:
- Code trace PASS
- Verification PASS

Stage D:
- Verification PASS

Only then may the task lifecycle conclude.

---

## 11. Fail-Closed Supremacy

If any Cognitive Loop:

- Cannot classify failure
- Cannot determine convergence
- Detects ambiguity without resolution path
- Encounters validator conflict

Execution MUST:

- Halt
- Classify deterministically
- Escalate per Autonomy Policy

No silent continuation allowed.

---

**END OF CONTRACT**