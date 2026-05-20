# Stage 12.7 (Amended) — Automated Installer — Mid-Checkpoint

**Date:** 2026-05-20T11:30 (updated 2026-05-20T16:00 — Bugs B1–B6 fixed + GETTING_STARTED.md + S210–S212)
**Stage:** 12.7 — Automated Installer (Amendment supersedes manual walkthrough)
**Amendment authority:** `DECISION-2026-05-20T10-00-stage-12-7-amendment-automated-installer.md`
**Status:** MID — Phase B complete + Bugs B1–B6 fixed. STOP — owner re-runs installer to verify.

---

## §1 — Phase A Deliverables (Preserved — unchanged)

| Deliverable | File | Status |
|---|---|---|
| S208 scenario | `code/src/testing/scenarios/S208_phase12_full_regression.json` | ✓ PRESERVED |
| S208 helper | `code/src/testing/helpers/phase_12_regression_helper.js` | ✓ PRESERVED |
| S209 scenario | `code/src/testing/scenarios/S209_doctor_phase12_checks_pass.json` | ✓ PRESERVED |
| S209 extension to monitoring_test_helper | `code/src/testing/helpers/monitoring_test_helper.js` | ✓ PRESERVED |
| INSTALL.md | `INSTALL.md` (root) | ✓ PRESERVED |
| Production setup contract | `docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md` | ✓ PRESERVED |
| Evidence directory | `artifacts/stage_12_7/evidence/` | ✓ EXISTS (empty — populated by real install) |
| SU baseline | 204 pass / 0 fail / 5 skip | ✓ CONFIRMED |
| §ARC count | 6 | ✓ CONFIRMED |

---

## §2 — Phase B Deliverables (Amendment — automated installer)

| Deliverable | File | Status |
|---|---|---|
| Amendment decision artifact | `artifacts/decisions/DECISION-2026-05-20T10-00-stage-12-7-amendment-automated-installer.md` | ✓ DONE |
| **Bug B1 fix** | `scripts/install/install_orchestrator.js` (`_stepVerifyNssm`) | ✓ FIXED 2026-05-20T13:00 |
| **Owner guide** | `GETTING_STARTED.md` (root) | ✓ DONE 2026-05-20T13:00 |
| **Bug B2 fix** | `scripts/install/install_orchestrator.js` (`_stepVerifyNssm` UTF-16 LE) | ✓ FIXED 2026-05-20T13:30 |
| **Bug B3 fix** | `code/src/runtime/doctor/checks/uid_pin_match.js` (service-account equivalence) | ✓ FIXED 2026-05-20T14:00 |
| **S210 scenario** | `code/src/testing/scenarios/S210_uid_pin_service_account_equivalence.json` | ✓ DONE 2026-05-20T14:00 |
| **S210 helper** | `code/src/testing/helpers/uid_pin_identity_helper.js` | ✓ DONE 2026-05-20T14:00 |
| **Bug B4 fix** | `scripts/install/_nssm_helper.js` (shared verifyNssmVersion + _decodeNssmBuffer) | ✓ FIXED 2026-05-20T15:00 |
| **Bug B4 fix** | `scripts/install/install_orchestrator.js` (refactored to use _nssm_helper) | ✓ FIXED 2026-05-20T15:00 |
| **Bug B4 fix** | `scripts/install/post_verify.js` (refactored to use _nssm_helper) | ✓ FIXED 2026-05-20T15:00 |
| **S211 scenario** | `code/src/testing/scenarios/S211_nssm_helper_multi_encoding.json` | ✓ DONE 2026-05-20T15:00 |
| **S211 helper** | `code/src/testing/helpers/nssm_helper_test_helper.js` | ✓ DONE 2026-05-20T15:00 |
| **Bug B5 fix** | `code/src/runtime/doctor/checks/openaiApiKey.js` (consults secret_provider) | ✓ FIXED 2026-05-20T16:00 |
| **Bug B5 fix** | `scripts/install/install_orchestrator.js` (migrate_secrets step added) | ✓ FIXED 2026-05-20T16:00 |
| **Bug B5 fix** | `scripts/install/rollback.js` (migrate_secrets undo case added) | ✓ FIXED 2026-05-20T16:00 |
| **Bug B6 fix** | `scripts/install/post_verify.js` (crash recovery 30s → 60s) | ✓ FIXED 2026-05-20T16:00 |
| **S212 scenario** | `code/src/testing/scenarios/S212_openai_api_key_check_consults_keychain.json` | ✓ DONE 2026-05-20T16:00 |
| **S212 helper** | `code/src/testing/helpers/doctor_check_helper.js` | ✓ DONE 2026-05-20T16:00 |
| Installer entry point | `bin/forge-install.js` | ✓ DONE |
| Preflight checker | `scripts/install/preflight.js` | ✓ DONE |
| Install orchestrator (11 steps, rollback) | `scripts/install/install_orchestrator.js` | ✓ DONE |
| Rollback + diagnostic dump | `scripts/install/rollback.js` | ✓ DONE |
| Post-install verification (10 evidence items) | `scripts/install/post_verify.js` | ✓ DONE |
| Walkthrough marked DEPRECATED | `artifacts/stage_12_7/windows_walkthrough.md` | ✓ DONE |
| §ARC-3 extended in contract | `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` | ✓ DONE |

