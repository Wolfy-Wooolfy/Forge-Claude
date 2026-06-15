# PHASE-35 — STEP A-2 COMPLETE (mock-only · NO real · NO closure)

**Date:** 2026-06-15
**Status:** STEP A-2 done — deterministic gate GREEN. STOP for CTO verification before STEP B-2
(the re-run real Gate #10). This is NOT phase closure: no decision artifact, no status.json closure
fields, no real API calls, $0 spend.

**Goal of A-2 (from the STEP B honest findings, CTO-verified):** keep the 3 passing core objectives
(DF-1 reviewer catch, DF-2 security recall, DF-3 no-false-positive) while (1) fixing reviewer_v3's
over-fire (REJECTed clean code in 1/3 DF-4 trials, inventing AC violations) and (2) de-contaminating
the fixtures so STEP B-2's A/B can prove causality.

---

## 1. STEP A-2 CLOSURE GATE — all items verified

| Gate item | Result | Evidence |
|---|---|---|
| reviewer_v4 in 18b; v2/v3 retained **verbatim** | ✓ | `18b_ROLE_PROMPTS.md` headers: L195 `reviewer_v2`, L265 `reviewer_v3`, L354 `reviewer_v4` (v1/v2/v3 bodies untouched) |
| **first-500(v4) == first-500(v3) == first-500(v2)** | ✓ | node proof: true/true; v4 diverges from v3 at **char 3602** (>500); len 5951 = 5090 + 861 (the inserted clause only) |
| v4 = v3 + anti-over-fire clause; **recall preserved** | ✓ | v4 has "Precision discipline (Phase B — do not over-fire)" AND keeps the v3 "behavioral/contract defect = BLOCKER" + "this.changes … is STILL a BLOCKER" |
| reviewer_role → v4; security_auditor → v2 | ✓ | `pickRole("reviewer").system_prompt_id = reviewer_v4`; `security_auditor = security_auditor_v2` |
| DF-1 design leak neutralized | ✓ | identified_risk "Incorrect not-found handling / check affected-row + 404" → generic "SQLite write contention" (LOW); **spec AC-3/AC-4 kept** (the requirement the reviewer must check) |
| Other fixtures scanned + neutralized consistently | ✓ | DF-2 design named the seeded SQLi + parameterized fix → replaced with generic "unbounded result set" (LOW). DF-3 done in A-2.3. DF-4: no seeded defect to leak |
| All fixture **code behavior unchanged** | ✓ | DF-1 still omits row-check; DF-2 still concatenates; DF-3/DF-4 stay parameterized; DF-4 keeps this.changes→404 |
| DF-4/expected.md criterion corrected | ✓ | reviewer PASS = no BLOCKER; security PASS = no BLOCKER + no SQLi false-positive (missing-auth WARN/MEDIUM legitimate); threat_level NONE/LOW dropped |
| 18_AGENT_ROLES_CONTRACT.md → reviewer_v4 | ✓ | L173 + version-history note updated (v3→v4 supersession; v3/v2/v1 retained verbatim in 18b) — the one authorized docs/** change |
| SU suite green, exact count | ✓ | **317 passed, 0 failed, 5 skipped (322 total)**, exit 0, duration 235809ms — UNCHANGED vs PHASE-34/STEP-A baseline. S89/S90 explicitly green (`_a2_suite.log`) |
| doctor exit 0 | ✓ | exit 0; known 6-warning baseline (incl. keychain `api_auth_token` PowerShell-here-string quirk on this host). §ARC=8, L2=80, roles=13, doctor=35 (`_a2_doctor.log`) |
| NO real calls / decision artifact / status.json closure | ✓ | none made |

## 2. Files changed this step

**Docs (authorized):**
- `docs/10_runtime/18b_ROLE_PROMPTS.md` — added `reviewer_v4` block (v1/v2/v3 verbatim).
- `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` — `system_prompt_id` → `reviewer_v4` + version history (A-2.6).

**Runtime (id bump only — done in A-2.2, no logic change):**
- `code/src/runtime/agents/roles/reviewer_role.js` — `loadPrompt`/`system_prompt_id` → reviewer_v4.

**Fixtures (STEP B-2 inputs; de-contaminated — code behavior unchanged):**
- DF-1: `src/.../todoController.js` comments removed (A-2.3); `design.json` not-found risk neutralized (A-2.5).
- DF-2: `src/.../todoController.js` VULNERABILITY comments removed (A-2.3); `design.json` SQLi risk neutralized (A-2.5).
- DF-3: `spec.json` + `design.json` "already parameterized" hints removed (A-2.3).
- DF-4: `src/.../todoController.js` "Clean implementation" comment removed (A-2.3); `expected.md` criterion corrected (A-2.4).
- `README.md` + `DF-1/expected.md` — reviewer_v3 → reviewer_v4 + de-contamination note.

**Checkpoints:** `_phase_35_checkpoints/stage_a2_mid.md` (MID), this file.
**Regression logs:** `artifacts/spikes/gate35_phase35/_a2_suite.log`, `_a2_doctor.log`.

**NOT touched:** `mock_responses.json` (stable-prefix held), `progress/status.json`, any
role/tool/doctor registry, the conversation graph/engine, reviewer_v1/v2/v3 + security_auditor
bodies, all fixture CODE behavior.

## 3. Leak-scan disposition (A-2.5) — for the record
Rule applied (per CTO): neutralize design/spec text that names a **seeded defect or its fix**.
- DF-1 (seeded: not-found logic) → design risk named defect+fix → **neutralized**.
- DF-2 (seeded: SQLi) → design risk named defect+fix → **neutralized**.
- DF-3 (negative/precision — no seeded defect) → remaining generic "SQL injection risk / use
  parameterized" is a category cue, not a seeded-defect leak → left (CTO: done in A-2.3).
- DF-4 (clean — no seeded defect) → design's "correct not-found handling" / "checks are in place"
  describe correct properties, not a seeded-defect leak → left (CTO: nothing to leak; and at STEP B
  reviewer_v3 over-fired on DF-4 *despite* this text, so it does not mask the over-fire signal).
- Kept everywhere: spec **AC-3/AC-4** (the 404 requirement the reviewer must verify the code against)
  and the spec "parameterized queries" decision (security-side, not the reviewer's seeded defect).

## 4. Track A
- Only runtime code change = `reviewer_role.js` (2 string-literal lines; done A-2.2). No logic change.
- Prompts + fixtures are docs/artifacts. All role I/O via `reg.invoke`. **§ARC stays 8.** No
  tool/role/doctor registry file touched (doctor counts unchanged: L2=80, roles=13, checks=35).

---

## 5. What STEP B-2 will do (for CTO context — NOT started)
Re-run the real Gate #10 (openai/gpt-4o) over the de-contaminated DF-1..DF-4 with reviewer_v4 +
security_auditor_v2, N trials each, plus the A/B baselines (reviewer_v2 on DF-1; security_v1 on DF-3)
now that the fixtures no longer leak. Headline checks: (1) reviewer_v4 still catches the DF-1
this.changes BLOCKER (recall) AND no longer over-fires on DF-4 clean (precision); (2) the A/B is now
conclusive (v2 should miss DF-1 / v1 should false-positive DF-3 on the de-contaminated inputs);
(3) DF-2 recall + DF-3 precision preserved. Real spend — owner approval gate.

**STOP. Awaiting CTO verification of STEP A-2 before STEP B-2 (real calls).**
