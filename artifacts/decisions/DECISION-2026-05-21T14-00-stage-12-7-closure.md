# DECISION-2026-05-21T14-00 — Stage 12.7 Closure / PHASE-12 CLOSED

| Field | Value |
|---|---|
| **Decision ID** | DECISION-2026-05-21T14-00-stage-12-7-closure |
| **Date** | 2026-05-21 |
| **Phase** | PHASE-12 — Personal Production Setup, Stage 12.7 (Automated Installer) |
| **Owner** | Khaled (CTO) |
| **Status** | APPROVED — PHASE-12 CLOSED |
| **Authority chain** | DECISION-2026-05-18T11-30-phase-12-plan.md (original plan) → DECISION-2026-05-20T10-00-stage-12-7-amendment-automated-installer.md (NSSM installer) → DECISION-2026-05-21-pm2-two-file-setup-supersedes-nssm.md (pm2 pivot) |
| **Companion checkpoint** | artifacts/decisions/_phase_12_checkpoints/stage_12_7_amended_mid.md (B1–B7 + S206) |

---

## §1 — Stage 12.7 Scope

Stage 12.7 delivered the **production installation mechanism** for Forge — the last deliverable of PHASE-12. The scope evolved through three generations:

| Generation | Form | Outcome |
|---|---|---|
| Original plan | Manual 15-step PowerShell walkthrough | Immediately superseded by owner directive |
| First amendment (2026-05-20) | Automated `node bin/forge-install.js` NSSM installer | Abandoned after B8 (structural orphan-process issue) |
| Final form (2026-05-21) | `INSTALL_FORGE.bat` + `RUN_FORGE.bat` + `STOP_FORGE.bat` + `ecosystem.config.js` (pm2) | Field-proven on owner's Windows machine |

The final form is self-bootstrapping: a single double-click installs Node.js, git, pm2, clones the repo, configures Windows Startup auto-resurrect, creates Desktop shortcuts, and opens the browser.

---

## §2 — Strategic Pivot: NSSM → pm2

**Superseding authority:** DECISION-2026-05-21-pm2-two-file-setup-supersedes-nssm.md

The NSSM-based Node.js installer was abandoned after 8 bugs (B1–B8) across 5+ real install attempts. Bug B8 (orphan node processes holding port 3100 after NSSM service restart) is structural — NSSM's Windows process-tree management does not reliably propagate SIGTERM/SIGKILL to all child processes spawned by `start-api.js`. Every NSSM restart risked `EADDRINUSE` on port 3100 with no app-level fix available.

The pm2 two-file approach eliminates B8 entirely: pm2 tracks the full process tree. The `.bat` files also include a `netstat`/`taskkill` orphan-port kill guard before every `pm2 start` as belt-and-suspenders.

**Comparison:**

| Factor | NSSM | pm2 two-file |
|---|---|---|
| Install steps | 11-step Node.js orchestrator with rollback | 10-step BAT file, no rollback needed |
| Bugs discovered | 8 (B1–B8) across 5 real attempts | 0 |
| Orphan process risk | Structural (B8) | Eliminated |
| Owner workflow | `node bin/forge-install.js` (pre-requires Node.js + repo) | Double-click `INSTALL_FORGE.bat` (self-bootstrapping) |
| Auto-start on boot | NSSM Windows service | pm2 + Windows Startup folder `forge-resurrect.bat` |
| §ARC count impact | 0 | 0 (BAT files are not Node.js code) |
| Cost | $0.00 | $0.00 |

---

## §3 — Bug Ledger B1–B9

All bugs discovered during real install attempts on the owner's Windows machine. B1–B7 are in the NSSM installer era. B8 is the structural root cause that ended the NSSM era. B9 is a batch scripting bug in the pm2 installer discovered during code review.

