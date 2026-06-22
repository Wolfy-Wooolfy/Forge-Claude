# PHASE-42 — STEP A Checkpoint (Documentation + Governance)

**Date:** 2026-06-22
**Decision artifact:** [DECISION-2026-06-22-phase-42-built-project-test-harness.md](../DECISION-2026-06-22-phase-42-built-project-test-harness.md) (PROPOSAL + AMENDMENT A-1)
**Predecessor:** PHASE-41 TRULY CLOSED (tag `phase-41-complete`, HEAD `bedf6721`).
**Commit (STEP A docs):** `9900142` — selective add of 3 files only; **LOCAL, no push, no tag.**

---

## Scope reminder
STEP A is documentation/governance ONLY — ZERO live code. PHASE-42 is a hardening + documentation
+ owner-evidence phase (the L5b execution layer is already complete and proven end-to-end). The
owner-facing report endpoint + render is STEP B.

## Deliverables (3 files, committed in `9900142`)
1. **AMENDMENT A-1** appended to [DECISION-2026-06-22-phase-42-built-project-test-harness.md](../DECISION-2026-06-22-phase-42-built-project-test-harness.md)
   — scope lock + corrections to PROPOSAL §3/§6 + Ruling G1 (per-build) + locked STEP A/B scope +
   deterministic closure gate (A-1.5) + Track A constraint (A-1.6). The PROPOSAL above it is UNTOUCHED.
2. **Blueprint addendum** inserted in [FORGE_V2_BLUEPRINT.md](../../../architecture/FORGE_V2_BLUEPRINT.md)
   immediately after the "L5b. Built-Project Test Harness" final paragraph — ratifies PER-BUILD for
   v2.0; defers PER-MODULE to the Iterative Build Loop (Roadmap PHASE-10); marks
   `run_after_each_module.sh` as illustrative-only; points to the new authority doc. Additive; no
   surrounding text altered.
3. **NEW authority doc** [docs/09_verify/20_BUILT_PROJECT_TEST_CONTRACT.md](../../../docs/09_verify/20_BUILT_PROJECT_TEST_CONTRACT.md)
   — documents the verified as-built harness surface (tools, harness core, 8 assertion types, the
   RUN_TESTS flow, the test_designer role + designTests, §ARC-3/§ARC-10 mapping, the L3 vision gate +
   L4 doctor check, SU coverage S119–S128) + the PER-BUILD execution model + the OWNER-FACING REPORT
   CONTRACT that STEP B implements (`GET /api/ai-os/project/test-report` — READ-ONLY, sourced via
   `reg.invoke("builtproject.read_report")`, fail-soft `NO_REPORT`, fail-closed typed errors,
   non-React render).

## Verification
- `git status --porcelain` before staging showed EXACTLY the 3 touched files:
  `M architecture/FORGE_V2_BLUEPRINT.md`, `M artifacts/decisions/DECISION-2026-06-22-...md`,
  `?? docs/09_verify/20_BUILT_PROJECT_TEST_CONTRACT.md`.
- **ZERO `code/**` change. ZERO `progress/status.json` change.**
- **No suite run** (no behavior change — documentation only).
- `read_report` actual output shape verified against as-built code and found COMPATIBLE with the
  A.3§5 contract (`{ report_path, total, pass, fail, error, overall_status, ran_at, scenarios }`;
  input is `project_root`, not `project_id` — documented in §3.1 + §5.1). No contract adjustment needed.

## Open (STEP B)
Owner-facing READ-ONLY endpoint + minimal render; status.json cosmetic reconcile (gated on no
SU/doctor assertion referencing the touched fields); ≥ 1 new deterministic SU scenario; closure
gate A-1.5. Mock-only, $0.
