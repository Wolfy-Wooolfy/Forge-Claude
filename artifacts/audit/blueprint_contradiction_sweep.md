# Blueprint Contradiction Sweep — PHASE-0.5
**Produced by:** Claude Code (PHASE-0.5 Automated Sweep)
**Date:** 2026-05-08
**Authority:** DECISION-20260508-phase-0.5-contradiction-sweep-start
**Reference Blueprint:** architecture/FORGE_V2_BLUEPRINT.md (adopted DECISION-20260508)

---

## 1. Sweep Summary

| Metric | Value |
|---|---|
| Total docs/ files read | 114 |
| BLOCKERs | 2 |
| WARNs | 8 |
| INFOs | 4 |
| CLEAR (no finding) | ~100 |
| Verdict | **BLOCKED — resolve B-01 and B-02 before PHASE-1** |

---

## 2. File Coverage (Proof of Open)

### Tier 1 — Deep Read (~48 files)

#### docs/12_ai_os/ (21 files)
| # | File | Status |
|---|---|---|
| 1 | docs/12_ai_os/00_AI_OS_MASTER_SPEC.md | CLEAR |
| 2 | docs/12_ai_os/01_AI_OS_VISION.md | INFO-I-01 |
| 3 | docs/12_ai_os/02_USER_EXPERIENCE_MODEL.md | CLEAR |
| 4 | docs/12_ai_os/03_CONVERSATION_LAYER_CONTRACT.md | CLEAR |
| 5 | docs/12_ai_os/04_PROJECT_OBJECT_MODEL.md | CLEAR |
| 6 | docs/12_ai_os/05_PROJECT_LIFECYCLE.md | CLEAR |
| 7 | docs/12_ai_os/06_DISCUSSION_AND_IDEATION_LOOP.md | CLEAR |
| 8 | docs/12_ai_os/07_OPTION_DECISION_CONTRACT.md | CLEAR |
| 9 | docs/12_ai_os/08_DOCUMENTATION_BUILD_LOOP.md | CLEAR |
| 10 | docs/12_ai_os/09_EXECUTION_HANDOFF_TO_FORGE.md | CLEAR |
| 11 | docs/12_ai_os/10_EXISTING_PROJECT_REVIEW_WORKFLOW.md | CLEAR |
| 12 | docs/12_ai_os/11_MULTI_PROJECT_ORCHESTRATION.md | CLEAR |
| 13 | docs/12_ai_os/12_DELIVERY_AND_RUNBOOK_CONTRACT.md | CLEAR |
| 14 | docs/12_ai_os/13_AI_PROVIDER_ROLE.md | CLEAR |
| 15 | docs/12_ai_os/14_VERIFICATION_LOOP.md | INFO-I-03 |
| 16 | docs/12_ai_os/15_SEARCH_AND_EXTERNAL_RESEARCH.md | CLEAR |
| 17 | docs/12_ai_os/16_DECISION_OWNERSHIP_RULES.md | CLEAR |
| 18 | docs/12_ai_os/17_NON_TECHNICAL_USER_EXPERIENCE.md | INFO-I-02 |
| 19 | docs/12_ai_os/18_INTERFACE_REQUIREMENTS.md | CLEAR |
| 20 | docs/12_ai_os/19_AI_OS_RUNTIME_BEHAVIOR_CONTRACT.md | CLEAR |
| 21 | docs/12_ai_os/20_REQUIREMENT_DISCOVERY_LOOP.md | CLEAR |

#### docs/04_autonomy/ (6 files)
| # | File | Status |
|---|---|---|
| 22 | docs/04_autonomy/02_Execution_Trigger_Rules.md | CLEAR |
| 23 | docs/04_autonomy/04_Autonomy_Policy_and_Human_Interrupt_Protocol.md | WARN-W-03 |
| 24 | docs/04_autonomy/05_Artifact_Authority_Hierarchy_Specification.md | BLOCKER-B-02 |
| 25 | docs/04_autonomy/06_Cognitive_Layer_Contract.md | WARN (Stage D ref — see B-01) |
| 26 | docs/04_autonomy/07_Cognitive_Engine_Interface_Contract.md | CLEAR |
| 27 | docs/04_autonomy/Cognitive_Request_Response_Contract.md | WARN-W-04 |