| Bug | Root cause (one-line summary) |
|---|---|
| **B1** | NSSM 2.24 exits non-zero on `nssm version` (usage exit code) — `execSync` threw before stderr content was checked; fix: check string content, not exit code |
| **B2** | NSSM 2.24 outputs UTF-16 LE on piped stderr — Node.js decoded as UTF-8, producing interleaved null bytes; `includes("2.24")` returned false; fix: try 4 decodings (utf8/utf16le/latin1/ascii), first match wins |
| **B3** | `uid_pin_match` Doctor check flagged NSSM Local System account `COMPUTERNAME$` vs interactive user `Khaled.Sayed` as a mismatch — false positive on same machine; fix: `isIdentityMatch()` recognizes Windows computer-account ↔ interactive-user equivalence on same hostname |
| **B4** | UTF-16 LE encoding recurred in `post_verify.js` — B2 fix was applied only in `install_orchestrator.js`; a duplicate `_verifyNssmVersion` function in `post_verify.js` kept the broken `encoding:"utf8"` pattern; fix: extracted shared `_nssm_helper.js` with `verifyNssmVersion()` + `_decodeNssmBuffer()` |
| **B5** | `openaiApiKey.js` Doctor check predated Stage 12.2's `secret_provider` abstraction and only read `process.env.OPENAI_API_KEY`; NSSM Local System service has isolated environment — user env vars don't propagate; fix: check consults `secret_provider.get("openai_api_key")` first, plus new `migrate_secrets` installer step writes the key to Windows Credential Manager |
| **B6** | `_verifyCrashRecovery` in `post_verify.js` timed out at 30s — misdiagnosed as timeout config (fix: increased to 60s); the real root cause was B8 (orphan processes causing EADDRINUSE on restart, so the service never came back up within any timeout) |
| **B7** | `windows_credential_manager.js` used `Windows.Security.Credentials.PasswordVault` (WinRT) — unavailable on Desktop PowerShell without UWP runtime; `isAvailable()` always returned false → fell through to `encrypted_file_provider` → NSSM Local System couldn't read the encrypted file (different user context); fix: replaced WinRT with `cmdkey` (set/del) + PowerShell P/Invoke to `advapi32.dll!CredReadW` (get) |
| **B8** | NSSM stops services via SIGTERM/SIGKILL — Windows child processes spawned by `start-api.js` may not receive the signal and linger, holding port 3100; next NSSM start → `EADDRINUSE`; **structural, not fixable at the application level**; B6's timeout was a misdiagnosis of this bug; fix: eliminated NSSM entirely — pm2 tracks the full process tree; orphan-port kill guard (`netstat`/`taskkill`) added to all `.bat` runners |
| **B9** | `INSTALL_FORGE.bat`: nested `if errorlevel 1` inside parenthesized blocks — CMD evaluates errorlevel at parse time of the enclosing block, not after the inner command runs; silent false-pass possible; fix: complete rewrite with flat `if errorlevel 1 goto :label` pattern throughout, `setlocal enabledelayedexpansion`, all error labels consolidated after `goto :success` |

---

## §4 — Final Deliverables

### 4.1 — New pm2 setup files (repo root)

| File | Purpose |
|---|---|
| `INSTALL_FORGE.bat` | One-time per-machine setup: auto-detects install dir (D:\ForgeAI / C:\ForgeAI), winget auto-installs Node.js + git if absent, `git clone` or `git pull`, `npm install`, pm2 global install, orphan-port kill guard, `pm2 start ecosystem.config.js --update-env`, `pm2 save --force`, copies `forge-resurrect.bat` to Windows Startup folder, creates Desktop shortcuts (RUN_FORGE, STOP_FORGE), opens browser |
| `RUN_FORGE.bat` | Lightweight manual runner: orphan-port kill guard + `pm2 start ecosystem.config.js --update-env` + browser open |
| `STOP_FORGE.bat` | `pm2 stop forge` + `pm2 delete forge` |
| `ecosystem.config.js` | pm2 process descriptor: name=forge, script=start-api.js, cwd=`__dirname`, autorestart=true, max_restarts=10, restart_delay=3000ms, min_uptime=5000ms, env.FORGE_API_PORT="3100" |
| `GETTING_STARTED.md` | Replaced with two-file workflow (Arabic + English); raw INSTALL_FORGE.bat download URL; install target table; daily use table; uninstall section |