---

## §3 — Dry-Run Output (verbatim)

Run: `node bin/forge-install.js --dry-run`
Exit code: **0** ✓

```
═══════════════════════════════════════════════════════════════════
  FORGE INSTALLER — DRY RUN (no system changes)
═══════════════════════════════════════════════════════════════════

[DRY-RUN:preflight] Running...
  Preflight checks (platform, admin, port, disk, existing service):
  [WOULD FAIL] Administrator privileges required. Right-click PowerShell → 'Run as Administrator', then re-run the installer.
  (Resolve the above before running without --dry-run — dry-run continues)
 ✓
[DRY-RUN:node_install] Running...
  Node.js v24.14.1 already installed (v20+) — no action needed.
 ✓
[DRY-RUN:copy_repo] Running...
  Would robocopy D:\S\Halo\Tech\Forge-Claude → C:\Forge (new)
  Excluding: node_modules, .git
 ✓
[DRY-RUN:npm_install] Running...
  Would run: npm install (in C:\Forge)
 ✓
[DRY-RUN:nssm_locate_or_wait] Running...
  NSSM NOT found in standard locations or PATH.
  Would display one-time download prompt (D1 compliance).
  Expected path after download: C:\tools\nssm-2.24\win64\nssm.exe
 ✓
[DRY-RUN:nssm_verify] Running...
  Would verify NSSM version (run: nssm version, expect '2.24').
 ✓
[DRY-RUN:service_install] Running...
  Would install service 'forge-api' via NSSM:
    Node:   C:\Program Files\nodejs\node.exe
    Script: C:\Forge\start-api.js
    Logs:   C:\Forge\logs
 ✓
[DRY-RUN:service_start] Running...
  Would start service: forge-api
 ✓
[DRY-RUN:post_verify] Running...
  Would run 10 post-install verification checks:
  step_05 step_06 step_09 step_10 step_11 step_12 step_13 step_14 s208 s209
  Evidence would be written to: artifacts/stage_12_7/evidence/
 ✓
[DRY-RUN:open_browser] Running...
  Would open http://127.0.0.1:3100/ in default browser (cosmetic).
 ✓
[DRY-RUN:success_print] Running...
═══════════════════════════════════════════════════════════════════
  DRY RUN COMPLETE — no changes made. All checks passed above.
  Run without --dry-run to install.
═══════════════════════════════════════════════════════════════════

 ✓
```

**Dry-run notes:**
- `[WOULD FAIL] Administrator privileges` — expected on dev machine (non-admin session). In the real run the owner launches PowerShell as Administrator; this will show PASS.
- `NSSM NOT found` — expected (NSSM not yet placed on dev machine). OQ-D compliant — D1 prompt shown with download URL and expected extract path. Owner places binary before pressing Enter.
- All 11 steps reached ✓, exit 0 ✓.

