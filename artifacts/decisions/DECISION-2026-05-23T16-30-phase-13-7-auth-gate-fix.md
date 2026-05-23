# DECISION — PHASE-13.7: Production Auth-Gate Fix

> **Status:** APPROVED — owner approved in chat 2026-05-23  
> **Date:** 2026-05-23  
> **Phase:** PHASE-13.7 (corrective — same family as PHASE-13.6)  
> **Track:** A (backend — `code/src/workspace/apiServer.js`) + limited frontend (`base.ts` only)  
> **§ARC ledger:** stays at 6 (no new ARC exceptions)  
> **Owner approval required:** YES — no code written until explicit approval in chat

---

## §1 Defect Record

**Symptom:** `http://127.0.0.1:3100` returns `{"error":"Unauthorized"}` in a browser after
Forge is started via pm2. The React workspace shell — HTML, JS, CSS — is unreachable.

**Root cause (verified by reading code, 2026-05-23):**

PHASE-13.5 established a dual-server architecture:

| Server | File | Port | Responsibility |
|--------|------|------|----------------|
| Web (SPA) | `web/server.js` | 3000 | Serves `web/index.html`, `web/assets/*`, SPA fallback |
| API | `code/src/workspace/apiServer.js` | 3100 | All `/api/*` routes, auth gate |

Stage 13.5 extended `web/server.js` with `/assets/*` handler and SPA fallback (confirmed in the
Stage 13.5 closure artifact §1.A). `apiServer.js` was explicitly **FROZEN / UNTOUCHED** in
Stage 13.5.

`ecosystem.config.js` starts only `start-api.js` → `apiServer.js` (port 3100). `web/server.js`
(port 3000) is **never started by pm2**.

When the owner opens `http://127.0.0.1:3100` in a browser:

1. Request hits `apiServer.js` request handler.
2. Auth middleware fires (lines 1576–1588): `_activeToken !== null` is true because `start()`
   was called by pm2.
3. `_authExempt` covers only `GET /api/system/health` and `GET /api/system/doctor`.
4. `GET /` fails the exemption check → `sendJson(res, 401, { error: "Unauthorized" })`.

The browser never receives HTML. The SPA cannot boot. No client-side token-reading code
ever runs.

**Why Stage 13.5's Playwright tests missed this:**
Tests ran against Vite dev server (`npm run dev`, no auth gate) or against `apiServer.js` with
`_activeToken === null` (test mode — auth bypassed by the `_activeToken !== null` guard in
`api_server_test_helper.js`). No test exercised `GET /` against `apiServer.js` with a live
token set. This is the gap this phase must permanently close.

---

## §2 Fix Scope — Mechanism

**Architecture decision: consolidate to a single server on port 3100.**

Adding `web/server.js` to pm2 as a second process would require two open ports, a user-facing
port-selection decision, and keeping two servers in sync. The cleaner invariant: one server,
one port, one auth boundary. The security boundary is `/api/*`; the HTML shell is not a
protected asset.

### §2.1 Step 0 — Pre-flight (must pass before any code)

```bash
node -e "require('fs').accessSync('web/index.html')"
node -e "console.log(require('fs').readdirSync('web/assets').length)"
```

First command must exit 0. Second must print > 0. If either fails, the React build
is absent and the phase halts — no point adding serving logic if the file isn't there.

### §2.2 Auth-Gate Change (apiServer.js lines 1576–1588)

**Current:**
```js
const _authExempt =
  (req.method === "GET" && pathname === "/api/system/health") ||
  (req.method === "GET" && pathname === "/api/system/doctor");
```

**Proposed:**
```js
// Security boundary is /api/* — the HTML shell and its assets are public by design.
const _isApiRoute = pathname.startsWith("/api/");
const _authExempt =
  !_isApiRoute ||
  (req.method === "GET" && pathname === "/api/system/health") ||
  (req.method === "GET" && pathname === "/api/system/doctor");
```

Non-`/api/` requests bypass auth entirely. All `/api/*` requests (except the two explicit
health exemptions) require a valid Bearer token. This is a **two-line net change**.

### §2.3 Static File Handlers (new, in apiServer.js)

Three handlers inserted **after** the auth gate block and **before** the existing
`GET /health` handler (approx. line 1590). These mirror the logic in `web/server.js` verbatim,
but without the vestigial `window.__FORGE_API_BASE__` injection (confirmed vestigial in
Stage 13.5 §4 — React reads `import.meta.env.VITE_API_BASE` baked at build time).

**Handler A — `GET /` and `GET /index.html`**
```
Read web/index.html → respond 200 text/html
```