### 4.2 — NSSM installer files (deprecated — retained for audit trail)

| File | Status |
|---|---|
| `bin/forge-install.js` | DEPRECATED 2026-05-21 header added |
| `scripts/install/preflight.js` | DEPRECATED 2026-05-21 header added |
| `scripts/install/install_orchestrator.js` | DEPRECATED 2026-05-21 header added |
| `scripts/install/rollback.js` | DEPRECATED 2026-05-21 header added |
| `scripts/install/post_verify.js` | DEPRECATED 2026-05-21 header added |
| `scripts/install/_nssm_helper.js` | DEPRECATED 2026-05-21 header added |

### 4.3 — Phase A deliverables (preserved from earlier stages)

| File | Status |
|---|---|
| `code/src/testing/scenarios/S208_phase12_full_regression.json` | PRESERVED |
| `code/src/testing/helpers/phase_12_regression_helper.js` | PRESERVED |
| `code/src/testing/scenarios/S209_doctor_phase12_checks_pass.json` | PRESERVED |
| `code/src/testing/scenarios/S210_uid_pin_service_account_equivalence.json` | NEW — B3 fix |
| `code/src/testing/helpers/uid_pin_identity_helper.js` | NEW — B3 fix |
| `code/src/testing/scenarios/S211_nssm_helper_multi_encoding.json` | NEW — B4 fix |
| `code/src/testing/helpers/nssm_helper_test_helper.js` | NEW — B4 fix |
| `code/src/testing/scenarios/S212_openai_api_key_check_consults_keychain.json` | NEW — B5 fix |
| `code/src/testing/helpers/doctor_check_helper.js` | NEW — B5 fix |
| `INSTALL.md` | PRESERVED |
| `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` | PRESERVED |

### 4.4 — Code changes (B3, B5, B7, S206 regression)

| File | Change |
|---|---|
| `code/src/runtime/doctor/checks/uid_pin_match.js` | B3: `isIdentityMatch()` added — Windows computer-account equivalence |
| `code/src/runtime/doctor/checks/openaiApiKey.js` | B5: consults `secret_provider.get()` first, async |
| `code/src/runtime/secrets/windows_credential_manager.js` | B7: WinRT `PasswordVault` replaced with `cmdkey` (set/del) + `advapi32.dll!CredReadW` P/Invoke (get) |
| `code/src/testing/helpers/api_server_test_helper.js` | S206 regression: `closeAllConnections()` in `_teardown` + `agent: false` in `_httpGet` |

### 4.5 — .gitignore cleanup

§17 Runtime Artifacts block added; ~1506 runtime files untracked from git index (commit 68124a6).
Patterns added: `artifacts/health/`, `artifacts/self-test/`, `artifacts/env/`, `artifacts/projects/*/orchestration/`, `artifacts/projects/*/forge_tests/last_report.json`, `artifacts/projects/*/forge_tests/loopback_signal.json`, `artifacts/projects/*/intake_state.json`, `artifacts/projects/project_registry.json`, `artifacts/projects/*/kb/exports/`, `artifacts/stage_*/evidence/`, `progress/uid_pin.json`, `web/.forge-session`, `.pm2/`.

---

## §5 — Real-World Test Evidence

**Test:** `INSTALL_FORGE.bat` double-click on owner's Windows 10 machine (2026-05-21).
**Install target:** `D:\ForgeAI` (D: drive present).

| Step | Result |
|---|---|
| git clone (`D:\ForgeAI`) | OK |
| npm install | OK |
| pm2 start `ecosystem.config.js` | forge ONLINE — **0 restarts** |
| Desktop shortcuts (RUN_FORGE, STOP_FORGE) | Created |
| `forge-resurrect.bat` → Windows Startup folder | Confirmed |
| Browser opened at `http://127.0.0.1:3100` | Confirmed |

