# PHASE-24 Mid-Checkpoint — D1 Complete (engine + tool + unit scenarios)

**Date:** 2026-06-08
**Status:** MID — 4 unit scenarios pass; full-suite regression confirmed; awaiting GO-WIRE.

---

## What was built

### D1a — `code/src/runtime/orchestration/materializerEngine.js` (NEW)
Pure orchestration engine. No direct fs/cp/fetch/new OpenAI(). All side effects via `reg.invoke`.

Functions:
- `_sha256(content)` — pure, `crypto.createHash("sha256")`
- `_lineCount(content)` — pure, split on `\n`
- `_isSafePath(p)` — rejects `..`, leading `/`, leading `\`
- `_buildCodegenPrompt(plan, spec, design, scenario_id)` — embeds `SCENARIO_TAG: <id>` for mock scripting
- `_tryParseCodegenResponse(text)` — 2 parse attempts (raw JSON + markdown-stripped)
- `async materialize(input, ctx)` — full flow: codegen → safety → write → smoke → return

Return contract: `{ ok, status, files_written, smoke, summary, error_code?, error_detail? }`. Never throws.

Error codes:
| Code | Trigger |
|---|---|
| `AGENT_INVOKE_ERROR` | `agent.invoke` threw |
| `CODEGEN_AGENT_FAILED` | `agent.invoke` returned non-SUCCESS |
| `INVALID_CODEGEN` | response not parseable as `{ files: [...] }` after 2 attempts |
| `UNSAFE_PATH` | any `files[i].path` contains `..` or starts with `/` or `\` |
| `WRITE_FAILED` | `fs.write_file` returned non-SUCCESS |
| `SMOKE_FAILED` | `shell.run_in_workspace` threw or exit_code ≠ 0 |

### D1b — `code/src/runtime/tools/materializer_tools.js` (NEW)
L2 tool `builder.materialize`. Auto-registered by `_registry.js` (matches `*_tools.js` pattern). `required_mode: "WORKSPACE_WRITE"`. Has `preview()`. Wraps `materialize()` in `ok()` envelope — materializer business failures surface in `output.status: "FAILED"` + `output.error_code`; infrastructure failures surface as `status: "FAILED"` at the L2 envelope level only for unexpected throws.

### D1c — `code/src/testing/helpers/materializer_test_helper.js` (NEW)
Test helpers for S267–S272. All call `reg.invoke("builder.materialize", ...)` with mock provider. Track A clean (§ARC exception not needed — no direct fs.* calls).

### D1d — mock_responses.json entries (4 added)
| Key | Purpose |
|---|---|
| `mock\|mock-mat-s267\|scenario:S267` | Valid 2-file codegen response |
| `mock\|mock-mat-s268\|scenario:S268` | `../evil.js` unsafe path |
| `mock\|mock-mat-s269\|scenario:S269` | Non-JSON text (parse failure) |
| `mock\|mock-mat-s272\|scenario:S272` | Valid 3-file codegen response |

### D1e — Scenario JSON files (4 new)
| Scenario | File | Assertions |
|---|---|---|
| S267 | `S267_materializer_happy_path.json` | tool SUCCESS, status SUCCESS, 2 files, sha256 real×2, smoke.ran=false |
| S268 | `S268_materializer_unsafe_path.json` | tool SUCCESS, status FAILED, UNSAFE_PATH, nothing_written |
| S269 | `S269_materializer_codegen_parse_fail.json` | tool SUCCESS, status FAILED, INVALID_CODEGEN, nothing_written |
| S272 | `S272_materializer_three_files.json` | tool SUCCESS, status SUCCESS, 3 files, all sha256 real |

---

## Test results

```
── Forge Self-Test Harness ──────────────────────────────────────

  ✓  S267   builder.materialize happy path — 2 files → real sha256 (≠ pending), status SUCCESS (PHASE-24)
  ✓  S268   builder.materialize path-safety — ../evil.js → UNSAFE_PATH, nothing written (PHASE-24)
  ✓  S269   builder.materialize codegen parse failure → INVALID_CODEGEN, no partial writes (PHASE-24)
  ✓  S272   builder.materialize 3-file plan → all 3 written, all sha256 real (PHASE-24)

─────────────────────────────────────────────────────────────────
ALL PASS — 4 passed, 0 failed, 0 skipped (4 total)
duration: 1246ms
```

Full suite: **268 total (263 pass / 0 fail / 5 skip Windows)** — 0 fail. (Baseline was 264/259/0/5.) Confirmed clean on second run (709615ms). First run had an intermittent S120/S121 failure traced to prior-session resource contention (not reproducible; confirmed pre-existing flakiness unrelated to PHASE-24 changes).

---

## Track A & §ARC

**Track A grep result:** Clean — no `fs.writeFileSync`, `fs.readFileSync`, `fs.unlinkSync`, `fs.rmSync`, `child_process`, `fetch(`, `new OpenAI(`, or `new Anthropic(` in the 3 new production/test files.

**§ARC ledger:** Still 8 — no new exceptions added.

**actual_usd:** $0 (all mock).

---

## What is NOT done yet (awaiting GO-WIRE)

- `buildProject()` bridge in `code/src/ai_os/conversationEngine.js`
- Wiring scenarios S270 (BUILDER→RUN_TESTS full-loop) and S271 (smoke-fail / no advance)
- Gate #10 real-provider build

---

## Risks

- `agent.invoke` codegen call forwards `budget_usd: 0.50` hardcoded. Gate #10 real provider must confirm this is within the $0.50/call kill bar.
- `smoke_entry` must be spec-defined (R-A refinement) — the test helper passes `smoke: false` so this path is not exercised in unit tests.
- `fs.write_file` creates parent dirs (`mkdirSync recursive`) — tested via S267/S272 with real project dir writes + cleanup.

## Backlog (do NOT fix in PHASE-24 — frozen scope)

- **builtproject server scenarios (S120/S121/S124–S127) flake under full-suite load; harden later (configurable wait_for_port / randomized port / clean teardown / stop pm2 during suite).** Pre-existing test-infra fragility: those scenarios start `node server.js` with a 5s `wait_for_port`; under a ~22-min full-suite run (with pm2 Forge on port 3100) they can miss the window. Not caused by PHASE-24 changes. A closure run must be clean 0-fail — re-run if these flake, and document the flake count.