**Handler B — `GET /assets/*`**
```
Verify path is within web/assets/ (isWithin guard)
Resolve MIME type by extension (.js / .css / .html / .svg / .png / .ico / .woff2 / .woff)
fs.readFileSync → respond 200 with content-type
Return 404 if file not found or path escapes assets root
```

**Handler C — SPA fallback**
```
Condition: GET && !pathname.startsWith("/api/") && no earlier handler matched
Read web/index.html → respond 200 text/html
Catches /chat, /projects, /vision, /kb, /doctor
```

**`isWithin` helper:** `apiServer.js` currently lacks this function. Copy verbatim from
`web/server.js` lines 29–32 as a top-scope helper in `apiServer.js`. No new dependency.

### §2.4 Relative API Base (base.ts + frontend rebuild)

**Problem (surfaced by CTO, 2026-05-23):**
`web/apps/forge-workspace/src/api/base.ts` line 4:
```ts
return import.meta.env.VITE_API_BASE ?? 'http://localhost:3100'
```
`localhost:3100` is baked into the built JS as an absolute URL. Two consequences:
- Port 3100 is frozen — any future port change requires a full rebuild.
- LAN access fails — a browser on another device calls its own `localhost`, not the server.

**Why PHASE-13.7 fixes it without extra work:**
Once the same server (port 3100) serves both the SPA and the API, the frontend does not need
to know the origin at all. `fetch('/api/...')` resolves to whatever origin delivered the page.
A relative base is simpler, not more complex — it removes a hardcoded assumption.

**Change:**
```ts
// before
export function getApiBase(): string {
  return import.meta.env.VITE_API_BASE ?? 'http://localhost:3100'
}

// after
export function getApiBase(): string {
  return import.meta.env.VITE_API_BASE ?? ''
}
```

Empty string `''` → `apiFetch('/api/projects', ...)` constructs `'' + '/api/projects'` =
`'/api/projects'`, which the browser resolves to the same origin. Correct for same-origin serving.

**Step 0 verification (before writing code):**
Confirm that:
1. `apiFetch` constructs URLs as `${getApiBase()}${path}` — verified: `base.ts` line 11.
2. All `path` arguments in `chat.ts`, `projects.ts`, `ai.ts`, `governance.ts`, `system.ts`,
   `vision.ts`, `kb.ts` start with `/` — if any path is relative itself, `'' + 'relative/path'`
   would break. Must verify no such case exists before writing the change.
3. SPA routing (`/chat`, `/projects`, etc.) is React Router client-side — not affected by
   `getApiBase()`. Handler C in §2.3 ensures server-side refreshes still work.

**Rebuild:** After changing `base.ts`, run `npm run build` from
`web/apps/forge-workspace/`. The new `web/assets/*.js` must contain no `localhost:3100`.

### §2.5 Files NOT touched

`web/server.js` stays as-is (dev use / legacy). `ecosystem.config.js` is already correct.
`GETTING_STARTED.md` needs no change (still points users to port 3100). All `docs/**` files
and all other scenarios are untouched.

---

## §3 Regression Test (mandatory — test-first, §11.5)

**Scenario S216 — `auth_gate_exempts_static_routes_when_token_active`**

This scenario is the primary regression guard. It must be written and confirmed RED before
the `apiServer.js` change is made.

```
Setup:
  startTestServerWithAuth() — starts apiServer.js and calls start(), so _activeToken is set.
  Test isolation: stub checkOrCreateUidPin (no-op), secretProvider.set (in-memory), and
  skip web/.forge-session write (or write to a temp path).

Assertions (all deterministic):
  1. GET /             (no Authorization header) → HTTP 200, Content-Type ∋ "text/html"
  2. GET /index.html   (no Authorization header) → HTTP 200, Content-Type ∋ "text/html"
  3. GET /chat         (no Authorization header) → HTTP 200, Content-Type ∋ "text/html"
  4. GET /assets/<first file in web/assets/> (no auth) → HTTP 200
  5. GET /api/projects (no Authorization header) → HTTP 401
  6. File check: grep web/assets/*.js for 'localhost:3100' and '127.0.0.1:3100' → 0 matches
```

Assertion 5 proves that adding static-route exemptions did NOT widen the API auth boundary.
Assertion 6 proves the baked-in absolute URL is absent from the rebuilt bundle.

`startTestServerWithAuth()` will be added to `code/src/testing/helpers/api_server_test_helper.js`.
Proposed isolation mechanism: pass `_testMode: true` to `start()`, which skips pin-check and
session-file write (same pattern as `_resetForTest` in `secret_provider.js`).

---

## §4 Closure Gate

