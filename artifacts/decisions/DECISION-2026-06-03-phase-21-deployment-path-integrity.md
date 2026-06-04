# DECISION-2026-06-03 — PHASE-21: Deployment Path Integrity (deployment_split closure)

> **Status:** DRAFT — awaiting owner approval in chat. NOT binding until Khaled replies "approved".
> **Authored:** 2026-06-03
> **Phase type:** Hardening / cleanup — closes the last open finding.
> **Predecessor:** PHASE-20 CLOSED ✓ (commit 8f3a2a3, Gate #10 owner-confirmed).
> **Authority:** Builds on existing runtime + Doctor layer. Does NOT amend the Blueprint or add §ARC.

---

## 1. Why this phase exists

`deployment_split` is the only open finding after PHASE-20. It was discovered during the PHASE-19 Discovery session: pm2 was running Forge from a **stale copy** (`D:\ForgeAI`, a May-21 PHASE-12 snapshot) instead of the live development repo (`D:\S\Halo\Tech\Forge-Claude`). This caused every Discovery anomaly — the owner's real browser was hitting an old build, so recent work appeared "not to work" with no obvious cause.

It was fixed **manually** in PHASE-19 (pm2 delete + restart from the correct cwd), but nothing prevents it from recurring. This phase closes it **structurally**.

### Root cause (verified this session)

- `ecosystem.config.js` correctly uses `cwd: __dirname`. The config is not the problem.
- `start-api.js` correctly resolves `.env` from `__dirname`.
- `apiServer.js` takes `root = options.root || process.cwd()` — depends on the working directory.
- **There is no guard** that verifies the server is running from the intended location.
- **There is no Doctor check** for "am I running from the right path / does a stale copy exist".

The gap is not a broken config — it is the **absence of detection and prevention**. If pm2 remembers a stale path (from an old `pm2 save`), or someone launches from the wrong folder, Forge starts silently from the wrong place and all work vanishes behind it.

---

## 2. Scope (frozen — hardening only)

### 2.1 Startup guard in start-api.js

At launch, `start-api.js` verifies its own location is the intended Forge root:

- Compute `__dirname` (the real location of the running code).
- Read an expected-root marker. Since hardcoding an absolute path is brittle, the guard instead asserts **structural identity**: the running directory must contain the canonical Forge markers (e.g. `progress/status.json`, `code/src/workspace/apiServer.js`, `architecture/FORGE_V2_BLUEPRINT.md`). This proves "I am a real Forge root" without hardcoding `D:\S\...`.
- Detect the known stale copy: if `D:\ForgeAI` exists AND is not the current `__dirname`, print a prominent warning to the log naming both paths and which one is running.
- The guard logs clearly at startup which absolute path Forge is running from — so the log itself is evidence.

The guard does NOT hard-exit on the stale-copy warning (the owner may have a legitimate reason for a second copy); it makes the situation **loud and visible** rather than silent. Hard-exit only if the structural markers are missing (i.e. launched from a non-Forge directory).

### 2.2 Doctor check: install_path

A new Doctor check `code/src/runtime/doctor/checks/install_path.js`:

- PASS: running from a directory with all canonical markers, and no conflicting stale copy detected.
- WARN: a stale copy (`D:\ForgeAI` or any sibling Forge root) exists alongside the running one — names both.
- FAIL: canonical markers missing (shouldn't happen if the server booted, but defensive).

Registered in the Doctor `_registry.js` (one line). Surfaces in `GET /api/system/doctor` and `node bin/forge-doctor.js` like every other check.

### 2.3 Cleanup + pm2 hygiene

- Confirm `D:\ForgeAI` is deleted (or, if the owner wants to keep it, documented as "must never be pm2-started").
- `pm2 delete forge` + `pm2 start ecosystem.config.js` from the correct repo + `pm2 save` — so the saved process list points at the right cwd permanently.
- Document the canonical startup sequence in a short runbook note.

### 2.4 Fix the stale current_task field (incidental)

PHASE-20 left `progress/status.json.current_task` with stale mid-checkpoint text ("241/0/5, Gate #10 pending") even though `phase_20.status` and `self_test_last_result` correctly say CLOSED/242. One-line correction — fold into this phase's status.json update, no separate cycle.

---

## 3. Out of scope (explicit)

- Any pipeline expansion (spec_writer and beyond). That is the **next** phase after this finding closes.
- Any change to the architect, idea synthesis, or FE.
- Any new agent role, §ARC, or npm dependency.
- Cross-platform service install (systemd/launchd) — that is PHASE-12 territory, already closed.

---

## 4. §ARC impact

**Zero new §ARC.** The startup guard and Doctor check are read-only filesystem inspections through existing patterns. Ledger stays at 8.

> Note: `start-api.js` is a top-level launcher, not a runtime module under `code/src/`. If the structural-marker check needs `fs.existsSync` at the very top of boot (before the registry is up), that is a launcher-level read consistent with how `start-api.js` already calls `loadDotEnv` directly. Claude Code must confirm in §0 whether this counts against Track A or is launcher-exempt like the existing `loadDotEnv` call — and STOP if a new §ARC would be required.

---

## 5. Acceptance gates (deterministic — phase stays OPEN if any fails)

| # | Gate |
|---|---|
| 1 | Startup guard logs the absolute running path at boot — verified by scenario or log inspection. |
| 2 | Startup guard detects a simulated stale copy and warns (naming both paths) — verified by scenario with a fixture. |
| 3 | Startup guard hard-exits when launched from a directory missing canonical markers — verified by scenario. |
| 4 | Doctor check `install_path` registered and returns PASS on a healthy boot — verified by scenario. |
| 5 | Doctor check returns WARN when a stale sibling root is present — verified by scenario with fixture. |
| 6 | `current_task` field corrected to reflect CLOSED state. |
| 7 | Full suite on Windows: 242 + N / 0 / 5, N = new scenarios (expect ~3-4). |
| 8 | §ARC count: 8 (unchanged). |
| 9 | TypeScript build clean (no FE change expected, but confirm). |
| 10 | **Gate #10 (owner verification):** owner reboots / restarts pm2, runs `node bin/forge-doctor.js`, sees `install_path: PASS` and the correct absolute path; then opens the browser and confirms a fresh project still works end-to-end (proving the running copy is the live one). |

---

## 6. Cost budget

- Mock-first for all scenarios. No LLM calls needed for this phase (pure runtime/filesystem).
- Gate #10 may do one real end-to-end to confirm the live copy — reuse PHASE-20's flow (~$0.02).
- Kill bar: $3.00.

---

## 7. Estimated effort

- **1 session.** This is focused hardening: one guard, one Doctor check, cleanup, 3-4 scenarios.

---

## 8. After this phase

With `deployment_split` closed, **all open findings are resolved.** The project is then clean, and the natural next step is **pipeline expansion** — wiring `spec_writer` (the state after `architect`) into the flow, the same way PHASE-20 wired the architect. That becomes PHASE-22, decided separately.

---

## 9. Approval

- [x] Owner replied "approved" in chat (2026-06-03)
- [ ] This artifact committed to `artifacts/decisions/`
- [ ] `status.json.next_phase` updated to `PHASE-21-ACTIVE`

Until all three: DRAFT, no authority.