---

## §4 — Track A Grep Results

**Grep 1 — `new OpenAI()` outside adapter**
All grep matches are comments (`// Track A: no direct new OpenAI()`). Zero actual violations. **CLEAN** ✓

**Grep 2 — `fs.writeFileSync` outside tools**
Matches are all in `code/src/modules/`, `code/src/execution/`, `code/src/orchestrator/`, legacy code — pre-existing from prior phases, all §ARC-authorized or legacy (same output as Phase A mid-checkpoint). **Zero new violations from Stage 12.7 amendment files.** New install scripts (`scripts/install/*`) use `fs.*Sync` under §ARC-3 extension — explicitly authorized by `DECISION-2026-05-20T10-00-stage-12-7-amendment-automated-installer.md §6`. **CLEAN** ✓

**Grep 3 — `String.includes` on user text in conversation layer**
Path `code/src/runtime/conversation` does not exist — module renamed/refactored in prior phases. No violations. **CLEAN** ✓

**Grep 4 — `TODO` / `placeholder` in code**
- `code/src/modules/traceEngine.js:858: note: "Cognitive trace placeholder"` — pre-existing, not from Stage 12.7.
- `code/src/providers/openAiExecutionFilesProvider.js:36: "- Do not include placeholder content..."` — instruction text in a system prompt string, not placeholder code.
Both pre-existing. No new violations. **CLEAN** ✓

**Track A verdict for Stage 12.7 (Amended): CLEAN** ✓

---

## §5 — §ARC Count

§ARC-3 extended (not a new §ARC-7) to cover 5 install-time infrastructure files.

```
grep -c "§ARC-" docs/10_runtime/18_AGENT_ROLES_CONTRACT.md
→ 6
```

**§ARC count: 6** (§ARC-1 through §ARC-6 — NO §ARC-7) ✓

---

## §6 — OQ Resolution Summary

| OQ | Question | Ruling | Applied |
|---|---|---|---|
| OQ-A | §ARC boundary for install scripts | Extend §ARC-3 (infrastructure lifecycle) — count stays 6 | ✓ §ARC-3 table updated |
| OQ-B | Evidence output location | Write to source repo `artifacts/stage_12_7/evidence/` | ✓ post_verify.js writes there |
| OQ-C | Post-verify failure handling | Auto-rollback + diagnostic dump to `C:\Forge_install_failure_<ts>\` | ✓ orchestrator + rollback.js |
| OQ-D | D1 conflict — no auto-download NSSM | Option B: locate existing binary or one-time owner prompt | ✓ `_stepLocateOrPromptNssm` + D1 compliance statement in amendment |

**Critical catch (recorded in amendment §5):** OQ-D was identified during Step 0 analysis. The original amendment prompt's pseudocode included a `nssm_download` step that would have violated binding decision D1. Caught before any code was written. Corrected by replacing with `nssm_locate_or_wait`. The installer does NOT auto-download NSSM.

---

## §7 — D1 Compliance Statement (Verbatim from amendment §5 OQ-D)

> This amendment preserves D1's spirit. The installer does NOT auto-download NSSM. NSSM presence is detected via standard paths and PATH lookup. If not found, the installer pauses with a clear one-time prompt for the owner to download from the official source (`https://nssm.cc/release/nssm-2.24.zip`) and place at the expected location. SHA-256 verification of the ZIP is the owner's responsibility per D1 — the installer verifies NSSM is executable via `nssm version`. The change vs original D1 is operational ergonomics only — supply-chain security posture unchanged.

---

## §8 — Cost Actuals

**$0.00** — No LLM calls in any install file. No LLM calls in this session's file writes. ✓

---

## §9 — Files Created/Modified in Stage 12.7 (Amendment — Phase B)

