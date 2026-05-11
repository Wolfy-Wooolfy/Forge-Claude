# DECISION-20260511-1330 — PHASE-8 CLOSED: Built-Project Test Harness (L5b)

**Date:** 2026-05-11  
**Owner Approval:** Implicit — all Closure Gate checks passed  
**Scope:** PHASE-8 full closure

---

## Closure Gate Verification

| Check | Result |
|---|---|
| `node bin/forge-doctor.js` → exits 0 | ✓ PASS (21/21 checks, 0 FAIL) |
| `node bin/forge-test.js` → all PASS or SKIP | ✓ 123 PASS, 0 FAIL, 5 SKIP (128 total) |
| Decision artifact registered | ✓ DECISION-20260513-1100-phase-8-builtproject-harness.md + this artifact |
| `progress/status.json.next_step` → PHASE-9 | ✓ Updated |
| Exit Report written | ✓ Below |

---

## Exit Report

### What Was Built

**L5b Harness Infrastructure (4 core modules):**
- `code/src/runtime/builtproject/scenario_loader.js` — reads `forge_tests/scenarios/*.json`, validates required fields
- `code/src/runtime/builtproject/harness_runner.js` — runs one scenario (setup → execute → assert → teardown), spawns server via `child_process.spawn`
- `code/src/runtime/builtproject/verdict_aggregator.js` — aggregates results → `forge_tests/last_report.json` (§ARC-1 fs.writeFileSync)
- `code/src/runtime/builtproject/loopback_signal.js` — emits `forge_tests/loopback_signal.json` (§ARC-1 fs.writeFileSync)

**8 Assertion Types:**
`http_status_equals`, `response_body_contains_key`, `response_body_field_equals`, `response_body_is_array`, `response_body_matches_schema`, `process_exit_code_equals`, `file_exists`, `stdout_contains`

**2 New L2 Tools (auto-loaded via `*_tools.js` naming):**
- `builtproject.run_scenarios` (PROMPT) — runs harness, writes report + signal
- `builtproject.read_report` (READ_ONLY) — reads last report

**1 New Doctor Check:**
- `builtproject_runtime` (index 20) — verifies harness modules, assertion types, reference fixture

**CLI:**
- `bin/forge-builtproject-test.js` — standalone runner with ANSI output, `--project` / `--scenario` args

**Reference Fixture:**
- `artifacts/projects/_reference_todo_api/` — Express + better-sqlite3 `:memory:` CRUD API
- 6 scenarios: T-1 (POST 201), T-2 (GET 200+[]), T-3 (GET:id 404), T-4 (PUT:id 404), T-5 (DELETE:id 404), T-6 (POST empty 400)
- Smoke result: 6/6 PASS

**Sub-task: Test Designer Schema Upgrade (DECISION-20260513-0930):**
- Upgraded `test_designer_v1` → `test_designer_v2` (L5b-compatible output format)
- `docs/10_runtime/18b_ROLE_PROMPTS.md` updated with v2 prompt
- `mock_responses.json` updated with L5b-formatted mock response
- S100 assertions updated; S100/S101/S103 all PASS

**Documentation:**
- `docs/10_runtime/20_BUILT_PROJECT_HARNESS_CONTRACT.md`

**10 New Self-Test Scenarios (S119–S128):**
- S119: doctor `builtproject_runtime` PASS
- S120: run_scenarios reference all 6 PASS
- S121: run_scenarios with scenario_ids filter
- S122: read_report returns last report
- S123: missing project_root → FAILED+PROJECT_NOT_FOUND
- S124: empty scenario_ids → runs all 6
- S125: T-1 assertions verified
- S126: T-6 (400) assertions verified
- S127: report + signal files written
- S128: read_report no-run → FAILED+REPORT_NOT_FOUND

### Namespace Changes

| Metric | Before | After |
|---|---|---|
| Tools | 56 | 58 |
| Doctor checks | 20 | 21 |
| Self-test scenarios | 118 | 128 |
| Reference project scenarios | 0 | 6 |

### Known Issues / Non-Issues

- DeprecationWarning `DEP0190` (shell option + args): Node.js warning about subprocess spawning on Windows; does not affect correctness; suppressed in production by passing args array.
- `better-sqlite3` requires `node-gyp@12.3.0` (vs bundled node-gyp) for compilation with VS2026. Package.json updated with `devDependencies: { "node-gyp": "^12.3.0" }`. Use `npm ci` for clean install.
- Doctor WARNs (plasma/disk): pre-existing, not introduced by PHASE-8.

### Testing

- `node bin/forge-builtproject-test.js` → 6/6 PASS (reference fixture)
- `node bin/forge-test.js` → 123/128 PASS, 0 FAIL, 5 SKIP
- `node bin/forge-doctor.js` → 21 checks, 0 FAIL
- `node verify/smoke/test_tool_runtime.js` → 22/22 PASS
- `node verify/smoke/test_doctor.js` → 8/8 PASS
- `node verify/smoke/test_harness_meta.js` → 13/13 PASS

---

**PHASE-8 is CLOSED. next_phase = PHASE-9.**
