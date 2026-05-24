# DECISION-2026-05-23T20-00-phase-13-8-frontend-auth

> **Type:** Phase Activation Decision — Corrective (post-closure)
> **Status:** APPROVED — owner approved in chat 2026-05-23
> **Authored:** 2026-05-23
> **Authority:** Blueprint Part H + PHASE-13.7 closure
> **Predecessor:** PHASE-13.7 — Production Auth-Gate Fix — CLOSED
> **Step-0 correction:** 2026-05-24 — Stage 13.8-0 analysis corrected §1 and §2
>   (CTO confirmed correction; see §1 errata below)

---

## 1. Why this phase exists

PHASE-13.7 made the React workspace shell reachable (static routes
exempt from the auth gate). But the workspace is still not usable:
the first real API call — sending a chat message — returns
`{"error":"Unauthorized"}`.

Root cause (verified by the CTO, corrected by Stage 13.8-0 analysis):
- The backend auth gate protects every `/api/*` route: a request
  without a valid `Authorization` token gets 401.
- **Actual exempt API routes (verified by grep):**
  `GET /api/system/health` and `GET /api/system/doctor` only.
  All other `/api/*` routes — including `/api/auth/login` and
  `/api/auth/register` — require a valid Bearer token.
- **CTO artifact §1 errata:** The original decision stated that
  `/api/auth/login` and `/api/auth/register` were the only exempt
  API routes. This was wrong — they are NOT exempt. They appear
  AFTER the auth gate in `apiServer.js` (line 1952) and are
  unreachable without a valid token. The "frontend logs in" path
  is impossible. This error was caught in Stage 13.8-0 analysis
  and confirmed by the CTO.
- The frontend's `apiFetch` sends only `Content-Type`. It attaches
  NO token, NO `Authorization` header. The `chat.ts` stream call
  is the same.
- The token IS available: `start()` writes it to `web/.forge-session`
  as JSON `{ token, ts }` on every server boot. HTTP access to
  `.forge-session` paths is blocked (404) by the server itself.

So: the backend is ready for auth; the frontend never authenticates.
The workspace loads (static, exempt) but every feature fails.

## 2. Scope

### IN
- **Auto-authentication.** Forge is a single-owner, local tool. The
  frontend authenticates automatically — no login screen on every
  open. On load, the app obtains a valid token and uses it.
- **Token acquisition — confirmed mechanism (Stage 13.8-0):**
  Handler A (`GET /` and `GET /index.html`) injects the token into
  the served HTML as a `<script>` tag in `<head>`, BEFORE the React
  module script tag:
  ```html
  <script>window.__FORGE_TOKEN__="HEX64...";</script>
  ```
  The React app reads `window.__FORGE_TOKEN__` at module load time
  via `auth.ts::getToken()`. This is the only safe mechanism given
  that `/api/auth/login` is behind the auth gate and `.forge-session`
  is HTTP-blocked.
- **Token storage** in-memory (module-level variable in `auth.ts`).
  No localStorage, no sessionStorage, no cookies. Refreshing the page
  re-injects from the current server token.
- **Injection timing:** The `<script>` tag is injected into `<head>`
  BEFORE the `<script type="module">` tag. This guarantees
  `window.__FORGE_TOKEN__` is set before any React code executes,
  with no ordering dependency on module defer semantics.
- **`apiFetch` attaches the token.** Every call through `apiFetch`
  and the `chat.ts` stream sends `Authorization: Bearer <token>`.
- **Install-script cleanup.** `INSTALL_FORGE.bat` currently
  `git clone`s the repo into `D:\ForgeAI` — a SECOND copy of the
  code, separate from the dev tree. This is why `D:\ForgeAI` runs
  stale code. Change: the install script no longer clones; it runs
  in place (the directory where it is invoked from, `%~dp0`). One
  copy, no sync gap. `RUN_FORGE.bat` already uses `%~dp0` — no
  change needed.
- **Clean re-provision of `D:\ForgeAI`.** Because `D:\ForgeAI` holds
  a stale clone, it must be cleared and re-provisioned from current
  code. THIS MUST PRESERVE owner data — see §3.

### OUT
- No backend auth-logic change. The auth gate and `/api/auth/*`
  endpoints work; this phase wires the frontend to them.
- No new backend endpoints.
- No login UI (auto-auth chosen — a login screen is explicitly out).

## 3. `D:\ForgeAI` re-provision — data preservation (MANDATORY)

`D:\ForgeAI` is the running install. Before it is cleared it MUST
be backed up — it contains owner data NOT present in the dev tree:
- `.env` — the OpenAI API key.
- `artifacts/projects/**` — any projects worked on inside Forge.
- `progress/` — runtime state.
- `progress/uid_pin.json`, any secrets / keychain-backed material.

Procedure (Claude Code executes, owner approves the destructive step):
1. Stop Forge and free port 3100: `pm2 delete all`, `pm2 kill`, and
   kill any node process holding the port.
2. Copy `D:\ForgeAI\.env`, `artifacts/projects/`, `progress/` to a
   safe backup location OUTSIDE `D:\ForgeAI`.
3. Delete `D:\ForgeAI`.
4. Re-provision from current code via the corrected install script
   (in-place model, run from the dev tree directory).
5. Restore `.env`, `artifacts/projects/`, `progress/` into the new
   install.
6. Confirm Doctor sees the restored state (OpenAI key present,
   prior projects intact).
NEVER delete `D:\ForgeAI` before the backup in step 2 is confirmed.

## 4. Track A

`apiFetch` / `auth.ts` / views — frontend, Track A exempt
(TypeScript strict, zero `any`). The install scripts are not Forge
runtime code. No backend file changes — §ARC stays 6.

## 5. Staging

| Stage | Content |
|---|---|
| 13.8-0 | Step 0: establish token mechanism, injection timing, install model. **CONFIRMED 2026-05-24** |
| 13.8-1 | Write the auth scenario FIRST, confirm RED: HTML injection absent → assertion fails. |
| 13.8-2 | Wire frontend auth (HTML injection in Handler A + `apiFetch`/`chatStream` + `auth.ts`); correct install scripts; rebuild frontend; scenario → GREEN. |
| 13.8-3 | `D:\ForgeAI` backup + clean re-provision per §3. Closure. |

## 6. Closure gate — deterministic

1. The auth scenario (S217) PASSES: `GET /` HTML contains
   `window.__FORGE_TOKEN__` in `<head>` before the module script;
   API call with extracted token returns 200; API call without
   returns 401 — proven RED before the fix, GREEN after.
2. `apiFetch` and the chat stream attach `Authorization: Bearer`.
3. `npm run build` exits 0; bundle < 500 KB; zero `any`.
4. Full SU suite — owner machine baseline holds, no regression.
5. Install scripts no longer clone; run in place. `D:\ForgeAI`
   re-provisioned; `.env` + projects + progress restored and
   confirmed by Doctor.
6. **Real-world verification (MANDATORY — the step every prior
   closure skipped):** the owner opens `http://127.0.0.1:3100` in a
   browser, sends a real chat message, and gets a real response —
   NOT `Unauthorized`. The phase does not close until the owner
   confirms this with a screenshot.
7. Closure artifact + checkpoints written; `status.json` advanced;
   project-closure artifact amended again to record PHASE-13.8.

## 7. Cost

Mock-only. No real API key needed for the work. Kill-bar $3.00.
Expected $0.00.

## 8. Approval

Approved by the owner in chat 2026-05-23. PHASE-13.8 authorized.
Stage 13.8-0 confirmed by CTO 2026-05-24 with injection-timing
tightening (inject in `<head>` before module script).

---

**END OF DECISION**
