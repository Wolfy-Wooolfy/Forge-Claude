# DECISION-2026-05-30 — PHASE-18: Quality Debt Sweep — CLOSED

**Date:** 2026-05-30
**Owner:** Khaled (CTO) — Forge Project
**Status:** CLOSED
**Author:** Claude Code (claude-sonnet-4-6)
**Predecessor:** PHASE-17 CLOSED ✓
**Authority:** `DECISION-2026-05-29-phase-18-quality-debt-sweep.md` (APPROVED 2026-05-29)

---

## Summary

PHASE-18 — Quality Debt Sweep — is fully closed. Four scenarios that have carried as
"pre-existing — accept" through 4-6 closures since PHASE-9 are now resolved. The suite
achieves true green for the first time:

**234 passed / 0 failed / 5 skipped (239 total)**

The 5 skips are intentional docker scenarios (S58/S62/S65/S67/S68 — `requires_binary: docker`).
No more pre-existing failures in any future closure summary.

---

## Acceptance Gates

| # | Gate | Status |
|---|------|--------|
| 1 | S17 PASS in the full suite (not just alone) | ✓ PASS |
| 2 | S28 PASS in the full suite (not just alone) | ✓ PASS (was already passing — verified) |
| 3 | S137 PASS — engine and scenario agreed on empty-KB semantics | ✓ PASS |
| 4 | S191 PASS on Windows AND non-Windows (helper assertion fix — no SKIP needed) | ✓ PASS |
| 5 | Track A grep clean — zero new `new OpenAI()`, raw `fetch()`, `fs.*Sync` outside §ARC | ✓ CLEAN |
| 6 | `stage_17_final.md` title updated; `§ARC-8` wording corrected in PHASE-17 closure artifact | ✓ DONE |
| 7 | `doDiscovery`-related dead code removed (or explicitly noted as still-needed) | ✓ Zero matches — already cleaned in PHASE-16 |
| 8 | Full suite on Windows: **234 passed / 0 failed / 5 skipped (239 total)** | ✓ PASS |
| 9 | Frontend TypeScript strict build still clean | ✓ `tsc --noEmit` 0 errors |
| 10 | Decision artifact closed + `status.json` updated + checkpoint written | ✓ THIS ARTIFACT |

---

## Fixes Applied

### S17 — `documentationBuildLoop` LOOP_EXHAUSTED

**Root cause:** `_runDirectEngine` in `scenario_runner.js` only created the project fixture (and set `fixtureCreated = true`) when `fixturePath` didn't already exist. A stale `doc_build_loop_state.json` from 2026-05-25 with `iterations: 3, max_iterations: 3` remained on disk. The engine read it and returned `LOOP_EXHAUSTED` immediately. Since `fixtureCreated = false`, no cleanup was attached — stale state persisted indefinitely.

**Fix:** `_runDirectEngine` now always deletes and recreates the project directory before writing the fixture. Cleanup is unconditional (not gated on `fixtureCreated`).

**Also fixed:** `_runApiserver` had the same `!fs.existsSync` guard for fixture recreation (though its cleanup was already unconditional). Fixed for consistency to prevent future stale-state issues.

**`_runModuleCall` verified:** No project dir management — no fix needed.

**File:** `code/src/testing/scenario_runner.js`

---

### S137 — `kb.retrieve` Empty Results

**Root cause:** `_runDirectProvider` reset the OpenAI client singleton (`_resetClientForTests()`) at the start of the try block, but its `finally` block closed the mock server (`svc.close()`) without resetting `_client`. The singleton remained pointing to the now-closed mock server port. S137 (`direct_tool`, `kb.retrieve`) ran after S01/S02/S03 (`direct_provider`). Its embedding call hit the stale client → `ECONNREFUSED` → FAILED.

**Confirmed via:** `node bin/forge-test.js --scenario S01 S02 S03 S137` → S137 FAILS. `--scenario S137` alone → PASSES.

**Fix:** Added `_resetClientForTests()` call in `_runDirectProvider`'s `finally` block after `svc.close()`. Mirrors the existing reset already present in `_runDirectEngine`'s try block.

**File:** `code/src/testing/scenario_runner.js`

---

### S191 — `windows_task_scheduler_install.bat` Structure Check

**Root cause:** Helper `runS191TaskSchedulerScriptCheck()` checked `content.includes("-LogonType S4U")`. The BAT file was deliberately redesigned to use `-AtLogOn` with `$env:USERNAME` instead of S4U — to avoid stored credentials. BAT line 16 comment: `"no S4U, no stored password"`. The assertion was written for a design that was intentionally changed.

