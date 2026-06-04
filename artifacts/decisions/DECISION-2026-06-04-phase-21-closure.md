# DECISION-2026-06-04-phase-21-closure.md

> **Type:** Phase Closure
> **Date:** 2026-06-04
> **Owner:** Khaled (CTO)
> **Status:** CLOSED

---

## §1 Supersedes / Closes

Supersedes and closes: `artifacts/decisions/DECISION-2026-06-03-phase-21-deployment-path-integrity.md`

---

## §2 Outcome

**PHASE-21 CLOSED** — Deployment path integrity.

---

## §3 Deliverables Shipped

| Deliverable | File | Status |
|---|---|---|
| Startup guard | `code/src/startup/forge_root_guard.js` | SHIPPED |
| Doctor install_path check | `code/src/runtime/doctor/checks/install_path.js` | SHIPPED |
| Test helper | `code/src/testing/helpers/install_path_test_helper.js` | SHIPPED |
| Scenario S250 | `code/src/testing/scenarios/S250_startup_guard_markers_present_no_exit.json` | SHIPPED |
| Scenario S251 | `code/src/testing/scenarios/S251_startup_guard_markers_missing_exits_1.json` | SHIPPED |
| Scenario S252 | `code/src/testing/scenarios/S252_doctor_install_path_pass.json` | SHIPPED |
| Scenario S253 | `code/src/testing/scenarios/S253_doctor_install_path_warn_stale_sibling.json` | SHIPPED |
| S209 updated | `code/src/testing/scenarios/S209_*.json` | UPDATED (check_count 34→35) |
| Registry +1 check | `code/src/runtime/doctor/_registry.js` | MODIFIED |
| Startup wiring | `start-api.js` | MODIFIED |

**Guard behavior:**
- Reads 3 canonical markers (`progress/status.json`, `code/src/workspace/apiServer.js`, `ecosystem.config.js`).
- Read-only structural check — `fs.existsSync` only, zero writes.
- Hard-exits (`process.exit(1)`) if any marker is missing.
- WARN (no exit) if stale sibling path (`D:\ForgeAI` or override) exists and differs from cwd.
- Logs `[Forge] Running from: <absolute-path>` at every boot.

---

## §4 §ARC Impact

**ZERO new §ARC entries. Ledger stays at 8.**

- `forge_root_guard.js` follows the existing `code/src/startup/env_loader.js` (`loadDotEnv`) precedent — startup-layer read-only fs, consistent with established pattern. Launcher-exempt from L2 Tool Runtime.
- `install_path.js` follows the established Doctor check pattern (`statusJsonValid.js`, `diskSpace.js`) — read-only diagnostics, no §ARC entry.

---

## §5 Verification Evidence

| Check | Result |
|---|---|
| Suite on owner machine (Windows) | **246 / 0 / 5 (251 total)** |
| CTO independent run (sandbox) | **238 / 8 / 5** — 8 failures are the documented env-deltas only (S48 npm, S120–S127 native binaries, S137 vector/API); no new breakage |
| Track A (no writeFileSync/unlinkSync/rmSync/new OpenAI) | CLEAN — 0 matches |
| Doctor registry | `listCheckIds().length === 35` verified |

**Env-deltas (documented, non-blocking):** S48, S120, S121, S122, S123, S124, S125, S126, S127, S137.

---

## §6 Gate #10 — Owner Real-World Verification

**Status: PASS**

Owner performed pm2 hygiene (delete + restart from `D:\S\Halo\Tech\Forge-Claude`), launched the system, and verified the architect→UI flow worked end-to-end in the browser. Bilingual output (Arabic/English) confirmed correct.

---

## §7 Known Non-Blocking State (recorded honestly)

On the owner machine, `install_path` currently reports **WARN** because the stale copy `D:\ForgeAI` still exists on disk.

- This is **correct guard behavior, not a defect**.
- Owner will delete `D:\ForgeAI` manually; the check then reports PASS with no code change.
- This is NOT a code finding.

---

## §8 Open Findings

```
findings_open: []
```

All findings from PHASE-21 are resolved or correctly classified as expected behavior.

---

## §9 Closure Gate Checklist

```
[x] node bin/forge-doctor.js → exits 0
[x] node bin/forge-test.js → 246/0/5 (251 total) — all pass or skip, none fail
[x] decision artifact recorded in artifacts/decisions/ with owner approval
[x] progress/status.json.next_step points to PHASE-22
[x] exit report written (this document)
```

---

## §10 Next Phase

**PHASE-22 — Pending Decision**

Proposed scope: wire `spec_writer` into the orchestration loop (same pattern as PHASE-20 architect). Requires new decision artifact + CTO prompt `PROMPT-STAGE-22`.
