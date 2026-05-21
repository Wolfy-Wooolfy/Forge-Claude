# DECISION-2026-05-21T16-30-phase-13-conversational-ux-polish

> **Type:** Track B Phase Activation Decision
> **Status:** APPROVED — owner approved in chat 2026-05-21
> **Authored:** 2026-05-21
> **Authority chain:** DECISION-20260508-phase-0-closure-and-blueprint-prep.md
>   → DECISION-20260509-vision-shift-track-b.md
>   → DECISION-20260510-vision-shift-multi-agent-conductor.md
> **Blueprint reference:** architecture/FORGE_V2_BLUEPRINT.md Part F (Track B table, row 13)
> **Roadmap reference:** architecture/FORGE_V2_PHASE_ROADMAP.md §"[Track B] PHASE-13 — Conversational UX Polish"
> **Predecessor phase:** PHASE-12 (Personal Production Setup) — CLOSED, commit e41af94

---

## 1. Purpose

This artifact authorizes the start of **PHASE-13 — Conversational UX Polish**,
the final phase on the Track B roadmap. Per Blueprint Part F and project
governance rule 3, every Track B phase requires a fresh decision artifact and
explicit owner approval before any code is written. This decision artifact
satisfies that requirement.

PHASE-13 replaces the legacy single-file `web/index.html` with a modern
React application, adds voice input and
visual feedback, and brings the Forge workspace UI to a production-quality
standard now that the orchestration layer beneath it (L1–L5, Track A + the
Track B capability phases 7-A through 12) is complete.

---

## 2. Scope — IN

| # | Item | Source |
|---|---|---|
| 1 | New React application at `web/apps/forge-workspace/` — Vite + React + TypeScript + Tailwind + shadcn/ui | Roadmap §PHASE-13 "New folder" |
| 2 | Replacement of `web/index.html` as the workspace UI entry point | Roadmap §PHASE-13 Goal |
| 3 | All current UI views ported: chat (send/receive + SSE streaming + clarification flow), project management (create / activate / delete / list + context panel), vision view (read), KB view (read-only, with citation rendering), doctor health indicator | Roadmap §PHASE-13 closure gate |
| 4 | Voice input (browser-native Web Speech API) and visual feedback (activity / agent-progress stream) | Roadmap §PHASE-13 Goal |
| 5 | Playwright scenarios covering 5 flows for the closure gate | Roadmap §PHASE-13 closure gate |
| 6 | Bundle size budget < 500 KB gzipped initial chunk; Lighthouse > 90 on Performance and Accessibility | Roadmap §PHASE-13 closure gate |

---

## 3. Scope — OUT (explicit non-goals)

| # | Item | Reason |
|---|---|---|
| 1 | Any change to the backend — `apiServer.js`, providers, L2 tools, engines, orchestrator | Roadmap §PHASE-13: "Backend unchanged" |
| 2 | New API endpoints | The React app consumes the existing 24 endpoints as-is |
| 3 | Any change to L1 Provider Contract, L2 Tool Runtime, or L3 Permission layers | Track A foundation is closed and frozen |
| 4 | PHASE-14 (Legacy Support) | Deferred — requires its own separate decision artifact |
| 5 | Refactoring `web/server.js` into a Track A-compliant module | See §5 below — explicitly out of scope for PHASE-13 |

---

## 4. Architectural decisions

### 4.1 Frontend is exempt from Track A discipline

The Track A rules (no direct `fetch()`, no `fs.*Sync` outside §ARC modules, no
`new OpenAI()` outside `openAiAdapter.js`, no `child_process` outside §ARC-3)
govern the **Forge runtime** — Node.js process code. They do **not** apply to
browser frontend code.

The React application in `web/apps/forge-workspace/` is browser code. It will
call the backend HTTP API directly via the browser `fetch` / `EventSource`
APIs. This is the correct and only mechanism available to a browser client and
is **explicitly exempt** from Track A, in the same way the Blueprint Part A
clause 5 ("no TypeScript on the backend") exempts the frontend from the
TypeScript prohibition.

