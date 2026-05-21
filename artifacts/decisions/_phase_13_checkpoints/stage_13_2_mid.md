# Stage 13.2 — Mid-Stage Checkpoint

> **Type:** MID  
> **Date:** 2026-05-21  
> **Stage:** 13.2 — Chat View (send/receive + SSE streaming + clarification + voice)  
> **Status:** §1.A + §1.B complete — STOP before §1.D (Playwright scenario)

---

## §1 Deliverables Completed (§1.A + §1.B)

### §1.A — ChatView full implementation

**Files created:**
- `src/lib/detectLanguage.ts` — port of legacy `detectUserLanguage()` (Arabic char ratio > 0.3)
- `src/components/chat/types.ts` — `ChatMessage`, `QuickReplyChip`, `ClarificationState`, `ChatPhase`
- `src/components/chat/MessageBubble.tsx` — user/assistant message, streaming cursor, PENDING_CONFIRMATION style
- `src/components/chat/QuickReplies.tsx` — chip normalization (string/object), exclusive/multi-select, "إرسال الاختيارات" button, `normalizeChips()` export
- `src/components/chat/ChatInput.tsx` — textarea, send button, voice mic button
- `src/views/ChatView.tsx` — full state machine (discovery → clarification → ready → streaming)

**Files modified:**
- `src/api/chat.ts` — `ClarificationAnswerRequest.answers` type corrected from `Record<string, string>` to `{ raw_answer: string; answered_questions: string[] }` (matches legacy payload and actual backend contract)

### §1.B — Voice Input

- Implemented in `ChatInput.tsx` using `SpeechRecognition` / `webkitSpeechRecognition`
- Detection: `getSR()` reads `window.SpeechRecognition ?? window.webkitSpeechRecognition` (cast via `WindowWithSR` local type — no global `SpeechRecognition` type used)
- Mic button shown only when browser supports it; hidden otherwise (graceful degradation confirmed)
- Self-contained SR types defined locally in ChatInput.tsx — zero conflict with lib.dom.d.ts, no use of `any`

---

## §2 SSE Streaming — Legacy Behaviour Ported 1:1

| Legacy behaviour | React implementation |
|---|---|
| `fetch()` → `ReadableStream.getReader()` → `TextDecoder` → `\n\n` split → parse `data: ` JSON | `chatStream()` AsyncGenerator from 13.1 — same mechanics encapsulated |
| `evt.type === "chunk"` → append `evt.c`, show cursor | `state.messages.map()` — `isStreaming: true` renders blinking cursor |
| `evt.type === "done"` → finalize text, remove cursor, handle `PENDING_CONFIRMATION`, show quick replies | `normalizeChips(evt.suggested_answers)` → `pendingReplies` state, PENDING_CONFIRMATION border class |
| `evt.type === "error"` → show error text | Error message in Arabic/English depending on `detectLanguage()` |
| `stream-cursor` blinking span | `animate-pulse` Tailwind span with `data-testid="stream-cursor"` |

---

## §3 Clarification Flow — Legacy Behaviour Ported 1:1

| Legacy behaviour | React implementation |
|---|---|
| `pendingAiOsDiscovery` null check on send | `ChatPhase` state machine: `discovery → clarification → ready → streaming` |
| First send: `clarifyRequest()` + `intake()` | `doDiscovery()` — sequential calls, branches on `intake.mode` |
| `intake.mode === "CLARIFICATION_REQUIRED"` → set state, show questions, show quick replies | `clarification` state set, `pendingReplies` set |
| On answer: `answerClarification({ raw_answer, answered_questions })` | `doClarificationAnswer()` — correct payload type now enforced |
| `mode === "IDEATION_READY"` → clear state, allow streaming | `phase = 'ready'`, `clarification = null` |

---

## §4 Build Results

**`npm run build` output (literal):**
```
vite v5.4.21 building for production...
✓ 1524 modules transformed.
dist/index.html                  0.49 kB │ gzip:  0.30 kB
dist/assets/index--rClWbc2.css  11.29 kB │ gzip:  3.06 kB
dist/assets/index-Pe8VR3s-.js   40.91 kB │ gzip: 14.07 kB
dist/assets/vendor-D0xakLYA.js 163.49 kB │ gzip: 53.38 kB
✓ built in 43.96s
```

**Bundle total gzip:** 0.30 + 3.06 + 14.07 + 53.38 = **70.81 KB gzip**  
**Delta from 13.1 baseline (57.93 KB):** +12.88 KB  
**Budget headroom:** 500 − 70.81 = **429 KB**

**`grep -rn ": any" src/` exit code:** 1 (0 matches) ✓

---

## §5 Type Fix Note

`src/api/chat.ts` `ClarificationAnswerRequest.answers` was typed as `Record<string, string>` in Stage 13.1. The legacy payload is `{ raw_answer: string; answered_questions: string[] }` — a string[] as a value doesn't fit `Record<string, string>`. The type was corrected to `{ raw_answer: string; answered_questions: string[] }` in Stage 13.2 as part of consumption. This is a type-only correction; the runtime payload is unchanged.

---

## §6 Blocking Issues

None.

---

## §7 Next Step

§1.D — Playwright scenario `chat_send_receive`. Requires CTO confirmation before proceeding.
