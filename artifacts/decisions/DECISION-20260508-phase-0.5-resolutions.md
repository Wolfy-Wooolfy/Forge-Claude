# DECISION-20260508-phase-0.5-resolutions

| Field | Value |
|---|---|
| **Decision ID** | DECISION-20260508-phase-0.5-resolutions |
| **Status** | APPROVED |
| **Authored** | 2026-05-08 |
| **Triggered by** | artifacts/audit/blueprint_contradiction_sweep.md (2 BLOCKERs found) |
| **Related** | DECISION-20260508-phase-0.5-contradiction-sweep-start, DECISION-20260508-phase-0-closure-and-blueprint-prep |

---

## 1. Context

PHASE-0.5 Contradiction Sweep found 2 BLOCKERs:

- **B-01:** Blueprint Part A says "three-stage model (A/B/C)" but 4 Layer-0 pipeline docs define Stage D as mandatory and "exactly four stages."
- **B-02:** `architecture/FORGE_V2_BLUEPRINT.md` has no position in DOC-11's authority hierarchy — unresolvable conflicts when Blueprint meets Layer-0 docs.

Options A (Blueprint supersedes Stage D) and B (Blueprint as Layer -1) were evaluated and **rejected** in favor of Option C below.

---

## 2. Option C — Selected Resolution

### Why Option A was rejected
Option A drops Stage D. Stage D's acceptance gate (`docs/03_pipeline/03_14_Final_Acceptance_and_Release_Gate_Contract.md`) is architecturally meaningful: it's the ONLY place that grants release authority. Absorbing it into Stage C closure merges "code verified" with "release authorized" — two different governance moments. Dropping Stage D would require significant rewrites to 4 Layer-0 documents. The cost exceeds the benefit.

### Why Option B was rejected
Option B creates "Layer -1" with automatic priority over Layer 0. This grants Blueprint blanket authority that is too broad. Blueprint is specifically about runtime enforcement layers (L1–L5) and should not silently outrank all pipeline stage contracts for unrelated subjects. Auto-priority without a decision artifact is exactly the kind of implicit authority the governance model is designed to prevent.

---

### R-01 Option C: Add Stage D to Blueprint (amend Part A + add Part D-Stage)

**Principle:** Blueprint was wrong to say "three-stage." Stage D is real and authoritative. Fix the Blueprint, not the pipeline.

**Files to change:**
- `architecture/FORGE_V2_BLUEPRINT.md` — Part A item 2, Authority block, add Part D-Stage

**Files NOT to change:** `docs/03_pipeline/*` (4 files stay authoritative, no edit needed)

#### Diff — architecture/FORGE_V2_BLUEPRINT.md

