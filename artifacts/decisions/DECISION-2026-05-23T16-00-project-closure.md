# DECISION — Forge v2.0 Project Closure

> **Artifact ID:** DECISION-2026-05-23T16-00-project-closure
> **Type:** Project-level closure
> **Status:** AMENDED (×2) — PHASE-13.7 corrective 2026-05-23; PHASE-16 corrective 2026-05-24 (see §Amendment-2 below)
> **Authored:** 2026-05-23
> **Authority:** Blueprint Part H + FORGE_V2_PHASE_ROADMAP.md

---

## 1. Statement

Forge v2.0 — as defined by `FORGE_V2_BLUEPRINT.md` and
`FORGE_V2_PHASE_ROADMAP.md` — is complete. Every scheduled phase of
the roadmap has been delivered, closed against a deterministic
closure gate, and independently verified.

## 2. Phases delivered (26)

PHASE-0, 0.5, 1, 2, 3, 4, 5, 5.1, 6, 7-A, 7-B, 7-C (1/2/3), 7-E,
7-F (1/2/3), 8, 9, 10, 10-gap-fixes, 11, 11.6, 12, 13, 13.6, 13.7, 15.

`progress/status.json`: `roadmap_summary.remaining = []`,
`overall_progress_percent = 100`.

## 3. Final verified state

- **SU self-test:** 210 passed / 0 failed / 5 skipped on the owner
  machine (215 total scenarios).
- **Doctor:** `node bin/forge-doctor.js` exits 0 (HEALTHY).
- **§ARC ledger:** 6 exceptions — unchanged, no unaudited deviation.
- **L2 Tool Runtime:** 78 registered tools.
- **Agent roles:** all roadmap roles registered (incl. the 12th,
  reverse_vision).
- **Frontend:** React workspace (Vite + TypeScript strict + Tailwind
  + shadcn/ui); legacy single-file UI retired; Lighthouse 100/100;
  bundle ~76 KB gzipped (budget 500 KB).
- **Codebase sweep:** zero stubs, zero TODO/FIXME, zero half-built
  code in production paths.
- **Cost:** $0.00 actual across the entire project — all phases
  executed mock-only.

## 4. PHASE-14 — deferred, conditional, not a gap

PHASE-14 (Legacy Support — industrial migration / refactoring /
modernization of pre-existing legacy codebases) was defined in the
roadmap (2026-05-10) as DEFERRED, to open "only if real legacy
demand surfaces". It is not an incomplete item — it is a conditional
future capability.

The owner confirmed that the capability they need — Forge analyzing,
evaluating, improving, and advising on an existing project — is
already delivered by PHASE-11 (the Understand / Improve / Add
Feature / Bug Fix flows and the reverse_vision role). PHASE-14's
distinct scope (full language migration, architectural rebuild) has
no current demand.

PHASE-14 therefore remains a conditional future option. If real
legacy-migration demand surfaces, it requires its own decision
artifact and explicit owner approval before it may begin. Until
then, the project is considered complete without it.

## 5. Closure

Forge v2.0 is formally CLOSED in a stable, verified state. No phase
is active. No work is pending. Any future work — including PHASE-14
— is new scope requiring a fresh decision artifact and owner
approval.

---

## Amendment — PHASE-13.7 (applied 2026-05-23)

After this artifact was issued, a production defect was discovered:
`http://127.0.0.1:3100/` returned `{"error":"Unauthorized"}` when
Forge was started via pm2. Root cause: the auth gate in `apiServer.js`
blocked the React SPA shell (`GET /`, `/assets/*`, SPA routes), and
`web/server.js` (the static server on port 3000) was never started
by pm2.

PHASE-13.7 was opened as a corrective phase (decision artifact:
`DECISION-2026-05-23T16-30-phase-13-7-auth-gate-fix.md`). The fix:

- Auth gate boundary moved to `/api/*` only — the HTML shell and its
  assets are public by design.
- `apiServer.js` (port 3100) now serves the React SPA shell directly
  via three L2-tool static handlers (Handler A: `GET /` +
  `/index.html`, Handler B: `GET /assets/*`, Handler C: SPA fallback
  for React Router routes).
- `getApiBase()` fallback changed from `'http://localhost:3100'` to
  `''` (relative) — eliminates the hardcoded absolute URL from the
  built bundle.
- Frontend rebuilt: no `localhost:3100` in any built JS asset.
- §ARC ledger unchanged at 6. All file reads via L2 `fs.read_file`.
- Regression guard S216 added and confirmed GREEN.
- Full SU suite: 211 passed / 0 failed / 5 skipped (216 total).

PHASE-13.7 was independently verified by the CTO (S216 confirmed
RED-by-defect on revert, GREEN post-fix; suite 203/8/5 on Linux
reflecting known environment delta — no regression).

**The project is now genuinely complete and usable.** The React
workspace is reachable at `http://127.0.0.1:3100/` after
`pm2 restart forge`.

Closure artifact: `DECISION-2026-05-23T18-30-phase-13-7-closure.md`

---

## §Amendment-2 — 2026-05-24 — PHASE-16 corrective phase opened

**The "complete and usable" declaration above was premature.**

The first real owner-use session (2026-05-24) revealed that Forge is
mechanically correct but not usable for the core purpose: a
non-technical owner cannot use it to build an app. The root cause is
structural: Forge has no free-form conversation mode. Every message
enters the pipeline state machine immediately, causing a question loop
with no exit.

This closure artifact is amended to record that closure was premature
and that **PHASE-16 (UX Closure Gap)** follows as an authorized
corrective phase.

**PHASE-16 authority:** `DECISION-2026-05-24T16-00-phase-16-ux-closure-gap.md`

**PHASE-16 scope:** 6 stages — Conversation Mode (G1 BLOCKER),
Intake UI (G2 BLOCKER), Shared Project State (G10), Doctor Fixes
(G3/G5), UX Polish (G6–G9), Provider Contract v2 Completion (G4).

**Closure gate rule change:** Every PHASE-16 stage closes against a
user *outcome* (owner real-use test with screenshot), not a widget's
existence. This is the central lesson of the premature closure.

**PHASE-13.8** (Frontend Auth + Robust Startup) is concurrently DRAFT
pending the owner's reboot test (Stage 13.8-7). PHASE-16 stages
16.1/16.3/16.5 do not block on PHASE-13.8; stages 16.2/16.4/16.6
require PHASE-13.8 to be fully CLOSED first.

The statement "The project is now genuinely complete and usable" is
retracted and replaced by: **PHASE-16 is the active phase. Project
is usable after PHASE-16.1 closes.**

---

**END OF DECISION**
