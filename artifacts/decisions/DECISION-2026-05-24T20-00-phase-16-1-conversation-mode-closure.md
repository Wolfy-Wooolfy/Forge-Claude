# DECISION — PHASE-16.1 Conversation Mode — Closure

> **ID:** DECISION-2026-05-24T20-00-phase-16-1-conversation-mode-closure
> **Date:** 2026-05-24
> **Phase:** PHASE-16.1 — Conversation Mode (G1 BLOCKER)
> **Status:** DRAFT — IMPLEMENTATION COMPLETE, pending owner real-use test
> **Owner:** KhElmasry

---

## What Was Approved

CTO approved PHASE-16.1 implementation of **Option A** (new `conversation_mode` field on
project state) via chat confirmation. Mid-checkpoint was reviewed and approved by CTO before
proceeding to D3+D4. Transition mechanism revised to button-based (not keyword-based).

---

## Problem Addressed

**G1 BLOCKER:** `conversationEngine.js` `processMessage()` lines 427-435. On every first
message, the pipeline branch fires unconditionally — `DISCUSSION → IDEATION` transition
happens regardless of what the user says. Free-form conversation before committing to a
project idea was structurally impossible.

**CONVERSATION_LAYER_CONTRACT §13.7.3** prohibits keyword matching on user intent. The prior
code violated this by entering the pipeline on any message in DISCUSSION state.

---

## What Was Built

### D1 — `code/src/ai_os/projectRuntime.js`
Added `conversation_mode: "CONVERSATION"` to `buildDefaultState()`. Every new project starts
in conversation mode. Pre-existing projects (without the field) are unaffected — backward
compat preserved.

### D2 — `code/src/ai_os/conversationEngine.js`
- `handleConversationMode()` function: routes CONVERSATION-mode messages to
  `ConversationalResponseProvider.executeTask()`. Fail-closed on provider failure. Persists
  turn to conversation history.
- Gate in `processMessage()`: if `state.conversation_mode === "CONVERSATION"` → route to
  `handleConversationMode()` before reaching the pipeline branch. Pipeline structurally
  unreachable for new projects.

### D3 — `code/src/ai_os/conversationEngine.js` + `code/src/workspace/apiServer.js`
- `startPipeline()` function: reads state, sets `conversation_mode: "PIPELINE"`, captures
  `user_goal` from conversation history, saves via L2 `fs.write_file`.
- `POST /api/ai-os/project/start-pipeline` endpoint: auth-gated, calls `startPipeline()`.
- `buildProjectState()` fix: added `conversation_mode` preservation to prevent
  `listProjects()` from wiping the field on every `GET /api/projects` call.
- Transition mechanism: always-visible "ابدأ بناء المشروع" button in frontend;
  `suggest_next` can highlight but NOT auto-trigger; owner click → API call → deterministic
  transition. Zero text-scanning.

### D4 — 5 SU scenarios (S220–S224)
S224 is the core outcome guard: "اقترح عليا" → actual proposal content in response, state
stays DISCUSSION, pipeline not entered.

---

## Test Results

```
218 passed, 1 failed (S191 known env delta), 5 skipped — 224 total
S220-S224: ALL GREEN
```

---

## Track A Compliance

- No new `new OpenAI()` calls. §ARC count = 7 (unchanged).
- No `fs.*Sync` outside registered tools.
- No `child_process`.
- Zero new regressions in existing 219 baseline scenarios.

---

## Ratification Status

| Gate | Status |
|------|--------|
| D1 code written + reviewed | ✓ DONE |
| D2 code written + reviewed | ✓ DONE |
| D3 code written + reviewed | ✓ DONE |
| D4 scenarios written, RED→GREEN | ✓ DONE |
| Track A compliance verified | ✓ DONE |
| Full SU suite run | ✓ 218P/1F(known)/5S |
| Mid-checkpoint approved by CTO | ✓ DONE |
| Final checkpoint written | ✓ DONE |
| **Owner real-use test** | **PENDING** |

---

## Owner Real-Use Test Required (§4)

To advance this decision from DRAFT to CLOSED, the owner must:

1. Open Forge at http://127.0.0.1:3100
2. Create a new project
3. In conversation mode, send "اقترح عليا فكرة مشروع تقني"
4. Confirm: response is an actual proposal (not a follow-up question)
5. Confirm: project state remains DISCUSSION (no IDEATION transition)
6. Screenshot
7. Report result in chat → stage declared CLOSED

This is the PHASE-16 closure gate rule: **every stage closes against owner OUTCOME, not
just green SU scenarios.**

---

## Post-Ratification Actions

When owner confirms real-use test:
1. Update this document: status → `CLOSED`, `closed_at` → confirmation timestamp
2. Update `progress/status.json`: `phase_16.stages.16_1.status` → `"CLOSED"`
3. Update `progress/status.json`: advance `next_step` to PHASE-16.2 or next applicable stage
4. Update memory: `project_phase16_active.md` with stage 16.1 closed

---

**END OF DECISION**
