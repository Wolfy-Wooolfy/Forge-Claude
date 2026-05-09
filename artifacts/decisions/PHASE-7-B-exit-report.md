# PHASE-7-B Exit Report

**date:** 2026-05-09  
**owner:** KhElmasry  
**status:** CLOSED  
**track:** TRACK-B (Shell Hardening — second phase)

---

## Summary

PHASE-7-B hardened the existing shell execution layer (shell.run + shell.run_in_workspace, present since PHASE-2). Three gaps were closed: (1) env secrets leak to subprocess, (2) incomplete hard-deny list, (3) no vision-lock gate for shell tools. One new PROMPT-mode tool was added. Total tools: 24 → 25. Doctor checks: 14 → 15. Scenarios: 35 → 41.

---

## Files Created

| File | Description |
|---|---|
| `code/src/runtime/permission/rules/shell_vision_lock_rule.js` | L3 deny rule — blocks shell commands to project dirs when vision not locked |
| `code/src/runtime/doctor/checks/shellHardening.js` | Doctor check — verifies run_with_prompt, sudo/su in HARD_DENY, rule loadable |
| `code/src/testing/scenarios/S36–S41.json` | 6 new scenarios (≥4 assertions each) |
| `docs/10_runtime/13_SHELL_EXECUTION_CONTRACT.md` | Authoritative spec |
| `artifacts/decisions/PHASE-7-B-exit-report.md` | This file |

---

## Files Modified

| File | Change |
|---|---|
| `code/src/runtime/tools/shell_tools.js` | Added `shell.run_with_prompt` (PROMPT) + `_buildSafeEnv` + `HARD_DENY_PATTERNS` + extended `HARD_DENY_ARGV0` (sudo/su/doas/pkexec) + `shell.run_in_workspace` switched to `_buildSafeEnv` |
| `code/src/runtime/permission/permissionPolicy.js` | Registered `shell_vision_lock_rule` at Step 1.6 |
| `code/src/runtime/doctor/_registry.js` | Added `shellHardening` check |
| `verify/smoke/test_tool_runtime.js` | Updated tool count: 24 → 25 |
| `verify/smoke/test_harness_meta.js` | Updated scenario counts: 35 → 41, IDs S01–S41 |
| `verify/smoke/test_doctor.js` | Updated check count: 14 → 15 |
| `progress/status.json` | Updated to PHASE-7-B-CLOSED |

---

## Test Results

```
ALL PASS — 41 passed, 0 failed, 0 skipped (41 total)
```

S36–S41 each have ≥4 assertions, all PASS.

Test-First discipline observed: S36–S41 written before F1–F4, confirmed RED (5 FAIL), then GREEN after implementation.

---

## Zero Direct Writes Verification

```
fs.writeFileSync: 0 occurrences in shell_vision_lock_rule.js
fs.appendFileSync: 0 occurrences
fs.rmSync: 0 occurrences
```

`shell_vision_lock_rule._checkProjectId()` calls `_engine().readVisionSync(projectId)` — the only permitted sync read per L3 hot-path exception.

---

## Runtime Health

- **Tools registered:** 25 (was 24; shell.run_with_prompt added)
- **Scenarios:** 41 (was 35; S36–S41 added)
- **Doctor checks:** 15 (was 14; shell_hardening added)
- **Providers:** 12 (unchanged)

---

## Acceptance Criteria — All Met

| # | Criterion | Result |
|---|---|---|
| 1 | 41/41 PASS | ✓ |
| 2 | S36–S41 ≥4 assertions each, all PASS | ✓ |
| 3 | Zero direct `fs.*` in shell_vision_lock_rule.js | ✓ |
| 4 | `shell.run_with_prompt` registered (total tools: 25) | ✓ |
| 5 | shell_vision_lock_rule registered in permissionPolicy at Step 1.6 | ✓ |
| 6 | `sudo`, `su`, `doas`, `pkexec` in HARD_DENY_ARGV0 | ✓ |
| 7 | HARD_DENY_PATTERNS covers chmod 777/-R, chown, curl\|bash, wget\|bash | ✓ |
| 8 | `$()` remote-fetch pattern gated to sh/bash argv[0] only | ✓ |
| 9 | Env allowlist applied in shell.run_in_workspace + shell.run_with_prompt | ✓ |
| 10 | shell.run (DANGER_FULL_ACCESS) env allowlist NOT applied (by design) | ✓ |
| 11 | Doctor check `shell_hardening` registered and PASS | ✓ |
| 12 | All 5 smoke suites PASS with explicit exit codes | ✓ |
| 13 | S01–S35 all PASS (backwards compat) | ✓ |
| 14 | Protected layers untouched (apiServer.js, providers/) | ✓ |
| 15 | `docs/10_runtime/13_SHELL_EXECUTION_CONTRACT.md` created | ✓ |

---

## TRACK-B STATUS: PHASE-7-B COMPLETE

Next phase: PHASE-7-C (env capability expansion) — requires new decision artifact and explicit owner approval per §11.3.
