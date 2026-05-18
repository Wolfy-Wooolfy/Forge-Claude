# Stage 12.1 — Mid-Checkpoint

**Date:** 2026-05-18
**Stage:** 12.1 — Service Lifecycle
**Author:** Claude (CTO advisor)
**Status:** AWAITING OWNER REVIEW — Group A complete, Group B + C pending

---

## §1 — Group A Script Inventory

All 6 binding scripts from Plan §3 Stage 12.1 (CTO-ratified filenames) written to
`scripts/service/`:

| File | Size | Idempotent | Description |
|---|---|---|---|
| `windows_nssm_install.bat` | 7 294 B | ✓ | Removes existing service before re-install |
| `windows_task_scheduler_install.bat` | 6 419 B | ✓ | Deletes existing task before re-create |
| `forge.service` | 2 121 B | N/A | systemd unit (installed via INSTALL.md walkthrough) |
| `com.forge.api.plist` | 2 260 B | N/A | launchd plist (installed via INSTALL.md walkthrough) |
| `Dockerfile` | 2 718 B | N/A | Tier-2 container image definition |
| `compose.yml` | 2 758 B | N/A | Tier-2 single-service compose |

**Idempotency confirmation (Windows scripts):**
- `windows_nssm_install.bat install`: checks `nssm status forge-api` before installing;
  if service exists → stops + removes before re-installing. Safe to re-run.
- `windows_task_scheduler_install.bat install`: checks `schtasks /query /tn ForgeAPI`
  before creating; if task exists → deletes before re-creating. Safe to re-run.

**Placeholder pattern (Linux/macOS/Tier-2):**
- `forge.service` and `com.forge.api.plist` use `FORGE_DIR` / `FORGE_USER`
  placeholders documented with replacement instructions in INSTALL.md (Stage 12.6).
- `Dockerfile` and `compose.yml` use relative path `../..` to point to repo root,
  valid when executed from `scripts/service/`.

---

## §2 — Track A Compliance (Group A)

Group A produced only operational script files in `scripts/service/`. Zero
`code/src/` files were created or modified.

```
git status --short output:
  M  artifacts/decisions/DECISION-2026-05-18T12-00-roadmap-phase-12-amendment.md
  ?? scripts/
```

No `code/src/` files appear in the diff. Track A: **CLEAN**.

`scripts/service/` is outside `code/src/` — these are operational artifacts, not
Forge runtime. No §ARC exemption required for any file in Group A.

---

## §3 — §ARC Ledger Status

| Status | Count |
|---|---|
| Active §ARC entries | 4 (§ARC-1 through §ARC-4 — unchanged) |
| Pre-authorized (plan §6) | 2 (§ARC-5 Stage 12.2, §ARC-6 Stage 12.4) |
| New entries added in Group A | 0 |

No §ARC ledger changes in Group A. The `scripts/service/` scripts use OS-native
commands (NSSM, schtasks, systemd, launchd) — none involve Forge runtime deviations.

---

## §4 — Plan §3 Stage 12.1 Acceptance Criteria (Partial — Group A Only)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `scripts/service/windows_nssm_install.bat` present | ✓ | 7 294 B, idempotent |
| 2 | `scripts/service/windows_task_scheduler_install.bat` present | ✓ | 6 419 B, idempotent |
| 3 | `scripts/service/forge.service` present | ✓ | 2 121 B, valid systemd unit syntax |
| 4 | `scripts/service/com.forge.api.plist` present | ✓ | 2 260 B, valid XML plist |
| 5 | `scripts/service/Dockerfile` present | ✓ | 2 718 B |
| 6 | `scripts/service/compose.yml` present | ✓ | 2 758 B |
| 7 | `code/src/runtime/doctor/checks/service_lifecycle.js` | ⏳ | Group B — pending |
| 8 | `scripts/service/crash_recorder.bat` | ⏳ | Group B — pending |
| 9 | `scripts/service/crash_recorder.sh` | ⏳ | Group B — pending |
| 10 | `recentExecution.js` extended with crash check | ⏳ | Group B — pending |
| 11 | S190–S192 scenarios PASS | ⏳ | Group C — pending |
| 12 | `node bin/forge-doctor.js` shows `service_lifecycle` check | ⏳ | Group B+C — pending |
| 13 | SU baseline: 184 + 3 = 187 pass, 0 fail, 5 skip | ⏳ | Group C — pending |

---

## §5 — Design Notes (for CTO review)

**D1 — NSSM crash recorder hook (commented out in Group A):**
`windows_nssm_install.bat` includes a commented-out line:
```batch
:: nssm set forge-api AppEvents AppExit "%FORGE_DIR%\scripts\service\crash_recorder.bat"
```
NSSM does not natively support arbitrary "run on crash" event hooks via `AppEvents AppExit`.
The commented line is illustrative — the actual integration for crash recording will
be implemented in Group B using a different mechanism. Options:
- **Option 1 (wrapper):** NSSM runs `crash_recorder_wrapper.bat` which launches
  `node start-api.js` and calls `crash_recorder.bat` on non-zero exit.
- **Option 2 (scheduler task):** A secondary Windows Task Scheduler task triggers
  on "Event ID 7034" (service crashed) in the System event log.

**Recommendation:** Option 1 (wrapper) keeps everything within `scripts/service/`
and avoids event log dependency. Requesting CTO decision before Group B.

**D2 — Task Scheduler restart-on-failure (uses PowerShell):**
`windows_task_scheduler_install.bat` uses PowerShell's `Register-ScheduledTask`
internally for the task creation. Pure `schtasks /create` command-line cannot
configure restart-on-failure with custom delays/retries. PowerShell is available
on all Windows 10/11 systems and is expected in this context.

**D3 — Dockerfile `.dockerignore`:**
The Dockerfile includes a comment recommending a `.dockerignore` file. The file
itself is NOT created in Stage 12.1 (it would need to live at the repo root, and
creating repo-root files requires explicit plan authorization). Noted for Stage 12.6
(INSTALL.md walkthrough).

---

## §6 — STOP — Awaiting Owner Review

Requesting CTO review of Group A before proceeding to Group B:

1. **NSSM crash recorder integration approach** (§5 Design Note D1): confirm
   Option 1 (wrapper) or Option 2 (event log task) for Group B implementation.
   If Option 1: Group B adds `crash_recorder_wrapper.bat` which wraps node launch.
   If Option 2: Group B adds a secondary schtasks event-triggered task.

2. **Group B + Group C scope confirmation**: confirm Group B is:
   - `code/src/runtime/doctor/checks/service_lifecycle.js` (new check)
   - `scripts/service/crash_recorder.bat` (Windows)
   - `scripts/service/crash_recorder.sh` (Unix)
   - Modified `code/src/runtime/doctor/checks/recentExecution.js`
   And Group C is S190, S191, S192 (3 scenarios) per Plan §1.

**No STOP-AND-REPORT triggers encountered:**
- No Node.js devDependencies required ✓
- No §ARC ledger additions needed ✓
- No Track A violations ✓
- No package.json changes ✓

**END OF MID-CHECKPOINT**
