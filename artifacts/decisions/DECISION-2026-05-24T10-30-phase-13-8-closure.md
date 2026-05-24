# DECISION-2026-05-24T10-30-phase-13-8-closure

> **Type:** Phase Closure Artifact
> **Status:** DRAFT — pending Stage 13.8-7 owner reboot-test screenshot
> **Authored:** 2026-05-24
> **Authority:** PHASE-13.8 activation decision
>   `DECISION-2026-05-23T20-00-phase-13-8-frontend-auth.md`
> **Predecessor:** PHASE-13.7 closure
>   `DECISION-2026-05-23T18-30-phase-13-7-closure.md`

---

## 1. What PHASE-13.8 delivered

PHASE-13.8 closed two distinct gaps that prevented Forge from being
usable end-to-end on the owner's machine:

### Gap A — Frontend authentication (Stages 13.8-0 → 13.8-2)

The React workspace loaded (static routes exempt from auth gate) but
every API call returned 401. Root cause: the frontend never sent an
`Authorization` header; the token was available in `web/.forge-session`
but HTTP-blocked.

**Fix:** HTML token injection. `apiServer.js` Handler A (`GET /` and
`GET /index.html`) injects:

```html
<script>window.__FORGE_TOKEN__="HEX64...";</script>
```

into `<head>` BEFORE the `<script type="module">` tag. The React app
reads `window.__FORGE_TOKEN__` at module load time via `auth.ts::getToken()`.
`apiFetch` and `chatStream` attach `Authorization: Bearer <token>` on every
call. Token stored in-memory — no localStorage, no cookies.

Install scripts rewritten to in-place model: `INSTALL_FORGE.bat` no longer
`git clone`s; runs from `%~dp0`. One copy of code, no sync gap.

### Gap B — Robust startup (Stages 13.8-3 → 13.8-6)

`OPENAI_API_KEY` never reached `process.env` when the Task Scheduler
booted `node start-api.js` — the `.env` file was present but unread.

**Fix:**
1. `code/src/startup/env_loader.js` — hand-rolled `.env` parser, called
   in `start-api.js` lines 16–17 before `apiServer` is required. Ambient
   env wins (pm2's `FORGE_API_PORT=3100` is preserved even if `.env`
   had `4100`).
2. `.env` hygiene — stale `FORGE_API_PORT=4100` and `FORGE_WEB_PORT=4000`
   lines removed from owner's `.env`.
3. `INSTALL_FORGE.bat` updated to call `scripts/service/windows_task_scheduler_install.bat`
   instead of writing `forge-resurrect.bat`. Stale `forge-resurrect.bat`
   removed from Windows Startup folder.
4. `RUN_FORGE.bat` EPERM self-heal — when pm2 ping reveals broken daemon
   (EPERM/rpc.sock), kills only the pm2 daemon PID from `~/.pm2/pm2.pid`
   via `taskkill /F /PID`; never `taskkill /IM node.exe`.

---

## 2. Scenarios added

| Scenario | Description | Status |
|---|---|---|
| S217 | `html_token_injection_in_head` — `GET /` HTML contains `window.__FORGE_TOKEN__` in `<head>` before module script; API call with extracted token → 200; without → 401 | PASS ✅ |
| S218 | `env_key_loads_from_dotenv` — boot with no ambient `OPENAI_API_KEY` + `.env` present → key loads | PASS ✅ |
| S219 | `env_port_conflict_ambient_wins` — `FORGE_API_PORT=4100` in `.env`, ecosystem sets 3100 → effective port stays 3100 | PASS ✅ |

---

## 3. §ARC ledger

| Change | Detail |
|---|---|
| §ARC count before | 6 |
| §ARC count after | 7 |
| §ARC-7 | `code/src/startup/env_loader.js` — `loadDotEnv` `fs.readFileSync` (pre-runtime bootstrap; Tool Runtime not yet loaded) |
| Decision artifact | `DECISION-2026-05-24T10-00-arc-7-env-loader-fs-exception.md` |
| Ledger updated | `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` §ARC table, row §ARC-7 appended |

---

## 4. Files created / modified

