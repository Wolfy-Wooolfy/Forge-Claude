# DECISION — Stage 13.4 Closure: Vision + KB Stubs + Doctor View

> **Status:** CLOSED — all 7 closure gate conditions verified  
> **Date:** 2026-05-22  
> **Phase:** PHASE-13 (Conversational UX Polish)  
> **Stage:** 13.4 — Vision + KB stubs + Doctor health indicator  
> **Owner approval:** Pending CTO independent verification.

---

## §1 Stage Summary

Stage 13.4 delivered under the amended scope (DECISION-2026-05-22T10-00):

- **§1.A** — DoctorView full implementation: typed client for `GET /api/system/doctor`, 3-color polling indicator (green/yellow/red), per-check list with status badges and detail text.
- **§1.B** — VisionView stub: `data-testid="vision-stub"`, text "pending PHASE-15".
- **§1.C** — KBView stub: `data-testid="kb-stub"`, text "pending PHASE-15".
- **§1.D** — Playwright scenarios: `doctor_indicator` (4 tests) + `route_stubs_present` (2 tests). All 6 PASS.
- **§1.E** — PHASE-15 one-line roadmap entry added to `architecture/FORGE_V2_PHASE_ROADMAP.md`.
- **§1.F** — Amendment artifact `DECISION-2026-05-22T10-00-phase-13-scope-amendment-kb-vision-stubs.md` committed.

---

## §2 Files Created / Modified

### New files
- `web/apps/forge-workspace/src/api/system.ts` — typed client: `DoctorCheck`, `DoctorReport`, `DoctorResponse`, `getSystemDoctor()`
- `web/apps/forge-workspace/e2e/doctor_indicator.spec.ts` — 4 tests
- `web/apps/forge-workspace/e2e/route_stubs_present.spec.ts` — 2 tests
- `artifacts/decisions/DECISION-2026-05-22T10-00-phase-13-scope-amendment-kb-vision-stubs.md`

### Modified files
- `web/apps/forge-workspace/src/api/index.ts` — added `export * from './system'`
- `web/apps/forge-workspace/src/views/DoctorView.tsx` — full implementation (was stub)
- `web/apps/forge-workspace/src/views/VisionView.tsx` — stub with `data-testid="vision-stub"` + PHASE-15 text
- `web/apps/forge-workspace/src/views/KBView.tsx` — stub with `data-testid="kb-stub"` + PHASE-15 text
- `architecture/FORGE_V2_PHASE_ROADMAP.md` — PHASE-15 one-line entry + dependency graph

---

## §3 Closure Gate — All 7 Conditions

| # | Condition | Result |
|---|-----------|--------|
| 1 | Doctor health indicator (polling, 3-colour) consuming `GET /api/system/doctor` | PASS — DoctorView with 5s polling; green/yellow/red via `data-status`; per-check list with PASS/WARN/FAIL badges |
| 2 | `/vision` and `/kb` routes render labelled placeholders | PASS — `data-testid="vision-stub"` and `data-testid="kb-stub"` with "pending PHASE-15" text |
| 3 | `npm run build` exits 0; bundle < 500 KB gzip | PASS — `✓ built in 4.01s`; **74.57 KB gzip** (delta +0.88 KB from 73.69 KB. Headroom: 425 KB) |
| 4 | TypeScript strict; `grep -rn ": any" src/` → 0 | PASS — 0 matches |
| 5 | Playwright `doctor_indicator` + `route_stubs_present` PASS; `playwright-report/` committed | PASS — `10 passed (7.4s)` (full suite: chat + project_lifecycle + doctor_indicator + route_stubs_present) |
| 6 | Backend untouched; SU baseline 207/0/5 | PASS — `git diff HEAD -- code/src web/server.js web/index.html apiServer.js` → 0 files |
| 7 | Closure decision artifact + final checkpoint | THIS DOCUMENT + `_phase_13_checkpoints/stage_13_4.md` |

---

## §4 Key Technical Decisions

- **3-color logic:** `counts.fail > 0` → red; `counts.warn > 0` → yellow; otherwise green. `data-status` attribute enables deterministic Playwright assertions without relying on CSS classes.
- **Polling:** `setInterval(fetchDoctor, 5000)` with cleanup on unmount (`clearInterval` in useEffect return). Stable `useCallback(fetchDoctor, [])` prevents interval drift.
- **DoctorResponse envelope:** `GET /api/system/doctor` returns `{ ok, results: DoctorReport }`. Typed separately — the outer `ok` is the API-call success flag; `results.ok` is the health verdict.
- **Stub text:** "pending PHASE-15" verbatim in both stubs, matching the amendment wording. Playwright asserts `toContainText('PHASE-15')`.
- **PHASE-15 added:** One-line stub + dependency graph entry in `FORGE_V2_PHASE_ROADMAP.md`. Deferred, requires own decision artifact.

---

## §5 Constraints Confirmed

- Backend (`code/src/**`, `web/server.js`, `web/index.html`, `apiServer.js`) — **UNTOUCHED**
- §ARC ledger — **UNCHANGED at 6**
- No new npm dependencies
- No new backend endpoints — only existing `GET /api/system/doctor` consumed
- No real API keys; $0.00 cost
- No `any` in TypeScript code

---

## §6 Next Stage

Stage 13.5 — Cutover + Performance + Closure (legacy `web/index.html` retired, bundle measured, Lighthouse > 90, 4-scenario harness, phase closure).