**Consequence:** Track A grep checks (the `fetch(` / `fs.*Sync` / `new OpenAI(`
/ `child_process` greps) continue to be scoped to `code/src/**` and the Forge
runtime. They are NOT run against `web/apps/forge-workspace/**`. PHASE-13
closure verification will prove the Forge runtime is untouched (the backend
greps return the identical pre-PHASE-13 result), not that the frontend obeys
Track A.

### 4.2 No new §ARC exceptions

PHASE-13 introduces no new §ARC ledger entries. The ledger remains at 6
exceptions (§ARC-1 through §ARC-6). The React app is browser code outside the
Forge runtime, so the §ARC ledger does not extend to it.

### 4.3 `web/server.js` — Option A (leave in place, out of scope)

`web/server.js` is a legacy static-file server that currently uses
`new OpenAI()` and `fs.*` directly, placing it outside Track A governance.

**Decision:** Option A. `web/server.js` is **left unchanged** in PHASE-13. The
Vite production build outputs to `web/` and `web/server.js` continues to serve
the built static assets. This honors the "backend unchanged" constraint and
keeps PHASE-13 scoped to the UI.

It is **explicitly recorded here** that `web/server.js` is known to be outside
Track A and that consolidating it (folding static-serving into `apiServer.js`,
or rewriting it as a Track A-compliant module) is **out of scope for
PHASE-13**. If consolidation is desired later, it requires its own separate
decision artifact.

### 4.4 Voice input — Web Speech API

Voice input is implemented with the browser-native **Web Speech API**
(`SpeechRecognition`). No external speech-to-text service, no API key, no
network cost. This keeps PHASE-13 consistent with the project's $0.00 cost
actuals. Browsers without Web Speech API support degrade gracefully (the voice
button is hidden / disabled; text input remains fully functional).

### 4.5 shadcn/ui

UI primitives are provided by **shadcn/ui**, which generates component source
into the app rather than installing a runtime npm dependency. This keeps the
production bundle lean (favorable to the < 500 KB gzipped budget) and keeps
component code inspectable in-repo.

### 4.6 TypeScript strict mode

The React app uses TypeScript in `strict` mode. `any` is disallowed (lint
rule). This is the frontend-only TypeScript permitted by Blueprint Part A
clause 5.

---

## 5. Stage breakdown

PHASE-13 is delivered in **5 stages**. Each stage has a mid-checkpoint
(written before its second half) and a deterministic closure gate. No stage
is "partially closed" — closure gate fully met, or the stage stays OPEN.

| Stage | Title | Primary deliverable | Est. |
|---|---|---|---|
| 13.1 | Scaffold + Build Pipeline + API Client Layer | `web/apps/forge-workspace/` scaffolded (Vite+React+TS+Tailwind+shadcn/ui); typed API client wrapping all 24 endpoints; empty app shell + routing | 3–4 d |
| 13.2 | Chat View | Chat panel: send/receive, SSE streaming, clarification flow, voice input, streaming visual feedback | 4–5 d |
| 13.3 | Project Management View | Project list / create / activate / delete; active-project context panel; project activity stream | 2–3 d |
| 13.4 | Vision + KB + Doctor | Vision view (read); KB view read-only with citations; doctor health indicator (polling, 3-color) | 3–4 d |
| 13.5 | Cutover + Performance + Closure | Legacy `web/index.html` retired; bundle < 500 KB gzipped; Lighthouse > 90; all 5 Playwright scenarios in harness; phase closure | 3–4 d |
| | | **Total** | **15–20 d** |

### Stage closure gates (deterministic)

**13.1** — `npm run build` succeeds; bundle baseline measured and recorded;
TypeScript strict, zero `any`; app shell renders; all 24 endpoints have a
typed client function (one decision-line per endpoint mapping); SU baseline
unchanged (backend untouched — grep proof); mid-checkpoint written.