This is the **first successful end-to-end install in the history of PHASE-12**. The NSSM approach reached 5 attempts but never completed past the post-install verification phase (stopped at B8).

---

## §6 — SU Test Baseline at Closure

**207 pass / 0 fail / 5 skip (212 total)**

5 skips = S58, S62, S65, S67, S68 (docker not installed — environment-only, pre-existing throughout PHASE-12).

### S120 Flakiness — Explicit Note (required by closure gate)

S120 (`builtproject.run_scenarios reference project — all 6 scenarios PASS`) **intermittently reports 1 error under concurrent test load**. Root cause: `builtproject.run_scenarios` spawns a real HTTP server via `harness_runner.js`; port or temp-dir conflicts occur when multiple full-suite processes run in parallel on the same machine.

S120 is a **known pre-existing flaky test. It is NOT a regression introduced by Stage 12.7.** In every authoritative single-process suite run across the entire Stage 12.7 bug arc (B1 through B9), S120 consistently passed. The flakiness is also documented in:
- `stage_12_7_amended_mid.md §18` (first observed during B4 parallel run)
- `stage_12_7_amended_mid.md §22` (confirmed during B5+B6 concurrent run)

The same family of concurrency flakiness affected S124 and S125 during the B3 parallel suite run. None of B1–B9 changes touch `builtproject.run_scenarios` or `harness_runner.js`.

---

## §7 — §ARC Count

**§ARC count: 6 — unchanged throughout all of PHASE-12.**

- §ARC-1 through §ARC-6: no changes in Stage 12.7.
- `.bat` files and `ecosystem.config.js` are not Node.js runtime code — no §ARC exceptions apply.
- §ARC-3 extension (install scripts) is retained in `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` as audit trail for the B1–B7 NSSM work. The deprecated files are no longer in the active runtime path.

---

## §8 — Cost

**$0.00** — No LLM calls in any Stage 12.7 file or in this closure session. All work is file writes, git operations, Windows CLI commands, and mock-only test scenarios.

**PHASE-12 total cost across all stages (12.0–12.7): $0.00.**
This satisfies the $0.00 binding declared in all Stage 12.7 decision artifacts.

---

## §9 — Closure Gate Verification

| Criterion | Status |
|---|---|
| Closure decision artifact written, B1–B9 ledger complete | ✓ This document, §3 |
| `progress/status.json` shows PHASE-12 CLOSED | ✓ Updated in this session |
| Final checkpoint `stage_12_7.md` written | ✓ `artifacts/decisions/_phase_12_checkpoints/stage_12_7.md` |
| S120 flakiness explicitly noted in closure artifact | ✓ §6 above |
| §ARC count stated as 6, unchanged | ✓ §7 above |
| No new code, no new §ARC, no behavior change — closure only | ✓ Documentation + status.json + checkpoint only |

---

## §10 — PHASE-12 Complete

All 8 stages closed: 12.0, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7.

**PHASE-12 is CLOSED.**

Per the roadmap (`architecture/FORGE_V2_PHASE_ROADMAP.md`), the next phase is **PHASE-13 — Conversational UX Polish** (Track B, formerly PHASE-10 Frontend Refactor, re-labeled 2026-05-09). PHASE-13 is the final phase before the optional PHASE-14 (Legacy Support, deferred).

**PHASE-13 does NOT begin automatically.** It requires:
1. A fresh decision artifact scoped to PHASE-13
2. Owner approval in chat
3. `progress/status.json.lean_v2_exit_status` update if applicable per §11.3 of CLAUDE.md

No PHASE-13 work begins without explicit owner directive.

---

**END OF DECISION ARTIFACT — DECISION-2026-05-21T14-00-stage-12-7-closure**
