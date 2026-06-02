# DECISION-2026-05-30 — PHASE-19: Frontend State Sync & UX Reality

> **Status:** APPROVED — owner approved in chat 2026-06-02.
> **Authored:** 2026-05-30
> **Phase type:** Corrective — completes PHASE-17 in-flow assumptions that broke under real use.
> **Predecessor:** PHASE-18 CLOSED — (Quality Debt Sweep). PHASE-17 CLOSED — (Idea Synthesis backend).
> **Authority chain:** Builds on PHASE-17 (`DECISION-2026-05-29-phase-17-idea-synthesis-gate.md`). Does NOT amend the Blueprint.

---

## 1. Why this phase exists (the Discovery)

Owner Khaled performed the first real end-to-end test of the PHASE-17 flow on
2026-05-30 via the UI at `127.0.0.1:3100/chat`. Four distinct bugs surfaced.
These are NOT regressions from PHASE-17/18 — they are **design assumptions made
in PHASE-17 that broke when reality didn't match the assumption**:

| # | Bug observed | Severity |
|---|---|---|
| 1 | FE does not load `conversation_mode` from backend on project mount — button visibility logic stale — button shown when project is already in IDEA_REVIEW | **HIGH** — flow unusable |
| 2 | FE displays raw API error reason (`NOT_IN_CONVERSATION_MODE`) as if it were an assistant chat message — user confused by technical strings appearing as Forge "saying" things | **HIGH** — UX broken |
| 3 | The same error renders twice in the chat history | **MEDIUM** — visual confusion |
| 4 | Pre-PHASE-17 conversation patterns (e.g. user typing "اعطني مقترح") trigger an in-engine pseudo-transition to OPTION_DECISION without going through the confirmation gate. The state stays in CONVERSATION mode but the engine emits PIPELINE-stage chat messages | **HIGH** — confirmation gate bypass at the conversational level |

There is also one piece of carried-over work:

| # | Item | Status |
|---|---|---|
| 5 | `conversationEngine.js` line 630: provider default = `"openai"` (was `"mock"`) + helper passes `provider: "mock"` explicit | **uncommitted** — discovered + fixed during Discovery, never committed |

And one architectural cleanup that became visible:

| # | Item | Severity |
|---|---|---|
| 6 | `startPipeline()` legacy function still exported from `conversationEngine.js` (lines 559-594). HTTP endpoint is disabled but the function method remains callable. Dead public API. | **LOW** — but invites future bypass bugs |

---

## 2. Scope (frozen — no deferrals)

PHASE-19 fixes all six items above. Each is mechanical once root cause is understood (the §0 read will confirm the wiring).

### 2.1 FE conversation_mode sync from backend (Bug 1)

The FE's `ChatState.conversationMode` and `ChatState.ideaSummary` must be hydrated
on project mount/switch from the actual project state on disk, NOT from a default.

**Backend:** extend the project-load response (or add a fetch endpoint —
to be decided in §0) to return:
- `conversation_mode` (current value on disk)
- `idea_summary` (if `IDEA_REVIEW` state, the synthesized summary)

**Frontend:** when `useProject().activeProjectId` changes, fetch this data
and update `ChatState` accordingly. The button visibility and IdeaSummaryCard
render conditions automatically self-correct.

### 2.2 FE proper API error handling (Bug 2)

When `requestIdeaSummary` or `confirmIdea` return `{ok: false, reason: X}`,
the FE must NOT insert the raw reason as an assistant message. Options:
- Inline error banner above the chat input (preferred — non-destructive)
- Toast/snackbar pattern
- For `NOT_IN_CONVERSATION_MODE` specifically: auto-refresh state from backend
  (the error means our local state is stale)

The handler decides per-reason:
- `NOT_IN_CONVERSATION_MODE` — silently refresh state + hide button (no message)
- `NO_IDEA_SUMMARY` — refresh state
- `SYNTHESIS_FAILED` / `PROJECT_NOT_FOUND` — show user-friendly banner

### 2.3 Eliminate double-render (Bug 3)

Identify and fix. Likely cause: `setState` running twice in `handleRequestSummary`
catch block (once in try-then-error path, once in catch). Single source of truth.

### 2.4 In-engine pseudo-pipeline transition (Bug 4) — the deepest one

When user wrote "اعطني مقترح فاني واعرضه عليا", Forge's chat response said
"التنقل إلى مرحلة OPTION_DECISION". But `conversation_mode` on disk was still
`CONVERSATION` — the engine **chatted as if** it transitioned, without actually
transitioning. This means the `conversationalResponseProvider` (legacy) is
sometimes emitting PIPELINE-stage language while the state machine is still
in CONVERSATION mode.