#### docs/11_ai_layer/ (12 files)
| # | File | Status |
|---|---|---|
| 28 | docs/11_ai_layer/01_AI_LAYER_SCOPE.md | WARN-W-01 |
| 29 | docs/11_ai_layer/02_AI_LAYER_ARCHITECTURE.md | CLEAR |
| 30 | docs/11_ai_layer/03_AI_LAYER_GOVERNANCE.md | WARN-W-01 |
| 31 | docs/11_ai_layer/04_AI_LAYER_ARTIFACTS.md | CLEAR |
| 32 | docs/11_ai_layer/05_AI_LAYER_RUNTIME_FLOW.md | WARN-W-01 |
| 33 | docs/11_ai_layer/06_AI_RUNTIME_GOVERNANCE_CONTRACT.md | WARN-W-01 |
| 34 | docs/11_ai_layer/06_CHAT_FIRST_WORKSPACE_SPEC.md | CLEAR (self-declared non-authoritative) |
| 35 | docs/11_ai_layer/07_TOOL_VS_CONVERSATION_CONTRACT.md | WARN-W-02 |
| 36 | docs/11_ai_layer/08_CONVERSATION_EXECUTION_MODEL.md | CLEAR |
| 37 | docs/11_ai_layer/09_CONVERSATION_DEVIATION_PREVENTION_PROTOCOL.md | CLEAR |
| 38 | docs/11_ai_layer/09_WORKSPACE_RUNTIME_LANE.md | WARN-W-01 |
| 39 | docs/11_ai_layer/10_CODEX_PROVIDER_CONTRACT.md | WARN-W-06 |

#### docs/01_system/ (8 files)
| # | File | Status |
|---|---|---|
| 40 | docs/01_system/00_Project_Identity_Contract.md | CLEAR |
| 41 | docs/01_system/01_Idea_Admission_Contract.md | WARN (Stage D ref — see B-01) |
| 42 | docs/01_system/02_System_Overview_and_Operating_Model.md | BLOCKER-B-02 |
| 43 | docs/01_system/03_Project_Vision_Reference.md | WARN (Stage D ref — see B-01) |
| 44 | docs/01_system/04_Vision_and_Cognitive_Layer_Reference.md | WARN (Stage D ref — see B-01) |
| 45 | docs/01_system/05_Cognitive_Adapter_Layer_Architecture_Contract.md | WARN-W-07 |
| 46 | docs/01_system/06_Provider_Driver_Interface_Contract.md | WARN-W-06 |
| 47 | docs/01_system/07_Cognitive_Prompt_Construction_Contract.md | CLEAR |

### Tier 2 — Focused Read (26 files)

