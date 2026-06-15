# PHASE-35 — STEP A COMPLETE (mock-only · NO real · NO closure)

**Date:** 2026-06-15
**Status:** STEP A done — deterministic gate GREEN. STOP for CTO verification before STEP B
(the real Gate #10). This is NOT phase closure: no decision artifact, no status.json closure fields,
no real API calls, $0 spend.

---

## 1. STEP A CLOSURE GATE — all items verified

| Gate item | Result | Evidence |
|---|---|---|
| reviewer_v3 + security_auditor_v2 exist in 18b | ✓ | `18b_ROLE_PROMPTS.md` headers at L265 (`reviewer_v3`), L489 (`security_auditor_v2`) |
| v2 / v1 still present **verbatim** | ✓ | headers retained: L133 `reviewer_v1` (deprecated), L195 `reviewer_v2`, L421 `security_auditor_v1` (bodies untouched) |
| role files point to new ids | ✓ | `reviewer.system_prompt_id = reviewer_v3`, `security_auditor.system_prompt_id = security_auditor_v2` (both modules load — loader resolves both new ids) |
| SU suite GREEN, exact count | ✓ | **317 passed, 0 failed, 5 skipped (322 total)**, exit 0 — UNCHANGED vs PHASE-34 baseline |
| doctor exit 0 | ✓ | HEALTHY — 0 critical, 6 warnings (known baseline incl. keychain `api_auth_token`) |
| roles = 13 | ✓ | `_role_registry` listRoles().length = 13 (unchanged) |
| §ARC = 8, L2 tools = 80, doctor checks = 35 | ✓ | no registry/ledger file touched; doctor HEALTHY with the known 6-warning baseline (a changed count would have surfaced) |
| DF-1..DF-4 on disk | ✓ | `artifacts/spikes/phase35_fixtures/DF-{1..4}_*/` (spec/design/manifest/src/expected each) |
| 18_AGENT_ROLES_CONTRACT.md updated | ✓ | L173 → `reviewer_v3`, L213 → `security_auditor_v2`, + version-history notes (CTO-authorized docs/** change) |
| NO real calls / decision artifact / status.json closure | ✓ | none made |

## 2. Mock-fixture strategy outcome — (a) stable-prefix, as planned
- Fragile set was **{S89, S90}** only (prompt-prefix-keyed reviewer Phase A; no `scenario_id`).
- reviewer_v3's first 500 chars are byte-identical to reviewer_v2 (divergence at char 976) → the
  computed S89/S90 mock keys are unchanged.
- **Live proof:** targeted run of S89/S90/S91/S102/S96/S97/S98/S99/S297–S301 = **13/13 PASS**, and
  the full suite is unchanged at 317/0/5. **Zero `mock_responses.json` edits, zero re-record.**

## 3. Suite memory note (not a regression)
The full suite OOM'd at `--max-old-space-size=4096` (`Fatal process out of memory`) — a no-signal
crash, the known "suite memory footprint" backlog item, NOT caused by this change (proven: the 13
affected scenarios pass in isolation, and the full suite passes 317/0/5 once given headroom). It
completed clean at `--max-old-space-size=8192` (duration ~1191s). **Recommendation for STEP B /
backlog:** bump the documented full-suite heap flag to 8192, or split the heavy built-project
cluster — track under the existing memory-footprint backlog item.

## 4. Track A
- Only runtime code change = 4 string-literal lines (2 per role file: the `loadPrompt(...)` arg +
  the `system_prompt_id` field). No logic change.
- Grep on both role files: **no** `fs.*Sync` / `new OpenAI(` / `child_process` / `fetch(` / http
  require introduced. §ARC stays **8**. All role I/O remains via `reg.invoke`.

## 5. Files changed this step
**Docs (authorized):**
- `docs/10_runtime/18b_ROLE_PROMPTS.md` — added `reviewer_v3` + `security_auditor_v2` blocks (v1/v2 verbatim).
- `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` — system_prompt_id rows + version-history notes.

**Runtime (id bump only):**
- `code/src/runtime/agents/roles/reviewer_role.js` — `loadPrompt`/`system_prompt_id` → reviewer_v3.
- `code/src/runtime/agents/roles/security_auditor_role.js` — `loadPrompt`/`system_prompt_id` → security_auditor_v2.

**Fixtures (STEP B inputs, no mock):**
- `artifacts/spikes/phase35_fixtures/README.md` + `DF-1_logic_positive/`, `DF-2_sqli_positive/`,
  `DF-3_parameterized_negative/`, `DF-4_clean/` (each: spec.json, design.json, manifest.json,
  src/controllers/todoController.js, expected.md).

**Checkpoints:**
- `artifacts/decisions/_phase_35_checkpoints/stage_a_mid.md` (MID), this file (`stage_a_complete.md`).

**NOT touched:** `mock_responses.json` (strategy a), `progress/status.json`, any role/tool/doctor
registry, the conversation graph/engine, reviewer_v2/v1 + security_auditor_v1 bodies.

---

## 6. What STEP B will do (for CTO context — NOT started)
Real Gate #10: drive the tuned roles (openai/gpt-4o) over DF-1..DF-4, N trials each; score against
each `expected.md`. Headline proofs: DF-1 reviewer_v3 catches the `this.changes` BLOCKER (v2 missed
it); DF-3 security_auditor_v2 does NOT false-positive SQLi on parameterized queries (v1 did);
DF-2/DF-4 controls (recall + no-over-fire). Real spend — owner approval gate per D.4.

**STOP. Awaiting CTO verification of STEP A before STEP B (real calls).**