**Fix:** the conversational provider prompt must be constrained to NEVER
narrate stage transitions in CONVERSATION mode. Stage transitions are the
domain of `confirmIdea(AFFIRM)` exclusively. The legacy "OPTION_DECISION
narration" was inherited from pre-PHASE-16 behavior and is now stale.

This is **NOT a code change in the engine** — it's a prompt change in the
conversational provider's system prompt + an assertion in the existing
S221/S224 scenarios (which cover conversation_mode boundaries).

### 2.5 Provider default fix commit (Item 5)

The `conversationEngine.js` line 630 fix (provider default `"openai"`,
helper passes `provider: "mock"` explicit) has been on disk since the Discovery
session but never committed. Commit as part of PHASE-19.

### 2.6 Legacy `startPipeline()` removal (Item 6)

Delete the legacy function from `conversationEngine.js` (lines 559-594).
The HTTP endpoint is already disabled. Update the 2 test helpers
(`conversation_mode_test_helper.js`) to use `requestIdeaSummary` +
`confirmIdea(AFFIRM)` instead, OR mark the affected scenarios as
obsolete + remove them (if the scenarios were testing the legacy path).

---

## 3. Out of scope (explicit)

- Any NEW feature
- Any new agent role, new §ARC, new npm dependency
- Implicit "ready for summary" detection (deferred — user feedback first)
- Pipeline behavior after AFFIRM (separate concern — will be PHASE-20 or
  later, depending on what the next Discovery reveals)
- Multi-language vision generation polish
- Voice input / accessibility
- Knowledge base UI changes

---

## 4. §ARC impact

**Zero new §ARC.** Ledger stays at 8.

---

## 5. Acceptance gates (deterministic — phase stays OPEN if any fails)

| # | Gate |
|---|---|
| 1 | Backend exposes `conversation_mode` + `idea_summary` to FE via project-fetch endpoint (new endpoint or extended existing one — to decide in §0) |
| 2 | FE `ChatState` hydrates from backend on project mount/switch. Verified by scenario: open project in IDEA_REVIEW state — IdeaSummaryCard renders, "ready" button hidden |
| 3 | `NOT_IN_CONVERSATION_MODE` errors silently refresh state instead of rendering as messages — verified by scenario |
| 4 | No duplicate error renders — verified by counting messages in test |
| 5 | Conversational provider prompt updated; new scenario asserts that "اعطني مقترح" in CONVERSATION mode does NOT produce stage-transition narration |
| 6 | Provider default fix committed; conversationEngine.js line 630 reads `"openai"` |
| 7 | Legacy `startPipeline()` removed from `conversationEngine.js` exports; 2 test helpers updated; affected scenarios still PASS |
| 8 | TypeScript strict build clean |
| 9 | Full suite on Windows: **234+N passed / 0 failed / 5 skipped** where N = new scenarios added (estimated +3 to +5) |
| 10 | Real-world end-to-end: Khaled performs UI test — button visibility correct — IdeaSummaryCard renders with real summary — AFFIRM completes cleanly — no raw error strings anywhere |

The headline: **Gate #10 is the final closure gate.** Backend tests aren't enough — the closure depends on Khaled completing the actual UI flow without seeing a single broken-UX symptom.

---

## 6. Cost budget

- Mock-first for all new scenarios. Provider default fix already committed-pending.
- Real OpenAI calls expected during the Gate #10 user verification (1-3 calls
  total at ~$0.001-0.005 each) — ~$0.015 max for verification.
- Kill bar: $2.00 for the phase.

---

## 7. Open questions (resolve in §0 before coding)

- **OQ-1:** Extend existing `/api/projects/<id>` endpoint or add a new
  `/api/ai-os/project/state` endpoint? Lean: extend existing — fewer endpoints
  to maintain.
- **OQ-2:** Where does the IdeaSummary live on disk relative to the project?
  `artifacts/projects/<id>/idea_summary.json` (confirmed in PHASE-17). Does
  the project-state endpoint return its parsed content or just a flag
  `has_idea_summary: true` and let FE fetch separately? Lean: return parsed
  inline if it exists (single round-trip).
- **OQ-3:** Should `confirmIdea(REJECT)` delete `idea_summary.json` from disk
  so a future re-synthesis is clean, or keep it for audit? Lean: keep it
  (audit trail) but mark with `rejected_at` field.

---

## 8. Estimated effort

- **2 sessions** if Discovery (§0) goes clean
- **3 sessions** if §0 reveals additional wiring issues

This is realistic — UX bugs are mechanical once root cause is mapped, but the
state-sync wiring (Gate #2) touches both frontend and backend and requires
careful design to avoid race conditions.

---

## 9. Approval

- [x] Owner replied "approved" in chat 2026-06-02
- [ ] This artifact committed to `artifacts/decisions/`
- [ ] `status.json.next_phase` updated to `PHASE-19-ACTIVE`