#### docs/03_pipeline/ (26 files)
| # | File | Status |
|---|---|---|
| 48 | docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md | BLOCKER-B-01 |
| 49 | docs/03_pipeline/03_11_Idea_Evaluation_and_Finalization_Contract.md | CLEAR |
| 50 | docs/03_pipeline/03_12_Documentation_Gap_Detection_and_Refinement_Loop_Contract.md | CLEAR |
| 51 | docs/03_pipeline/03_13_Code_to_Documentation_Trace_and_Consistency_Contract.md | CLEAR |
| 52 | docs/03_pipeline/03_14_Final_Acceptance_and_Release_Gate_Contract.md | BLOCKER-B-01 |
| 53 | docs/03_pipeline/03_15_Cognitive_Lifecycle_Orchestration_Specification.md | BLOCKER-B-01 |
| 54 | docs/03_pipeline/03_16_Loop_Enforcement_Specification.md | CLEAR |
| 55 | docs/03_pipeline/03_17_Stage_Contracts_Revision_v2.md | BLOCKER-B-01 |
| 56 | docs/03_pipeline/03_20_AI_Cognitive_Loop_Execution_Contract.md | CLEAR (A/B/C only) |
| 57 | docs/03_pipeline/03_21_Candidate_Transformation_and_Authority_Separation_Contract.md | CLEAR |
| 58 | docs/03_pipeline/03_Cognitive_Layer_Engines_Execution_Contracts.md | CLEAR |
| 59 | docs/03_pipeline/11_Conversation_To_Pipeline_Bridge.md | CLEAR |
| 60 | docs/03_pipeline/ARTIFACT_NAMESPACE_GOVERNANCE.md | CLEAR |
| 61 | docs/03_pipeline/AUDIT_ENGINE_CONTRACT_v1.md | CLEAR |
| 62 | docs/03_pipeline/BACKFILL_PROTOCOL_v1.md | WARN-W-01 |
| 63 | docs/03_pipeline/CLOSURE_AND_RELEASE_CONTRACT_v1.md | CLEAR |
| 64 | docs/03_pipeline/DECISION_GATE_CONTRACT_v1.md | CLEAR |
| 65 | docs/03_pipeline/DESIGN_EXPLORATION_PROTOCOL.md | CLEAR |
| 66 | docs/03_pipeline/EXECUTE_MODULE_CONTRACT_v1.md | CLEAR |
| 67 | docs/03_pipeline/GAP_ENGINE_CONTRACT_v1.md | CLEAR |
| 68 | docs/03_pipeline/INTAKE_MODULE_CONTRACT_v1.md | CLEAR |
| 69 | docs/03_pipeline/MODULE_ORCHESTRATION_GOVERNANCE_v1.md | CLEAR |
| 70 | docs/03_pipeline/pipeline_contract_violation_v1.md | CLEAR |
| 71 | docs/03_pipeline/SELF_BUILDING_RUNTIME_ACTIVATION.md | CLEAR |
| 72 | docs/03_pipeline/SELF_BUILDING_SYSTEM_BLUEPRINT_v1.md | BLOCKER-B-02 |
| 73 | docs/03_pipeline/TRACE_ENGINE_CONTRACT_v1.md | CLEAR |

### Tier 3 — Skim (~40 files)

#### docs/00_index/ (2 files)
| # | File | Status |
|---|---|---|
| 74 | docs/00_index/Documentation_Pack_Index_v1.md | BLOCKER-B-02 |
| 75 | docs/00_index/Document_ID_Normalization_and_Mapping_Rule.md | CLEAR |

#### docs/02_scope/ (5 files)
| # | File | Status |
|---|---|---|
| 76 | docs/02_scope/01_User_Interaction_Flow.md | CLEAR |
| 77 | docs/02_scope/02_Scope_and_Success_Contract.md | CLEAR |
| 78 | docs/02_scope/03_Vision_Coverage_Matrix_Contract.md | CLEAR |
| 79 | docs/02_scope/04_Vision_Gap_Detection_Specification.md | CLEAR |
| 80 | docs/02_scope/PROJECT_OBJECTIVE_CONTRACT.md | CLEAR |

#### docs/05_artifacts/ (4 files)
| # | File | Status |
|---|---|---|
| 81 | docs/05_artifacts/05_Artifact_Schema_and_Repository_Layout_Standard.md | CLEAR |
| 82 | docs/05_artifacts/05_16_Cognitive_Artifacts_Definition_Specification.md | WARN (Stage D ref — see B-01) |
| 83 | docs/05_artifacts/05_17_Artifact_Schema_Revision_v2.md | WARN-W-08 |
| 84 | docs/05_artifacts/05_18_Artifact_Serialization_and_Embedded_JSON_Rule.md | CLEAR |

#### docs/06_progress/ (2 files)
| # | File | Status |
|---|---|---|
| 85 | docs/06_progress/06_Progress_Tracking_and_Status_Report_Contract_v1.md | CLEAR |
| 86 | docs/06_progress/06_Progress_Contract_Revision_v2.md | CLEAR |

