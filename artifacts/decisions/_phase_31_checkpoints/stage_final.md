# PHASE-31 STEP-A FINAL — stage_final.md

**Date:** 2026-06-14
**Phase:** PHASE-31 (REVIEWER_CODE_AND_SECURITY bridge — reviewProject)
**Status:** STEP A COMPLETE — full suite run, Track A greps, doctor. **NO closure, NO status.json, NO Gate #10.**

⚠️ **Honest deviation from the expected 294/0/5:** the full suite returned **293 passed / 1
failed / 5 skipped (299 total)**. The single FAIL is **S57** (`pkg.install pip --target`, PHASE-3
package management) — an environmental full-suite-load flake, NOT a PHASE-31 defect. Analysis below.
All 5 PHASE-31 scenarios (S297–S301) PASS inside the full suite. STOP-AND-REPORT for CTO ruling.

---

## 1. Full suite (Start-Process workaround, Windows)

```
FAILURES DETECTED — 293 passed, 1 failed, 5 skipped (299 total)
duration: 1313206ms (≈21.9 min)
exit: process completed (orphaned-wrapper note below)
evidence: artifacts/spikes/gate31_phase31/stepA_suite_stdout.txt
```

- **Total 299** = 294 prior baseline + 5 NEW (S297–S301). ✓ Count delta exactly as planned.
- **5 skipped** = unchanged from baseline (docker-dependent container scenarios, e.g. S58/S62).
- **1 failed = S57** — `pkg.install pip installs package into test workspace --target (Tier 1)`.

**Orphaned-wrapper note (process hygiene, no impact on result):** the first STEP-A launch's
Start-Process *wrapper* was lost at a session boundary, but the inner `node bin/forge-test.js`
(PID 31556) kept running and flushed the full buffered report to the redirect file on exit. The
"293/1/5" summary line is the harness's own final line, not the wrapper's. Verified by reading the
completed file (312 lines, ends with the summary).

### S57 — environmental flake, not a PHASE-31 regression

| Evidence | Result |
|----------|--------|
| S57 in isolation | **✓ PASS** (8.2 s) — `node bin/forge-test.js -s S57` |
| pkg cluster off full-suite load (S48,S52,S54,S55,S56,S57) | **✓ 6/6 PASS** (56.6 s) |
| `pip` availability | present — `C:\Python310\Scripts\pip.exe`, `python C:\Python310\python.exe` |
| S48 (npm twin, same code path) in full suite | **✓ PASS** |
| Subsystem | PHASE-3 package_management — **untouched by PHASE-31** |

Root cause: S57 runs a **real `pip install --target` subprocess**. The full-suite run executed
under heavy machine load (≈21.9 min wall vs the 16-min baseline; long-running pm2 node servers at
high CPU concurrently), and the pip subprocess flaked (timeout/index contention). This is the same
*class* as the project's documented full-suite-load flakes (builtproject server scenarios
S120/S121/S124–S127 in the PHASE-24 backlog; S191 Windows env delta). It is deterministically GREEN
when not under full-suite contention.

### All 5 PHASE-31 scenarios — GREEN inside the full suite

```
✓ S297  reviewProject APPROVE → DOCUMENTATION; review_report persisted
✓ S298  reviewProject REQUEST_CHANGES (reviewer REJECTED+BLOCKER) → loop_back BUILDER, iter+1, audit from_state=REVIEWER_CODE_AND_SECURITY
✓ S299  reviewProject threat axis (reviewer APPROVED + security HIGH) → REQUEST_CHANGES → BUILDER
✓ S300  reviewProject MANIFEST_REQUIRED fail-closed (no role calls, no transition, nothing written)
✓ S301  reviewProject REVIEW_PARSE_FAILED fail-closed (reviewer schema-invalid; distinct from REQUEST_CHANGES)
```

Standalone confirmation: `-s S297…S301` → 5/5 PASS (3.1 s). Adjacent bridges
(S273–S276, S284–S287, S288–S296) → 17/17 PASS, zero regression.

## 2. Track A greps (the two changed runtime files)

Commands + outputs (ripgrep over the two modified runtime files):

```
PATTERN: child_process | fs.\w+Sync | fetch( | new OpenAI(

code/src/ai_os/conversationEngine.js
  48:   try { return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : fallback; }
  751:  const verifyContent = fs.existsSync(absVisionPath) ? fs.readFileSync(absVisionPath, "utf8") : null;
  1419: "assert","buffer","child_process","cluster","console","crypto","dgram",   ← NODE_BUILTINS string literal

code/src/workspace/apiServer.js
  93,143,148,302,626,649–654,859,878,905,956–968,1026–1027,1198–1199,1504,1578–1579,2031–2036  ← fs read helpers
  2176–2186  ← §ARC-8 binary ZIP upload exemption (fs.mkdirSync/fs.writeFileSync — pre-existing, decision-backed)
```

