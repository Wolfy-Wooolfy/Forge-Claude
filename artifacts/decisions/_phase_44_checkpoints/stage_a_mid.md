# PHASE-44 (A-5) — STEP A MID CHECKPOINT

> Build Loopback Self-Correction. Mock-only, **$0** (zero real LLM calls).
> Authority: `DECISION-2026-06-28-phase-44-build-loopback-self-correction.md` (ADOPTED).
> Date: 2026-06-28. Author: Claude Code (implementation arm).
> Status: **STEP A COMPLETE — gate A green. STOPPED.** Awaiting CTO independent verification → "STEP B GO".

---

## 1. What changed (D1–D3) — exactly 2 live files + 1 test helper + 3 scenarios

| File | Layer | Change | Forbidden patterns introduced |
|---|---|---|---|
| `code/src/runtime/orchestration/materializerEngine.js` | live (runtime) | D1: `materialize()` reads OPTIONAL `input.repair_feedback` (undefined-safe → `[]`); `_buildCodegenPrompt` gains a 5th param and appends a repair block **only when non-empty**; `_buildCodegenPrompt` exported for the invariance unit test | NONE (prompt-construction + reg.invoke only) |
| `code/src/ai_os/conversationEngine.js` | live (ai_os) | D2: capture `iteration_count` from the EXISTING get_status; on `> 0` read the report via `reg.invoke("builtproject.read_report")` (fail-OPEN), distil failing assertions into `repair_feedback`, thread it ADDITIVELY into the `builder.materialize` call | NONE (reg.invoke + path + pure JS) |
| `code/src/testing/helpers/build_loopback_test_helper.js` | test-infra (NEW) | D3: `runTInvariance` / `runTFeedbackPresent` / `runTConvergence` | test-infra (fs fixture setup only) |
| `code/src/testing/scenarios/S335_build_loopback_invariance.json` | test-infra (NEW) | T-invariance scenario | — |
| `code/src/testing/scenarios/S336_build_loopback_feedback_present.json` | test-infra (NEW) | T-feedback-present scenario | — |
| `code/src/testing/scenarios/S337_build_loopback_convergence.json` | test-infra (NEW) | T-convergence scenario | — |

**No new live-surface file. No new §ARC entry. §ARC stays 10.** Cumulative live surface unchanged (still the PHASE-43 four files; A-5 edits two of them).

---

## 2. As-built wiring (T1–T4)