#### docs/07_decisions/ (8 files)
| # | File | Status |
|---|---|---|
| 87 | docs/07_decisions/07_Decision_Logging_and_Change_Traceability_Specification.md | CLEAR |
| 88 | docs/07_decisions/DECISION_ARTIFACT_SCHEMA.md | CLEAR |
| 89 | docs/07_decisions/DECISION_GATE_BEHAVIOR_SPEC.md | CLEAR |
| 90 | docs/07_decisions/DECISION_PIPELINE_CONTRACT_ENFORCEMENT_v1.md | CLEAR |
| 91 | docs/07_decisions/EXECUTION_FORK_DETECTION_PROTOCOL.md | CLEAR |
| 92 | docs/07_decisions/EXECUTION_FORK_DETECTION_RULES.md | CLEAR |
| 93 | docs/07_decisions/OPTION_EVALUATION_FRAMEWORK.md | CLEAR |
| 94 | docs/07_decisions/RECOMMENDATION_ARTIFACT_SPECIFICATION.md | CLEAR |

#### docs/08_audit/ (3 files)
| # | File | Status |
|---|---|---|
| 95 | docs/08_audit/08_Forge_Boundary_Audit_Rules_Fail-Closed_Pack.md | CLEAR |
| 96 | docs/08_audit/08_10_Docs_to_Code_Coverage_Map_Core_Runtime.md | CLEAR |
| 97 | docs/08_audit/09_Vision_Alignment_Contract.md | CLEAR |

#### docs/09_verify/ (4 files)
| # | File | Status |
|---|---|---|
| 98 | docs/09_verify/09_Build_and_Verify_Playbook_Local.md | CLEAR |
| 99 | docs/09_verify/09_17_Cross_Document_Consistency_Review_Contract.md | CLEAR |
| 100 | docs/09_verify/09_18_Code_to_Spec_Trace_Validator_Contract.md | CLEAR |
| 101 | docs/09_verify/09_19_Docs_Gap_Analyzer_Validator_Contract.md | CLEAR |

#### docs/10_runtime/ (3 files)
| # | File | Status |
|---|---|---|
| 102 | docs/10_runtime/10_Tech_Assumptions_and_Local_Runtime_Setup.md | CLEAR |
| 103 | docs/10_runtime/10_05_Cognitive_Engine_Selection_and_Routing_Policy.md | WARN-W-05 |
| 104 | docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md | INFO-I-04 |

#### Architecture files (read as part of sweep context)
| # | File | Status |
|---|---|---|
| 105 | architecture/FORGE_V2_BLUEPRINT.md | REFERENCE (binding authority) |
| 106 | architecture/FORGE_V2_PHASE_ROADMAP.md | REFERENCE |
| 107 | code/src/providers/_contract/SCHEMA.md | REFERENCE (L1) |
| 108 | code/src/runtime/tools/SCHEMA.md | REFERENCE (L2) |
| 109 | code/src/runtime/permission/SCHEMA.md | REFERENCE (L3) |
| 110 | progress/status.json | REFERENCE |
| 111 | artifacts/decisions/DECISION-20260508-phase-0-closure-and-blueprint-prep.md | REFERENCE |
| 112 | artifacts/decisions/DECISION-20260508-phase-0.5-contradiction-sweep-start.md | REFERENCE |
| 113 | CLAUDE.md | REFERENCE |
| 114 | INSTRUCTIONS.md | REFERENCE |

---

## 3. BLOCKER Findings

### B-01 — Stage D vs Three-Stage Model

