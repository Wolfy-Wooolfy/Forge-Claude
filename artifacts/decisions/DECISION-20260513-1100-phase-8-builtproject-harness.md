# DECISION-20260513-1100 — PHASE-8 Built-Project Test Harness (L5b)

| Field | Value |
|---|---|
| Date | 2026-05-13 |
| Owner | KhElmasry |
| Status | OWNER_APPROVED_2026-05-13 (per PROMPT-PHASE-8.md) |
| Authority | Layer-1 (scoped implementation decision) |
| Layer-0 | `DECISION-20260510-vision-shift-multi-agent-conductor.md` |
| Override | `DECISION-20260512-0900-phase-7-F-3-override.md` §5 discipline rule active |
| Sub-decision | `DECISION-20260513-0930-test-designer-schema-upgrade.md` (schema upgrade) |
| Track | Track B |
| Depends on | PHASE-7-F-3 (CLOSED with override) |

---

## 1. Phase Identity

**PHASE-8 — Built-Project Test Harness (L5b)**

PHASE-5 built L5a (Forge's own self-test harness). PHASE-8 builds L5b — the harness that tests projects Forge generates. Without L5b, when Builder Agent produces a TODO API for the owner, there is no infrastructure to verify the TODO API actually works.

---

## 2. Schema Compatibility Check Findings (§3.2)

**Finding:** Test Designer output schema (PHASE-7-F-2) was incompatible with L5b §2-C format.

- Compatibility: 3/13 fields aligned (id, name, description only)
- Root cause: PHASE-7-F-2 produced abstract descriptions (inputs/expected_outputs), not executable specs
- Resolution: Option A selected (schema upgrade within PHASE-8 scope)
- Decision artifact: `DECISION-20260513-0930-test-designer-schema-upgrade.md`

**Post-upgrade verification:**
- S100 (test_designer happy path): PASS with new L5b assertions
- S101 (test_designer invalid input): PASS
- S103 (test_designer bad JSON): PASS
- Full suite 118/118: PASS or SKIP

**Verdict:** Test Designer schema NOW COMPATIBLE with L5b §2-C format.

---

## 3. Scope (per §2-A of PROMPT-PHASE-8.md)

### Part 1 — L5b Harness Infrastructure
- `code/src/runtime/builtproject/harness_runner.js`
- `code/src/runtime/builtproject/scenario_loader.js`
- `code/src/runtime/builtproject/verdict_aggregator.js`
- `code/src/runtime/builtproject/loopback_signal.js`
- `code/src/runtime/builtproject/_assertion_registry.js`
- `code/src/runtime/builtproject/assertion_types/` (8 modules)

### Part 2 — L2 Tools (2 new)
- `builtproject.run_scenarios` (PROMPT mode)
- `builtproject.read_report` (READ_ONLY mode)

### Part 3 — Reference Project (Fixture)
- `artifacts/projects/_reference_todo_api/` — Node.js + Express + better-sqlite3
- 6 forge_tests scenarios (T1–T6)

### Part 4 — Test Designer Compatibility
- Verified COMPATIBLE post schema upgrade (see §2 above)

### Part 5 — Forge Self-Test Scenarios
- 10 new L5a scenarios: S119–S128

### Part 6 — Documentation & Doctor
- `code/src/runtime/doctor/checks/builtproject_runtime.js`
- `docs/10_runtime/20_BUILT_PROJECT_HARNESS_CONTRACT.md`

---

## 4. Pre-Decided Behaviors (§2-D, binding)

### §2-D1: Reference project hand-crafted
Claude Code writes the reference TODO API verbatim from §5 of PROMPT-PHASE-8.md. No Builder Agent invocation.

### §2-D2: 8 assertion types (exactly these)
1. `http_status_equals`
2. `response_body_contains_key`
3. `response_body_field_equals`
4. `response_body_is_array`
5. `response_body_matches_schema`
6. `process_exit_code_equals`
7. `file_exists`
8. `stdout_contains`

### §2-D3: Server lifecycle managed by L5b runner
Via `shell.run_in_workspace` L2 tool (NOT direct child_process.spawn).

### §2-D4: Network access local-only
`execution.url` must be `localhost` or `127.0.0.1`. Non-local URLs → INVALID_SCENARIO at load time.

### §2-D5: Loopback signal write-only in PHASE-8
Writes to `artifacts/projects/<id>/forge_tests/loopback_signal.jsonl`. PHASE-10 reads it.

### §2-D6: Server spawning via shell.run_in_workspace
NEVER `child_process.spawn` directly.

### §2-D7: Scenario timeout default 30 seconds
Per scenario, overridable via `metadata.timeout_ms`.

### §2-D8: Verdict aggregation → structured report
Saved to `artifacts/projects/<id>/forge_tests/runs/<run_ts>/report.json`.

### §2-D9: Test Designer schema compatibility
VERIFIED COMPATIBLE (see §2 above). AC-S1–AC-S8 all met.

### §2-D10: Reference project is normal Forge project
Located at `artifacts/projects/_reference_todo_api/`. `_` prefix = infrastructure fixture.

### §2-D11: Multi-step scenarios out of scope
T3/T4/T5 test not-found paths (no prior state needed). Multi-step deferred.

---

## 5. Track A Exceptions (§ARC-1 precedent)

- `loopback_signal.js` uses `fs.appendFileSync` for JSONL log (log-style write)
- `verdict_aggregator.js` uses `fs.writeFileSync` for report JSON
- `harness_runner.js` uses `shell.run_in_workspace` for spawning (NOT direct spawn)
- Reference project itself is NOT under Track A discipline (fixture code)

All exceptions documented here per §7 of PROMPT-PHASE-8.md.

---

## 6. Namespace

New L2 namespace: `builtproject.*`
- Tool count: 56 → 58
- Doctor checks: 20 → 21
- Scenarios: 118 → 128

---

## 7. Owner Approval

Authorized by PROMPT-PHASE-8.md binding §2 (owner-issued). Schema upgrade separately approved per DECISION-20260513-0930.

— Decision authored by Claude (CTO advisor) 2026-05-13.
