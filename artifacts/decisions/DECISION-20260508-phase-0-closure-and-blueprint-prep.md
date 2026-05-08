# DECISION-20260508-phase-0-closure-and-blueprint-prep

| Field | Value |
|---|---|
| **Decision ID** | DECISION-20260508-phase-0-closure-and-blueprint-prep |
| **Status** | APPROVED |
| **Authored** | 2026-05-08 |
| **Supersedes** | — |
| **Related** | DECISION-20260504-phase-0-fix-1-domain-pivot, DECISION-20260504-phase-0-fix-2-multiselect-chips, DECISION-20260504-phase-0-fix-3-project-deletion, DECISION-20260504-phase-0-vision-scaffolding, DECISION-20260505-phase-0-bug-fix-round, DECISION-20260505-phase-0-bug-fix-round-2, DECISION-20260505-phase-0-bug-fix-round-3 |

---

## 1. Context

PHASE-0 (Foundation Repair) was the first phase in the original `files.zip` roadmap. Its four fixes (domain pivot, multi-select chips, project deletion, vision scaffolding) are complete per the seven prior decision artifacts. `progress/status.json` reflected this at 99% but was never formally closed.

Concurrently, an architectural review replaced the old 6-phase roadmap with a 13-entry v2.0 roadmap and introduced four runtime layers (Provider Contract v2, Tool Runtime, Permission/Safety, Doctor) plus a Scenario Harness.

This decision combines two atomic changes that must happen together:

1. Formally close PHASE-0.
2. Adopt Blueprint v2.0 as the binding architecture and update operational documents accordingly.

## 2. Decision

### 2.1 PHASE-0 closure
- PHASE-0 status flips from `PHASE-0-FOUNDATION-REPAIR` (99%) to `PHASE-0-CLOSED` (100%).
- The four prior `phase-0-fix-*` decisions remain authoritative for the fixes themselves; this artifact does not supersede them, only closes the phase.

### 2.2 Blueprint adoption
- `architecture/FORGE_V2_BLUEPRINT.md` becomes binding.
- `architecture/FORGE_V2_PHASE_ROADMAP.md` becomes the authoritative roadmap, superseding the contents of `files.zip`.
- The old `files.zip` `01_PHASE_0_*` through `06_PHASE_5_*` documents are archived (not deleted) under `artifacts/archive/old_roadmap_2026-05-08/` for reference.

### 2.3 Resolved questions Q1–Q9
All nine open questions (Q1–Q5 in Blueprint Part G initial draft, Q6–Q9 added in roadmap review) are resolved per the owner's affirmative replies on 2026-05-07. The full table is recorded in Blueprint §Part G "Resolved decisions".

### 2.4 Operational document updates
- `CLAUDE.md` — gains §11 (Runtime Layers + Closure Gate), §5 replaced (phase map), §10 replaced (start point).
- `INSTRUCTIONS.md` — gains §6 (Closure Gate) and §7 (Phase Failure Rule).
- `README.md` — replaced wholesale.
- `progress/status.json` — replaced with v2.0 schema (additive: runtime_health + lean_v2_exit_status).
- `package.json` — replaced; adds `optionalDependencies` (playwright) and `scripts`.

### 2.5 Lean v2 Exit point
A formal Lean v2 Exit is established after PHASE-5.1. Phases 6–12 are NOT assumed; each requires a fresh decision artifact to begin.

## 3. Acceptance criteria

This decision is accepted when ALL of the following are true:

1. The 9 file modifications detailed in §3–§4 of the prompt are applied verbatim.
2. The 5 new spec files exist at the paths defined in the prompt.
3. The owner replies "approved" (or equivalent verbatim) in chat. The exact reply is captured below in §6.
4. `git diff --stat` shows changes to the expected files only.
5. A single commit is made with message `Forge v2.0 blueprint adoption + PHASE-0 closure`.

## 4. Risks

- **R1.** No code changes in this decision yet — only documentation and config. Risk that the runtime is in an interim state where `bin/forge-doctor.js` and `bin/forge-test.js` referenced in the new docs do not yet exist. **Mitigation:** the modified `CLAUDE.md` §10 explicitly notes that doctor/test scripts only become available after PHASE-4/PHASE-5 close, and provides a smoke-check fallback in the meantime.
- **R2.** Old roadmap archival could be confusing to future contributors. **Mitigation:** `artifacts/archive/old_roadmap_2026-05-08/README.md` notes the supersession.

## 5. Rollback plan

If this decision needs to be rolled back:

1. Restore the 5 modified files from git (`git checkout HEAD~1 -- CLAUDE.md INSTRUCTIONS.md README.md package.json progress/status.json`).
2. Delete the 5 new spec files and the `architecture/` files.
3. Mark this decision as `SUPERSEDED_AND_REVERTED`.

No other state is affected because no code or runtime artifacts changed.

## 6. Owner approval record

> _(Capture verbatim owner reply here. Format:_ `"<reply text>" — 2026-05-08T<HH:MM>Z` _)_

Approval: "موافق على كل التعديلات مهما كانت طبقا للى بعتهولك" — 2026-05-08T00:30Z

---

**END OF DECISION ARTIFACT**
