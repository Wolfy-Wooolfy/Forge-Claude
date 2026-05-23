# DECISION-2026-05-23T10-00-phase-15-vision-kb-frontend-views

> **Type:** Phase Activation Decision — Track B
> **Status:** APPROVED — owner approved in chat 2026-05-23
> **Authored:** 2026-05-23
> **Amendment:** 2026-05-23 — §2 corrected: kb.cite dropped from KB
>   scope; citations out of scope; KB view is sources-only.
>   See §1 below.
> **Authority:** Blueprint Part F + DECISION-2026-05-22T10-00-phase-13-
>   scope-amendment-kb-vision-stubs.md (which deferred this work to
>   PHASE-15)
> **Predecessor:** PHASE-13.6 — Backend Health Fixes — CLOSED

---

## 1. Amendment record (2026-05-23)

During Step 0 of Stage 15.1, the implementation arm identified that
the original §2.IN incorrectly listed `kb.cite` as a tool to "wrap"
in a read layer. `kb.cite` is `required_mode: WORKSPACE_WRITE` — it
**creates** CitationRecords, it does not read them. There is no
`kb.list_citations` L2 tool and no citation-read path exists. The
original §2.IN also specified "citation rendering" for the KB view.

**CTO ruling (2026-05-23):** This is an error in the original
decision artifact — the same class of mistake as the PHASE-13 scoping
gap (naming a tool without checking its mode). Option A is adopted:
Stage 15.1 scope is Vision endpoint + KB sources endpoint ONLY. No
citations endpoint will be built. The KB view in Stage 15.2 displays
sources only. "Citation rendering" is removed from PHASE-15 scope.
Building a new `kb.list_citations` tool (Option B) is scope creep
into a frontend-completion phase and is rejected.

This document supersedes the original §2.IN and §2.OUT on this point.

---

## 2. Why this phase exists