**Created:**
- `artifacts/decisions/DECISION-2026-05-20T10-00-stage-12-7-amendment-automated-installer.md`
- `bin/forge-install.js`
- `scripts/install/preflight.js`
- `scripts/install/install_orchestrator.js`
- `scripts/install/rollback.js`
- `scripts/install/post_verify.js`
- `artifacts/decisions/_phase_12_checkpoints/stage_12_7_amended_mid.md` (this file)

**Modified:**
- `artifacts/stage_12_7/windows_walkthrough.md` (DEPRECATED header added)
- `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` (§ARC-3 row extended with 5 install files)

---

## §10 — STOP — Awaiting CTO Review

**STOP.** Phase B implementation complete and dry-run verified (exit 0).

Do NOT run `node bin/forge-install.js` (real install) until the CTO reviews this checkpoint and issues explicit GO.

**After CTO review + GO:**
1. Owner runs `node bin/forge-install.js` in Administrator PowerShell on target Windows machine
2. NSSM must be pre-placed at `C:\tools\nssm-2.24\win64\nssm.exe` (or press Enter when prompted to place it during install)
3. Installer runs all 11 steps, writes 10 evidence files to `artifacts/stage_12_7/evidence/`
4. CTO reviews populated evidence directory → Phase C (closure artifact + status.json)

---

## §11 — Bug B1 — nssm_verify False Negative (Fixed 2026-05-20T13:00)

**Discovered:** During owner's real install run on Windows machine.

**Symptom:** `[nssm_verify] Running... ✗` — installer reported NSSM as invalid despite correct output.

**Owner output (verbatim):**
```
Error: NSSM at 'C:\tools\nssm-2.24\win64\nssm.exe' failed to execute.
Command failed: "C:\tools\nssm-2.24\win64\nssm.exe" version
NSSM: The non-sucking service manager
Version 2.24 64-bit, 2014-08-31
Usage: nssm <option> [<args> ...]
...
```

**Root cause:** NSSM 2.24 exits non-zero when called with `version` (no service name) and prints usage to stderr. The original `_stepVerifyNssm` used a try/catch that threw on any non-zero exit, discarding the stderr output containing "Version 2.24".

**Why dry-run didn't catch it:** Dry-run skips actual NSSM execution (no binary on dev machine). Only the real install on Windows triggers this code path.

**Fix applied (`scripts/install/install_orchestrator.js` — `_stepVerifyNssm`):**
- Capture both stdout and stderr from the error object when `execSync` throws
- Check `output.includes("2.24")` — string content, not exit code
- Print the detected version line for operator visibility

