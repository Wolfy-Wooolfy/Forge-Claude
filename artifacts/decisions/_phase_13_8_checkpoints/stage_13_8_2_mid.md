# Stage 13.8-2 — Mid-Checkpoint
> **Status:** COMPLETE — awaiting Stage 13.8-3 (D:\ForgeAI re-provision + real-world verification)
> **Date:** 2026-05-24

---

## Scope completed

### Backend — HTML token injection (apiServer.js)
- Added `_injectForgeToken(html, token)` (module-level function, line ~50)
- **Handler A** (`GET /` and `GET /index.html`): injects `<script>window.__FORGE_TOKEN__="TOKEN";</script>`
  into `<head>` BEFORE the first `<script type="module">` tag. Falls back to before `</head>`.
- **Handler C** (SPA fallback — `/chat`, `/projects`, `/vision`, `/kb`, `/doctor`): same injection.
- Injection only fires when `_activeToken !== null` (server started via `start()`, not bare test listener).
- Token comes directly from the `_activeToken` closure — no extra file read per request.

### Frontend — auth wiring (TypeScript strict, zero `any`)
- **`auth.ts`**: Added `declare global { interface Window { __FORGE_TOKEN__?: string } }`,
  module-level `_token: string | null = null`, and `getToken(): string | null` (lazy init from window).
- **`base.ts`**: Imports `getToken` from `./auth`. `apiFetch` now builds headers as
  `Record<string, string>` including `Authorization: Bearer <token>` when token is non-null.
- **`chat.ts`**: Imports `getToken` from `./auth`. `chatStream` adds `Authorization: Bearer <token>`
  header when token is non-null.
- Circular import (`base.ts` ↔ `auth.ts`): safe — both export only functions, no init-time calls.

### Install scripts — in-place model
- **`INSTALL_FORGE.bat`** rewritten:
  - Removed: drive detection (D:\ vs C:\), git check, git clone/pull step.
  - Added: Step 1 validates `package.json` + `ecosystem.config.js` exist in `%~dp0`.
  - All paths use `%ROOT%` (= `%~dp0`). One copy of code — no sync gap.
  - Steps renumbered: 8 steps (was 10).
- **`RUN_FORGE.bat`**: no change (already uses `%~dp0`).
- **`STOP_FORGE.bat`**: no change.

### Frontend rebuild
- `npm run build` → exit 0
- `tsc -b` → 0 errors (zero `any` confirmed by TypeScript strict)
- Bundle (raw): index-Dum7ZWtE.js (58.34 kB) + vendor-D0xakLYA.js (163.49 kB) + CSS (15.36 kB) = 237.19 kB total
- Bundle (gzip): 76.19 kB — well under 500 kB budget
- New module file hash: `index-Dum7ZWtE.js` (was `index-DWIuvs7j.js`, hash changed by auth imports)

---

## Test results

```
Command: node bin/forge-test.js --scenario S217
✓  S217   GET / — HTML contains window.__FORGE_TOKEN__ in <head> before module script
ALL PASS — 1 passed, 0 failed, 0 skipped (1 total)
duration: 485ms
```

```
Command: node bin/forge-test.js  (full suite)
S216 ✓  S217 ✓  all others ✓
ALL PASS — 212 passed, 0 failed, 5 skipped (217 total)
duration: 74975ms
```

---

## Files modified

| File | Change |
|---|---|
| `code/src/workspace/apiServer.js` | `_injectForgeToken` function; Handler A + C inject token |
| `code/src/testing/helpers/api_server_test_helper.js` | `_parseSessionToken` + S217 helper (Stage 13.8-1 fix carried) |
| `web/apps/forge-workspace/src/api/auth.ts` | `getToken()` + global Window declaration |
| `web/apps/forge-workspace/src/api/base.ts` | Import `getToken`; Authorization header in `apiFetch` |
| `web/apps/forge-workspace/src/api/chat.ts` | Import `getToken`; Authorization header in `chatStream` |
| `web/index.html` | Rebuilt (new module hash `index-Dum7ZWtE.js`) |
| `web/assets/index-Dum7ZWtE.js` | New built bundle |
| `INSTALL_FORGE.bat` | In-place model: no clone, validates root, uses `%~dp0` |

---

## Stage 13.8-3 — what's next

Per §3 of the DECISION:
1. Stop Forge (`pm2 delete all`, kill port 3100 processes)
2. Backup `D:\ForgeAI\.env`, `artifacts/projects/`, `progress/` to a safe location
3. Owner confirms backup before any deletion
4. Delete `D:\ForgeAI`
5. Re-provision from current dev tree (run INSTALL_FORGE.bat from `D:\S\Halo\Tech\Forge-Claude`)
6. Restore `.env`, `artifacts/projects/`, `progress/`
7. Real-world verification: owner opens `http://127.0.0.1:3100`, sends a real chat message, gets a real response
8. Phase closure artifact + status.json update

---

**Stage 13.8-2 is code-complete. STOP — awaiting CTO confirmation before Stage 13.8-3.**
