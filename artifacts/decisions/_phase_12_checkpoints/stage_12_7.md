# Stage 12.7 — Final Checkpoint

**Date:** 2026-05-21
**Stage:** 12.7 — Automated Installer → pm2 Two-File Setup
**Status:** CLOSED
**Companion (mid-checkpoint):** `stage_12_7_amended_mid.md` (§1–§25, B1–B7 + S206)
**Closure decision:** `DECISION-2026-05-21T14-00-stage-12-7-closure.md`
**pm2 pivot decision:** `DECISION-2026-05-21-pm2-two-file-setup-supersedes-nssm.md`

---

## §1 — Bug Arc Summary (B1–B9)

Stage 12.7 had the longest bug arc in PHASE-12: 9 bugs across 6+ real install attempts. The arc ends with NSSM eliminated entirely.

| Bug | Fixed | Installer state after |
|---|---|---|
| B1 — NSSM exit-code false negative | 2026-05-20 (mid §11) | 2nd real run attempt |
| B2 — UTF-16 LE (orchestrator) | 2026-05-20 (mid §14) | 3rd real run attempt |
| B3 — uid_pin service-account equivalence | 2026-05-20 (mid §16) | 4th real run attempt |
| B4 — UTF-16 LE recurrence (post_verify) | 2026-05-20 (mid §18) | 5th real run attempt |
| B5 — Doctor openai_api_key stale | 2026-05-20 (mid §20) | 6th real run attempt |
| B6 — crash-recovery timeout (misdiagnosis of B8) | 2026-05-20 (mid §21) | 6th real run attempt |
| B7 — PasswordVault WinRT unavailable | 2026-05-21 (mid §24) | pm2 pivot decision point |
| B8 — orphan node process holding port 3100 (root cause) | 2026-05-21 — NSSM eliminated | pm2 installer begins |
| B9 — batch nested if-errorlevel | 2026-05-21 — INSTALL_FORGE.bat rewrite | Final form |

### B8 — The Root Cause Revelation

During the B7 investigation, structural analysis revealed that NSSM's process-tree management does not reliably deliver SIGTERM/SIGKILL to all child processes spawned by `start-api.js`. Orphan processes linger and hold port 3100. The next NSSM service start fails with `EADDRINUSE`. B6's timeout fix was a misdiagnosis of this bug. B8 is not fixable at the application level without significant NSSM configuration work.

This revelation terminated the NSSM approach after 8 bugs across 5+ attempts. See `DECISION-2026-05-21-pm2-two-file-setup-supersedes-nssm.md §2` for the full B1–B8 root-cause analysis.

### B9 — Batch Control Flow

`INSTALL_FORGE.bat` was rewritten after B9 was identified during code review (no field install attempt needed — pure static analysis).

**Root cause:** In Windows CMD, `if errorlevel 1 ( ... inner-command ... if errorlevel 1 goto :err )` evaluates the inner `if errorlevel` at parse time of the outer block, not after the inner command runs. Silent false-pass results. Fix: flat `if errorlevel 1 goto :label` pattern throughout, `setlocal enabledelayedexpansion`, all error labels consolidated after `goto :success`. Verified: 9 flat gotos + 1 single-line WARNING + 1 flat startup-folder check, no nested errorlevel blocks.

---

## §2 — pm2 Migration

**Authority:** DECISION-2026-05-21-pm2-two-file-setup-supersedes-nssm.md

Four files replaced the entire NSSM installer stack:

| File | Role |
|---|---|
| `INSTALL_FORGE.bat` | One-time self-bootstrapping installer (10 steps, B9-clean) |
| `RUN_FORGE.bat` | Lightweight manual start |
| `STOP_FORGE.bat` | Clean stop |
| `ecosystem.config.js` | pm2 config: forge, start-api.js, autorestart, FORGE_API_PORT=3100 |

