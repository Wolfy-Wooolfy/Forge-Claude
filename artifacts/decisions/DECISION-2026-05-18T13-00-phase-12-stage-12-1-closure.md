# Stage 12.1 — Service Lifecycle — Closure Decision

**Date:** 2026-05-18T13:00:00.000Z
**Stage:** 12.1 — Service Lifecycle
**Author:** Claude (CTO advisor)
**Status:** CLOSED — owner approval pending
**Plan Authority:** `artifacts/decisions/DECISION-2026-05-18T11-30-phase-12-plan.md`

---

## §1 — Closure Gate Criteria

| # | Gate Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `node bin/forge-doctor.js → exits 0` | ✓ | 0 critical, 3 warning. `service_lifecycle` check present: PASS |
| 2 | `node bin/forge-test.js → 187 pass, 0 fail, 5 skip` | ✓ | 187 / 0 / 5 / 192 total confirmed |
| 3 | Decision artifact registered in `artifacts/decisions/` | ✓ | This file |
| 4 | `progress/status.json.next_step` → Stage 12.2 | ✓ | Patched in §7 |
| 5 | Exit Report (§4 below) | ✓ | Present |

**All gate criteria met. Stage 12.1 is CLOSED pending CTO review.**

---

## §2 — Acceptance Criteria (Plan §3)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `scripts/service/windows_nssm_install.bat` | ✓ | 7,294 B — S190 PASS |
| 2 | `scripts/service/windows_task_scheduler_install.bat` | ✓ | 6,419 B — S191 PASS |
| 3 | `scripts/service/forge.service` | ✓ | 2,121 B |
| 4 | `scripts/service/com.forge.api.plist` | ✓ | 2,260 B |
| 5 | `scripts/service/Dockerfile` | ✓ | 2,718 B |
| 6 | `code/src/runtime/doctor/checks/service_lifecycle.js` | ✓ | S192 PASS |
| 7 | `service_lifecycle` check in `node bin/forge-doctor.js` | ✓ | 0 critical, PASS detail |
| 8 | `scripts/service/crash_recorder.bat` | DESCOPED | → Stage 12.4 (Monitoring) per CTO ruling |
| 9 | `scripts/service/crash_recorder.sh` | DESCOPED | → Stage 12.4 (Monitoring) per CTO ruling |
| 10 | `recentExecution.js` extended with crash check | DESCOPED | → Stage 12.4 (Monitoring) per CTO ruling |
| 11 | S190 PASS | ✓ | `windows_nssm_install.bat` structure verified |
| 12 | S191 PASS | ✓ | `windows_task_scheduler_install.bat` structure verified |
| 13 | S192 PASS | ✓ | `service_lifecycle` Doctor check present + PASS |
| 14 | SU baseline: 184 + 3 = 187 pass, 0 fail, 5 skip | ✓ | 187 / 0 / 5 / 192 total |

---

## §3 — Track A + §ARC Compliance

| Check | Status |
|---|---|
| `code/src/` files modified | 2: `_registry.js` (service_lifecycle entry only); `service_lifecycle.js` (new check — read-only shell_tools calls) |
| Direct `fs.writeFileSync` in production code | 0 |
| Direct `child_process` in production code | 0 — shell calls via `shell.run_read_only` Path A (getDefaultRegistry) |
| New `new OpenAI()` outside adapter | 0 |
| §ARC ledger additions | 0 — shell_tools.js invoked via registry; no new Track A deviations |
| `package.json` changes | 0 |
| New npm dependencies | 0 |

**Track A: CLEAN. §ARC ledger unchanged at 4 entries (§ARC-1 through §ARC-4).**

---

## §4 — Exit Report

### Files Created

**`scripts/service/` (Group A — operational scripts):**
- `windows_nssm_install.bat` — idempotent NSSM service installer (5 actions)
- `windows_task_scheduler_install.bat` — idempotent Task Scheduler installer (PowerShell)
- `forge.service` — systemd unit with FORGE_DIR/FORGE_USER placeholders
- `com.forge.api.plist` — launchd plist with FORGE_DIR placeholder
- `Dockerfile` — Tier-2 container image (non-root `forge` user)
- `compose.yml` — Tier-2 single-service compose (loopback binding `127.0.0.1:3100:3100`)

**`code/src/runtime/doctor/checks/` (Group B — Doctor check):**
- `service_lifecycle.js` — OS-aware service status check (Windows/Linux/macOS/other)

**`code/src/testing/` (Group C — scenarios + helper):**
- `helpers/service_lifecycle_test_helper.js` — 3 helper methods
- `scenarios/S190_service_install_windows_nssm.json`
- `scenarios/S191_service_install_windows_taskscheduler.json`
- `scenarios/S192_service_lifecycle_doctor_check.json`

**`artifacts/decisions/_phase_12_checkpoints/`:**
- `stage_12_1_mid.md` — Group A mid-checkpoint (owner-approved before Group B/C)

### Files Modified

- `code/src/runtime/doctor/_registry.js` — added `service_lifecycle` entry (last line, 1 line)

### New Behavior

- `node bin/forge-doctor.js` shows `service_lifecycle` check
- On Windows dev machine (service not installed): PASS with detail "not installed — see INSTALL.md §Windows Service"
- If NSSM service `forge-api` is registered and running: PASS "running via nssm"
- If registered but not running: WARN with start command
- If Task Scheduler task `ForgeAPI` registered and running: PASS "running via task_scheduler"
- Linux: checks `systemctl is-active forge-api`
- macOS: checks `launchctl list com.forge.api`
- Other OS: PASS "not applicable"

### SU Baseline Delta

| Metric | Before Stage 12.1 | After Stage 12.1 |
|---|---|---|
| Scenarios | 189 | 192 |
| PASS | 184 | 187 |
| FAIL | 0 | 0 |
| SKIP | 5 | 5 |
| Doctor checks | 25 | 26 |

### Descoped to Stage 12.4

Per CTO ruling during mid-checkpoint review:
- `scripts/service/crash_recorder.bat` → Stage 12.4
- `scripts/service/crash_recorder.sh` → Stage 12.4
- `recentExecution.js` crash-timestamp extension → Stage 12.4
These belong in the Monitoring stage (Stage 12.4) alongside `log_writer.js` and `metrics_window_24h`.

### Incidental Addition (Beyond Plan §3 Scope)

`scripts/service/compose.yml` was added as a Tier-2 optional companion to `Dockerfile`.
Not in Plan §3 but approved by CTO during mid-checkpoint: "compose.yml kept as incidental addition beyond Plan §3 scope."
No §ARC entry required (scripts/service/ is outside `code/src/`).

---

## §5 — Risks Carried Forward

| Risk | Stage |
|---|---|
| Crash recording not yet wired — service crash goes unrecorded | Stage 12.4 |
| `forge.service` and `com.forge.api.plist` not yet installed on any machine | Stage 12.6 (INSTALL.md) |
| OQ-2 (localhost binding security) unresolved | Stage 12.5 |
| No `.dockerignore` at repo root | Stage 12.6 (INSTALL.md note) |

---

## §6 — Owner Approval Block

STOP — CTO verification required before marking `progress/status.json` as CLOSED
and beginning Stage 12.2.

Verification checklist for CTO:
- [ ] Gate criteria §1 accepted
- [ ] Descoped items (crash_recorder, recentExecution.js) confirmed as Stage 12.4
- [ ] compose.yml incidental addition accepted
- [ ] `service_lifecycle.js` behavior (PASS when not installed) accepted
- [ ] Stage 12.2 (Secret Storage) GO authorized

---

**END OF STAGE 12.1 CLOSURE DECISION**
