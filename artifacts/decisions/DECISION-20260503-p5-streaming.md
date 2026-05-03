---
decision_id: DECISION-20260503-p5-streaming
task: P5
status: COMPLETED
date: 2026-05-03
---

# P5 — Streaming responses via Server-Sent Events

## Problem

AI responses appeared all at once after a delay. Users saw a spinner then a wall of text,
with no sense of the AI "thinking and writing" progressively.

## Decision

Add Server-Sent Events streaming for conversational responses.
New endpoint: POST /api/ai-os/chat/stream
New method: ConversationalResponseProvider.streamTask()
Frontend: streamChatMessage() — renders tokens as they arrive with a blinking cursor.

## SSE Protocol

- `data: {"type":"chunk","c":"..."}` — each token
- `data: {"type":"done","message":"...","suggest_next":"...","mode":"MESSAGE_PROCESSED"}` — completion
- `data: {"type":"error","reason":"..."}` — error

## Streaming Prompt Format

Provider uses plain-text output (not JSON) for streaming:
```
[message content]
---SUGGEST---
[suggest_next sentence]
```
Separator parsed at end. `message` and `suggest_next` extracted cleanly.

## Files Changed

- `code/src/providers/conversationalResponseProvider.js`
  - Added `buildStreamPrompt(task)` — plain-text system prompt
  - Added `streamTask(task, onToken)` — async generator calling OpenAI with stream:true

- `code/src/workspace/apiServer.js`
  - Added `require(ConversationalResponseProvider)`
  - Added `/api/ai-os/chat/stream` SSE endpoint
  - Saves user+assistant to memory after stream completes

- `web/index.html`
  - CSS: `.stream-cursor` with blink animation
  - Added `streamChatMessage(message, projectId)` — fetch + ReadableStream parser
  - `chatSendBtn` handler: streaming path triggers when project is active + no pending discovery

## Success Criterion

User sees text appearing word by word with blinking cursor, instead of a blank wait.