**Severity:** BLOCKER
**Files Affected:**
- `docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md` — title says "A → D", defines 4 stages
- `docs/03_pipeline/03_15_Cognitive_Lifecycle_Orchestration_Specification.md` §2 — "The lifecycle consists of **exactly** four stages: A, B, C, D. No additional lifecycle stages are permitted."
- `docs/03_pipeline/03_14_Final_Acceptance_and_Release_Gate_Contract.md` — Stage D is "the ONLY authoritative acceptance gate for a Forge pipeline execution lifecycle"
- `docs/03_pipeline/03_17_Stage_Contracts_Revision_v2.md` §5 — Stage D defined as "Deployment & Runtime Governance"
- `docs/04_autonomy/06_Cognitive_Layer_Contract.md` §5 — "Stage A/B/C/D Execution"
- `docs/01_system/01_Idea_Admission_Contract.md` §2 — "Stage A → Stage B → Stage C → Stage D"
- `docs/01_system/03_Project_Vision_Reference.md` §3.1 — "Stage separation A/B/C/D"
- `docs/05_artifacts/05_17_Artifact_Schema_Revision_v2.md` §3 — layout includes `artifacts/stage_D/`

**Contradicts:**
- `architecture/FORGE_V2_BLUEPRINT.md` Part A — "The **three-stage** operating model stays: Stage A — Idea Engine, Stage B — Documentation Engine, Stage C — Code Engine"

**Gap in Blueprint supersession:** Blueprint Part A introduction states it "supersedes any contradiction in `docs/01_system/02_System_Overview_and_Operating_Model.md` and `docs/12_ai_os/00_AI_OS_MASTER_SPEC.md` only." It does NOT explicitly supersede `docs/03_pipeline/` (Layer 0 authority). The Pipeline Stages Specification is Layer 0 (ABSOLUTE AUTHORITY) per DOC-11 and cannot be overridden without explicit declaration.

**Why it blocks PHASE-1:** PHASE-1 implements L1 Provider Contract. Provider contracts operate in a stage context. Without knowing whether Stage D exists, the stage binding requirement in `docs/04_autonomy/06_Cognitive_Layer_Contract.md` §4 ("Every Task MUST declare the Stage it belongs to") cannot be satisfied for Stage D tasks. PHASE-1 cannot write compliant code without stage model resolution.

**Required Resolution:** Owner decision: Does the Blueprint adoption supersede docs/03_pipeline/ Stage D definition? If yes — what replaces Stage D's acceptance gate function? If Stage D is absorbed into Stage C, which artifacts from `03_14_Final_Acceptance_and_Release_Gate_Contract.md` are still mandatory?

---

### B-02 — Blueprint Has No Defined Position in Authority Hierarchy

**Severity:** BLOCKER
**Files Affected:**
- `docs/04_autonomy/05_Artifact_Authority_Hierarchy_Specification.md` (DOC-11) — Layer 0 = `docs/03_pipeline/*`, `docs/04_autonomy/*`, etc. `architecture/FORGE_V2_BLUEPRINT.md` is NOT listed in any layer.
- `docs/01_system/02_System_Overview_and_Operating_Model.md` §14 — 14-item conflict resolution hierarchy (Forge Core Rules → ... → Runtime behavior → Agent output). Blueprint not listed.
- `docs/00_index/Documentation_Pack_Index_v1.md` §2 — "Authority hierarchy is defined in DOC-11." DOC-11 has no entry for Blueprint.
- `docs/03_pipeline/SELF_BUILDING_SYSTEM_BLUEPRINT_v1.md` — an older "Blueprint" document in docs/03_pipeline/ (Layer 0, EXECUTION-BOUND) which predates FORGE_V2_BLUEPRINT.md.

**Contradicts:**
- `artifacts/decisions/DECISION-20260508-phase-0-closure-and-blueprint-prep.md` §2.2 — "`architecture/FORGE_V2_BLUEPRINT.md` becomes binding."

**The core contradiction:** DECISION-20260508 says Blueprint is "binding" but the documents that define what "binding" means (DOC-11 authority hierarchy and the §14 conflict resolution order in DOC-02) don't include Blueprint in their hierarchy. When Blueprint contradicts a Layer 0 document (e.g., B-01 above), there is no deterministic conflict resolution rule.

**Why it blocks PHASE-1:** Every PHASE-1 implementation decision must cite authority. If Blueprint contradicts docs/03_pipeline/ (Layer 0), developers face an unresolvable conflict: DOC-11 says Layer 0 wins, Decision artifact says Blueprint wins. No deterministic rule exists.

