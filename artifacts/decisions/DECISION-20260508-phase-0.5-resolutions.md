# DECISION-20260508-phase-0.5-resolutions

| Field | Value |
|---|---|
| **Decision ID** | DECISION-20260508-phase-0.5-resolutions |
| **Status** | PENDING_OWNER_DECISION |
| **Authored** | 2026-05-08 |
| **Triggered by** | artifacts/audit/blueprint_contradiction_sweep.md (2 BLOCKERs found) |
| **Related** | DECISION-20260508-phase-0.5-contradiction-sweep-start, DECISION-20260508-phase-0-closure-and-blueprint-prep |

---

## 1. Context

PHASE-0.5 Contradiction Sweep (2026-05-08) found 2 BLOCKERs that prevent PHASE-1 from beginning:

- **B-01:** Stage D defined as mandatory in 4 Layer-0 pipeline docs vs Blueprint's explicit 3-stage model (A/B/C)
- **B-02:** `architecture/FORGE_V2_BLUEPRINT.md` has no defined position in the authority hierarchy (DOC-11), creating unresolvable conflicts when Blueprint contradicts Layer-0 documents

This artifact proposes specific resolutions and requires owner approval before PHASE-1 can begin.

---

## 2. Proposed Resolutions

### Resolution R-01 (for B-01): Blueprint Supersedes Stage D

**Proposed text:**
`architecture/FORGE_V2_BLUEPRINT.md` Part A ("The three-stage operating model stays") explicitly supersedes the following documents with respect to the number of pipeline stages:

- `docs/03_pipeline/03_Pipeline_Stages_Specification_A-D.md`
- `docs/03_pipeline/03_15_Cognitive_Lifecycle_Orchestration_Specification.md` §2
- `docs/03_pipeline/03_17_Stage_Contracts_Revision_v2.md` §5
- `docs/03_pipeline/03_14_Final_Acceptance_and_Release_Gate_Contract.md`
- All other documents that define or reference "Stage D"

**Stage D disposition:**
Stage D ("Final Acceptance & Release Gate") is **not a separate stage** in v2.0. Its acceptance gate function is absorbed into Stage C closure conditions. The mandatory outputs formerly in Stage D (Release artifact package, Runtime readiness validation, Deployment record, Rollback strategy) become optional Stage C exit artifacts, required only when explicitly activated by an owner decision for a given project.

**Artifact impact:**
`artifacts/stage_D/` directory definition in `docs/05_artifacts/05_17_Artifact_Schema_Revision_v2.md` is deprecated. No `artifacts/stage_D/` directory will be created in PHASE-1 or later phases.

---

### Resolution R-02 (for B-02): Blueprint Authority Position

**Proposed text:**
`architecture/FORGE_V2_BLUEPRINT.md` is inserted into DOC-11 (Artifact Authority Hierarchy) as a new **Layer -1** with the following scope:

- **Layer -1 authority covers ONLY:** The four new runtime layers (L1 Provider Contract, L2 Tool Runtime, L3 Permission/Safety, L4 Doctor/Health) and the number of operating stages (three-stage model A/B/C as defined in Part A).
- **Layer 0 remains authoritative for:** All other subjects not explicitly addressed by Blueprint (stage internal behavior, autonomy rules, artifact schema, closure gates, etc.).

In cases of conflict:
- If the conflict is about L1/L2/L3/L4 or the three-stage model → Blueprint (Layer -1) wins.
- If the conflict is about anything else → Layer 0 docs win.

`docs/00_index/Documentation_Pack_Index_v1.md` will be updated to reference `architecture/FORGE_V2_BLUEPRINT.md` as Layer -1 authority.

`docs/03_pipeline/SELF_BUILDING_SYSTEM_BLUEPRINT_v1.md` remains valid as a Layer 0 execution contract for the self-building module system, and does not conflict with FORGE_V2_BLUEPRINT.md because they address different scopes (module orchestration vs runtime layers).

---

## 3. Acceptance Criteria

This resolution is accepted when:

1. Owner explicitly approves R-01 and R-02 (verbatim reply captured below).
2. `docs/00_index/Documentation_Pack_Index_v1.md` is updated to include Blueprint as Layer -1.
3. `progress/status.json` `next_step` points to PHASE-1.

---

## 4. Owner Approval Record

> _(Capture verbatim owner reply here.)_

Approval: ________________ — 2026-05-08

---

**END OF DECISION ARTIFACT**
