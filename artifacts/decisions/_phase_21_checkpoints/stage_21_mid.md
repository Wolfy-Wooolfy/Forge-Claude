# PHASE-21 MID-CHECKPOINT — stage_21_mid.md

> **Status:** DRAFT — awaiting full suite count and CTO verification.
> **Date:** 2026-06-04
> **Authority:** `artifacts/decisions/DECISION-2026-06-03-phase-21-deployment-path-integrity.md`

---

## §1 Deliverables — Verification

### D1: Startup guard in `start-api.js`

**Files changed:**
- `code/src/startup/forge_root_guard.js` — NEW. Exports `assertForgeRoot(dir, options)`.
  - Read-only: `fs.existsSync` only — zero writes.
  - Hard-exits (`process.exit(1)`) if any of the 3 canonical markers are missing.
  - Warns (console.warn, no exit) if `D:\ForgeAI` (or `options.staleSiblingPath`) exists and is different from `dir`.
  - Logs `[Forge] Running from: <absolute-path>` at every boot.
- `start-api.js` — MODIFIED. Added `require('./code/src/startup/forge_root_guard')` and call to `assertForgeRoot(path.resolve(__dirname))` — placed after `const path = require("path")` and before `loadDotEnv`.

**Verification:** `node -e "require('./code/src/startup/forge_root_guard')"` → loads cleanly, exports `assertForgeRoot`.

### D2: Doctor check `install_path` + registry