**Fix:** One-line change in `service_lifecycle_test_helper.js`:
```js
// Before:
logon_type_ok: content.includes("-LogonType S4U"),
// After:
logon_type_ok: content.includes("$env:USERNAME") && content.includes("-AtLogOn"),
```

No SKIP mechanism. Test is platform-agnostic (reads file content). Passes on Windows and non-Windows.

**File:** `code/src/testing/helpers/service_lifecycle_test_helper.js`

---

### S28 — `/api/ai/propose` Test Isolation

**Verified as already fixed.** Confirmed passing in current full suite during §0 analysis. Running the full suite shows 3 failures (S17/S137/S191), not 4. No action taken.

---

### Cosmetic Fixes (PHASE-17 Artifacts)

1. `artifacts/decisions/_phase_17_checkpoints/stage_17_final.md` — title line 1:
   - Before: `# PHASE-17 FINAL CHECKPOINT (pre-UI) — Steps 1 + 2 + 2.5 + 3 Complete`
   - After: `# PHASE-17 FINAL — CLOSED`

2. `artifacts/decisions/DECISION-2026-05-29-phase-17-closure.md` — §ARC Ledger section: separated `§ARC-8` (binary upload exemption, PHASE-13.8 origin) from `ideaSynthesisProvider` (PHASE-17 provider, no §ARC association). Also fixed the deliverables table: "§ARC-8 row added (ideaSynthesisProvider)" → "§ARC-8 row added (binary upload exemption documentation)".

---

### doDiscovery Dead Code

Zero matches for `doDiscovery` in `.js` and `.ts/.tsx` files. Already cleaned up in PHASE-16. No action taken.

---

## Sandbox Verification Note

CTO verified S17 + S191 fixes work environment-independently (Windows suite 234/0/5 confirmed).

S137 fix requires `OPENAI_API_KEY` presence for the KB embedding path to be exercised in a live call. In the sandbox without an API key, `kb.retrieve` short-circuits differently — this is an environment delta (no API key → no embedding call → different failure path), not a regression. On the Windows dev machine with `.env` + `OPENAI_API_KEY`, S137 PASS confirmed in full suite.

---

## Suite Delta

| Metric | Before PHASE-18 (PHASE-17 close) | After PHASE-18 | Delta |
|--------|----------------------------------|----------------|-------|
| Total scenarios | 239 | 239 | 0 |
| Passing | 231 | **234** | **+3** |
| Failing | 3 (S17/S137/S191) | **0** | **-3** |
| Skipped | 5 | 5 | 0 |
| New scenarios | — | 0 | 0 |
| New assertions | — | 0 | 0 |

Scenarios that moved from FAIL to PASS: S17, S137, S191.

---

## §ARC Ledger

**Count: 8 — unchanged.** Zero new §ARC added in PHASE-18.

---

## Cost Actuals

| Category | Budget | Actual |
|----------|--------|--------|
| LLM / API calls | $0.00 (mock-only) | $0.00 |
| Kill bar | $1.00 | — |

---

## Files Changed

| File | Change |
|------|--------|
| `code/src/testing/helpers/service_lifecycle_test_helper.js` | `logon_type_ok` assertion: `$env:USERNAME && -AtLogOn` |
| `code/src/testing/scenario_runner.js` | `_runDirectEngine`: always delete+recreate projectDir; cleanup unconditional. `_runDirectProvider`: `_resetClientForTests()` in finally. `_runApiserver`: always recreate fixture when `scenario.fixture` set. |
| `artifacts/decisions/_phase_17_checkpoints/stage_17_final.md` | Title → `# PHASE-17 FINAL — CLOSED` |
| `artifacts/decisions/DECISION-2026-05-29-phase-17-closure.md` | §ARC Ledger + deliverables table: separated §ARC-8 from ideaSynthesisProvider |
| `artifacts/decisions/DECISION-2026-05-29-phase-18-quality-debt-sweep.md` | Status → APPROVED; §2.4 rewritten; Gate #4 updated; §1 table row updated |

---

## References

| Type | Artifact |
|------|----------|
| Decision | `artifacts/decisions/DECISION-2026-05-29-phase-18-quality-debt-sweep.md` |
| Mid-checkpoint | `artifacts/decisions/_phase_18_checkpoints/stage_18_mid.md` |
| Final checkpoint | `artifacts/decisions/_phase_18_checkpoints/stage_18_final.md` |

---

## Next Phase

**PHASE-19-PENDING-DECISION** — requires a new decision artifact + explicit owner approval before activation. No phase is started automatically.

---

**PHASE-18-CLOSED — 2026-05-30**
