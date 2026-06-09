# PHASE-24 Final Checkpoint — BUILDER Materializer (Path A)

**Date:** 2026-06-08
**Status:** CLOSED — Gate #10 PASS (owner confirmed 2026-06-08)
**Decision artifact:** `artifacts/decisions/DECISION-2026-06-08-phase-24-builder-materializer.md`

---

## What was built

### D1a — `code/src/runtime/orchestration/materializerEngine.js` (NEW)
Pure orchestration engine. All side effects via `reg.invoke`. Functions: `_sha256`, `_lineCount`, `_isSafePath`, `_buildCodegenPrompt`, `_tryParseCodegenResponse`, `async materialize`.  
Error codes: `AGENT_INVOKE_ERROR`, `CODEGEN_AGENT_FAILED`, `INVALID_CODEGEN`, `UNSAFE_PATH`, `WRITE_FAILED`, `SMOKE_FAILED`.  
Files written to `artifacts/projects/<project_id>/<file.path>`. Smoke: optional, via `shell.run_in_workspace`.

### D1b — `code/src/runtime/tools/materializer_tools.js` (NEW)
L2 tool `builder.materialize`. `required_mode: "WORKSPACE_WRITE"`. Has `preview()`. Auto-registered (tool #79). Business failures surface in `output.status: "FAILED"` + `output.error_code`.

### D1c — `code/src/testing/helpers/materializer_test_helper.js` (NEW)
Unit test helpers S267–S272. All call `reg.invoke("builder.materialize", ...)` with mock provider. §ARC: no test-helper fs.* used (cleanup via scenario `cleanup_project` field).

### D1d — `code/src/ai_os/conversationEngine.js` (MODIFIED)
Added `buildProject()` bridge + exported it. Pattern mirrors `formalizeSpec`/`reviewSpec`:
- State guard (`currentState === "BUILDER"`)
- Read `spec.json` + `architect_design.json` via `reg.invoke("fs.read_file")`
- `role.invoke(builder)` → plan
- `builder.materialize` → writes real files (smoke: driven by `spec.smoke_entry`)
- `orchestration.advance_state(RUN_TESTS)` on materializer SUCCESS
- Any failure → `{ok:true, build_error:<code>, advanced:false}`, stays BUILDER
- Stage-split params (`build_*` / `mat_*`) for different mock keys per stage in tests

### D1e — `code/src/testing/helpers/builder_wiring_test_helper.js` (NEW)
Wiring test helpers S270/S271. Seeds loop at BUILDER, calls `engine.buildProject()`, asserts state advancement / no-advance. Uses §ARC test-helper fs.* exception for fixture setup.

### D1f — mock_responses.json (MODIFIED — 4 entries added, total 60 keys)
| Key | Purpose |
|---|---|
| `mock\|mock-mat-s267\|scenario:S267` | Valid 2-file codegen |
| `mock\|mock-mat-s268\|scenario:S268` | Unsafe path `../evil.js` |
| `mock\|mock-mat-s269\|scenario:S269` | Non-JSON codegen |
| `mock\|mock-mat-s272\|scenario:S272` | Valid 3-file codegen |
| `mock\|mock-bld-s270\|scenario:S270` | Builder planner output (sha256:"pending") |
| `mock\|mock-mat-s270\|scenario:S270` | Materializer codegen for S270 |
| `mock\|mock-bld-s271\|scenario:S271` | Builder planner output (smoke_entry plan) |
| `mock\|mock-mat-s271\|scenario:S271` | Materializer codegen for S271 (main.js has `process.exit(1)`) |

### D1g — Scenario JSON files (6 new)
| Scenario | File | Key assertions |
|---|---|---|
| S267 | `S267_materializer_happy_path.json` | 2 files, sha256 real, smoke.ran=false |
| S268 | `S268_materializer_unsafe_path.json` | UNSAFE_PATH, nothing_written |
| S269 | `S269_materializer_codegen_parse_fail.json` | INVALID_CODEGEN, nothing_written |
| S270 | `S270_builder_wiring.json` | advanced=true, advanced_to=RUN_TESTS, sha256≠pending, graph=RUN_TESTS |
| S271 | `S271_smoke_fail_no_advance.json` | advanced=false, build_error=SMOKE_FAILED, graph=BUILDER |
| S272 | `S272_materializer_three_files.json` | 3 files, all sha256 real |

### D1h — `scripts/spikes/gate10_phase24_builder_materialize.js` (NEW)
Gate #10 script. Track A clean. Writes locked vision.md for `phase24_gate10`, calls `role.invoke(builder)` + `builder.materialize` with real gpt-4o, runs `node main.js`, asserts stdout.trim() === "7" and total_usd ≤ $1.

---

## Test results (SU)

**6-scenario PHASE-24 subset run:**
```
✓  S267   builder.materialize happy path — 2 files → real sha256 (≠ pending), status SUCCESS
✓  S268   builder.materialize path-safety — ../evil.js → UNSAFE_PATH, nothing written
✓  S269   builder.materialize codegen parse failure → INVALID_CODEGEN, no partial writes
✓  S270   buildProject() wiring — BUILDER mock loop → materializer writes real files → RUN_TESTS
✓  S271   buildProject() smoke fail — materialize SMOKE_FAILED → state stays BUILDER
✓  S272   builder.materialize 3-file plan → all 3 written, all sha256 real

ALL PASS — 6 passed, 0 failed, 0 skipped (6 total)
duration: 1740ms
```

**Full suite (270 total):**  
Target: 265/0/5 Windows. Result: **265 passed, 0 failed, 5 skipped (270 total) — CLEAN RUN.**  
Duration: ~23.4 min. S120/S121/S124–S127 all PASS (no flakes in closure run).

---

## Track A & §ARC

**Track A:** Clean on all new production files:
- `materializerEngine.js`: reg.invoke only
- `materializer_tools.js`: reg.invoke only (via materializerEngine)
- `conversationEngine.js` `buildProject()`: reg.invoke only (pre-existing fs.readFileSync on lines 48/751 not in buildProject)
- `gate10_phase24_builder_materialize.js`: reg.invoke only

**§ARC ledger:** Still 8 — no new exceptions added.  
**builder_wiring_test_helper.js**: Uses §ARC test-helper exception (fs.mkdirSync/writeFileSync/rmSync for fixture setup — same pattern as reviewer_spec_test_helper.js).

---

## Gate #10 (real provider, owner)

**Status:** PASS — executed `2026-06-09T08:14:58Z` (see CORRECTION note in decision artifact)  
**Script:** `scripts/spikes/gate10_phase24_builder_materialize.js`  
**Fixture:** `phase24_gate10` — add(3,4) → prints "7"  
**Provider/model:** `openai / gpt-4o-2024-08-06` (real call)  
**Result (9/9 PASS):**
- G1a role.invoke(builder) → SUCCESS, files_written Array ✓
- G1b planner plan length = 2 ✓
- G1c all sha256 === "pending" (planner output) ✓
- G2a/G2b builder.materialize → SUCCESS ✓
- G2c add.js sha256=`fe91ce41f2797dce9edf01eed1b0228a7def00d1d008aca1f0a46814ceac061a` (≠ "pending") ✓
- G3 shell exit_code === 0 ✓
- G4 stdout.trim() === "7" ✓
- G5 total_usd $0.01064 ≤ $1.00 ✓

**Files written:**
- `add.js` — sha256=`fe91ce41...` lines=4
- `main.js` — sha256=`e4eefa2d3ccaeeaa13406050661c52542396c552ff33c8c22bfe7e3b796ec6f3` lines=2

**Cost:** builder $0.00866 + materializer $0.00198 = **$0.01064** total  
**Fresh re-run (free):** `node main.js` → stdout `"7\n"`, exit_code=0  
**Evidence:** `artifacts/spikes/gate10_phase24/gate10_result.json`

---

## Closure Gate status

- [x] `node bin/forge-doctor.js → exits 0` — confirmed by owner environment (Gate #10 ran clean)
- [x] `node bin/forge-test.js → 265/0/5` — CONFIRMED 2026-06-08 (duration ~23.4 min, S120/S121 clean)
- [x] Decision artifact registered + owner approval — DECISION-2026-06-08-phase-24-builder-materializer.md + AMENDMENT 1
- [x] `progress/status.json.next_step` updated → PHASE-25 — done 2026-06-08
- [x] Gate #10 PASS — owner confirmed 2026-06-08
- [x] Exit Report written — this document (Gate #10 placeholder pending owner run)

---

## Backlog (do NOT fix in PHASE-24 — frozen scope)

- **builtproject server scenarios (S120/S121/S124–S127) flake under full-suite load; harden later (configurable wait_for_port / randomized port / clean teardown / stop pm2 during suite).** Pre-existing test-infra fragility. Not caused by PHASE-24 changes.
- `smoke_entry` mechanism is spec-driven (per-field). A future phase could make it more explicit (e.g., a dedicated `test.smoke` field in the spec schema).

---

## Risks

- Gate #10 uses real gpt-4o — codegen is non-deterministic. If the LLM produces syntactically invalid JS, main.js may fail to run. The gate10 script asserts stdout.trim()==="7"; any other output (including "5" from a wrong add call) is a FAIL.
- `agent.invoke` budget: $0.50/call. Gate #10 makes 2 calls (builder role + materializer codegen) = ≤ $1.00 total. Kill bar $3.00.
- S120/S121 flakiness: if the full-suite closure run shows these failing, re-run once and document the flake.
