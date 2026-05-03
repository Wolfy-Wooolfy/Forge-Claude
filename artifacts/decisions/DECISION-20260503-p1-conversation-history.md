---
decision_id: DECISION-20260503-p1-conversation-history
task: P1
status: COMPLETED
date: 2026-05-03
---

# P1 — Pass conversation_history to model

## Problem

Both providers (`ConversationalResponseProvider`, `IdeationExpansionProvider`) were sending only
`[system, userPrompt]` to the OpenAI API. The `conversationMemoryManager` was persisting history
correctly to disk but it was never read before API calls, making the model stateless per turn.

## Decision

Read the last 20 entries from `conversation_context.json` before each API call and inject them
as multi-turn OpenAI messages between `system` and the current `user` prompt.

## Files Changed

- `code/src/ai_os/conversationEngine.js`
  - Added `loadConversationHistory(projectId)` — reads last 20 entries from disk
  - Updated `generateConversationalMessage` signature to accept `conversation_history`
  - Passes history in `task.context.conversation_history` to provider
  - `processMessage` loads history before calling the provider

- `code/src/providers/conversationalResponseProvider.js`
  - `executeTask` reads `task.context.conversation_history`
  - Builds messages as: `[system, ...historyMessages, userPrompt]`

- `code/src/providers/ideationExpansionProvider.js`
  - Same pattern as above

- `code/src/ai_os/ideationEngine.js`
  - Reads history from disk and passes it in `context.conversation_history`

- `code/src/ai_os/refinementLoopOrchestrator.js`
  - Same pattern as `ideationEngine.js`

## Success Criterion

When user says "زي اللي قلتلك قبل كده" the model understands without reminder.

## Token Budget

Max 20 entries per call. Entries stored as `{role, content, saved_at}` — mapped to
`{role, content}` only for the OpenAI messages array.
