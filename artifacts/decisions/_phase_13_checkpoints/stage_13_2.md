# Stage 13.2 — Final Checkpoint

> **Type:** FINAL  
> **Date:** 2026-05-21  
> **Stage:** 13.2 — Chat View (send/receive + SSE streaming + clarification + voice)  
> **Status:** CLOSED — pending CTO independent verification

---

## Deliverables Completed

### §1.A — ChatView (state machine + SSE streaming + clarification flow)

**State machine:** `ChatPhase` enum — `discovery → clarification → ready → streaming`

| Phase | Trigger | Handler |
|-------|---------|---------|
| `discovery` | First send | `doDiscovery` — calls `clarifyRequest` + `intake` |
| `clarification` | `intake` returns `CLARIFICATION_REQUIRED` | `doClarificationAnswer` — calls `answerClarification` |
| `ready` | `intake` returns `IDEATION_READY` (or clarification answered) | `doStream` — calls `chatStream` SSE |
| `streaming` | Send in `ready` phase | SSE loop via `chatStream` AsyncGenerator |

**SSE streaming:** Exact 1:1 port of legacy `eventSource` handler. Events: `chunk` (append `evt.c`, `isStreaming: true`), `done` (finalize, `isStreaming: false`, normalizeChips for quick replies), `error` (show error text). Uses `AbortController` for cancellation.

**Clarification flow:** 1:1 port of legacy `pendingAiOsDiscovery` pattern. `ClarificationState` holds `{projectId, projectName, originalRequest, questions}`. Quick replies from `suggested_answers` via `normalizeChips()`.

**Visual feedback:** Phase badge (`data-testid` implicit via `getByText`), streaming cursor (`data-testid="stream-cursor"` animating while `isStreaming`), loading skeleton during API calls.

### §1.B — Voice Input (Web Speech API)

**Implementation:** `getSR()` returns `SRConstructor | null` from `window as WindowWithSR`. All types local (`SRInstance`, `SRConstructor`, `WindowWithSR`, `SREvent`, etc.) — zero lib.dom.d.ts conflicts.

**Behavior:** Mic button hidden (`display: none`) when `getSR() === null` (graceful degradation). When active: `recognition.start()` transcribes into chat input value. Auto-stop on silence. `data-testid="mic-button"`.

### §1.C — Quick Replies chip normalization

`normalizeChips()` in `QuickReplies.tsx` handles: string chips, object chips with `label/value/exclusive/multiSelect/action`. Ports legacy `renderQuickReplies()` — supports `exclusive`, `multi_select`, `open_input` actions. Zero `any` (uses `a as Record<string, unknown>` with property guards).

### §1.D — Playwright scenario `chat_send_receive`

2 tests in `e2e/chat_send_receive.spec.ts`:

| Test | Mocks | Assertions |
|------|-------|------------|
| `sends a message and receives a streamed response` | intake→IDEATION_READY, SSE stream with `['Hello', ' world']` chunks | user message visible; `'Hello world'` in assistant bubble; no stream-cursor; phase=`'ready'` |
| `clarification answer round-trip` | intake→CLARIFICATION_REQUIRED, answerClarification→IDEATION_READY | question text visible; quick replies visible; `'Discovery complete.'` after answer; phase=`'ready'` |

Run result: `2 passed (50.1s)`

### §1.E — chat.ts type fix (Stage 13.1 deliverable, corrected in Stage 13.2)

`ClarificationAnswerRequest.answers` corrected from `Record<string,string>` to `{raw_answer: string; answered_questions: string[]}` to match legacy backend contract (`buildAiOsClarificationAnswersPayload` at index.html:981–984). Type-only change; runtime payload unchanged.

---

## Files Created / Modified

### New files
- `web/apps/forge-workspace/src/lib/detectLanguage.ts`
- `web/apps/forge-workspace/src/components/chat/types.ts`
- `web/apps/forge-workspace/src/components/chat/MessageBubble.tsx`
- `web/apps/forge-workspace/src/components/chat/QuickReplies.tsx`
- `web/apps/forge-workspace/src/components/chat/ChatInput.tsx`
- `web/apps/forge-workspace/playwright.config.ts`
- `web/apps/forge-workspace/e2e/chat_send_receive.spec.ts`

### Modified files
- `web/apps/forge-workspace/src/views/ChatView.tsx` — full implementation (was stub)
- `web/apps/forge-workspace/package.json` — `@playwright/test ^1.45.0` devDep + `test:e2e` script
- `web/apps/forge-workspace/src/api/chat.ts` — `ClarificationAnswerRequest.answers` type correction

---

## Closure Gate Results (8 conditions)

| # | Condition | Status |
|---|-----------|--------|
| 1 | ChatView: send/receive, SSE streaming (incremental), clarification flow, voice input | PASS — state machine: discovery→clarification→ready→streaming; all four implemented |
| 2 | `npm run build` exits 0 | PASS — `✓ built in 12.28s` |
| 3 | Bundle < 500 KB gzip | PASS — **70.81 KB gzip** (vendor 53.38 + js 14.07 + css 3.06 + html 0.30). Delta +12.88 KB from 13.1 baseline. Headroom: 429 KB |
| 4 | TypeScript strict; zero `any` | PASS — `grep -rn ": any" src/` exit 1 (0 matches) |
| 5 | Playwright `chat_send_receive` PASS | PASS — `2 passed (50.1s)` |
| 6 | Backend untouched; SU 207/0/5 | PASS — backend md5 unchanged; owner-machine summary: `ALL PASS — 207 passed, 0 failed, 5 skipped (212 total)` (468725ms) |
| 7 | Closure decision artifact | PASS — `artifacts/decisions/DECISION-2026-05-21T22-00-phase-13-stage-13-2-closure.md` |
| 8 | Final checkpoint | THIS DOCUMENT |

---

## Risks / Open Questions

None. Stage 13.3 (Project Management View) is the next stage.
