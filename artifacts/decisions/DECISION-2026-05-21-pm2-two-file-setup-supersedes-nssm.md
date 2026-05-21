# DECISION-2026-05-21 — pm2 Two-File Setup Supersedes NSSM Installer

**Date:** 2026-05-21
**Owner:** Khaled (CTO)
**Status:** APPROVED — in effect immediately
**Replaces:** `artifacts/decisions/DECISION-2026-05-20T10-00-stage-12-7-amendment-automated-installer.md`

---

## 1. Decision

Abandon the NSSM-based automated installer (`bin/forge-install.js` + `scripts/install/*.js`).
Replace with two `.bat` files + pm2:

| File | Purpose |
|---|---|
| `INSTALL_FORGE.bat` | One-time per-machine setup (downloads, installs, configures boot) |
| `RUN_FORGE.bat` | Lightweight manual runner (start/open browser) |
| `STOP_FORGE.bat` | Stop Forge and remove from pm2 list |
| `ecosystem.config.js` | pm2 process descriptor |

---

## 2. Root Cause — Why NSSM Was Abandoned

The NSSM approach surfaced **8 bugs** over 5 real install attempts (B1–B8). Each required a separate fix session and a new install attempt. Total cycle time: >1 week.

### B1 — NSSM exits non-zero on `nssm version`

**Symptom:** Installer reported NSSM invalid despite correct output.
**Root cause:** NSSM 2.24 prints its version to stderr and exits with non-zero (usage exit code). Node's `execSync` threw on non-zero, discarding the stderr.
**Fix:** Capture stderr from the error object; check string content, not exit code.
**Reference:** Stage 12.7 mid-checkpoint §11.

### B2 — NSSM stderr is UTF-16 LE

**Symptom:** `output.includes("2.24")` returned false even though the version line was visually present.
**Root cause:** NSSM 2.24 (2014 Windows binary) outputs UTF-16 LE on piped stderr. Node.js reads it as UTF-8, interleaving null bytes: `"V e r s i o n   2 . 2 4"`.
**Fix:** Try 4 decodings (utf8, utf16le, latin1, ascii); first match wins.
**Reference:** Stage 12.7 mid-checkpoint §14.

### B3 — uid_pin_match false positive with NSSM Local System account

**Symptom:** Post-install Doctor showed `uid_pin_match: FAIL — Username mismatch: pinned=KHALEDSAYED$ current=Khaled.Sayed`.
**Root cause:** NSSM installs services as Local System (`COMPUTERNAME$`). The Doctor compared `COMPUTERNAME$` (service) vs `Khaled.Sayed` (interactive user) and flagged a mismatch.
**Fix:** Added `isIdentityMatch()` to `uid_pin_match.js` recognizing Windows computer-account ↔ interactive-user equivalence on the same hostname.
**Reference:** Stage 12.7 mid-checkpoint §16.

### B4 — UTF-16 LE encoding recurred in post_verify.js

**Symptom:** B2 was fixed in `install_orchestrator.js` but the same `encoding:"utf8"` bug existed independently in `post_verify.js`.
**Root cause:** Code duplication — two separate NSSM version parsers existed.
**Fix:** Extracted `_nssm_helper.js` with shared `verifyNssmVersion()` + `_decodeNssmBuffer()`; refactored both callers.
**Reference:** Stage 12.7 mid-checkpoint §18.

### B5 — Doctor openai_api_key check didn't consult keychain

**Symptom:** Doctor showed `openai_api_key: FAIL` from service context even after successful `migrate_secrets` step.
**Root cause:** `openaiApiKey.js` predated the `secret_provider` abstraction and only checked `process.env.OPENAI_API_KEY`. NSSM Local System services have an isolated environment — user env vars don't propagate.
**Fix:** Updated `openaiApiKey.js` to call `secret_provider.get()` first; added `migrate_secrets` step to installer to write the key to Windows Credential Manager.
**Reference:** Stage 12.7 mid-checkpoint §20.

### B6 — Crash recovery timeout too short (30s → 60s)

**Symptom:** Post-install step_11 (crash recovery verification) timed out — NSSM `AppRestartDelay=10000ms` + app startup exceeded 30s on real hardware.
**Fix:** Increased poll timeout from 30s to 60s in `_verifyCrashRecovery`.
**Reference:** Stage 12.7 mid-checkpoint §21.

### B7 — Windows Credential Manager provider used WinRT (unavailable on Desktop)

