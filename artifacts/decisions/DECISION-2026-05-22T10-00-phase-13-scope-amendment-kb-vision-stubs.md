# DECISION-2026-05-22T10-00-phase-13-scope-amendment-kb-vision-stubs

> **Type:** Scope Amendment to an Approved Phase Decision
> **Status:** APPROVED — owner approved in chat 2026-05-22
> **Authored:** 2026-05-22
> **Amends:** DECISION-2026-05-21T16-30-phase-13-conversational-ux-polish.md
> **Authority:** Blueprint Part H (changes to an approved phase scope are
>   recorded via a dedicated decision artifact)
> **Predecessor state:** PHASE-13 Stages 13.1, 13.2, 13.3 — CLOSED

---

## 1. Why this amendment exists

The approved PHASE-13 decision (DECISION-2026-05-21T16-30) lists, in §2
scope item 3 and §5 Stage 13.4, two deliverables stated as full views:
"vision view (read)" and "KB view (read-only, with citation rendering)".

During Stage 13.4 scoping, the CTO verified the backend endpoint
inventory. Finding:

- The backend exposes 29 `/api/*` endpoints. **None** is a Vision read
  endpoint or a KB endpoint.
- `/api/system/doctor` and `/api/system/health` exist — the Doctor view
  has backend support.
- Vision is read from disk (`artifacts/projects/<id>/vision*`), not over
  HTTP. The only Vision endpoint, `/api/governance/vision-compliance`, is
  a write-side compliance gate, not a read API.
- KB (built in PHASE-9) is exposed only as L2 runtime tools (`kb.*`).
  A browser frontend cannot call an L2 tool — it needs an HTTP endpoint.
  No KB HTTP layer exists.

Therefore the Vision view and the KB view, as full read views, cannot be
built in PHASE-13 without adding new backend endpoints — which PHASE-13
§3 explicitly forbids ("Backend unchanged", "No new API endpoints").

This gap should have been caught during initial PHASE-13 scoping. It was
not. This amendment corrects the scope to match verified reality.

## 2. What changes

### 2.1 Stage 13.4 scope — amended

Stage 13.4 ("Vision + KB + Doctor") is amended to:

- **Doctor health indicator — full implementation.** Consumes the
  existing `GET /api/system/doctor` endpoint. A new typed client
  function is added to the frontend API client (the endpoint exists;
  only the client function is new — this is permitted, the frontend is
  not frozen). Polling, 3-colour health indicator.
- **Vision view — route stub.** The `/vision` React route exists and
  renders a clear, labelled placeholder ("coming soon — backend read
  API pending PHASE-15"). No data fetch.
- **KB view — route stub.** The `/kb` React route exists and renders the
  same style of labelled placeholder ("pending PHASE-15"). No data fetch.

The five-route app shell is therefore visually complete; two routes are
honest, labelled placeholders.

### 2.2 PHASE-13 closure gate — amended

The PHASE-13 phase-level closure gate (DECISION-2026-05-21T16-30 §6) item
2 listed five Playwright scenarios including `vision_view` and `kb_view`.
Amended:

- `vision_view` and `kb_view` scenarios are **replaced** by a single
  scenario `route_stubs_present` asserting that the `/vision` and `/kb`
  routes render their labelled placeholder and are reachable.
- The Playwright scenario set for PHASE-13 becomes: `chat_send_receive`,
  `project_lifecycle`, `doctor_indicator`, `route_stubs_present`
  (4 scenarios, not 5).
- All other PHASE-13 closure conditions (bundle < 500 KB, Lighthouse > 90,
  SU baseline, cutover) are unchanged.

### 2.3 New phase — PHASE-15

The deferred work — adding read access for Vision and KB so the frontend
can display them, then building the full Vision and KB views — is moved
to a new phase, **PHASE-15**, added to the roadmap. (Note: PHASE-14 is
already taken — it is the "Legacy Support" phase added 2026-05-10. The
deferred Vision/KB work is unrelated to legacy support, so it takes the
next free number, PHASE-15.)

PHASE-15 is a Track B phase: it requires its own decision artifact and
explicit owner approval before it may begin. It is NOT authorized by this
amendment. This amendment only records that the work exists and names
where it goes.

The technical approach for PHASE-15 — how Vision and KB read access is
exposed, and how the views are built — is defined in PHASE-15's own
decision artifact when that phase is opened. This amendment does not
prescribe it.

## 3. What does NOT change

- The "backend frozen" constraint for PHASE-13 stands — strengthened, in
  fact: this amendment removes the two deliverables that would have
  required touching the backend.
- Stages 13.1, 13.2, 13.3 — closed, unaffected.
- Stage 13.5 (Cutover + Performance + Closure) — unchanged, except it now
  closes a 4-scenario harness, not 5.
- The §ARC ledger stays at 6.
- Cost posture unchanged — mock-only, $0.00.
- PHASE-14 (Legacy Support) — untouched. The deferred Vision/KB work is
  PHASE-15, a separate and distinct phase.

## 4. Impact on Stage 13.4 closure gate

Stage 13.4 is CLOSED when:
1. Doctor health indicator implemented (polling, 3-colour), consuming
   `GET /api/system/doctor`.
2. `/vision` and `/kb` routes render labelled placeholders, reachable.
3. `npm run build` exits 0; bundle gzipped initial chunk < 500 KB.
4. TypeScript strict; zero `any`.
5. Playwright scenarios `doctor_indicator` and `route_stubs_present`
   PASS; `playwright-report/` committed.
6. Backend untouched — backend md5 + Track A greps identical to
   pre-stage; SU baseline 207/0/5 on the owner machine.
7. Closure decision artifact + final checkpoint written.

## 5. Approval

Approved by the owner in chat on 2026-05-22. PHASE-13 §2/§5/§6 are
amended as specified above. Stage 13.4 is authorized to begin under the
amended scope.

Upon approval (completed):
- PROMPT-STAGE-13.4 is authored against this amended scope.
- The roadmap is updated to add PHASE-15 as a one-line entry (PHASE-15
  itself stays unopened, pending its own decision artifact).

---

**END OF AMENDMENT**