**Required Resolution:** A resolution decision artifact must explicitly:
1. Place `architecture/FORGE_V2_BLUEPRINT.md` at a defined position in DOC-11's authority hierarchy (above Layer 0 or as a new "Layer -1" superseding all), OR
2. Amend DOC-11 to include Blueprint as the new Layer 0, OR
3. Declare which specific Layer 0 clauses are superseded by Blueprint (narrower fix)

---

## 4. WARN Findings

### W-01 — Old Execution Pipeline Model vs Blueprint L2 Tool Runtime

**Severity:** WARN
**Files Affected:**
- `docs/11_ai_layer/05_AI_LAYER_RUNTIME_FLOW.md` — Step 8: "Decision Packet → Forge Pipeline"
- `docs/11_ai_layer/06_AI_RUNTIME_GOVERNANCE_CONTRACT.md` §3 — mandatory flow: "Execution through Forge Core" (step 4)
- `docs/11_ai_layer/09_WORKSPACE_RUNTIME_LANE.md` — defines WORKSPACE_DECISION_GATE → WORKSPACE_BACKFILL → WORKSPACE_EXECUTE → WORKSPACE_VERIFY pipeline
- `docs/11_ai_layer/01_AI_LAYER_SCOPE.md` §5 — "All execution MUST go through: Forge → Decision Gate → Backfill → Execute → Verify"
- `docs/03_pipeline/BACKFILL_PROTOCOL_v1.md` — defines WORKSPACE_BACKFILL module

**Contradicts:**
- Blueprint L2 Tool Runtime — every side effect is a registered Tool with `name, required_mode, input_schema, output_schema, preview, execute`. No "Backfill" or "Decision Gate" step in the L2 model.

**Not BLOCKER because:** Blueprint only defines what L2 IS, not what the old pipeline IS NOT. The two models may coexist as layers. But WORKSPACE_BACKFILL has no equivalent in Blueprint L2, which could cause the backfill function to be orphaned or duplicated.

**Required before PHASE-2 (Tool Runtime):** Clarify which components of the old pipeline (Decision Gate, Backfill, Execute, Verify) are replaced by L2 Tool Runtime and which remain.

---

### W-02 — "Tool" Terminology Ambiguity

**Severity:** WARN
**Files Affected:**
- `docs/11_ai_layer/07_TOOL_VS_CONVERSATION_CONTRACT.md` §6 — "confirmed tools" listed as API endpoints: `/api/ai/analyze`, `/api/ai/propose`, `/api/ai/preview`, `/api/ai/decision`, `/api/ai/apply-execute-plan`, `/api/ai/history`

**Contradicts:**
- Blueprint L2 Tool Runtime — a "Tool" is a formal runtime object with required fields: `name`, `required_mode`, `input_schema`, `output_schema`, `preview()`, `execute()`. API endpoints are not "tools" in this model.

**Not BLOCKER because:** The old "tool" usage is UX/API layer; Blueprint L2 "Tools" are implementation-layer. They can coexist with different names, but the shared term "tool" creates confusion.

**Required before PHASE-2:** Add a glossary entry clarifying "Tool (Blueprint L2)" vs "API endpoint (AI Layer)."

---

### W-03 — `FORGE_DECISION_OVERRIDE` Env Var Not in Blueprint L3

**Severity:** WARN
**Files Affected:**
- `docs/04_autonomy/04_Autonomy_Policy_and_Human_Interrupt_Protocol.md` §8 — "Current governed override channel: environment variable `FORGE_DECISION_OVERRIDE`. Permitted values: `APPROVE ALL` / `REJECT`"

**Contradicts (partially):**
- Blueprint L3 Permission/Safety — defines permission modes (READ_ONLY, WORKSPACE_WRITE, DANGER_FULL_ACCESS, PROMPT, TEST) and the `authorize()` sequence. No `FORGE_DECISION_OVERRIDE` mentioned.

**Not BLOCKER because:** The env var and L3 permission modes may operate at different layers. But if L3 is authoritative for all permission decisions, the env var override could bypass L3 checks.

