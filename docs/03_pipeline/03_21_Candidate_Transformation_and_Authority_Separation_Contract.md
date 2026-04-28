# Candidate Transformation & Authority Separation Contract

**Document ID:** HALO-DOC-21  
**Applies To:** All Cognitive Outputs  
**Status:** HARD ENFORCEMENT  
**Enforcement:** Fail-Closed  

---

## 1. Purpose

This contract defines how probabilistic AI outputs
are transformed into authoritative pipeline artifacts.

It ensures:

- LLM outputs never gain implicit authority
- No narrative reasoning becomes executable state
- All intelligence remains candidate-bound
- Deterministic validators grant authority exclusively

---

## 2. Core Principle

LLM outputs are ALWAYS classified as:

CANDIDATES

A Candidate:

- Has zero authority
- Cannot mutate progress
- Cannot advance stage
- Cannot trigger retry
- Cannot close artifact
- Cannot override existing state

Candidates may ONLY:

- Be accepted deterministically
- Be rejected deterministically
- Be transformed structurally

---

## 3. Candidate Classification Rule

Every AI output MUST be classified as ONE of:

- STRUCTURED_CANDIDATE
- GAP_DETECTION_CANDIDATE
- TRACE_CANDIDATE
- IMPLEMENTATION_CANDIDATE
- TEST_CANDIDATE

Unclassified AI output → FAIL CLOSED

---

## 4. Structural Transformation Rule

Before any Candidate becomes an artifact:

It MUST be:

- Schema-bound
- Field-addressable
- Deterministically interpretable
- Free of narrative continuity
- Validated against contract-defined schema

If transformation cannot be performed
without preserving narrative structure:

→ FAIL CLOSED

---

## 5. Authority Grant Rule

Authority is granted ONLY when:

1. Candidate transformed into schema-bound artifact
2. Validator PASS occurs
3. Boundary Audit PASS occurs
4. Stage authority permits closure

All four are mandatory.

Skipping any step → SYSTEM VIOLATION

---

## 6. No Direct State Mutation Rule (Hard)

AI outputs MUST NEVER:

- Update governed runtime authority artifacts
- Update `progress/status.json`
- Modify stage transitions
- Log decisions
- Trigger retries
- Initiate rollback
- Trigger human interrupt

Only deterministic pipeline logic may do so.

---

## 7. Narrative Contamination Prohibition

No raw reasoning text
may leak into:

- Authoritative artifacts
- Verification artifacts
- Status artifacts
- Audit artifacts

Reasoning may exist only in:

- Non-authoritative logs
- Local transient buffers
- Debug artifacts not consumed by pipeline

If reasoning leaks into executable state:

→ FAIL CLOSED

---

## 8. Validator Supremacy Rule

Validators have absolute authority over Candidates.

If:

Candidate says PASS  
Validator says FAIL  

→ FAIL

If:

Candidate proposes resolution  
Validator cannot verify  

→ FAIL CLOSED

No AI proposal overrides deterministic validation.

---

## 9. Candidate Lifecycle

A Candidate lifecycle is:

LLM Output  
→ Classification  
→ Structural Transformation  
→ Deterministic Validation  
→ Boundary Audit  
→ Artifact Closure OR Rejection  

No shortcuts permitted.

---

## 10. Cognitive Layer Boundaries

Cognitive Layer may:

- Generate candidates
- Suggest structural transformations
- Detect deterministic inconsistencies

Cognitive Layer may NOT:

- Decide acceptance
- Resolve ambiguous authority
- Escalate unless contract-defined
- Modify frozen artifacts

---

## 11. Fail-Closed Guarantee

If at any point:

- Candidate cannot be classified
- Candidate cannot be transformed deterministically
- Validator cannot interpret candidate
- Authority boundary unclear

Execution MUST halt.

No interpretation permitted.

---

## 12. Final Authority Model

The authority chain is:

Human (Approval Gate)  
→ Deterministic Contracts  
→ Validators  
→ Boundary Audit  
→ Pipeline Orchestrator  

AI is NOT in the authority chain.

AI is an input generator only.

---

**END OF CONTRACT**