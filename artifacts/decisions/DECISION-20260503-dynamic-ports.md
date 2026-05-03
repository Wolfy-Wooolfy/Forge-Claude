# DECISION-20260503-dynamic-ports

**Date:** 2026-05-03  
**Scope:** Operational — not a docs change, not a philosophy change  
**Status:** Implemented

## Decision

Make server ports configurable via environment variables instead of hardcoded values.

## Changes Made

### web/server.js
- Line ~686: HTML response now injects `<script>window.__FORGE_API_BASE__ = "http://localhost:${FORGE_API_PORT}";</script>` before `</head>` instead of serving the file directly.
- Line ~839: Web server listens on `FORGE_WEB_PORT` (default 3000) instead of hardcoded 3000.

### web/index.html
- 7 locations updated to use `window.__FORGE_API_BASE__` (injected at runtime by server.js) with `.replace(":3000", ":3100")` or `"http://localhost:3100"` as fallback.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `FORGE_WEB_PORT` | `3000` | Port for the web/HTML server |
| `FORGE_API_PORT` | `3100` | Port for the API server (used in injected base URL) |

## Rationale

Avoids manual edits when running in environments where ports 3000/3100 are taken or need to differ (CI, Docker, staging).

## Test Command

```powershell
$env:FORGE_API_PORT="4100"; $env:FORGE_WEB_PORT="4000"; node web/server.js
# Then open http://localhost:4000 and verify API calls go to :4100
```
