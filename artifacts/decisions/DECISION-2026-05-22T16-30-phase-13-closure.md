# DECISION — PHASE-13 Closure: Conversational UX Polish

> **Status:** CLOSED — all 5 stages complete; 10 closure conditions verified  
> **Date:** 2026-05-22  
> **Phase:** PHASE-13 — Conversational UX Polish (React 18 + Vite 5 + Tailwind + Playwright)  
> **Owner approval:** Pending CTO independent verification.

---

## §1 Phase Summary

PHASE-13 delivered a production-ready React frontend for the Forge Workspace, layered over the frozen Forge runtime (Track A discipline throughout). All 5 stages closed cleanly with zero SU regressions.

### Stage Summary

| Stage | Title | Key Deliverables | Playwright | SU |
|---|---|---|---|---|
| **13.1** | React Scaffold | React 18 + Vite 5 + TS strict + Tailwind + shadcn/ui; 24-endpoint API client; 5-route SPA shell | — | 207/0/5 |
| **13.2** | Chat View | MessageBubble, ChatInput (voice), QuickReplies; streaming render; clarification round-trip; `chat_send_receive` Playwright scenario | 2 pass | 207/0/5 |
| **13.3** | Projects View | CreateProjectDialog, DeleteConfirmDialog, ProjectContextPanel, ActivityStream; delete-protection guard; `project_lifecycle` Playwright scenario | 4 pass | 207/0/5 |
| **13.4** | Doctor + Stubs | DoctorView (5s polling, 3-colour, per-check list); VisionView stub + KBView stub (PHASE-15 deferred); `doctor_indicator` + `route_stubs_present` Playwright scenarios | 10 pass | 207/0/5 |
| **13.5** | Cutover + Final | Legacy `web/index.html` retired; React build promoted to `web/`; `web/server.js` SPA serving; Lighthouse 100/100; accessibility fixes; phase closure | 10 pass | 207/0/5 |

### Scope amendment
Stage 13.4 ran under amended scope (`DECISION-2026-05-22T10-00-phase-13-scope-amendment-kb-vision-stubs.md`): Vision + KB deferred as stubs; Doctor promoted to full implementation; PHASE-15 added to roadmap as a deferred one-line entry.

---

## §2 Final State

### Bundle (production build, gzip)
| Chunk | Size (gzip) |
|---|---|
| vendor (react, react-dom, react-router-dom) | 53.38 KB |
| app JS | 17.14 KB |
| CSS | 3.78 KB |
| index.html | 0.30 KB |
| **Total** | **74.30 KB** |
Budget: 500 KB — headroom 425 KB.

### Lighthouse (Lighthouse 12.8.2, headless Chromium, vite preview port 4173)
| Category | Score | Threshold |
|---|---|---|
| Performance | **100** | > 90 ✅ |
| Accessibility | **100** | > 90 ✅ |
| Best Practices | 96 | — |
| SEO | 82 | — |

Report: `web/apps/forge-workspace/lighthouse-report.json`

### Playwright (10 tests, 4 scenarios)
`10 passed (6.6s)` — `report.json: expected 10, unexpected 0, skipped 0`

Scenarios:
- `chat_send_receive` — send + stream; clarification round-trip
- `project_lifecycle` — create → activate → delete; delete-protection guard
- `doctor_indicator` — green / yellow / red states; check list renders
- `route_stubs_present` — /vision stub + /kb stub with PHASE-15 text

### SU suite
`207 passed, 0 failed, 5 skipped (212 total)` — identical to PHASE-12 baseline. No regressions.

---

## §3 Track A Ledger

The Forge runtime (`code/src/**`, `apiServer.js`) was **frozen throughout PHASE-13**. §ARC ledger remains at **6 entries** (unchanged from PHASE-12 close).

`web/server.js` was modified in Stage 13.5 for serving only: two handlers added (`/assets/*` static + SPA fallback). No logic, provider, tool, or doctor check was touched.

---

## §4 Known Backend Issues — Deferred to PHASE-13.6 (must-fix)

These two issues were observed during PHASE-13 and **must not be fixed here**. They are recorded for PHASE-13.6.

### Issue 1 — forge-test.js exit code unreliable
`bin/forge-test.js` exits 0 even when scenario failures are present. This means CI and scripts that check the exit code cannot reliably detect failures. The summary line is correct, but the process exit code is not. PHASE-13.6 must fix the exit code to reflect actual pass/fail.

### Issue 2 — S184–S189 display "undefined" titles
SU scenarios S184–S189 (added in PHASE-11.6 for intake capacity limits) render as "undefined" in the test runner output instead of their proper scenario names. This is a cosmetic bug in the scenario loader / title resolution but masks which scenarios are running. PHASE-13.6 must fix the title display.

Both issues are operational inconveniences only — no data corruption, no incorrect test outcomes.

---

## §5 Closure Gate — 10 Conditions

| # | Condition | Result |
|---|-----------|--------|
| 1 | All 5 stages CLOSED with decision artifacts | PASS |
| 2 | `npm run build` exits 0; bundle < 500 KB gzip | PASS — 74.30 KB |
| 3 | Lighthouse Performance > 90 | PASS — **100** |
| 4 | Lighthouse Accessibility > 90 | PASS — **100** |
| 5 | TypeScript strict; 0 `any` | PASS |
| 6 | Playwright 10/10 pass; `playwright-report/` committed | PASS |
| 7 | SU 207/0/5 — no regressions | PASS |
| 8 | Backend frozen (code/src/**, apiServer.js) | PASS — Track A clean throughout |
| 9 | §ARC unchanged at 6 | PASS |
| 10 | Known backend issues recorded for PHASE-13.6 | PASS — §4 above |

---

## §6 What Was NOT Done (Deferred)

| Item | Deferred To |
|---|---|
| Vision frontend view (read API) | PHASE-15 |
| KB frontend view (read API) | PHASE-15 |
| forge-test.js exit code fix | PHASE-13.6 |
| S184–S189 undefined titles fix | PHASE-13.6 |

---

## §7 Next

**PHASE-13.6** opens immediately. It is a must-fix backend health phase. It requires its own decision artifact and owner approval before starting.

`progress/status.json`: `phase_13.status = "CLOSED"`, `next_step = "PHASE-13.6"`.