**Install target:** `D:\ForgeAI` if D: drive present, else `C:\ForgeAI`.
**Auto-start:** `forge-resurrect.bat` copied to `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\`.
**B8 guard:** `netstat`/`taskkill` orphan-port kill loop before every `pm2 start`.

NSSM installer files (`bin/forge-install.js`, `scripts/install/*.js`) deprecated with headers (retained for audit trail — do not run).

---

## §3 — GETTING_STARTED.md Replaced

The original `GETTING_STARTED.md` (describing the NSSM `node bin/forge-install.js` workflow) was replaced with the pm2 two-file workflow. Arabic + English. Raw download URL for `INSTALL_FORGE.bat` included. Install target table (D:/E: presence), daily use table (RUN/STOP/auto-start), uninstall section (`pm2 stop forge`, `pm2 delete forge`, dir deletion, Startup folder cleanup).

---

## §4 — .gitignore Cleanup

§17 Runtime Artifacts block added to `.gitignore`. ~1506 runtime files untracked from git index (commit 68124a6). Patterns: `artifacts/health/` (89 doctor snapshots), `artifacts/self-test/`, `artifacts/env/`, `artifacts/projects/*/orchestration/`, `artifacts/projects/*/forge_tests/last_report.json`, `artifacts/projects/*/forge_tests/loopback_signal.json`, `artifacts/projects/*/intake_state.json` (9 files), `artifacts/projects/project_registry.json`, `artifacts/projects/*/kb/exports/`, `artifacts/stage_*/evidence/`, `progress/uid_pin.json`, `web/.forge-session`, `.pm2/`.

Security check: no source deliverables (`code/`, `docs/`, `artifacts/decisions/`, `progress/status.json`, root `.bat` files) were removed from tracking. `_reference_todo_api/` source files (README, routes/, server.js, db.js, forge_tests/scenarios/) remain tracked; only orchestration logs and runtime exports were untracked.

---

## §5 — Real-World Install Test

**`INSTALL_FORGE.bat` — owner's Windows 10 machine — 2026-05-21**

| Step | Result |
|---|---|
| git clone → `D:\ForgeAI` | ✓ OK |
| npm install | ✓ OK |
| pm2 start: forge ONLINE | ✓ 0 restarts |
| Desktop shortcuts (RUN_FORGE, STOP_FORGE) | ✓ Created |
| `forge-resurrect.bat` → Windows Startup folder | ✓ Confirmed |
| Browser → `http://127.0.0.1:3100` | ✓ Confirmed |

**First successful end-to-end install in the history of PHASE-12.**
The NSSM approach never cleared the post-install verification phase (B8 terminated it).

---

## §6 — SU Baseline at Closure

**207 pass / 0 fail / 5 skip (212 total)**

| Scenario | Status | Context |
|---|---|---|
| S208 — phase12 full regression | PASS | preserved from Phase A |
| S209 — doctor phase12 checks | PASS | preserved from Phase A |
| S210 — uid_pin service account equivalence | PASS | new — B3 |
| S211 — nssm helper multi-encoding | PASS | new — B4 |
| S212 — openai_api_key keychain consulted | PASS | new — B5 |
| S58, S62, S65, S67, S68 | SKIP | docker not installed — environment-only, pre-existing |
| S120 | FLAKY | Pre-existing concurrency issue in `builtproject.run_scenarios` (HTTP server spawn race on port/temp-dir); PASS in all single-process authoritative runs across B1–B9; NOT a Stage 12.7 regression |

---

## §7 — §ARC Count

**6 — unchanged throughout all of PHASE-12.**

§ARC-1 through §ARC-6 intact. No new §ARC-7. `.bat` files and `ecosystem.config.js` are not Node.js runtime code. §ARC-3 extension (NSSM install scripts) retained for audit trail only.

---

## §8 — Phase A / B Integrity

All Phase A deliverables (S208, S209, helpers, INSTALL.md, production contract, doctor checks, backup, logging, api server auth, uid_pin) preserved and passing. Phase B deliverables (NSSM installer) deprecated. New pm2 files are `.bat`/`config` — zero §ARC implications.

Code changes from Stage 12.7 that survive in the production runtime:
- `uid_pin_match.js` — B3: `isIdentityMatch()` (Doctor check, read-only)
- `openaiApiKey.js` — B5: consults `secret_provider` first (Doctor check, read-only)
- `windows_credential_manager.js` — B7: cmdkey + CredReadW (§ARC-5 scope)
- `api_server_test_helper.js` — S206: `closeAllConnections()` + `agent: false` (test infra only)

---

## §9 — PHASE-12 CLOSED

All stages closed:

| Stage | Status | Closed at |
|---|---|---|
| 12.0 — platform detection | CLOSED | 2026-05-18T12:30 |
| 12.1 — service lifecycle | CLOSED | 2026-05-18T13:00 |
| 12.2 — secret keychain | CLOSED | 2026-05-18T15:00 |
| 12.3 — backup | CLOSED | 2026-05-19T08:30 |
| 12.4 — logging/metrics | CLOSED | 2026-05-19T09:30 |
| 12.5 — api server auth | CLOSED | 2026-05-19T15:00 |
| 12.6 — install docs | CLOSED | 2026-05-19T17:30 |
| 12.7 — automated installer | CLOSED | 2026-05-21T14:00 |

**PHASE-12 total cost: $0.00** (zero LLM calls across all stages).

**Next:** PHASE-13 (Conversational UX Polish, Track B) — requires a fresh decision artifact and owner approval before beginning. Does NOT open automatically.

---

**END OF STAGE 12.7 FINAL CHECKPOINT**