**Symptom:** `secretProvider.set()` silently returned `{ ok: false }` — credentials never written to Windows Credential Manager.
**Root cause:** `windows_credential_manager.js` used `Windows.Security.Credentials.PasswordVault` (WinRT API). WinRT `PasswordVault` is unavailable on Desktop PowerShell without UWP runtime components. `isAvailable()` always returned false → fell back to `encrypted_file_provider` → NSSM Local System couldn't read the file (different user context).
**Fix:** Replaced WinRT with `cmdkey` (set/delete) + PowerShell P/Invoke to `advapi32.dll!CredReadW` (get). §ARC-5 exception preserved.
**Reference:** Stage 12.7 mid-checkpoint §24.

### B8 — Orphan node processes holding port 3100 after NSSM restart

**Symptom (root cause, not yet field-confirmed):** NSSM stops the service by sending SIGTERM/SIGKILL to the Node.js process. On Windows, child processes (spawned internally by `start-api.js`) may not receive the signal and linger, holding port 3100. Next NSSM start → `EADDRINUSE` on port 3100 → service fails to start.
**Impact:** This is a structural issue with NSSM's process tree management on Windows — not fixable at the application level without significant NSSM configuration work.
**Fix:** Eliminated NSSM entirely. pm2 has explicit child-process tracking and port-conflict detection. The `INSTALL_FORGE.bat` and `RUN_FORGE.bat` scripts also include a `netstat`/`taskkill` guard before each pm2 start to clear any orphan processes.

---

## 3. Decision Rationale

| Factor | NSSM approach | pm2 two-file approach |
|---|---|---|
| Install complexity | 11-step Node.js orchestrator, rollback logic | 10-step BAT file, no rollback needed |
| Bugs discovered | 8 (B1–B8) across 5 real install attempts | 0 (pm2 is well-tested Windows software) |
| Orphan process risk | Structural (B8) | Eliminated (pm2 tracks process tree) |
| Multi-machine support | Requires NSSM binary on each machine | Requires only Node.js + git (winget auto-install) |
| Owner workflow | `node bin/forge-install.js` (requires Node.js + repo already cloned) | Double-click `INSTALL_FORGE.bat` (self-bootstrapping) |
| Auto-start on boot | NSSM Windows service | pm2 + Startup folder `forge-resurrect.bat` |
| §ARC count impact | N/A | 0 (BAT files are not Node code — no new §ARC entries) |
| Cost | $0.00 | $0.00 |

---

## 4. New Install Workflow

### First time on a machine

1. Download `INSTALL_FORGE.bat` from:
   `https://raw.githubusercontent.com/Wolfy-Wooolfy/Forge-Claude/main/INSTALL_FORGE.bat`
2. Double-click it.
3. Done — Forge is running, starts with Windows, Desktop shortcuts created.

**What INSTALL_FORGE.bat does (in order):**
1. Detects install dir (`D:\ForgeAI` if D: exists, else `C:\ForgeAI`)
2. Checks / auto-installs Node.js via winget
3. Checks / auto-installs git via winget
4. `git clone` (or `git pull` if already installed)
5. `npm install`
6. Checks / installs pm2 globally
7. Kills any orphan processes on port 3100 (B8 guard)
8. `pm2 start ecosystem.config.js --update-env` + `pm2 save --force`
9. Copies `forge-resurrect.bat` to Windows Startup folder
10. Creates Desktop shortcuts for `RUN_FORGE.bat` and `STOP_FORGE.bat`
11. Opens `http://127.0.0.1:3100`

### Subsequent use

- **Start manually:** Double-click `RUN_FORGE` (Desktop shortcut)
- **Stop:** Double-click `STOP_FORGE` (Desktop shortcut)
- **Auto-start:** Handled by `forge-resurrect.bat` in Windows Startup folder

---

## 5. Install Target

| Drive D: present | Install dir |
|---|---|
| Yes | `D:\ForgeAI` |
| No | `C:\ForgeAI` |

---

## 6. Files Created

| File | Status |
|---|---|
| `INSTALL_FORGE.bat` | NEW — repo root |
| `RUN_FORGE.bat` | NEW — repo root |
| `STOP_FORGE.bat` | NEW — repo root |
| `ecosystem.config.js` | NEW — repo root |

## 7. Files Deprecated (not deleted — audit trail)

| File | Deprecation header added |
|---|---|
| `bin/forge-install.js` | ✓ |
| `scripts/install/preflight.js` | ✓ |
| `scripts/install/install_orchestrator.js` | ✓ |
| `scripts/install/rollback.js` | ✓ |
| `scripts/install/post_verify.js` | ✓ |
| `scripts/install/_nssm_helper.js` | ✓ |

## 8. Files Modified

| File | Change |
|---|---|
| `GETTING_STARTED.md` | Install section replaced with two-file workflow |

---

## 9. §ARC Count

**Stays at 6.** `.bat` files are not Node.js code — no §ARC exceptions apply.

---

## 10. Cost

**$0.00.** No LLM calls in any of the new files.

---

**END OF DECISION**
