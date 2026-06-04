# PROMPT-STAGE-21 — Deployment Path Integrity (deployment_split closure)

**Phase:** PHASE-21 (Hardening — closes the last open finding)
**Estimated effort:** 1 session
**Cost target:** mock-first; no LLM calls needed (pure runtime/filesystem). Gate #10 may reuse PHASE-20 flow (~$0.02).
**Kill bar:** $3.00
**Authority:** `artifacts/decisions/DECISION-2026-06-03-phase-21-deployment-path-integrity.md` (owner-approved 2026-06-03)
**Predecessor:** PHASE-20 CLOSED ✓ (commit 8f3a2a3)

> This is new work (a new finding, new scope). Do §0 fresh before any code.

---

## The finding

`deployment_split`: pm2 was running Forge from a **stale copy** (`D:\ForgeAI`, a May-21 snapshot) instead of the live repo (`D:\S\Halo\Tech\Forge-Claude`). Discovered in PHASE-19, fixed manually, but nothing prevents recurrence. This phase closes it structurally: a startup guard + a Doctor check + pm2 hygiene.

**Root cause (CTO-verified):** `ecosystem.config.js` (`cwd: __dirname`) and `start-api.js` are correct. The gap is the **absence of detection/prevention** — if pm2 remembers a stale path or someone launches from the wrong folder, Forge starts silently from the wrong place and all work vanishes behind it.

---

## §0 — Read, then STOP. No code before I confirm.

Read:
1. `architecture/FORGE_V2_BLUEPRINT.md` — L4 Doctor section (how checks are structured).
2. `progress/status.json` — confirm PHASE-20 CLOSED, deployment_split is the open finding.
3. `artifacts/decisions/DECISION-2026-06-03-phase-21-deployment-path-integrity.md` — this phase's plan.
4. Code:
   - `start-api.js` — the launcher. Note it already calls `loadDotEnv(path.resolve(__dirname))` directly — a launcher-level fs operation.
   - `ecosystem.config.js` — `cwd: __dirname` (already correct).
   - `code/src/workspace/apiServer.js` lines ~50-90 — how `root` is resolved (`options.root || process.cwd()`).
   - `code/src/runtime/doctor/_registry.js` — how checks are registered.
   - One existing check as a template, e.g. `code/src/runtime/doctor/checks/envDotfile.js` or `statusJsonValid.js` — the `() => { id, status, detail }` shape.
   - `code/src/runtime/doctor/checks/` — confirm there is NO existing path/install check.

§0 deliverable — post then STOP:

1. **start-api.js boot sequence** — paste the current top. Where exactly would a structural-marker guard go (before or after loadDotEnv)?

2. **Doctor check shape** — paste one existing check in full. Confirm the exact signature, how `detail` is formatted, and the one-line registration pattern in `_registry.js`.

3. **§ARC question (CRITICAL):** the startup guard needs to check for the existence of marker files (e.g. `progress/status.json`) at the very top of boot, before the tool registry exists. `start-api.js` already does a direct `loadDotEnv` (which reads the filesystem) at launcher level. **Confirm:** is a direct `fs.existsSync` in `start-api.js` consistent with the existing launcher-level exception, or would it require a new §ARC? If it would require a new §ARC — STOP and flag it; do NOT add one without a decision artifact.

4. **Canonical markers** — propose the set of files that prove "this is a real Forge root" (candidates: `progress/status.json`, `code/src/workspace/apiServer.js`, `architecture/FORGE_V2_BLUEPRINT.md`, `ecosystem.config.js`). Which set is both sufficient and stable?

5. **Stale-copy detection** — the finding names `D:\ForgeAI`. How should the check detect "a stale sibling Forge root exists"? Hardcode `D:\ForgeAI`, or generalize (any directory with Forge markers that is NOT __dirname)? Recommend, with reasoning. (Hardcoding the one known path is acceptable for a personal tool; generalizing is more robust but riskier. Your call to propose.)

6. **Doctor check testability** — how will a scenario simulate "a stale copy exists" deterministically? (e.g. create a fixture directory with markers, point the check at a configurable base, assert WARN.) The check must be testable without actually creating `D:\ForgeAI`.

7. Open questions before code.

mock-first. No LLM calls in this phase. Kill bar $3.00.

STOP after §0. I verify before any code.

---

## §1 — Deliverables (after §0 confirmed)

1. **Startup guard** in `start-api.js`: assert canonical markers present (hard-exit with a clear message if missing — launched from a non-Forge dir); detect + warn (loud, named) if a stale sibling copy exists; log the absolute running path at boot.

