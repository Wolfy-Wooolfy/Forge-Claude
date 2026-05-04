# DECISION-20260503-pipeline-reconnect

**Date:** 2026-05-03  
**Status:** IMPLEMENTED + REVIEWED  
**Affected Files:**
- `code/src/workspace/apiServer.js`
- `code/src/ai_os/conversationEngine.js`
- `web/index.html`
- `artifacts/projects/test_project_2/project_state.json`

---

## Problem

`/api/ai-os/chat/stream` was calling `ConversationalResponseProvider.streamTask()` directly,
bypassing `conversationEngine.processMessage()` entirely. This caused:

1. No intent classification — keyword matching prohibition violated.
2. No `pending_confirmation` handling — user affirmations never triggered `confirmTransition()`.
3. No phase transitions — state machine was never consulted.
4. `conversation_context.json` never written — `saveContext` was unreachable when `streamTask` threw.
5. Residual values from prior sessions in `project_state.json` went undetected.

Root cause: The stream endpoint was an isolated chatbot with no pipeline awareness.

---

## Changes Made

### `apiServer.js` — stream endpoint (lines ~3009–3076)
- Removed direct `ConversationalResponseProvider.streamTask()` call.
- Now calls `conversationEngine.processMessage(body)` first (state machine runs first).
- Fake-streams result message as word tokens via `message.match(/\S+|\s+/g)` — reduces SSE events from O(chars) to O(words).
- `saveContext` called after successful `processMessage`.
- `done` event carries `{mode, suggested_answers, confirmation_key, target_state, current_state}`.

### `apiServer.js` — engine instantiation (line 74)
- `createConversationEngine({ root, ideationEngine })` — dependency injection.

### `apiServer.js` — `buildProjectState` (line 1744)
- Added `existing.active_runtime_state` as fallback before file-system inference.
- Prevents active_runtime_state from being reset to "DOCUMENTATION" due to stale proposal files when an AI OS project is rebuilt.

### `conversationEngine.js` — `generateCheckpoint` (line 104)
- Fixed: was returning `null` when project not found (would cause TypeError in processMessage).
- Now returns `{ ok: false, mode: "BLOCKED", reason: "PROJECT_NOT_FOUND", project_id }`.

### `conversationEngine.js` — `processMessage()` routing (lines 364–398)
- Added `ideationEngine = options.ideationEngine || null`.
- DISCUSSION/IDEATION states now delegate to `ideationEngine.expandIdea()`.
- If `ready_for_options`: calls `generateCheckpoint("OPTION_DECISION")`.
- If not ready: returns `follow_up_question` + `suggested_answers`.
- Fail-closed: `ok: false` from ideation → `BLOCKED` with reason.

### `web/index.html` — `done` event handler (line ~1107)
- Calls `renderQuickReplies(evt.suggested_answers)` when answers are present.
- When `mode === "PENDING_CONFIRMATION"`: changes title and adds `.mode-pending-confirmation` CSS class.

### `web/index.html` — CSS (line ~523)
- Added `.mode-pending-confirmation` style: blue left border + blue title.

### `artifacts/projects/test_project_2/project_state.json`
- Reset: `project_mode` EXTEND_EXISTING → NEW_PROJECT.
- Reset: `active_runtime_state` DOCUMENTATION → IDEATION.
- Reset: `current_phase` DOCS_DRAFTING → DISCOVERY.
- Cleared: `technical_goal` ("add a button to the UI" → "").
- Cleared: `selected_strategy` ("HTML_BUTTON_CREATE" → "").
- Cleared: `provider_error`, `documentation_state` → EMPTY.

---

## What Remains Deferred

- Real token streaming — P5 (requires `processMessage` to accept `onToken` callback).
- `documentationBuildLoop` trigger after OPTION_DECISION confirmation — separate task.
- `ideationEngine.expandIdea()` does not persist expansion results back to `project_state.json` — conversation_history fix mitigates this; structured model update is separate.