- **T1 (input-gather + materialize call)** — `_buildProjectImpl` ([conversationEngine.js:1141](../../../code/src/ai_os/conversationEngine.js#L1141)): reads `spec.json` (L1190) + `architect_design.json` (L1206) as before; the `builder.materialize` invoke (~L1289) now carries `repair_feedback` **only when non-empty** — when empty the `Object.assign` adds no key ⇒ the call is byte-identical to pre-A-5.
- **T2 (materializer seam)** — `_buildCodegenPrompt(plan, spec, design, scenario_id, repair_feedback)` ([materializerEngine.js:27](../../../code/src/runtime/orchestration/materializerEngine.js#L27)): the A-4 `acBlock` is built at L40–46 and the repair block (`repairBlock`) is computed after `fileBlock`; in the `return`, `repairBlock` is concatenated **after** the AC/runnability/endpoint directives and **immediately before** the final `"\nRESPOND WITH VALID JSON ONLY."` ⇒ it is the LAST conditional block; `repairBlock === ""` when feedback is empty (byte-identical).
- **T3 (iteration gate + no stale-report leak)** — the gate reuses `statusResult.output.iteration_count` from the SINGLE existing `orchestration.get_status` call (no second call) ([conversationEngine.js:1187-1194](../../../code/src/ai_os/conversationEngine.js#L1187)). `> 0` ⇒ a prior RUN_TESTS ran + looped back; `=== 0` ⇒ first BUILDER pass of the loop ⇒ no feedback. Because `last_report.json` is per-project (not per-loop), the `> 0` gate is exactly what stops a stale report from a PREVIOUS loop reaching a NEW loop's first attempt (a new loop starts `iteration_count = 0`).
- **T4 (report reader + same root)** — feedback source = `reg.invoke("builtproject.read_report", { project_root })`, `project_root = path.resolve(root, "artifacts/projects/" + pid)` — re-derived IDENTICALLY to `runTests` (conversationEngine.js:1395-1396) so both read the same absolute `forge_tests/last_report.json`. `REPORT_NOT_FOUND` / any non-SUCCESS / throw ⇒ `repair_feedback = []` (fail-OPEN). NO direct fs read of the report.

### `repair_feedback` shape (built in D2, consumed in D1)
```
[ { scenario_id, name, status, error,                 // status ∈ {FAIL, ERROR}
    failing_assertions: [ { type, reason } ] } ]       // only assertions where pass === false
```
Filter = `scenarios.filter(s => s.status !== "PASS")`; passing assertions are dropped; an ERROR scenario with no failing assertion still carries `error` so the materializer sees it.

---

## 3. Gate A evidence (deterministic, mock, $0)

### 3.1 SU suite + doctor
- `node bin/forge-test.js` → **ALL PASS — 330 passed, 0 failed, 5 skipped (335 total)** = baseline **327** + the 3 new (S335/S336/S337). Duration ~252s.
- `node bin/forge-doctor.js` → **exit 0; HEALTHY — 0 critical; 35 checks (29 PASS / 6 WARN / 0 FAIL)**. The 6 warns are pre-existing/non-blocking (incl. the known `install_path` D:\ForgeAI stale-copy WARN on the owner machine).
- Track A grep clean in BOTH touched files: `materializerEngine.js` → 0 matches for `fetch(` / `new OpenAI` / `child_process` / `fs.*Sync`; `conversationEngine.js` → the only `fs.*Sync` (L48, L751) and `"child_process"` (L1497, a NODE_BUILTINS whitelist STRING) hits are PRE-EXISTING and far from the A-5 edit regions (L1187, L1289) — A-5 added none.
- §ARC = 10 (unchanged; the suite's S208 §ARC meta-assertion is green).

### 3.2 T-invariance (S335) — byte-identical first build
`_buildCodegenPrompt(plan,spec,design,sid)` (pre-A-5 arity) `===` `(…,[])` `===` `(…,undefined)`; none contains the repair marker; a non-empty feedback DOES change the prompt and DOES contain the marker. All 5 assertions PASS.

### 3.3 T-feedback-present (S336) — prompt carries the report's failures
With a non-passing `last_report.json` (2× `http_status_equals` failures: "expected 200 but got 404", "expected 201 but got 500"; plus one PASSING `response_body_is_array`) + `iteration_count = 1`, the materializer's codegen prompt (captured at the adapter seam) **contains** the failing type + both reason strings, contains the repair marker, and **excludes** the passing assertion's type. All 8 assertions PASS.

### 3.4 T-convergence (S337) — FAIL → PASS caused by the feedback
A deterministic, prompt-conditioned codegen stub (`conv_stub`, injected into the adapter cache for the test) returns **defective** code (entry only) when its received prompt lacks the repair marker, and **corrected** code (entry + `src/REPAIRED.js`) when present. The loop, driven through the REAL engine:

1. **attempt 1** (`iteration_count 0`, no feedback) → stub prompt has NO marker → defective build (no `src/REPAIRED.js`) → advance RUN_TESTS.
2. **RUN_TESTS** runs the REAL L5b harness (`file_exists src/REPAIRED.js`, no server → zero flake) → **FAIL** → `orchestration.loop_back` → `iteration_count → 1`, back to BUILDER.
3. **attempt 2** (`iteration_count 1`) → `read_report` returns the attempt-1 FAIL report → `repair_feedback` built → stub prompt HAS the marker → corrected build (writes `src/REPAIRED.js`) → advance RUN_TESTS.
4. **RUN_TESTS** → **PASS** → advance REVIEWER_CODE_AND_SECURITY.

Causation isolated: captured prompt #1 has no marker, captured prompt #2 has it; the verdict flips FAIL→PASS in lockstep. All 13 assertions PASS (incl. `prompt1_no_repair_marker`, `prompt2_has_repair_marker`, `flip_fail_to_pass`, `final_state_reviewer`).

### 3.5 Concrete repair-block artifact (illustrative, generated $0)
For inputs `spec.scope="demo"`, sample feedback `[FAIL T-1 http_status_equals "expected 200 but got 404"; ERROR T-3 "Unresolved placeholder {{created.id}}"]`:
- empty-feedback prompt = **1965 chars, no marker**; with-feedback prompt = **2242 chars**; the with-feedback prompt is byte-identical up to the insertion point (`byte_identical_prefix = true`).
- Rendered block (tail of the prompt):
```
PREVIOUS BUILD ATTEMPT FAILED THESE CHECKS — fix exactly these without regressing the checks that already passed:
- [FAIL] T-1 — get_returns_200
    • http_status_equals: expected 200 but got 404
- [ERROR] T-3 — create_first
    • ERROR: Unresolved placeholder {{created.id}}
RESPOND WITH VALID JSON ONLY.
```

---

## 4. Notes / honest disclosures

- **status.json**: shows a working-tree diff that is PURELY the `forge-doctor` automatic `runtime_health` refresh (`last_doctor_run` timestamp; `last_doctor_counts` 28/7 → 29/6; trailing newline) — a side effect of the gate-required doctor run, NOT a PHASE-44 content edit. `current_task` / `next_phase` / all semantic fields untouched. `git checkout -- progress/status.json` to revert it was DENIED by the permission layer (destructive op); left as-is and disclosed here (identical to the PHASE-42 "cosmetic reconcile" precedent). `next_phase` advance is a closure-time (§5C) action, intentionally NOT done at STEP A.
- **Test-infra adapter injection**: `conv_stub` is added to the agent adapter cache (additive key) and removed in `finally`; it is NOT a file under `runtime/agents/adapters/` (no new live file). A locked `vision.md` is seeded per test project so the L3 `agent_budget_rule` lets the non-mock stub through (budget ≈ $0 ≪ default cap).

## 5. Gate status

- **Gate A (mock, required): MET** — T-invariance + T-feedback-present + T-convergence all PASS; SU 330/0/5 (327 + 3); doctor 35/0; Track A clean; §ARC = 10.
- **Gate B (real, one gated run): PENDING** — separately gated on explicit owner spend-approval (§6; est. ~$0.30–0.60; soft-stop $1.50; hard-kill $3.00). NO real call made or attempted.
- **Gate C (bookkeeping): PENDING** — closure note + status.json next_phase advance + STEP-B checkpoint, at closure (LOCAL commit only; no push/tag until CTO "push GO").

🛑 **STOPPED after STEP A.** Owner will zip the LOCAL folder for independent CTO verification. No commit-push, no tag, no STEP B until "STEP B GO".