**13.2** — Playwright scenario `chat_send_receive` PASS; SSE streaming renders
incrementally; voice input toggle functional; clarification answer flow works;
mid-checkpoint written.

**13.3** — Playwright scenario `project_lifecycle` (create → activate →
delete) PASS; mid-checkpoint written.

**13.4** — Playwright scenarios `vision_view`, `kb_view`, `doctor_indicator`
all PASS; mid-checkpoint written.

**13.5** — Bundle < 500 KB gzipped (measured); Lighthouse Performance > 90 AND
Accessibility > 90; all 5 Playwright scenarios PASS in the harness; SU baseline
(207 pass / 0 fail / 5 skip) identical to pre-PHASE-13 (grep proof the Forge
runtime was not touched); phase closure artifact written; `status.json`
updated (`next_phase` advanced, `roadmap.remaining` → `[]`); final checkpoint
written.

---

## 6. Closure gate — PHASE-13 (phase-level)

PHASE-13 is CLOSED only when all of the following are true:

1. All 5 stages (13.1–13.5) individually CLOSED.
2. All 5 Playwright scenarios present in the test harness and PASS:
   `chat_send_receive`, `project_lifecycle`, `vision_view`, `kb_view`,
   `doctor_indicator`.
3. Production bundle initial chunk < 500 KB gzipped (measured value recorded
   in the closure artifact).
4. Lighthouse score > 90 on Performance AND > 90 on Accessibility (scores
   recorded in the closure artifact).
5. SU baseline = 207 pass / 0 fail / 5 skip — identical to pre-PHASE-13.
   Proven by running the SU suite and by Track A backend greps returning the
   identical pre-PHASE-13 result (the backend was not modified).
6. PHASE-13 closure decision artifact written.
7. `progress/status.json` updated: phase advanced past PHASE-13,
   `roadmap.remaining` set to `[]`.
8. Final checkpoint written under
   `artifacts/decisions/_phase_13_checkpoints/`.

Per project governance rule 6, if any one of the above is unmet, PHASE-13
stays OPEN.

---

## 7. Cost

Default mock-only. Dev kill-bar = $3.00 for the phase. Voice input uses the
browser-native Web Speech API (no API cost). Playwright scenarios run
mock-only. Real API keys only with explicit owner approval in chat. Expected
cost actual: $0.00.

---

## 8. Risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | Bundle budget (< 500 KB gzipped) is tight with React + shadcn/ui | shadcn/ui generates only used components; code-split routes; measured at 13.1 baseline and tracked every stage |
| 2 | Lighthouse Accessibility > 90 is strict | shadcn/ui primitives are accessible by default; a11y checked from 13.2 onward, not deferred to 13.5 |
| 3 | SSE streaming behaviour differs between `fetch`-stream and the legacy implementation | Stage 13.2 ports streaming behaviour 1:1 and proves it with the `chat_send_receive` Playwright scenario |
| 4 | Playwright scenarios need a running backend | Scenarios run mock-only against a booted Forge with the mock OpenAI service, consistent with the existing harness |
| 5 | Legacy `web/index.html` retired in 13.5 — no rollback path if React app regresses | `web/index.html` kept in git history; 13.5 cutover happens only after 13.1–13.4 closed and all 5 scenarios green |

---

## 9. Approval

**APPROVED — 2026-05-21.**

Owner approved in chat on 2026-05-21 by sending PROMPT-STAGE-13.1 immediately
after this decision artifact was shared for review. Stage 13.1 is IN_PROGRESS
as of approval.

Actions taken upon approval:
- `progress/status.json.next_step` updated to point at PHASE-13 Stage 13.1.
- `progress/status.json.phase_13` block added (`status: "IN_PROGRESS"`, `current_stage: "13.1"`).
- `progress/status.json.current_task` set to `PHASE-13-STAGE-13.1-IN-PROGRESS`.

---

**END OF DECISION**