2. **Doctor check** `code/src/runtime/doctor/checks/install_path.js`: PASS (correct root, no conflict) / WARN (stale sibling present, names both) / FAIL (markers missing). Registered in `_registry.js`. Must be testable via a configurable base path (so a scenario uses a fixture, not the real `D:\ForgeAI`).

3. **Scenarios (test-first RED→GREEN):**
   - `install_path` Doctor check PASS on healthy root.
   - `install_path` Doctor check WARN when a fixture stale-sibling exists.
   - startup guard: structural markers present → boot proceeds; markers absent → hard-exit (test via the guard function in isolation, not by actually killing a process).
   (3-4 scenarios. Number them as the next free S-numbers after S249, i.e. S250+.)

4. **Fix stale current_task** in `progress/status.json` (one-line: reflect PHASE-20 CLOSED state).

5. **pm2 hygiene** (manual, documented in the mid-checkpoint): `pm2 delete forge` → `pm2 start ecosystem.config.js` from the correct repo → `pm2 save`. Confirm `D:\ForgeAI` is deleted or documented as never-to-be-started.

---

## §2 MID-CHECKPOINT (binding)

After §1 — before Gate #10 — write `artifacts/decisions/_phase_21_checkpoints/stage_21_mid.md`:
- Each deliverable: files changed + verification.
- The §ARC determination from §0 (launcher-exempt vs needs decision).
- The canonical-marker set used + stale-detection approach.
- Track A grep (no new violations).
- Suite count: 242 + N / 0 / 5 on Windows.
- New scenarios listed.
- pm2 hygiene confirmation (delete + start + save from correct cwd).

**STOP after mid-checkpoint. CTO verifies before Gate #10.**

---

## §3 Gate #10 — Owner verification (closure gate)

Owner will:
1. Reboot (or `pm2 kill` + `pm2 resurrect`) — simulate a fresh machine start.
2. Run `node bin/forge-doctor.js` — confirm `install_path: PASS` and the correct absolute path printed.
3. Open the browser, create a fresh project, confirm it still works end-to-end (the running copy is the live one).

If `install_path` shows the wrong path or the stale copy is silently running — stay open, fix.

---

## §4 Track A Rules (NON-NEGOTIABLE)

- The startup guard is launcher-level. If it needs `fs.existsSync` in `start-api.js`, treat it like the existing `loadDotEnv` launcher exception — but CONFIRM in §0 it does not require a new §ARC. If it would — STOP, decision artifact first.
- The Doctor check runs inside the runtime: it must read the filesystem through the same pattern existing checks use (e.g. `statusJsonValid.js`), NOT a new raw `fs.*Sync` outside the established path.
- NO `new OpenAI()`, raw `fetch()`, `child_process` in new code.
- §ARC ledger stays at 8.
- NO new agent role, NO new npm dependency.

---

## §5 STOP-AND-REPORT triggers

- The startup guard would require a new §ARC (raw fs in a context not already exempt) — STOP, decision artifact first.
- Existing Doctor checks use a filesystem-access pattern that doesn't cleanly extend to "check a sibling directory" — STOP, discuss.
- The canonical-marker set is ambiguous (some markers missing in a legitimately healthy root) — STOP.
- pm2 cannot be cleanly re-pointed (saved list corruption) — STOP, report.

---

## §6 Closure Gates (deterministic — phase stays OPEN if any fails)

| # | Gate |
|---|---|
| 1 | Startup guard logs absolute path + detects stale sibling (scenario). |
| 2 | Startup guard hard-exits on missing markers (scenario). |
| 3 | Doctor `install_path` PASS on healthy root (scenario). |
| 4 | Doctor `install_path` WARN on fixture stale sibling (scenario). |
| 5 | `current_task` corrected. |
| 6 | Full suite on Windows: 242 + N / 0 / 5. |
| 7 | §ARC count: 8. |
| 8 | TypeScript build clean. |
| 9 | **Gate #10 — owner runs forge-doctor after restart, sees install_path PASS + correct path, fresh project works.** |

---

## §7 Closure deliverables (only after Gate #10 PASSES)

1. `artifacts/decisions/DECISION-<closure-date>-phase-21-closure.md`
2. `artifacts/decisions/_phase_21_checkpoints/stage_21_final.md`
3. `progress/status.json`: current_task → PHASE-21-CLOSED; next_phase → PHASE-22-PENDING-DECISION (pipeline expansion: spec_writer); phase_21 block; **findings_open: [] (empty — all findings closed)**; roadmap_summary.completed.push("PHASE-21").
4. git add + commit + push (single clean commit).
5. After push: STOP, report commit hash for CTO closure verification.

---

## §8 Cost Budget

- Mock-first. No LLM calls in this phase.
- Gate #10: optional one real end-to-end (~$0.02) reusing PHASE-20 flow.
- Kill bar: $3.00.