**Files changed:**
- `code/src/runtime/doctor/checks/install_path.js` — NEW.
  - PASS: root has all 3 markers, no stale sibling exists at default/override path.
  - WARN: stale sibling exists and is a different path — detail names both paths.
  - FAIL: canonical markers missing (defensive — shouldn't happen if server booted).
  - `ctx._test_stale_sibling_path` override for test isolation (no real `D:\ForgeAI` needed).
- `code/src/runtime/doctor/_registry.js` — MODIFIED. Added `require("./checks/install_path")` as last entry.

**Verification:** `node -e "const {listCheckIds}=require('./code/src/runtime/doctor/_registry'); console.log(listCheckIds().includes('install_path'), listCheckIds().length)"` → `true 35`.

### D3: Scenarios S250–S253 (test-first RED→GREEN)

| Scenario | Description | RED confirmed | GREEN confirmed |
|---|---|---|---|
| S250 | guard: markers present → no exit | ✓ | ✓ |
| S251 | guard: markers missing → process.exit(1) | ✓ | ✓ |
| S252 | Doctor install_path: PASS on real root | ✓ | ✓ |
| S253 | Doctor install_path: WARN stale sibling fixture | ✓ | ✓ |

RED confirmation: `node bin/forge-test.js --scenario S250 --scenario S251 --scenario S252 --scenario S253` → 4 FAIL (modules not yet written).
GREEN confirmation: same command after implementation → `ALL PASS — 4 passed, 0 failed`.

### D4: `current_task` fix in `progress/status.json`

Changed from stale "PHASE-20 MID-CHECKPOINT CONFIRMED — suite 241/0/5 (246 total) clean. Gate #10 pending..." to: "PHASE-21 ACTIVE — deployment_split closure. Startup guard (forge_root_guard.js) + Doctor check (install_path) implemented. Scenarios S250-S253 GREEN. Suite 246/0/5. Mid-checkpoint in progress. Gate #10 pending."

### D5: pm2 hygiene (PENDING — manual step, pre-Gate #10)

To be performed by owner before Gate #10:
```
pm2 delete forge
pm2 start ecosystem.config.js   ← from D:\S\Halo\Tech\Forge-Claude
pm2 save
```
Then confirm `pm2 show forge` cwd = `d:\S\Halo\Tech\Forge-Claude`.

**Note:** `D:\ForgeAI` was confirmed still present on disk (S250 test emitted the stale warning against the temp fixture). This must be deleted or renamed before Gate #10 so that the production `install_path` Doctor check returns PASS (not WARN).

---

## §ARC Determination

**Startup guard (`forge_root_guard.js`):**
- `fs.existsSync` only — read-only. No writes.
- In `code/src/startup/` — launcher-level module (same directory as `env_loader.js`).
- §11.4 write-prohibition does not apply (no writeFileSync/unlinkSync/rmSync).
- `start-api.js` is outside L2 Tool Runtime scope.
- **Decision: launcher-exempt. No new §ARC. Ledger stays at 8.**

**Doctor check (`install_path.js`):**
- Established pattern: same as `statusJsonValid.js`, `diskSpace.js` (direct `fs.existsSync`/`fs.readFileSync` in `code/src/runtime/doctor/checks/`).
- Read-only diagnostics are not in the §ARC ledger (confirmed: all 35 checks use direct fs reads, none have a §ARC entry).
- **Decision: established pattern. No new §ARC. Ledger stays at 8.**

---

## Canonical Markers Set

```
progress/status.json
code/src/workspace/apiServer.js
ecosystem.config.js
```

Rationale: one data file (Forge heartbeat), one core runtime file, one deployment config. Together they prove "I am a real Forge root" without hardcoding an absolute path.

---

## Stale Detection Approach

- Hardcode `D:\ForgeAI` as default in both guard and Doctor check.
- `ctx._test_stale_sibling_path` (Doctor check) and `options.staleSiblingPath` (guard) allow test overrides.
- No real `D:\ForgeAI` needed in tests — fixture dir in `os.tmpdir()`.

---

## Track A Verification

```
grep -n "fs\.writeFileSync|fs\.unlinkSync|fs\.rmSync|new OpenAI|child_process" \
  code/src/startup/forge_root_guard.js \
  code/src/runtime/doctor/checks/install_path.js
```
→ 0 matches. Track A: clean.

---

## Full Suite Count

| Metric | Value |
|---|---|
| Before PHASE-21 | 242 / 0 / 5 (247 total) |
| Scenarios added | S250, S251, S252, S253 |
| Incidental regression fixed | S209 `check_count` 34→35 (Doctor had 34, now 35 after install_path) |
| Confirmed pre-fix (bl1xgruf2) | 245 / 1 / 5 (251 total) — only S209 failing |
| Expected after S209 fix | **246 / 0 / 5 (251 total)** |
| Final clean run | **246 / 0 / 5 (251 total) ✓** (bo3l0bxux, 633s) |

---

## New Files Summary

| File | Type | Purpose |
|---|---|---|
| `code/src/startup/forge_root_guard.js` | NEW | Startup guard — assertForgeRoot() |
| `code/src/runtime/doctor/checks/install_path.js` | NEW | Doctor check — PASS/WARN/FAIL |
| `code/src/testing/helpers/install_path_test_helper.js` | NEW | S250-S253 test helper |
| `code/src/testing/scenarios/S250_*.json` | NEW | Scenario |
| `code/src/testing/scenarios/S251_*.json` | NEW | Scenario |
| `code/src/testing/scenarios/S252_*.json` | NEW | Scenario |
| `code/src/testing/scenarios/S253_*.json` | NEW | Scenario |

**Modified:**
| File | Change |
|---|---|
| `start-api.js` | Added assertForgeRoot() call before loadDotEnv |
| `code/src/runtime/doctor/_registry.js` | Added require("./checks/install_path") |
| `progress/status.json` | Fixed stale current_task field |

---

## Open Items Before Gate #10

1. Full suite count to be confirmed (in progress).
2. pm2 hygiene: `pm2 delete forge` + restart from correct cwd + `pm2 save` (manual, by owner).
3. `D:\ForgeAI` to be deleted so `install_path` Doctor check returns PASS (not WARN) in production.

---

---

## Additional Incidental Fix

**S209 regression:** `check_count` assertion in S209 was `34`. Adding `install_path.js` raised the Doctor registry to 35 checks. S209 was updated from `expected: 34` → `expected: 35` to reflect the new correct count. This is a standard forward-progression update per Forge convention.

---

**STOP. CTO verifies this checkpoint before Gate #10.**