**Required before PHASE-3 (Permission Layer):** Define whether `FORGE_DECISION_OVERRIDE` is superseded by L3 modes or is a valid complement.

---

### W-04 — Temperature Contradiction (0 vs 0.6)

**Severity:** WARN
**Files Affected:**
- `docs/04_autonomy/Cognitive_Request_Response_Contract.md` — `"constraints": {"deterministic": true, "temperature": 0}` for all cognitive calls

**Contradicts:**
- Blueprint L1 Provider Contract (`code/src/providers/_contract/SCHEMA.md`) — `temperature: 0.6` as default for Provider Contract

**Note:** Blueprint Part A explicitly supersedes docs/01/02 and docs/12/00. `docs/04_autonomy/Cognitive_Request_Response_Contract.md` is in docs/04_autonomy/ which is NOT one of the two explicitly superseded docs. Temperature=0 is technically still authoritative for docs/04 scope.

**Not BLOCKER because:** Temperature setting is operational, not architectural. But conversational providers with temperature=0 would produce low-quality conversational responses.

**Required before PHASE-1:** Explicitly resolve: Blueprint L1 temperature=0.6 supersedes the older temperature=0 constraint for conversational providers. OR: temperature=0 applies only to Stage A/B/C deterministic pipeline tasks; temperature=0.6 applies to AI OS conversational providers (different scope).

---

### W-05 — Provider Selection Mechanism Conflict

**Severity:** WARN
**Files Affected:**
- `docs/10_runtime/10_05_Cognitive_Engine_Selection_and_Routing_Policy.md` — selection via `COGNITIVE_ENGINE_SELECTION_MODE=MANUAL|AUTO` env var; specific model_id declarations per task category

**Contradicts:**
- Blueprint L1 Provider Contract — providers registered via `defineProvider(contract, handler)` in `code/src/providers/_contract/`; provider is determined by which provider module handles a given task type

**Not BLOCKER because:** Both could describe the same selection at different abstraction levels. But the env var-based MANUAL/AUTO selection with specific model IDs is a different mechanism than provider contract registration.

**Required before PHASE-1:** Clarify whether `COGNITIVE_ENGINE_SELECTION_MODE` is subsumed by Blueprint L1's provider registration system or remains a parallel mechanism.

---

### W-06 — Codex Local CLI vs Blueprint L1 Provider Contract

**Severity:** WARN
**Files Affected:**
- `docs/01_system/06_Provider_Driver_Interface_Contract.md` — "Secondary Provider: Codex (Local / CLI)" via local CLI execution (`codex.cmd`); invoked as a system command
- `docs/11_ai_layer/10_CODEX_PROVIDER_CONTRACT.md` — Codex receives task, returns diff/draft

**Contradicts:**
- Blueprint L1 Provider Contract — all providers must implement `executeTask({task_id, context}) → {status, output, metadata}` registered via `defineProvider(contract, handler)`. CLI-invoked process doesn't naturally fit this interface.

**Not BLOCKER because:** A CLI-wrapping driver could implement the L1 interface. But this needs explicit design.

**Required before PHASE-1 (if Codex is in scope):** Define how Codex CLI wraps into `defineProvider()` contract, or defer Codex integration to a later phase.

---

### W-07 — `artifacts/llm/` vs `cost_ledger.jsonl` Trace Mechanisms

**Severity:** WARN
**Files Affected:**
- `docs/01_system/05_Cognitive_Adapter_Layer_Architecture_Contract.md` §6 — mandatory LLM trace under `artifacts/llm/metadata/<task_id>.json`, `artifacts/llm/requests/<task_id>.json`, `artifacts/llm/responses/<task_id>.json`

**Not mentioned in:**
- Blueprint L1 Provider Contract — cost/trace via `cost_ledger.jsonl` (append-only per-call log); no `artifacts/llm/` structure defined