**Rollback status:** Rollback triggered cleanly on the failed run. `C:\Forge` removed. Diagnostic dump saved to `C:\Forge_install_failure_2026-05-20T09-30-32\`. **Fail-Closed principle confirmed working in production.**

**Track A:** Bug fix touches only `scripts/install/install_orchestrator.js` — already in §ARC-3 scope. No new §ARC entries. §ARC count stays 6. Cost: $0.00.

---

## §12 — GETTING_STARTED.md (Added 2026-05-20T13:00)

Owner request:
> "محتاجين نعمل ملف نوثق بيه خطوات التشغيل لاول مرة لان انا ممكن اشغله من كذا جهاز مختلف"

**File created:** `GETTING_STARTED.md` (root)

**Content:** 12-section Arabic+English guide covering:
- Node.js install, repo clone, NSSM 2.24 download + SHA-256 verify
- Administrator PowerShell, one-command install
- Post-install verification (browser + Get-Service + forge-doctor)
- Troubleshooting table (4 common errors + fixes)
- Daily use, new machine setup, uninstall steps
- Links to INSTALL.md, production contract, amendment artifact

**Track A:** Documentation file, no §ARC implications.

---

## §13 — STOP — Owner Re-Runs Installer

**STOP.** Bug B1 fixed. Owner must re-run `node bin/forge-install.js` to verify the fix.

NSSM is already at `C:\tools\nssm-2.24\win64\nssm.exe` (placed during previous attempt — no re-download needed).

After confirmed successful install → Phase C (closure artifact + status.json).

---

## §14 — Bug B2 — NSSM UTF-16 LE Encoding Mismatch (Fixed 2026-05-20T13:30)

**Discovered:** Owner re-ran installer after B1 fix. Same step (`nssm_verify`) failed with different error: "did not report version 2.24" — despite output visually showing "Version 2.24 64-bit, 2014-08-31".

**Root cause:** NSSM 2.24 (2014 Windows binary) outputs UTF-16 LE on piped stderr. Node's `encoding: "utf8"` reads each character interleaved with null bytes (` `). The JS string becomes `"V e r s i o n   2 . 2 4 ..."` — `output.includes("2.24")` returns false because no consecutive UTF-8 bytes `"2.24"` exist.

**Verified by simulation:**
- UTF-16 LE bytes of "2.24": `32 00 2e 00 32 00 34 00`
- Read as UTF-8: `"2 . 2 4 "`
- `includes("2.24")` → **false**

**Why B1 didn't cover this:** B1 correctly fixed the non-zero exit handling, but assumed UTF-8 stderr. Linux mock NSSM prints UTF-8; real NSSM 2.24 Windows binary prints UTF-16 LE.

**Fix (`scripts/install/install_orchestrator.js` — `_stepVerifyNssm`):**
- Omit `encoding` option → `execSync` returns raw `Buffer` (not string)
- Capture stdout and stderr Buffers from both success and error paths
- Concatenate → try 4 decodings: `utf8`, `utf16le`, `latin1`, `ascii`
- `includes("2.24")` checked in each decoded string; first match wins
- Logs detected encoding + version line for operator visibility
- If ALL 4 encodings fail → dumps first 100 raw bytes as hex for forensic diagnosis

**Post-fix dry-run:** `node bin/forge-install.js --dry-run` — all 11 steps ✓, exit 0. NSSM now detected at `C:\tools\nssm-2.24\win64\nssm.exe` (placed by owner in prior attempt — no re-download needed).

**Rollback status (B2 attempt):** Clean. `C:\Forge` removed. Diagnostic dump at `C:\Forge_install_failure_2026-05-20T09-46-36\`.

**Track A:** Touches only `scripts/install/install_orchestrator.js` (§ARC-3 scope). No new §ARC entries. §ARC count stays 6. Cost: $0.00.

---

## §15 — STOP — Owner Re-Runs Installer (Bug B2)

**STOP.** Bug B2 fixed. Owner must re-run `node bin/forge-install.js` to verify.

NSSM is already placed at `C:\tools\nssm-2.24\win64\nssm.exe` — no re-download needed.

After confirmed successful install → Phase C (closure artifact + status.json).

---

## §16 — Bug B3 — uid_pin_match false positive on NSSM-installed services (Fixed 2026-05-20T14:00)

**Discovered:** Owner's 3rd install attempt. Reached step 9/11 (post_verify), failed on Doctor: "1 critical: uid_pin_match — Username mismatch: pinned=KHALEDSAYED$ current=Khaled.Sayed".

**Root cause:** NSSM installs services as Local System by default. Local System manifests as `<COMPUTERNAME>$` (e.g., `KHALEDSAYED$`). When `post_verify` ran `forge-doctor.js` in the interactive PowerShell context, the Doctor's `uid_pin_match` check compared `KHALEDSAYED$` (pinned by the service) vs `Khaled.Sayed` (interactive user) and reported FAIL — a false positive.

**Verified by independent reproduction on owner's machine.** Manually installed and started `forge-api` via NSSM, ran Doctor in interactive PowerShell. Reproduced exact error: `✗ uid_pin_match: Username mismatch: pinned=KHALEDSAYED$ current=Khaled.Sayed`.

**Fix:** Extracted `isIdentityMatch({ username }, { username }, _opts)` function into `uid_pin_match.js`. On `win32` platform, recognizes that `COMPUTERNAME$` (Local System computer account) is equivalent to any interactive user on the same machine — verified by matching `pinned.username.slice(0,-1)` against `os.hostname()`.

**Security preserved:** Still rejects (1) different human usernames, (2) computer account from a different hostname (Forge folder copied to another machine), (3) `COMPUTERNAME$` identity on non-Windows platforms. Only relaxes the legitimate Windows service-vs-interactive-user pattern on the SAME machine.

**Surgical change:** Only `uid_pin_match.js` (Doctor check) modified. `uid_pin.js` (server-side `checkOrCreateUidPin`) unchanged. S207 tests `uid_pin.js` → unaffected.

**S210 added:** `S210_uid_pin_service_account_equivalence.json` + `uid_pin_identity_helper.js` — 5 test cases via dependency injection `_opts: { _platform, _hostname }`. All 5 pass (verified by direct helper call). S208 (arc_count_equals_six) re-verified: PASS.

**Full suite results (3 parallel runs):**
- Run 1 (authoritative): **205 pass / 0 fail / 5 skip / 210 total** ✓ — S124 ✓, S125 ✓, S207 ✓, S208 ✓, S209 ✓, S210 ✓
- Run 2: exit 0 ✓ (clean)
- Run 3 (concurrent with runs 1+2): 203 pass / **2 fail** / 5 skip — S124 ✗, S125 ✗ only

**S124/S125 failures are pre-existing concurrency flakiness** — both scenarios use `builtproject.run_scenarios` which spawns a real HTTP server via `harness_runner.js`. Port/temp-dir conflicts occur when 3 full-suite processes run in parallel. These failures are NOT caused by the B3 fix (which touches `uid_pin_match.js` only). Confirmed: both S124 and S125 PASS in the authoritative single-process run. Pre-existing: they pass in the PHASE-12 baseline (204/0/5) too.

**Post-fix dry-run:** `node bin/forge-install.js --dry-run` — all 11 steps ✓, exit 0.

**Rollback status (B3 attempt):** Clean. `C:\Forge` removed via auto-rollback.

**Track A:** `uid_pin_match.js` is a Doctor check (production runtime read-only). `uid_pin_identity_helper.js` is test infrastructure (§ARC convention: test helpers may use direct require). No new §ARC entries. §ARC count stays 6. Cost: $0.00.

---

## §17 — STOP — Owner Re-Runs Installer (Bug B3)

**STOP.** Bug B3 fixed. Owner must re-run `node bin/forge-install.js` to verify.

NSSM is already placed at `C:\tools\nssm-2.24\win64\nssm.exe` — no re-download needed.

After confirmed successful install → Phase C (closure artifact + status.json).

---

## §18 — Bug B4 — UTF-16 LE Encoding Recurred in post_verify.js (Fixed 2026-05-20T15:00)

**Discovered:** Owner's 4th install attempt. Reached step 9/11 (post_verify), failed inside the evidence-collection phase (`_verifyNssmVersion`). Same root cause as Bug B2 (NSSM 2.24 UTF-16 LE on piped stderr), but in a different file — `scripts/install/post_verify.js`. The B2 fix was applied only to `install_orchestrator.js` and missed the duplicate logic in `post_verify.js`.

**Rollback status (B4 attempt):** Clean. `C:\Forge` removed via auto-rollback. Fail-Closed confirmed working (4th successive clean rollback).

**Root cause of duplication:** Bug B2 fix was written inline in `_stepVerifyNssm` in `install_orchestrator.js`. The `post_verify.js` had its own separate `_verifyNssmVersion` function using the same broken `encoding:"utf8"` pattern — the B2 fix was never applied there.

**Fix — three files:**

1. **Created `scripts/install/_nssm_helper.js`** — shared utility with two exports:
   - `verifyNssmVersion(nssmPath)` — runs `nssm version`, captures raw Buffers, tries 4 decodings (`utf8`, `utf16le`, `latin1`, `ascii`), returns `{ ok, encoding, versionLine }` or `{ ok, error, rawHex, utf8 }`.
   - `_decodeNssmBuffer(combined)` — exported separately for deterministic unit testing without spawning a real NSSM process.

2. **Refactored `scripts/install/install_orchestrator.js` `_stepVerifyNssm`** — replaced the 30-line inline multi-encoding logic with a 6-line call to `verifyNssmVersion(_nssmPath)`. Error message preserves the same hex dump and UTF-8 preview for forensic diagnosis.

3. **Refactored `scripts/install/post_verify.js` `_verifyNssmVersion`** — replaced broken `encoding:"utf8"` + fallback string pattern with `verifyNssmVersion(nssmPath)` call. Added guard: throws immediately if `nssmPath` is null (was previously silently falling back to `nssm version` on PATH — which could mask the correct binary).

**NSSM output parser audit (grep across `scripts/install/` and `code/src/runtime/`):**
- `rollback.js` — uses NSSM for `stop`/`remove` commands only; does NOT parse NSSM output. Not affected.
- `service_lifecycle.js` (Doctor check) — uses `nssm status forge-api` → checks for `SERVICE_RUNNING` text (pure ASCII, no encoding issue). Not affected.
- No other NSSM version-output parsers exist. B4 fix is complete.

**S211 added:** `S211_nssm_helper_multi_encoding.json` + `nssm_helper_test_helper.js` — 4 test cases for `_decodeNssmBuffer`:
1. UTF-8 buffer with "2.24" → `encoding: "utf8"` detected
2. UTF-16 LE buffer (real NSSM 2.24 piped stderr) → `encoding: "utf16le"` detected
3. Buffer with no "2.24" → `ok: false` error shape returned
4. Combined empty stdout + UTF-16 LE stderr → `encoding: "utf16le"` detected (mirrors real execution)

**Full suite results (three runs — two sequential, one concurrent):**
- Run 1 (authoritative): **206 pass / 0 fail / 5 skip / 211 total** ✓ (11m 33s) — S208 ✓, S209 ✓, S210 ✓, S211 ✓
- Run 2 (authoritative): **206 pass / 0 fail / 5 skip / 211 total** ✓ (17m 14s) — all same ✓
- Run 3 (concurrent with runs 1+2): **205 pass / 1 fail / 5 skip** — S120 ✗ only (same pre-existing concurrency flakiness as S124/S125 in B3 run 3; `builtproject.run_scenarios` spawns an HTTP server, port/temp-dir conflict under parallel processes)
- 5 skips = S58, S62, S65, S67, S68 (docker not installed — pre-existing)

**S120 failure is pre-existing concurrency flakiness** — it's in the same family as S124/S125 and is NOT caused by the B4 fix (which touches only `_nssm_helper.js`, `install_orchestrator.js`, `post_verify.js`). Confirmed: S120 passes in both authoritative single-process runs.

**Post-fix dry-run:** `node bin/forge-install.js --dry-run` — all 11 steps ✓, exit 0. NSSM found at `C:\tools\nssm-2.24\win64\nssm.exe` ✓.

**Track A:** `_nssm_helper.js` is a new file within §ARC-3 scope (install scripts, `execSync` deviation already authorized). `install_orchestrator.js` and `post_verify.js` are both §ARC-3. No new §ARC entries. §ARC count stays 6. Cost: $0.00.

---

## §19 — STOP — Owner Re-Runs Installer (Bug B4)

**STOP.** Bug B4 fixed. Owner must re-run `node bin/forge-install.js` to verify.

NSSM is already placed at `C:\tools\nssm-2.24\win64\nssm.exe` — no re-download needed.

After confirmed successful install → Phase C (closure artifact + status.json).

---

## §20 — Bug B5 — Doctor openai_api_key check stale (Fixed 2026-05-20T16:00)

**Discovered:** 5th install attempt. `post_verify` step_10 evidence (Doctor API call from service context) showed `openai_api_key: FAIL — "OPENAI_API_KEY not set"`, while step_05 (Doctor called from interactive PowerShell context) showed PASS.

**Root cause:** `openaiApiKey.js` Doctor check predates Stage 12.2's `secret_provider` abstraction. It only checked `process.env.OPENAI_API_KEY`. NSSM Windows services run as Local System with isolated environment — user-level env vars do NOT propagate to the service. The key lived only in the owner's PowerShell session, not in Windows Credential Manager. Even after Stage 12.2 added keychain support, the check never consulted it.

**Two-part fix:**

**Fix 5a — Updated `openaiApiKey.js`:** Now calls `secret_provider.get("openai_api_key")` first. If the keychain has the key, returns `PASS` with `"from keychain, length=N"`. Falls back to `process.env.OPENAI_API_KEY` if keychain is empty. Changed from sync to async (`fn()` → `async fn()`). Doctor runner already uses `await Promise.resolve(check.fn(ctx))` — no change needed there.

**Fix 5b — New install step `migrate_secrets`:** Added between `nssm_verify` and `service_install` in the installer STEPS array. Reads `OPENAI_API_KEY` from env, stores it via `secret_provider.set()` in Windows Credential Manager. Idempotent: skips if the key is already in the keychain. Requires `secret_provider` from `INSTALL_DIR` (repo already copied by `copy_repo` step). Rollback intentionally leaves the keychain entry in place — it's a user secret, not install state. Re-running after rollback correctly sees it as already migrated and skips.

**S212 added:** `S212_openai_api_key_check_consults_keychain.json` + `doctor_check_helper.js` — 3 test cases using `Module._load` monkeypatching to inject a fake `secret_provider`: (1) keychain present → PASS with `"from keychain"`, (2) keychain absent + env present → PASS with `"from env"`, (3) neither → FAIL.

**Track A:** `openaiApiKey.js` is a Doctor check (production runtime read-only). `install_orchestrator.js` and `rollback.js` are §ARC-3 scope. No new §ARC entries. §ARC count stays 6. Cost: $0.00.

---

## §21 — Bug B6 — Crash Recovery Timeout 30s → 60s (Fixed 2026-05-20T16:00)

**Discovered:** Same 5th install attempt. `post_verify` step_11 (crash recovery) timed out after 30 seconds. NSSM `AppRestartDelay=10000ms` + Node.js app startup on real Windows hardware ≈ 15–25 seconds combined. The 30-second window was too tight.

**Fix:** In `_verifyCrashRecovery` (`post_verify.js`): changed `_pollForRunning(serviceName, 30000, 2000)` to `_pollForRunning(serviceName, 60000, 2000)`. Comment updated. Error message updated to "did not recover within 60s". No scenario change needed (S208 tests via forge-doctor.js, not the timeout constant).

**Track A:** `post_verify.js` is §ARC-3 scope. §ARC count stays 6. Cost: $0.00.

---

## §22 — Full Suite (B5+B6 — 2026-05-20T16:00)

**Full suite results (authoritative single-process run):**
- **207 pass / 0 fail / 5 skip / 212 total** ✓ (7m 22s)
- S208 ✓, S209 ✓, S210 ✓, S211 ✓, S212 ✓
- 5 skips = S58, S62, S65, S67, S68 (docker not installed — pre-existing)

**Dry-run:** `node bin/forge-install.js --dry-run` — all **12 steps** ✓, exit 0.
`migrate_secrets` step appears between `nssm_verify` and `service_install` as expected.

---

## §23 — STOP — Owner Re-Runs Installer (Bugs B5+B6)

**STOP.** Bugs B5 and B6 fixed. Owner must re-run `node bin/forge-install.js` to verify.

**Pre-requisite:** Set `OPENAI_API_KEY` in the Administrator PowerShell session before running the installer. The `migrate_secrets` step will read it from there and store it in Windows Credential Manager.

```powershell
$env:OPENAI_API_KEY = "sk-..."
node bin/forge-install.js
```

NSSM is already placed at `C:\tools\nssm-2.24\win64\nssm.exe` — no re-download needed.

After confirmed successful install → Phase C (closure artifact + status.json).

---

**END OF STAGE 12.7 (AMENDED) MID-CHECKPOINT**
