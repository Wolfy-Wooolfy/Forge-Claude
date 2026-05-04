# DECISION-20260503-fix-stream-api-base

**Date:** 2026-05-03  
**Scope:** Bug fix — web/index.html only  
**Status:** Implemented

## Bug Description

Sending a chat message showed "تعذّر الاتصال بالخادم" despite the web server and other API endpoints working correctly.

## Root Cause

`streamChatMessage` (web/index.html:1072) referenced `API_BASE` which was never defined in its scope. The variable `API_BASE` is only defined as a local `const` inside `requestAPI` (line 1853) and `callAPI` (line 2460). Using it in `streamChatMessage` throws a `ReferenceError` at runtime, which the surrounding `try/catch` silently converts to the error message shown to the user.

This regression was introduced when the dynamic-ports change (DECISION-20260503-dynamic-ports.md) updated other `API_BASE` occurrences but missed this one because `streamChatMessage` used the uppercase `API_BASE` name (not `apiBase`) and the endpoint was added separately as part of the streaming feature (P5).

## Fix

web/index.html line 1072 — added local definition before the fetch call:

```diff
- const res = await fetch(`${API_BASE}/api/ai-os/chat/stream`, {
+ const apiBase = window.__FORGE_API_BASE__ || window.location.origin.replace(":3000", ":3100");
+ const res = await fetch(`${apiBase}/api/ai-os/chat/stream`, {
```

Pattern matches all other locations in the file (lines 1538, 1568, 1597, 1787).

## Test

1. Restart web server: `node web/server.js`
2. Hard refresh browser (Ctrl+F5)
3. Send message in chat for test_project_2
4. Console: no ReferenceError
5. Network: POST /api/ai-os/chat/stream returns 200 with SSE events