**Change 1 — Authority block (line 4–6):**
```
--- before
> **Authority:** This blueprint, once approved via decision artifact `DECISION-20260507-forge-v2-blueprint.md`, becomes the binding architecture reference for Forge. It supersedes any contradiction in `docs/01_system/02_System_Overview_and_Operating_Model.md` and `docs/12_ai_os/00_AI_OS_MASTER_SPEC.md` only with respect to the four new layers and the Provider Contract v2 introduced here. All other clauses in those documents remain authoritative.

+++ after
> **Authority:** This blueprint is a peer Layer-0 authority alongside `docs/03_pipeline/*`, `docs/04_autonomy/*`, and the other Layer-0 members defined in DOC-11. It was adopted via decision artifact `DECISION-20260508-phase-0-closure-and-blueprint-prep.md`. Conflicts between this blueprint and any other Layer-0 document are resolved by a dedicated decision artifact scoped to the specific conflict — not by automatic priority. Blueprint clauses that duplicate or extend Layer-0 content are additive unless a decision artifact explicitly marks a Layer-0 clause as superseded.
```

**Change 2 — Part A item 2:**
```
--- before
2. **The three-stage operating model** stays:
   - Stage A — Idea Engine (idea → vision lock)
   - Stage B — Documentation Engine (vision → docs with gap loops)
   - Stage C — Code Engine (docs → code with trace + verify)

+++ after
2. **The four-stage operating model** stays:
   - Stage A — Idea Engine (idea → vision lock)
   - Stage B — Documentation Engine (vision → docs with gap loops)
   - Stage C — Code Engine (docs → code with trace + verify)
   - Stage D — Verification & Release Gate (execution evidence → release authority)

   Stage D is the ONLY stage that grants release authority. It does not generate code; it
   validates that all prior stages closed cleanly and that L4 Doctor + L5 Scenario Harness
   produce green evidence. Stage D is defined authoritatively in
   `docs/03_pipeline/03_14_Final_Acceptance_and_Release_Gate_Contract.md` and
   `docs/03_pipeline/03_15_Cognitive_Lifecycle_Orchestration_Specification.md`.
   This blueprint adds detail on how L4 and L5 serve Stage D — see Part D-Stage below.
```

**Change 3 — Add Part D-Stage (new section, inserted after Part D "Module Decision Table" or wherever Part D ends):**
```
+++ new section
## Part D-Stage — Stage D and the New Runtime Layers

Stage D ("Verification & Release Gate") is served by two of the five new layers:

| Layer | Stage D role |
|---|---|
| L4 — Doctor / Health | Provides the runtime readiness evidence Stage D requires: all L1–L3 checks green, no boot-time failures, all registered providers validated |
| L5 — Scenario Harness | Provides the behavioral correctness evidence Stage D requires: all baseline scenarios PASS or SKIP (none FAIL) |

Stage D closure gate (per `docs/03_pipeline/03_14_Final_Acceptance_and_Release_Gate_Contract.md`) is satisfied when:
1. Stage A, B, C closure artifacts exist and pass Boundary Audit.
2. `node bin/forge-doctor.js` exits 0 (L4 evidence).
3. `node bin/forge-test.js` reports all scenarios PASS or SKIP (L5 evidence).
4. A Stage D closure artifact is written to `artifacts/stage_D/`.

No other evidence substitutes for L4 + L5 outputs in Stage D.
This means Stage D is only executable after PHASE-4 (Doctor) and PHASE-5 (Scenario Harness) close.
```

---

### R-02 Option C: Add Blueprint as Layer-0 peer in DOC-11 + intra-Layer-0 conflict rule

**Principle:** Blueprint earns its place in the hierarchy through an explicit edit to DOC-11, not through automatic priority. When Blueprint conflicts with another Layer-0 document, a decision artifact resolves the specific conflict — no blanket winner.

**Files to change:**
- `docs/04_autonomy/05_Artifact_Authority_Hierarchy_Specification.md` — Layer 0 list + §3 conflict rule
- `architecture/FORGE_V2_BLUEPRINT.md` — Authority block (already shown in R-01 Change 1 above)

#### Diff — docs/04_autonomy/05_Artifact_Authority_Hierarchy_Specification.md

**Change 1 — Layer 0 list (add Blueprint):**
```
--- before
### Layer 0 — Stage Execution Contracts (ABSOLUTE AUTHORITY)

Includes:
- docs/03_pipeline/*
- docs/04_autonomy/*
- docs/05_artifacts/*
- docs/06_progress/*
- docs/09_verify/*
- docs/10_runtime/*

+++ after
### Layer 0 — Stage Execution Contracts (ABSOLUTE AUTHORITY)

Includes:
- docs/03_pipeline/*
- docs/04_autonomy/*
- docs/05_artifacts/*
- docs/06_progress/*
- docs/09_verify/*
- docs/10_runtime/*
- architecture/FORGE_V2_BLUEPRINT.md   ← added 2026-05-08 via DECISION-20260508-phase-0.5-resolutions
```

**Change 2 — §3 Authority Conflict Resolution Rule (add intra-Layer-0 clause):**
```
--- before
## 3. Authority Conflict Resolution Rule

If two layers conflict:

1. Stage Contracts override everything.
2. Artifact Schema overrides Cognitive Layer outputs.
3. Artifacts override status.json declarations.
4. Vision cannot override execution contracts.

If ambiguity remains:
→ Execution MUST enter BLOCKED state
→ A single blocking question must be raised

No inferred resolution is allowed.

+++ after
## 3. Authority Conflict Resolution Rule

If two layers conflict:

1. Stage Contracts override everything.
2. Artifact Schema overrides Cognitive Layer outputs.
3. Artifacts override status.json declarations.
4. Vision cannot override execution contracts.

### 3.1 Intra-Layer-0 Conflict Resolution (added 2026-05-08)

When two Layer-0 documents conflict with each other (including
`architecture/FORGE_V2_BLUEPRINT.md` vs any other Layer-0 member):

- No automatic priority applies.
- A dedicated decision artifact MUST be written, scoped to the specific conflict.
- The decision artifact MUST identify the two conflicting clauses by document + section.
- The decision artifact MUST be owner-approved before execution resumes.
- Until a decision artifact resolves the conflict → Execution MUST enter BLOCKED state.

This rule exists because Layer-0 members represent distinct governance domains.
Granting one automatic priority over others would silently erode the others' authority.

If ambiguity remains after §3.1:
→ Execution MUST enter BLOCKED state
→ A single blocking question must be raised

No inferred resolution is allowed.
```

---

## 3. Files Changed Summary

| File | Change | New content |
|---|---|---|
| `architecture/FORGE_V2_BLUEPRINT.md` | Authority block + Part A item 2 + new Part D-Stage | Shown in §2 diffs |
| `docs/04_autonomy/05_Artifact_Authority_Hierarchy_Specification.md` | Layer 0 list + §3.1 added | Shown in §2 diffs |

Files NOT changed: `docs/03_pipeline/*` (4 Stage D files remain authoritative, no edit)

---

## 4. Effect on Open BLOCKERs

| BLOCKER | Resolution |
|---|---|
| B-01 (Stage D vs 3-stage) | Blueprint amended to say 4 stages. Layer-0 pipeline docs unchanged and remain authoritative. |
| B-02 (Blueprint not in hierarchy) | DOC-11 amended to list Blueprint as Layer-0 peer. Intra-Layer-0 conflicts → decision artifact. |

Effect on open WARNs: W-01 through W-08 remain open; they are PHASE-specific and will be resolved before each phase via separate decision artifacts (W-01/W-02 before PHASE-2, W-03 before PHASE-3, W-04/W-05/W-06/W-07 before PHASE-1).

---

## 5. Application Scope

This decision authorized text changes to exactly 2 files. Applied in session `PHASE-0.5-RESOLUTIONS-APPLY` — 2026-05-08.

After application:
- `architecture/FORGE_V2_BLUEPRINT.md` — Status updated, Authority block replaced, Part A item 2 updated to four-stage, Part D-Stage section added.
- `docs/04_autonomy/05_Artifact_Authority_Hierarchy_Specification.md` — Blueprint added to Layer 0 list, §3.1 Intra-Layer-0 Conflict Resolution added.
- `progress/status.json` — B-01 and B-02 cleared, next_step updated to PHASE-1.

---

## 6. Owner Approval Record

> _(Capture verbatim owner reply here.)_

Approval: "approved" — 2026-05-08

---

**END OF DECISION ARTIFACT**