**Not BLOCKER because:** These could coexist. But the Cognitive Adapter Layer contract says `artifacts/llm/` is MANDATORY (Fail-Closed if cannot write). If Blueprint L1 doesn't implement `artifacts/llm/`, the adapter layer requirement is violated.

**Required before PHASE-1:** Declare whether `artifacts/llm/` is still required alongside `cost_ledger.jsonl`, or whether `cost_ledger.jsonl` supersedes it.

---

### W-08 — `artifacts/stage_D/` in Schema vs No Stage D in Blueprint

**Severity:** WARN
**Files Affected:**
- `docs/05_artifacts/05_17_Artifact_Schema_Revision_v2.md` §3 — official repository layout includes `artifacts/stage_D/`

**Contradicts (if B-01 resolved as "Stage D dropped"):**
- Blueprint: no Stage D → no `artifacts/stage_D/`

**Not BLOCKER because:** Depends on B-01 resolution. If Stage D is retained, W-08 dissolves.

**Required:** Resolved by B-01 resolution.

---

## 5. INFO Findings

### I-01 — Duplicate Content: 01_AI_OS_VISION.md and 00_AI_OS_MASTER_SPEC.md
- `docs/12_ai_os/01_AI_OS_VISION.md` appears to contain a subset of §1-§3 from `docs/12_ai_os/00_AI_OS_MASTER_SPEC.md` verbatim.
- No contradiction. Document hygiene issue.
- Recommendation: mark 01 as superseded by 00, or merge.

### I-02 — Duplicate Content: 17_NON_TECHNICAL_USER_EXPERIENCE.md and 02_USER_EXPERIENCE_MODEL.md §21
- `docs/12_ai_os/17_NON_TECHNICAL_USER_EXPERIENCE.md` is identical to §21 in `docs/12_ai_os/02_USER_EXPERIENCE_MODEL.md`.
- No contradiction. Document hygiene issue.

### I-03 — Verification Loop vs Blueprint L4 Doctor Layer
- `docs/12_ai_os/14_VERIFICATION_LOOP.md` defines a 4-level verification model predating L4 Doctor.
- L4 Doctor (Blueprint) is a runtime health check layer; the verification loop is a content/correctness check.
- No contradiction — different scopes. But their interaction is undefined.
- Recommendation: add a note linking the two when L4 is implemented.

### I-04 — Legacy Runtime Entrypoints vs `start-api.js`
- `docs/10_runtime/10_10_Runtime_Entrypoints_and_Tooling.md` defines `bin/forge-autonomous-run.js` as primary autonomous runner.
- `package.json` (PHASE-0-CLOSURE): `"start": "node start-api.js"` as the start command.
- Not a contradiction — these are different system layers (old Forge Core CLI vs AI OS API server). But no doc links them.

---

## 6. Verdict and Next Steps

### Verdict: **BLOCKED**

PHASE-1 cannot begin until B-01 and B-02 are formally resolved via a follow-up decision artifact.

### Required: DECISION-20260508-phase-0.5-resolutions.md must address:

1. **B-01 Resolution:** Explicitly declare that `architecture/FORGE_V2_BLUEPRINT.md` Part A (three-stage model) supersedes `docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md` and all documents that define Stage D. State what replaces Stage D's acceptance gate function within the three-stage model.

2. **B-02 Resolution:** Insert `architecture/FORGE_V2_BLUEPRINT.md` into DOC-11's authority hierarchy at a specific layer level (e.g., new Layer -1 above Layer 0 for the new runtime layers L1-L4 only, with Layer 0 remaining authoritative for all other subjects). Update `docs/00_index/Documentation_Pack_Index_v1.md` to reference Blueprint.

### WARNs to resolve before each phase:
- W-01, W-02: before PHASE-2 (Tool Runtime)
- W-03: before PHASE-3 (Permission Layer)
- W-04, W-05, W-06, W-07: before PHASE-1 (Provider Contract)
- W-08: resolved by B-01 resolution

### After resolutions, update:
- `progress/status.json` → `current_task: "PHASE-0.5-CLOSED"`, `next_step` → PHASE-1

---

**END OF SWEEP**