| # | Condition |
|---|-----------|
| 1 | Step 0 pre-flight passes (web/index.html present, web/assets/ non-empty; all API paths start with `/`; §ARC path confirmed or L2 confirmed) |
| 2 | S216 all 6 assertions GREEN (including assertion 6: no localhost:3100 in built assets) |
| 3 | Full SU suite: 211 passed / 0 failed / 5 skipped (216 total scenarios) |
| 4 | `apiServer.js` auth-gate diff matches §2.2 exactly — no wider change |
| 5 | Manual smoke: `curl http://127.0.0.1:3100/` returns HTML (200) with Forge token in env |
| 6 | `progress/status.json` updated; this artifact's status set to CLOSED |

---

## §5 Files to Touch

| File | Change |
|------|--------|
| `code/src/workspace/apiServer.js` | Auth-gate fix (§2.2) + `isWithin` helper + three static handlers (§2.3) — ≈ 50 lines added |
| `web/apps/forge-workspace/src/api/base.ts` | `getApiBase()` fallback: `'http://localhost:3100'` → `''` (one line) |
| `web/index.html` + `web/assets/*.js` | Rebuilt output — baked absolute URL replaced by relative; existing hashed chunks replaced by new build |
| `code/src/testing/helpers/api_server_test_helper.js` | Add `startTestServerWithAuth()` — ≈ 25 lines |
| `code/src/testing/scenarios/S216_auth_gate_exempts_static_routes_when_token_active.json` | New scenario |
| `progress/status.json` | Add `phase_13_7` block; update `last_completed_artifact`, `last_updated` |

---

## §6 Constraints

- **Track A:** `code/src/workspace/apiServer.js` and its test helper. **Limited frontend change:**
  `base.ts` only (`getApiBase()` fallback, one line) + frontend rebuild. No structural React
  change; no new components; no routing change. The frontend remains exempt from Track A's
  L2/permission constraints — it is pure TypeScript with no direct fs/shell access.
- **§ARC ledger:** The §ARC classification of the static file-read path will be verified at
  Step 0 against the actual ledger entries. The **preferred path is L2-tool reads**
  (`reg.invoke("fs.read_file", ...)`) for both `web/index.html` and `web/assets/*` — this
  eliminates the §ARC question entirely since all file I/O would pass through the registered
  tool layer as required by L2. If a blocker is found with the L2 path (e.g. permission scope
  incompatibility), the direct-`fs.readFileSync` path will be evaluated against the actual
  §ARC ledger at that time; if it requires a new §ARC entry, the phase STOPS and a separate
  decision artifact is raised before proceeding. The ledger count of 6 is not assumed to stay
  at 6 — it is confirmed or updated at Step 0.
- **No new npm dependencies.**
- **No TypeScript.** Backend is Vanilla Node.js / CommonJS (`"use strict"`).
- **Test-first (§11.5):** S216 written and confirmed RED before `apiServer.js` is changed.
- **One diff per turn:** auth-gate change and static handlers are reviewed together in one turn
  (they are logically inseparable — the exemption is meaningless without the handlers it unlocks).

---

## §7 Open Questions — RESOLVED by CTO (2026-05-23)

**OQ-1 — `start()` isolation for tests:** RESOLVED.
Use `{ _testMode: true }` option parameter — NOT an env var. Env var is global state that can
leak between scenarios or persist after a test; the option is explicit, scoped, and
self-clearing. Consistent with the existing `_resetForTest` pattern in `secret_provider.js`.

**OQ-2 — `window.__FORGE_API_BASE__` injection:** RESOLVED — no regression risk.
The injection being vestigial was already documented in Stage 13.5 §4 and its mid-checkpoint.
React reads `import.meta.env.VITE_API_BASE` baked at build time. `apiServer.js` correctly does
not inject it. The custom-port limitation is a known Stage 13.5 deferred item, not a 13.7
regression.

---

## §8 Suggested Staging

| Stage | Work |
|-------|------|
| 13.7-0 | Step 0 pre-flight: verify `web/index.html` present + `web/assets/` non-empty; verify all `apiFetch` path args start with `/`; confirm §ARC path (L2 preferred); OQs already resolved |
| 13.7-1 | Write S216 (6 assertions); confirm RED; write `startTestServerWithAuth()` in test helper |
| 13.7-2 | Apply auth-gate fix + `isWithin` helper + static handlers to `apiServer.js`; change `base.ts`; rebuild frontend; S216 → GREEN; full suite; manual curl smoke |
| 13.7-3 | Closure artifact; update `progress/status.json` |

---

**CTO review complete (2026-05-23). Awaiting owner `APPROVED` signal before Stage 13.7-0 begins.**

**END OF DECISION DRAFT**
