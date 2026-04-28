# 📄 Documentation Pack Index v1
**Document ID:** DOC-19  
**Status:** EXECUTION-BOUND  
**Scope:** Canonical Documentation Registry  
**Applies To:** Forge
**Enforcement Level:** HARD (Fail-Closed)

---

## 1. Purpose

This index is the canonical registry of all execution-bound documents and schemas
that define authoritative behavior within this repository.

It exists to:

- Eliminate document discovery ambiguity
- Declare binding vs reference-only sources
- Lock the canonical contract set
- Declare supersession rules (v1 → v2)
- Enforce naming portability rules

If this index is missing, incomplete, or outdated:
→ Execution MUST enter BLOCKED state.

---

## 2. Authority Resolution

Authority hierarchy is defined in:

- docs/04_autonomy/05_Artifact_Authority_Hierarchy_Specification.md (DOC-11)

All conflicts MUST be resolved by DOC-11.

---

## 3. Reference-Only (No Execution Authority)

- docs/01_system/03_Project_Vision_Reference.md (DOC-01)

---

## 4. Core Execution-Bound Pack (v1, binding unless superseded)

- docs/01_system/00_Project_Identity_Contract.md
- docs/01_system/02_System_Overview_and_Operating_Model.md
- docs/01_system/04_Vision_and_Cognitive_Layer_Reference.md
- docs/02_scope/02_Scope_and_Success_Contract.md
- docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md
- docs/03_pipeline/03_Cognitive_Layer_Engines_Execution_Contracts.md
- docs/03_pipeline/03_11_Idea_Evaluation_and_Finalization_Contract.md
- docs/03_pipeline/03_12_Documentation_Gap_Detection_and_Refinement_Loop_Contract.md
- docs/03_pipeline/03_13_Code_to_Documentation_Trace_and_Consistency_Contract.md
- docs/03_pipeline/03_14_Final_Acceptance_and_Release_Gate_Contract.md
- docs/03_pipeline/03_15_Cognitive_Lifecycle_Orchestration_Specification.md
- docs/03_pipeline/03_20_AI_Cognitive_Loop_Execution_Contract.md
- docs/03_pipeline/03_21_Candidate_Transformation_and_Authority_Separation_Contract.md
- docs/04_autonomy/04_Autonomy_Policy_and_Human_Interrupt_Protocol.md
- docs/05_artifacts/05_Artifact_Schema_and_Repository_Layout_Standard.md
- docs/05_artifacts/05_16_Cognitive_Artifacts_Definition_Specification.md
- docs/06_progress/06_Progress_Tracking_and_Status_Report_Contract_v1.md
- docs/07_decisions/07_Decision_Logging_and_Change_Traceability_Specification.md
- docs/08_audit/08_Forge_Boundary_Audit_Rules_Fail-Closed_Pack.md
- docs/08_audit/09_Vision_Alignment_Contract.md
- docs/09_verify/09_Build_and_Verify_Playbook_Local.md
- docs/09_verify/09_17_Cross_Document_Consistency_Review_Contract.md
- docs/09_verify/09_18_Code_to_Spec_Trace_Validator_Contract.md
- docs/09_verify/09_19_Docs_Gap_Analyzer_Validator_Contract.md
- docs/10_runtime/10_Tech_Assumptions_and_Local_Runtime_Setup.md

---

## 5. v2 Canonical Addendum (Execution-Bound)

### Governance & Cognitive Layer
- docs/04_autonomy/05_Artifact_Authority_Hierarchy_Specification.md (DOC-11)
- docs/04_autonomy/06_Cognitive_Layer_Contract.md (DOC-12)

### Loop & Stage Rebinding
- docs/03_pipeline/03_16_Loop_Enforcement_Specification.md (DOC-13)
- docs/03_pipeline/03_17_Stage_Contracts_Revision_v2.md (DOC-14)

### Vision Compliance Enforcement
- docs/02_scope/03_Vision_Coverage_Matrix_Contract.md (DOC-15)
- docs/02_scope/04_Vision_Gap_Detection_Specification.md (DOC-16)

### Artifact Schema (v2)
- docs/05_artifacts/05_17_Artifact_Schema_Revision_v2.md (DOC-17)
- docs/05_artifacts/05_18_Artifact_Serialization_and_Embedded_JSON_Rule.md (DOC-21)

### Progress Contract (v2)
- docs/06_progress/06_Progress_Contract_Revision_v2.md (DOC-18)

---

## 6. Machine-Verifiable Schemas (Canonical)

### Progress
- docs/06_progress/status_schema_v2.json (SCHEMA-01)

### Task Artifacts
- docs/05_artifacts/task_artifact_schema_v1.json (SCHEMA-02)

### Stage Closure
- docs/05_artifacts/stage_closure_schema_v1.json (SCHEMA-06)

### Stage C Verification
- docs/09_verify/trace_matrix_schema_v1.json (SCHEMA-03)
- docs/09_verify/mismatch_report_schema_v1.json (SCHEMA-04)
- docs/09_verify/verification_evidence_schema_v1.json (SCHEMA-05)

---

## 7. Supersession Map (v1 → v2)

- DOC-11 governs all authority conflicts
- DOC-12 governs Cognitive Layer execution units
- DOC-13 governs loop closure gating
- DOC-14 governs stage closure conditions where older docs conflict
- DOC-17 extends artifact schema to recognize TASK-layer formally
- DOC-18 governs status.json rules where v1 is insufficient

Where not explicitly superseded:
v1 documents remain binding.

---

## 8. Filename Portability Rule (Hard)

Canonical filenames MUST be ASCII-safe.
Non-ASCII punctuation is prohibited in canonical filenames.

---

## 9. Update Policy

This index MUST be updated when:

- A new execution-bound document is introduced
- A contract revision changes authority meaning
- A schema revision is introduced
- Any canonical file is renamed or relocated

Failure to update:
→ Governance violation
→ Execution MUST enter BLOCKED

---

**END OF DOCUMENT**
