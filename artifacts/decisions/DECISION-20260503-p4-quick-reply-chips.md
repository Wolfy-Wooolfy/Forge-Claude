---
decision_id: DECISION-20260503-p4-quick-reply-chips
task: P4
status: COMPLETED
date: 2026-05-03
---

# P4 — Quick-reply chips in Discovery UI

## Problem

Discovery questions were displayed as plain text. Users had to manually type answers,
slowing down the ideation loop significantly.

## Decision

Add `suggested_answers` to provider output schemas and render them as clickable chips
below AI messages in the discovery phase. Chip click → instant send.

## Files Changed

- `code/src/providers/openAiRequirementDiscoveryProvider.js`
  - Added `suggested_answers` to JSON schema in `buildPrompt`
  - Added to `normalizeOutput` (max 4 items)

- `code/src/providers/ideationExpansionProvider.js`
  - Added `suggested_answers` alongside `follow_up_question` in schema
  - Added to `normalizeOutput`

- `code/src/ai_os/ideationEngine.js`
  - Passes `suggested_answers` in `expandIdea` return value

- `code/src/ai_os/refinementLoopOrchestrator.js`
  - Tracks `lastSuggestedAnswers`, passes in loop return value

- `code/src/ai_os/projectRuntime.js`
  - `intakeProject` passes `suggested_answers` from discovery in response
  - `answerClarification` passes `suggested_answers` from discovery in response

- `web/index.html`
  - CSS: `.quick-reply-chips` + `.quick-reply-chip` with hover state
  - `renderQuickReplies(answers)`: appends chips to last assistant message
  - Chip click: sets input value, removes chips, triggers send
  - Called after intake CLARIFICATION_REQUIRED and clarification answer CLARIFICATION_REQUIRED

## Success Criterion

User sees chips: ["B2B شركات", "B2C أفراد", "Marketplace", "أكتب إجابة مختلفة"]
Clicking a chip sends it immediately as a user message.