PHASE-13 (Conversational UX Polish) replaced the legacy UI with a
React app. During PHASE-13, Stage 13.4 was scope-amended: the Vision
view and the KB view could not be built because the backend exposed
no read endpoints for either — the React frontend cannot reach them.
Those two views were shipped as labelled route stubs ("coming soon
— pending PHASE-15"), and the deferred work was assigned to this
phase, PHASE-15.

PHASE-15 completes that deferred work: it adds the backend HTTP read
layer for Vision and KB, then builds the full Vision and KB views in
the React app, replacing the stubs.

**A scoping fact, verified before this artifact was written:**
- KB logic already exists — built in PHASE-9 as L2 runtime tools:
  `kb.retrieve`, `kb.list_sources`, `kb.cite`, `kb.validate_citations`.
  There is no KB HTTP endpoint; a browser cannot call an L2 tool.
- Vision read already exists — `visionEngine.js` exposes
  `getCurrentVision(projectId)`. There is no Vision HTTP read
  endpoint.
- Therefore PHASE-15 does NOT build KB or Vision logic from scratch.
  It builds a THIN HTTP read layer over the existing L2 tools and
  vision engine, plus the two React views.

---

## 3. Scope

### IN
- **Backend — thin HTTP read endpoints (Track A compliant):**
  - A Vision read endpoint (`GET /api/vision`) that returns the
    current project's vision for display, wrapping
    `visionEngine.getCurrentVision`.
  - A KB sources read endpoint (`GET /api/kb/sources`) wrapping the
    existing `kb.list_sources` L2 tool, so the frontend can display
    KB sources.
  - These endpoints are READ-ONLY. They expose existing data; they
    do not add KB or Vision write capability.
- **Frontend — the two full views:**
  - Vision view — replaces the stub; renders the current vision
    (read-only).
  - KB view — replaces the stub; renders KB sources (read-only).
- **Typed API client functions** for the new endpoints, added to
  the React app's API client.
- **Playwright scenarios** for the two views, replacing the
  `route_stubs_present` stub scenario.

### OUT
- No KB or Vision *write* capability via HTTP — read-only.
- No change to KB logic (L2 tools) or Vision logic (visionEngine) —
  PHASE-15 wraps them, does not rewrite them.
- No change to the other backend endpoints or the other React views.
- PHASE-14 (Legacy Support) is a separate phase.
- **Citations endpoint** — `kb.cite` is `required_mode: WORKSPACE_WRITE`
  (creates CitationRecords); no `kb.list_citations` read tool exists.
  No citations endpoint will be built in PHASE-15. The KB view
  displays sources only. Citation rendering is out of scope.
  (See §1 above — CTO ruling 2026-05-23.)

---

## 4. Track A discipline — IN FORCE

PHASE-15 modifies backend code (new HTTP endpoints in the apiServer
/ handlers layer). Track A is fully in force:
- New endpoints must use the L2 Tool Runtime to reach KB/Vision —
  no direct `fs.*Sync`, no direct DB access, no bypass of the tool
  layer. They call the existing registered tools.
- The Vision endpoint calls `createVisionEngine({ root }).getCurrentVision`
  — calling the existing engine is the approved wrapping pattern.
- No `fetch()` in the runtime, no `new OpenAI()` outside
  `openAiAdapter.js`, no `child_process` outside §ARC-3.
- The §ARC ledger stays at 6. If an endpoint appears to need a new
  §ARC exception, that is a STOP-AND-REPORT.
- Track A greps are part of every stage's closure verification.
- The frontend (`web/apps/forge-workspace/**`) remains Track A
  exempt — browser code, TypeScript, strict, zero `any`.

---

## 5. Staging

PHASE-15 is delivered in **two stages**:

| Stage | Content |
|---|---|
| 15.1 | Backend — the Vision + KB sources read HTTP endpoints, over the L2 tools / vision engine. Track A compliant. Includes a mid-checkpoint before the KB endpoint. |
| 15.2 | Frontend — the full Vision view and KB view (sources-only), replacing the stubs; typed API client functions; Playwright scenarios. PHASE-15 closure. |

Stage 15.1 is backend, Track A governed. Stage 15.2 is frontend,
Track A exempt. Splitting them keeps each stage's verification
clean — 15.1 verified by backend greps + endpoint tests, 15.2 by
build + Playwright.

---

## 6. Closure gate — deterministic

### Stage 15.1 (backend endpoints)
1. Vision read endpoint and KB sources read endpoint exist and return
   the expected data — proven by SU scenarios S213, S214, S215.
   Paste literal test output.
2. The endpoints route through the existing L2 tools / vision
   engine — no bypass. Verified by reading the handler code.
3. Track A clean — paste the literal backend Track A greps
   (fetch( / fs.*Sync / new OpenAI( / child_process scoped to
   code/src); §ARC ledger still 6.
4. SU baseline: no existing scenario regresses. New baseline = 210/0/5
   (S213 + S214 + S215 added). Paste literal summary line.
5. Stage 15.1 closure decision artifact + checkpoint written.
6. status.json advanced.

### Stage 15.2 (frontend views) + PHASE-15 closure
1. Vision view and KB view (sources-only) fully implemented — stubs
   replaced.
2. `npm run build` exits 0; bundle gzipped initial chunk < 500 KB.
3. TypeScript strict; zero `any`.
4. Playwright scenarios for the Vision and KB views PASS; the
   `route_stubs_present` stub scenario is replaced; fresh
   `playwright-report/` with `report.json` committed.
5. Backend untouched in 15.2; SU baseline 210/0/5 holds.
6. PHASE-15 closure decision artifact + final checkpoint written.
7. `status.json` advanced.

If any condition is unmet, the stage stays OPEN.

---

## 7. Cost

Mock-only. No real API key. Kill-bar $3.00 for the phase. Expected
actual $0.00 — the read endpoints and views touch no LLM call.

---

## 8. Approval

Approved by the owner in chat on 2026-05-23. PHASE-15 is authorized
to begin.

---

**END OF DECISION**
