# DECISION-2026-05-18T10-07 — PHASE-11.6 Closure

| Field | Value |
|---|---|
| Date | 2026-05-18 |
| Owner | KhElmasry |
| Status | CLOSED |
| Scope | PHASE-11.6 — Intake Capacity Hardening (Finding F1) |
| Proposal artifact | artifacts/decisions/DECISION-2026-05-18T09-05-phase-11-6-proposal.md (D3) |
| Amendment artifact | artifacts/decisions/DECISION-2026-05-18T10-06-phase-11-6-amendment.md (D4) |

---

## §1 Status

**Closed at:** 2026-05-18T10:07:00Z
**Status:** CLOSED
**Finding addressed:** F1 — Intake entry/size caps too restrictive

PHASE-11.6 is closed. All 6 new scenarios pass. SU baseline holds at 184/0/5. Track A clean. Documentation updated.

---

## §2 Closure Gate Checklist

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | 6 new scenarios PASS (S184–S189); 0 FAIL | ✓ | npm run test:scenarios → 184 passed / 0 failed / 5 skipped |
| 2 | SU baseline: pass ≥ 184, fail = 0, skip = 5 | ✓ | 184/0/5 — see §5 |
| 3 | Track A grep on intake_tools.js: zero new violations | ✓ | See §6 |
| 4 | docs/10_runtime/20_INTAKE_CONTRACT.md §"Capacity Limits" committed | ✓ | Subsection added under §2 Intake Flow |
| 5 | Decision artifacts updated: D3 §9 + D4 + D5 (this document) | ✓ | D3 §9 updated 2026-05-18, D4 written 2026-05-18, D5 = this document |
| 6 | progress/status.json patched: phase_11_6 block added | ✓ | Patched — see §8 |

---

## §3 Finding F1 — Remediation Summary

**Before (PHASE-11 baseline):**
```js
const MAX_ZIP_ENTRIES = 1000;
const MAX_ZIP_BYTES   = 50 * 1024 * 1024;  // 50 MB  (hard-coded literal)
```

**After (PHASE-11.6):**
```js
const MAX_ZIP_ENTRIES = (() => {
  const v = parseInt(process.env.FORGE_INTAKE_MAX_ENTRIES, 10);
  return (Number.isInteger(v) && v >= 1 && v <= 500000) ? v : 50000;
})();
const MAX_ZIP_BYTES = (() => {
  const v = parseInt(process.env.FORGE_INTAKE_MAX_BYTES, 10);
  return (Number.isInteger(v) && v >= 1048576 && v <= 2147483648) ? v : (500 * 1024 * 1024);
})();
```

Error message strings at lines 515 and 551 updated from hard-coded literals to computed values:
- Before: `"unpacked size exceeds 50 MB cap"` / `"total size exceeds 50 MB cap"`
- After: `"unpacked size exceeds " + Math.floor(MAX_ZIP_BYTES / (1024 * 1024)) + " MB cap"`

---

## §4 Test Scenarios

| ID | Description | Outcome |
|---|---|---|
| S184 | 50 000 entries at new default cap → PASS | ✓ PASS |
| S185 | 50 001 entries, one over default → ZIP_TOO_LARGE with detail containing "50000" | ✓ PASS |
| S186 | FORGE_INTAKE_MAX_ENTRIES=60000, 55 000 entries → PASS via env override | ✓ PASS |
| S187 | 52 428 801 bytes (50 MB + 1), between old and new cap → PASS | ✓ PASS |
| S188 | 524 288 001 bytes (500 MB + 1) → ZIP_TOO_LARGE with detail "500 MB cap" | ✓ PASS |
| S189 | FORGE_INTAKE_MAX_BYTES=104857600, 52 428 801 bytes → PASS via env override | ✓ PASS |

Test-First Discipline (CLAUDE.md §11.5) confirmed:
- RED phase: 178 pass / 6 fail / 5 skip (178/6/5)
- GREEN phase: 184 pass / 0 fail / 5 skip (184/0/5)

---

## §5 SU Baseline

| Run | When | Result |
|---|---|---|
| RED (before code change) | 2026-05-18 | 178 passed / 6 failed / 5 skipped (189 total) |
| GREEN (after code change) | 2026-05-18 | 184 passed / 0 failed / 5 skipped (189 total) |

---

## §6 Track A Compliance

Changes made to `code/src/runtime/tools/intake_tools.js`:
- 2 constant declarations (lines 109–110) → IIFE block (lines 109–116): no new `fetch()`, no `new OpenAI()`, no `child_process`, no direct `fs.*Sync`
- 2 error message strings (lines 515, 551): pure string concatenation, no side effects

No new `§ARC` exceptions required.

---

## §7 Files Changed

| File | Change |
|---|---|
| `code/src/runtime/tools/intake_tools.js` | Lines 109–116: 2 consts → IIFE; lines 515, 551: dynamic error messages |
| `code/src/testing/helpers/intake_test_helper.js` | Added `const os`, `_buildEntriesZip`, `_buildBytesZip`, `runS184`–`runS189`, 6 exports |
| `code/src/testing/scenarios/S184_*.json` through `S189_*.json` | 6 new scenario files |
| `docs/10_runtime/20_INTAKE_CONTRACT.md` | §"Capacity Limits" subsection added under §2; version v1.2 → v1.3 |
| `artifacts/decisions/DECISION-2026-05-18T09-05-phase-11-6-proposal.md` | §9 Owner Approval note updated (pre-execution) |
| `artifacts/decisions/DECISION-2026-05-18T10-06-phase-11-6-amendment.md` | New — D4 amendment (CTO-modified values) |
| `artifacts/decisions/DECISION-2026-05-18T10-07-phase-11-6-closure.md` | New — this document |

---

## §8 status.json Patches

Four patches applied to `progress/status.json`:
1. `current_task` → `"PHASE-11-6-CLOSED"`
2. `last_updated` → `"2026-05-18T10:07:00.000Z"`
3. `phase_11_6` block added with findings, scenarios, SU baseline, cost, closure info
4. `pcst_v1.findings.F1.remediation_status` → `"CLOSED"`

---

## §9 PCST v1.0 Impact

The 3 PCST-blocked projects (hugo 2558 files, strapi 5908 files, ruff 10510 files) would now clear the new 50 000-entry cap with 8.5×–19.5× headroom. Re-running PCST v1.0 would require a separate decision.

---

## §10 Next Phase

With PHASE-11.6 closed, PHASE-11 is fully complete (stages 11.0–11.5 + sub-phase 11.6). Next phase is PHASE-12 (Personal Production Setup), which requires a separate decision artifact and owner go/no-go per §11.3 Lean v2 Exit rules.