### New files
- `code/src/startup/env_loader.js`
- `code/src/testing/scenarios/S217_html_token_injection_in_head.json`
- `code/src/testing/scenarios/S218_env_key_loads_from_dotenv.json`
- `code/src/testing/scenarios/S219_env_port_conflict_ambient_wins.json`
- `artifacts/decisions/DECISION-2026-05-24T10-00-arc-7-env-loader-fs-exception.md`
- `artifacts/decisions/_phase_13_8_checkpoints/stage_13_8_3.md`
- `artifacts/decisions/_phase_13_8_checkpoints/stage_13_8_6.md`
- `artifacts/decisions/_phase_13_8_checkpoints/stage_13_8_7.md` (reboot checklist)
- `artifacts/decisions/DECISION-2026-05-24T10-30-phase-13-8-closure.md` (this file)

### Modified files (Stages 13.8-0 → 13.8-2)
- `code/src/workspace/apiServer.js` — `_injectForgeToken` function; Handler A + C
- `code/src/testing/helpers/api_server_test_helper.js` — S217 helper
- `web/apps/forge-workspace/src/api/auth.ts` — `getToken()` + Window declaration
- `web/apps/forge-workspace/src/api/base.ts` — Authorization header in `apiFetch`
- `web/apps/forge-workspace/src/api/chat.ts` — Authorization header in `chatStream`
- `web/index.html` — rebuilt (new module hash)
- `INSTALL_FORGE.bat` — in-place model (no clone, validates root, uses `%~dp0`)

### Modified files (Stages 13.8-3 → 13.8-6)
- `start-api.js` — lines 16–17: `loadDotEnv` call before apiServer
- `INSTALL_FORGE.bat` — Task Scheduler wired; no forge-resurrect.bat
- `RUN_FORGE.bat` — EPERM self-heal block
- `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` — §ARC-7 row appended

---

## 5. Full SU suite result

```
node bin/forge-test.js  (run 2026-05-24)
213 passed, 1 failed (S191), 5 skipped — 219 total
duration: ~78s
exit code: 1 (expected — S191 is a known environment delta)
```

**S191** — `windows_task_scheduler_install.bat structure: LogonType S4U`
- This is a known environment delta (listed in project-closure artifact).
  The test checks for `LogonType S4U` in the Task Scheduler XML which requires
  a specific Windows environment configuration not present in the test runner.
  This failure pre-exists PHASE-13.8 and is NOT a regression.
- `unexpected_fail: 0` — no new FAILs introduced by this phase.

**S208** — Updated in this phase: `arc_count_equals_six` assertion renamed to
`arc_count_equals_seven` (stale guard after §ARC-7 addition). S208 now PASS ✅.

Known environment deltas (NOT regressions — documented in project-closure artifact):
- S120/121/124/125/126/127 — builtproject.run_scenarios (needs local HTTP server)
- S137 — kb.retrieve (LanceDB)
- S191 — windows_task_scheduler LogonType S4U (Windows environment delta)
- S48 — pkg.install npm (needs real network install)
Note: S120–127/S137/S48 passed in this Windows run; only S191 failed.

---

## 6. Closure gate status

| Gate item | Status |
|---|---|
| §ARC-7 decision artifact written; ledger 6 → 7 | ✅ DONE |
| Closure artifact + checkpoints 13.8-3 + 13.8-6 written | ✅ DONE |
| `status.json` `phase_13_8` block present, additive, `last_updated` set | ✅ DONE |
| Full `node bin/forge-test.js` — recorded, no unexpected FAIL | ✅ DONE (213/1/5, S191 known) |
| Stage 13.8-7 checklist written and handed to CTO | ✅ DONE |
| **Closure artifact status: DRAFT** — pending owner reboot-test screenshot | 🔴 DRAFT |

**This artifact remains DRAFT until the owner executes Stage 13.8-7 and provides a screenshot confirming a real AI response after a cold Windows reboot.**

---

## 7. Risk after closure

| Risk | Severity | Notes |
|---|---|---|
| Task Scheduler path drift | LOW | Runs `node start-api.js` from dev tree; path is fixed at install time |
| `.env` re-acquiring stale lines | LOW | Owner must not re-add `FORGE_API_PORT` or `FORGE_WEB_PORT` |
| pm2 EPERM recurrence | LOW | Self-heal in `RUN_FORGE.bat` handles it; Task Scheduler path avoids it entirely |

---

**END OF DECISION — STATUS: DRAFT**
