# PHASE-45 — A-1 §5 COHERENCE FIX CHECKPOINT (mock/$0; implementation only)

> Date: 2026-06-28
> Phase: PHASE-45 — Generalization Build (URL Shortener)
> Authority: `DECISION-2026-06-28-phase-45-generalization-build.md` → AMENDMENT A-1 → §5 (CTO-authored, owner-ratified).
> Mode: implementation only — mock/$0, ZERO real LLM calls, NO real pipeline run.
> Status: **A-1 §5 IMPLEMENTED + all closure criteria MET. STOPPED. No commit/push/tag. The cap-raised real re-run is the next, separately spend-approved step.**

---

## 1. What §5 fixes

A-1 registered `response_header_equals` as the runtime 9th built-project assertion type but left the test_designer_v2 prompt's "8 allowed" enumeration stale — an internal contradiction that would likely make the real test_designer avoid the new type in the re-run. §5 unifies the enumeration to 9 across the prompt + the doctor check, so the redirect (AC-2, the run-#2 gap) is both *testable* (A-1 runtime) and *reachable by the test_designer* (this fix).

---

## 2. Edits (exactly §5 (5a)+(5b), within the authorized two files + the decision append)

### (5a) test_designer_v2 prompt — `docs/10_runtime/18b_ROLE_PROMPTS.md`
- Changed every "8 allowed" → "9 allowed". **Count reconciliation:** the addendum estimated "two/three" mentions, but the prompt actually contained **FIVE** (lines 1286, 1292, 1297, 1356, 1364). To fully close the contradiction (the §5 goal — any remaining "8 allowed" would still contradict the 9-item list), CC changed **all five**. Post-edit: `grep -c "8 allowed"` = **0**; `grep -c "9 allowed"` = **5**. All five are past the first 500 bytes, so the SU-mock prefix is preserved (see proof below). This is disclosed in the decision artifact's §5 implementation note.
- Added item 9 to the enumerated list (after item 8 `stdout_contains`):
  `9. response_header_equals: { "type": "response_header_equals", "header": "Location", "expected": "<url>" }` (`grep -c "9. response_header_equals"` = 1).

### (5b) builtproject_runtime doctor check — `code/src/runtime/doctor/checks/builtproject_runtime.js`
- Added `"response_header_equals"` to the expected-types existence list (doctor now verifies the 9th type's module exists).
- Detail string count `8 assertion types` → `9 assertion types`.
- Diff = exactly 2 hunks (+1 array entry, detail 8→9). No new fs/fetch/OpenAI/child_process (the `fs.existsSync`/`readdirSync` in this file are pre-existing doctor-check reads, untouched by §5).

### Decision artifact
- §5 addendum appended verbatim to the A-1 block, plus a CC implementation note recording the five-not-three reconciliation.

---

## 3. Guardrails (all GREEN)

| Guardrail | Target | Result |
|---|---|---|
| first-500-bytes of test_designer_v2 | byte-identical (HEAD vs working) | ✅ `first500_identical = true` |
| "8 allowed" remaining | 0 | ✅ 0 (all five → "9 allowed"); item 9 present |
| Full SU suite | stays 332/0/5 (no regression) | ✅ **332 passed / 0 failed / 5 skipped (337)**, EXIT 0. S209 ✓ (check_count:35), S338 ✓, S339 ✓ |
| forge-doctor | 35 / 0 FAIL; builtproject_runtime "9 assertion types" | ✅ **HEALTHY — 0 critical, 6 warning**; `builtproject_runtime` → "L5b harness OK — 4 modules, 9 assertion types, 6 reference scenarios". EXIT 0 |
| check_count | 35 (unchanged) | ✅ S209 PASS asserts check_count:35 |
| Track A | only 18b + builtproject_runtime.js + decision changed this step; no new forbidden patterns | ✅ confirmed (diff scope = those files; no new fs.*Sync/fetch/OpenAI/child_process) |
| §ARC | frozen at 10 | ✅ unchanged (pure-evaluator runtime; doctor read; prompt text) |

**Disclosure (status.json):** running forge-doctor re-patched `runtime_health` (auto-refresh; not a deliberate edit). SU leaves the tree clean (PHASE-41 overlay).

---

## 4. Coherence now end-to-end

The 9th assertion type is consistent across all three layers:
- **runtime:** registered in `harness_runner.js` ASSERTION_TYPES (A-1) — the harness can evaluate it.
- **prompt:** test_designer_v2 lists 9 allowed types incl. `response_header_equals`, with the redirect-→-Location tail directive (A-1 + §5) — the real test_designer will both be permitted to and instructed to use it for redirects.
- **doctor:** `builtproject_runtime` verifies all 9 type modules exist and reports "9 assertion types".

The run-#2 gap (AC-2 302-redirect untestable) is now closed at the harness/test-design layer. The remaining run-#1/#2 build defect (single-quoted-regex URL validator) is **not** addressed here (it is within A-5's reach — to be exercised by the larger builder-loopback budget in the re-run; if persistent, PHASE-46 codegen-quality).

---

## 5. STOP

- §5 implemented; all §5 closure criteria MET (prompt lists 9 coherently; doctor verifies 9; first500_identical=true; SU 332/0/5; doctor 35/0; check_count 35; Track A clean; §ARC=10).
- Did NOT: run the real pipeline, spend, commit/push/tag, or edit any file beyond `docs/10_runtime/18b_ROLE_PROMPTS.md` + `code/src/runtime/doctor/checks/builtproject_runtime.js` + the decision artifact.
- Owner zips the LOCAL folder (excl node_modules) for CTO verification.
- **Next step (separately gated):** the cap-raised real re-run (builder loopback cap > 2 so A-5 gets more attempts on the single-quoted-regex defect; redirect now both testable and reachable by the test_designer). Needs a FRESH explicit owner spend-approval (estimate shown first).