**Verdict:** ZERO new violations. Every hit is PRE-EXISTING and outside the PHASE-31 diff:
- conversationEngine.js: lines 48 (state loader) + 751 (vision verify) + 1419 (NODE_BUILTINS literal
  inside runTests, PHASE-29). The new `reviewProject()` block (~L1612–1910) and the return-block
  export contain NONE of these patterns.
- apiServer.js: all hits are existing read helpers + the §ARC-8 binary-upload exemption. The new
  4-line `/review-project` endpoint contains NONE.
- All 9 new side effects in `reviewProject()` go through `reg.invoke` (`fs.read_file`, `fs.write_file`,
  `orchestration.get_status`/`advance_state`/`loop_back`, `role.invoke`). §ARC=8 unchanged. L2=80
  (no new tools).

## 3. Doctor

```
node bin/forge-doctor.js  →  ✓ HEALTHY — 0 critical, 6 warning   (DOCTOR EXIT: 0)
checks: 35   duration: 25000ms
report: artifacts/health/doctor_2026-06-14T08-37-08-951Z.json
```

All 6 warnings are pre-existing / environmental, none related to PHASE-31:
`providers_registered` (12 legacy v2-migration backlog), `disk_space` (artifacts 606 MB),
`container_runtime` (no docker daemon — expected), `secrets_in_env_var`, `api_auth_token`
(keychain PowerShell here-string quirk on this box), `install_path` (stale D:\ForgeAI — owner
cleanup pending). 0 critical. roles_runtime ✓ 13 roles incl. reviewer + security_auditor;
orchestration_runtime ✓ 6 tools.

## 4. Files changed — the 9 authorized items

| # | File | Change |
|---|------|--------|
| 1 | `code/src/ai_os/conversationEngine.js` | + `reviewProject()` after `runTests()`; + `reviewProject` in return block |
| 2 | `code/src/workspace/apiServer.js` | + 4-line `POST /api/ai-os/project/review-project` mirror block |
| 3 | `code/src/runtime/agents/adapters/mock_responses.json` | + 7 per-role mock entries (S297–S301) |
| 4 | `code/src/testing/helpers/review_project_test_helper.js` | NEW — `_seedLoopAtReview` + 5 runners |
| 5–9 | `code/src/testing/scenarios/S297…S301.json` | NEW (5 files) |

Plus checkpoints/decision (non-code): DECISION-2026-06-11-phase-31-reviewer-bridge.md,
_phase_31_checkpoints/stage_mid.md, this stage_final.md, and gate31_phase31 STEP-A suite evidence.
reviewer_role.js, security_auditor_role.js, iteration_controller.js, orchestration tools, graph:
**byte-identical** (not touched).

## 5. RULING-6 / RULING-7 — one-line confirmations

- **RULING-6 verdict mapping:** `reviewer_approve = (verdict !== "REJECTED") && no BLOCKER`;
  `security_approve = (threat_level ∉ {CRITICAL,HIGH}) && no BLOCKER`; `APPROVE` iff both — computed
  in the bridge from the two native schemas; neither role file modified. ✓ (S297 APPROVE, S298/S299
  REQUEST_CHANGES).
- **RULING-6 fail-closed taxonomy:** `INVALID_ROLE_OUTPUT` → `REVIEW_PARSE_FAILED`; any other
  non-SUCCESS → `ROLE_INVOKE_FAILED`; a valid REJECTED/HIGH-threat is the REQUEST_CHANGES branch, not
  a failure. ✓ (S301 vs S298/S299).
- **RULING-7 inputs:** `build_manifest.json` REQUIRED (absent/corrupt/empty → MANIFEST_REQUIRED, no
  role calls, no write); `spec.json` + `architect_design.json` REQUIRED; code object assembled
  manifest-restricted from on-disk content; unreadable listed file → REVIEW_INPUT_NOT_FOUND;
  reviewer `phase:"B"`, security `phase:"CODE"`. ✓ (S300).
- **Ordering:** `review_report.json` persisted BEFORE any transition; write failure →
  REVIEW_WRITE_FAILED; APPROVE → advance DOCUMENTATION, REQUEST_CHANGES → loop_back BUILDER
  (escalation-aware). ✓.

---

## Open item for CTO ruling

The closure gate requires 0 FAIL. The single FAIL (S57, pip flake) is environmental and GREEN both
in isolation and in the off-load pkg cluster. **Options:** (a) accept S57 as a known full-suite-load
flake (precedent: S120/S121/S124–S127, S191) and proceed to STEP B; or (b) request a clean full-suite
re-run for the record before STEP B. I did NOT silently re-run to manufacture a clean number.

**WAITING FOR CTO.** (No closure text, no status.json edit, no Gate #10 until CTO verify.)
