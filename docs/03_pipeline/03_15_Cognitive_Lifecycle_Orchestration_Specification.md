# Cognitive Lifecycle Orchestration Specification

**Document ID:** HALO-DOC-15  
**Status:** BINDING – EXECUTION ORCHESTRATION  
**Scope:** Full Lifecycle (Stage A → Stage D)  
**Enforcement:** Fail-Closed  

---

## 1. Purpose

This document defines the deterministic orchestration rules
governing the complete cognitive lifecycle:

Stage A → Stage B → Stage C → Stage D

It specifies:

- Entry conditions per stage
- Exit conditions per stage
- Artifact promotion rules
- Transition gating rules
- Loop re-entry rules
- Termination authority

This document does NOT redefine stage behavior.
It defines stage interaction authority.

---

## 2. Lifecycle Overview

The lifecycle consists of exactly four stages:

A — Idea Evaluation & Finalization  
B — Documentation Generation & Refinement  
C — Code Implementation & Verification  
D — Final Acceptance & Release Gate  

No additional lifecycle stages are permitted.

Design Exploration is NOT a lifecycle stage.

It is a bounded analytical sub-phase
that may occur inside Stage A, Stage B, or Stage C
when multiple valid, contract-compliant alternatives exist
and objective-governed evaluation is required
before deterministic continuation or decision escalation.

Design Exploration MUST NOT:

- create a fifth stage
- alter stage ordering
- grant transition authority
- bypass Decision Gate or Human Interrupt

---

## 3. Stage Entry Conditions

### 3.1 Stage A Entry

Stage A may begin ONLY when:

- A raw idea artifact exists
- No active lifecycle execution is running
- governed runtime authority artifacts allow deterministic Stage A entry

Stage A MUST produce:
- idea_evaluation_report
- idea_final_spec
- stage_A_closure_artifact

Stage A MAY also produce, if required by a valid execution fork:

- exploration artifacts
- recommendation artifacts

Such artifacts are analytical only
and MUST NOT grant closure authority.

Without closure artifact → Stage A not closed.

---

### 3.2 Stage B Entry

Stage B may begin ONLY when:

- Stage A closure artifact exists
- idea_final_spec is authoritative
- No active BLOCKED state exists

Stage B MUST produce:
- documentation_pack
- gap_analysis_report
- documentation_refinement_closure

Stage B MAY also produce, if multiple valid documentation paths exist:

- exploration artifacts
- recommendation artifacts

Such artifacts are analytical only
and MUST NOT grant closure authority.

Gap count MUST be zero before closure.

---

### 3.3 Stage C Entry

Stage C may begin ONLY when:

- Stage B closure artifact exists
- documentation_pack is final
- No unresolved documentation gaps remain

Stage C MUST produce:
- code_trace_matrix
- code_mismatch_report
- test_evidence
- stage_C_closure_artifact

Stage C MAY also produce, if multiple valid implementation paths exist:

- exploration artifacts
- recommendation artifacts

Such artifacts are analytical only
and MUST NOT grant closure authority.

Trace mismatches MUST be zero before closure.

---

### 3.4 Stage D Entry

Stage D may begin ONLY when:

- Stage C closure artifact exists
- verification_report.json exists
- No active Execution Abort exists
- No BLOCKED state unresolved

Stage D MUST produce:
- final_acceptance_report.json
- release_gate_closure.md (if ACCEPTED)

---

## 4. Transition Authority Rules

Stage transitions are allowed ONLY when:

- Current stage closure artifact exists
- Required verification passed
- No boundary audit FAIL exists
- No retry in-progress
- No rollback active
- governed runtime authority artifacts updated by orchestrator
- `progress/status.json` updated by orchestrator only as reflection/output

Stage transitions MUST NOT be triggered by:

- Candidate outputs
- LLM suggestions
- Narrative interpretation
- Implicit completion

Only closure artifacts grant transition authority.

Exploration artifacts and recommendation artifacts
MUST NOT:

- trigger stage transition
- grant closure authority
- justify implicit progression

They may only support deterministic evaluation
or decision escalation within the owning stage.

---

## 5. Loop Re-Entry Rules

Re-entry is allowed ONLY:

- From Stage B to Stage B (gap refinement loop)
- From Stage C to Stage C (code correction loop)
- From Stage C back to Stage B (if documentation flaw detected)
- From Stage D back to owning failed stage (if rejected)

Re-entry MUST:

- Invalidate failed closure artifact
- Preserve historical artifacts
- Log deterministic re-entry classification
- Update progress/state via orchestrator only

Implicit re-entry forbidden.

---

## 5.1 Exploration Escalation Rule

If Design Exploration occurs inside a stage
and evaluation still leaves more than one valid path:

- the stage MUST NOT continue autonomously
- a Decision or Human Interrupt escalation MUST occur
  according to the governing contracts
- execution MUST remain inside the owning stage
  until the fork is resolved deterministically

If exploration disqualifies all but one path
through explicit constraint enforcement,
the stage MAY continue deterministically
without a Decision.

---

## 6. Cross-Stage Invalidation Rules

If a later stage detects failure caused by earlier stage:

Example:
- Stage C detects documentation inconsistency
- Stage D rejects due to missing trace coverage

Then:

- The owning stage MUST be re-opened
- Its closure artifact loses authority
- Downstream artifacts lose authority
- Lifecycle re-enters deterministically

No patching across stage boundaries allowed.

---

## 7. Lifecycle Termination Conditions

Lifecycle terminates ONLY when:

- Stage D final_result = "ACCEPTED"
- release_gate_closure.md exists
- No boundary audit FAIL active
- No unresolved execution state

If final_result = "REJECTED":

- Lifecycle remains open
- Deterministic re-entry required

Execution Abort at any stage:

- Terminates current attempt
- Requires new deterministic attempt

---

## 8. Orchestrator Supremacy Rule

Only the orchestrator may:

- Update governed runtime authority artifacts
- Update `progress/status.json` as reflection/output
- Approve stage transition
- Freeze progress
- Recalculate progress percentages
- Classify BLOCKED vs ABORTED

No stage may self-advance.

---

## 9. Deterministic Lifecycle Guarantee

The lifecycle is considered deterministic if:

- Every stage produces closure artifacts
- Every transition is artifact-bound
- Every failure is classified
- No stage advances on interpretation
- No narrative output changes state

If determinism cannot be proven:
→ Execution MUST FAIL CLOSED.

---

## 10. Prohibited Behaviors

The lifecycle MUST NOT:

- Skip Stage A
- Generate code without finalized documentation
- Accept project without full trace validation
- Override audit results
- Allow implicit advancement
- Allow closure without artifact

Any violation → SYSTEM FAILURE.

---

## 11. Authority Clarification

Cognitive intelligence generates artifacts.

Pipeline governance grants authority.

Verification enforces correctness.

Boundary audit enforces permission.

Stage D grants acceptance.

Authority is layered and separated.

No layer may assume another’s authority.

---

## 12. Definition of Lifecycle Completion

Lifecycle completion exists ONLY when:

- All four stages closed
- Acceptance report = ACCEPTED
- Release closure exists
- Deterministic traceability proven
- No unresolved audit issues
- No execution state ambiguity

Only then is the project considered complete.

---

**END OF SPECIFICATION**