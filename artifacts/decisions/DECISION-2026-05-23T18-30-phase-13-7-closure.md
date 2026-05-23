# PHASE-13.7 Closure — Auth Gate Fix + Single-Server Consolidation

> **Artifact ID:** DECISION-2026-05-23T18-30-phase-13-7-closure
> **Status:** CLOSED
> **Date:** 2026-05-23
> **Phase:** PHASE-13.7 (corrective — production defect)
> **Decision artifact:** DECISION-2026-05-23T16-30-phase-13-7-auth-gate-fix.md

---

## Closure Gate — all conditions verified

| # | Condition | Result |
|---|-----------|--------|
| 1 | Step 0 pre-flight: `web/index.html` present, `web/assets/` non-empty; all `apiFetch` paths start with `/`; §ARC path confirmed L2 | PASS |
| 2 | S216 all assertions GREEN (incl. assertion 6: no `localhost:3100` in built assets) | PASS |
| 3 | Full SU suite: 211 passed / 0 failed / 5 skipped (216 total) | PASS |
| 4 | `apiServer.js` auth-gate diff matches §2.2 exactly — `_isApiRoute` + `!_isApiRoute` exemption | PASS |
| 5 | Manual smoke: in-process server with `_activeToken` set — `GET /` → 200 HTML, `GET /chat` → 200 HTML, `GET /assets/*.js` → 200 JS, `GET /api/projects` → 401 | PASS |
| 6 | `progress/status.json` updated: `phase_13_7` block added, `last_completed_artifact` updated, self-test counts updated | PASS |

---

## Changes delivered

### `code/src/workspace/apiServer.js`

**1. `isWithin` helper** — added before `createWorkspaceApiServer` (verbatim from `web/server.js`).

**2. Auth gate fix** — `_authExempt` now tests `_isApiRoute` first:
```js
// before
const _authExempt =
  (req.method === "GET" && pathname === "/api/system/health") ||
  (req.method === "GET" && pathname === "/api/system/doctor");

// after
const _isApiRoute = pathname.startsWith("/api/");
const _authExempt =
  !_isApiRoute ||
  (req.method === "GET" && pathname === "/api/system/health") ||
  (req.method === "GET" && pathname === "/api/system/doctor");
```

**3. Handler A** — `GET /` and `GET /index.html` → L2 `fs.read_file("web/index.html")` → 200 `text/html`.

**4. Handler B** — `GET /assets/*` → `isWithin` guard + MIME map + L2 `fs.read_file(relPath)` → 200 with correct content-type.

**5. Handler C** — SPA fallback at end of handler chain: `GET && !pathname.startsWith("/api/")` → L2 `fs.read_file("web/index.html")` → 200 `text/html`. Catches `/chat`, `/projects`, `/vision`, `/kb`, `/doctor`.

All file reads via L2 tool (`reg.invoke("fs.read_file", ...)`). §ARC ledger stays at 6.

### `code/src/testing/helpers/api_server_test_helper.js`

- `_bootServer`: added `process.env.FORGE_WORKSPACE_API_PORT = "0"` (string `"0"` — truthy, routes to port 0 correctly; `port:0` number is falsy and would fall through to 3100).
- `_saveEnv` / `_restoreEnv`: track `FORGE_WORKSPACE_API_PORT`.
- `_httpGetFull`: new helper returning `{ status, body, contentType }`.
- `runS205UnauthRejected`: changed test endpoint from `/health` to `/api/ai/approval-policy` — `/health` is no longer auth-gated after fix (not under `/api/*`).
- `runS206AuthAccepted`: same endpoint change.
- `runS216AuthGateExemptsStaticRoutes`: uses stub files (`tempDir/web/index.html`, `tempDir/web/assets/stub.js`) instead of copying real build artifacts — deterministic across all environments. Assertion 6 fails-closed if real assets dir missing or empty.

### `web/apps/forge-workspace/src/api/base.ts`

```ts
// before
return import.meta.env.VITE_API_BASE ?? 'http://localhost:3100'

// after
return import.meta.env.VITE_API_BASE ?? ''
```

Empty string → `fetch('/api/...')` → resolves to same origin. Works because apiServer.js (port 3100) now serves both the SPA and API.

### `web/index.html` + `web/assets/*.js`

Rebuilt (`npm run build` in `web/apps/forge-workspace/`). New hashed bundle: `index-DWIuvs7j.js` (replaces `index-BoaelLNq.js`). No `localhost:3100` or `127.0.0.1:3100` in any built JS file (verified by S216 assertion 6 + manual grep).

### Scenario `S216_auth_gate_exempts_static_routes_when_token_active.json`

New regression guard — confirmed RED before Stage 13.7-2, GREEN after. All 8 state assertions pass.

---

## §ARC ledger — unchanged (6 entries)

Handlers A, B, C use `reg.invoke("fs.read_file", ...)` — `is_read_only: true` tool, permission check skipped. No new §ARC entry required.

---

## What changes for the production user

`curl http://127.0.0.1:3100/` after pm2 restart returns `200 text/html` with the Forge React shell. Previously returned `401 {"error":"Unauthorized"}`.

pm2 restart required to pick up the new `apiServer.js`. No ecosystem.config.js changes needed.

---

**END OF CLOSURE ARTIFACT**
