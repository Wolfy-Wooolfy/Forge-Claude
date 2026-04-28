# 📄 Artifact Schema Revision v2
**Document ID:** DOC-17  
**Status:** EXECUTION-BOUND  
**Scope:** Artifact Types & Repository Layout Update  
**Applies To:** Entire Project  
**Enforcement Level:** HARD (Fail-Closed)

---

## 1. Purpose

This document updates the Artifact Schema
to formally include Task-level artifacts
as part of the official repository structure.

It aligns artifact governance with:

- DOC-11 (Authority Hierarchy)
- DOC-12 (Cognitive Layer)
- DOC-13 (Loop Enforcement)
- DOC-14 (Stage Contracts Revision)
- DOC-21 (Artifact Serialization & Embedded JSON Rule)

---

## 2. Official Artifact Categories (Updated)

The project now recognizes five artifact categories:

1. Stage Artifacts
2. Task Artifacts
3. Coverage & Gap Artifacts
4. Verification Artifacts
5. Release Artifacts

Any artifact outside these categories:
→ Considered invalid.

---

## 3. Repository Layout (Revised)

Official layout:

artifacts/
│
├── stage_A/
├── stage_B/
├── stage_C/
├── stage_D/
│
├── tasks/
│   ├── TASK-XXX.execution.md
│   ├── TASK-XXX.closure.md
│   └── TASK-XXX.validation.md
│
├── coverage/
│   ├── vision_coverage_matrix.md
│   └── vision_gap_report.md
│
└── release/
    ├── deployment_record.md
    └── runtime_validation.md

Stage C required verification artifacts are Stage Artifacts
and MUST live under:

- artifacts/stage_C/

Deviation from this layout:
→ Governance violation.

---

## 4. Task Artifact Definition

A Task Artifact MUST:

- Declare Task ID
- Declare Stage Binding
- Declare Contract Clauses Satisfied
- Declare Deterministic Inputs
- Declare Deterministic Outputs
- Declare Verification Binding (schema + evidence)

Task artifacts are mandatory for any multi-step task.

---

## 5. Stage Closure Artifact Definition

A Stage Closure Artifact MUST:

- Reference the last valid Stage Artifact outputs
- Reference all verification evidence
- Declare closure status (PASS/FAIL)
- Contain zero narrative authority

Closure artifacts are pointers, not arguments.

---

## 6. Coverage Artifacts

Coverage folder MUST contain:

- Vision Coverage Matrix
- Vision Gap Report

If missing:
→ Vision compliance invalid.

---

## 7. Verification Artifacts (Stage C)

Stage C MUST produce verification artifacts as Stage Artifacts under:

- artifacts/stage_C/

Required artifacts and canonical paths:

- artifacts/stage_C/code_trace_matrix.md  
  - Embedded JSON MUST conform to SCHEMA-03: docs/09_verify/trace_matrix_schema_v1.json

- artifacts/stage_C/code_mismatch_report.md  
  - Embedded JSON MUST conform to SCHEMA-04: docs/09_verify/mismatch_report_schema_v1.json

- artifacts/stage_C/test_evidence.md  
  - Embedded JSON MUST conform to SCHEMA-05: docs/09_verify/verification_evidence_schema_v1.json

Stage C cannot close without these.

All verification artifacts MUST comply with DOC-21 (Markdown container + embedded JSON).

---

## 8. Artifact Identity Rules

Every artifact MUST:

- Have deterministic filename
- Be reproducible under same inputs
- Contain schema-bound structure
- Avoid narrative-only justification

Artifacts define state.
Logs do not.

---

## 9. Backward Compatibility Rule

Existing artifacts under artifacts/tasks/
are now officially recognized.

No migration required.

---

## 10. Enforcement Rule

Any artifact:

- Missing required fields
- Outside defined categories
- Violating DOC-21 container rule
- Violating schema binding (where required)

→ SYSTEM FAILURE (Fail-Closed).

**END OF DOCUMENT**
