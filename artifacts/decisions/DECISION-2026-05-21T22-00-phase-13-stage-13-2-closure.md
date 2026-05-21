# DECISION — Stage 13.2 Closure: Chat View (send/receive + SSE streaming + clarification + voice)

> **Status:** CLOSED — all 8 closure gate conditions verified  
> **Date:** 2026-05-21  
> **Phase:** PHASE-13 (Conversational UX Polish)  
> **Stage:** 13.2 — Chat View  
> **Owner approval:** pending CTO independent verification (STOP point)

---

## §1 Stage Summary

Stage 13.2 delivered the full ChatView implementation:

- **§1.A** — ChatView with full state machine (discovery → clarification → ready → streaming), SSE streaming (incremental render), clarification flow (1:1 port of legacy `pendingAiOsDiscovery`), quick replies (chip normalization matching legacy), voice input (Web Speech API, graceful degradation)
- **§1.B** — Voice input: browser-native `SpeechRecognition` / `webkitSpeechRecognition`, mic toggle button, speech transcribed into text input, hidden when unavailable
- **§1.D** — Playwright scenario `chat_send_receive`: 2 tests (streaming + clarification round-trip), both PASS

---

## §2 Files Created / Modified

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
- `web/apps/forge-workspace/package.json` — added `@playwright/test ^1.45.0` devDependency + `test:e2e` script
- `web/apps/forge-workspace/src/api/chat.ts` — **Stage 13.1 deliverable modified in Stage 13.2**: `ClarificationAnswerRequest.answers` type corrected from `Record<string,string>` to `{raw_answer: string; answered_questions: string[]}`. Type-only correction; runtime payload unchanged. Reason: the 13.1 type did not match the legacy backend contract (`buildAiOsClarificationAnswersPayload` at index.html line 981–984 returns `{raw_answer, answered_questions: string[]}`). This is the expected bug-catching function of the consuming stage.

---

## §3 Closure Gate — All 8 Conditions

| # | Condition | Result |
|---|-----------|--------|
| 1 | ChatView implements send/receive, SSE streaming (incremental), clarification flow, voice input | PASS — all four implemented; state machine: discovery→clarification→ready→streaming |
| 2 | `npm run build` exits 0 | PASS — exit 0, 12.28s |
| 3 | Bundle gzip < 500 KB | PASS — **70.81 KB gzip** (0.30 html + 3.06 css + 14.07 js + 53.38 vendor). Delta +12.88 KB from 13.1 baseline. Headroom: 429 KB |
| 4 | TypeScript strict; `grep -rn ": any" src/` → 0 | PASS — exit 1 (0 matches) |
| 5 | Playwright `chat_send_receive` PASS — literal summary line | PASS — `2 passed (50.1s)` |
| 6 | Backend untouched; SU baseline 207/0/5 — literal summary line | PASS — backend md5 unchanged (git diff → 0 files); owner-machine SU: `ALL PASS — 207 passed, 0 failed, 5 skipped (212 total)` (duration 468725ms) |
| 7 | Closure decision artifact written | THIS DOCUMENT |
| 8 | Final checkpoint written | `artifacts/decisions/_phase_13_checkpoints/stage_13_2.md` |

---

## §4 Key Technical Decisions

- **SpeechRecognition typing:** Self-contained local types in `ChatInput.tsx` (`SRInstance`, `SRConstructor`, `WindowWithSR`) avoid all conflicts with lib.dom.d.ts — zero `any`, zero import of global `SpeechRecognition`
- **SSE streaming port:** Exact 1:1 port via `chatStream()` AsyncGenerator from Stage 13.1 — `chunk|done|error` events handled identically to legacy
- **Quick replies:** `normalizeChips()` ports legacy chip normalization (string/object, exclusive, multi_select, open_input action) with zero `any` using discriminated `unknown` casting
- **Clarification state:** `ChatPhase` enum replaces `pendingAiOsDiscovery` global variable; same branching logic (CLARIFICATION_REQUIRED / IDEATION_READY / ok:false)
- **Playwright mocking:** `page.route()` intercepts API calls at browser level — no backend required for scenario runs

---

## §5 Constraints Confirmed

- Backend (`code/src/**`, `web/server.js`, `web/index.html`, `apiServer.js`) — **UNTOUCHED**
- §ARC ledger — **UNCHANGED at 6**
- `@playwright/test` added to `web/apps/forge-workspace/package.json` ONLY (root `package.json` untouched)
- No real API keys; $0.00 cost
- No `any` in TypeScript code

---

## §6 Next Stage

Stage 13.3 — Project Management View (project list / create / activate / delete; active-project context panel).
