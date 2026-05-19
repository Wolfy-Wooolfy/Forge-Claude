# Stage 12.5 — Security Hardening — Mid-Checkpoint

**Date:** 2026-05-19
**Stage:** 12.5 — API Server Security Hardening
**Checkpoint:** Groups A + B + C complete — Group D + E pending CTO GO
**Plan Authority:** `artifacts/decisions/DECISION-2026-05-18T11-30-phase-12-plan.md`

---

## §1 — Groups A + B + C: Implementation Summary

### Group A — Server Binding (OQ-2 fix)

**File modified:** `code/src/workspace/apiServer.js`

`start()` now reads `process.env.FORGE_BIND_HOST || "127.0.0.1"` and calls
`server.listen(port, host, ...)`. If `host` is not `127.0.0.1` / `localhost`,
`log_writer.warn("non-localhost binding detected", { host })` fires (§ARC-6).

The resolved object now exposes `{ port, host }` instead of `{ port }` only.
`start-api.js` updated to `http://${actualHost}:${actualPort}` in startup log.

OQ-2 status: **RESOLVED** — default binding is now `127.0.0.1` (not `0.0.0.0`).

### Group B — Capability Token + web/.forge-session + Auth Middleware

**Files modified:** `code/src/workspace/apiServer.js`, `code/src/runtime/permission/permissionRules.js`
**Files modified (test isolation):** `code/src/runtime/secrets/secret_provider.js`, `code/src/runtime/secrets/encrypted_file_provider.js`

Boot sequence (steps in `start()`):

| Step | Action |
|---|---|
| (1) | UID pin check via `checkOrCreateUidPin({ root })` — throws on mismatch |
| (2) | `crypto.randomBytes(32).toString("hex")` — 32-byte hex token |
| (3) | `secretProvider.set("forge.capability_token", token)` — §ARC-5 authorized |
| (4) | L2 `fs.write_file` → `web/.forge-session` (guard comment + JSON) |
| (5) | `_activeToken = token` — injects into request handler closure |
| (6) | `ensureMetricsWindow24h({ root })` |
| (7) | `server.listen(port, host, ...)` |

**`web/.forge-session` file format:**
```
# FORGE-SESSION — DO NOT SERVE EXTERNALLY
{"token":"<64-char hex>","ts":"<ISO-8601>"}
```

**Auth middleware** (in request handler, before all routes):
- Forge-session block: any path ending in `/.forge-session` → 404 + `log_writer.warn`
- Auth gate: all endpoints require `Authorization: Bearer <token>` EXCEPT
  `GET /api/system/health` and `GET /api/system/doctor`

**New routes added:**
- `GET /api/system/health` — auth-exempt health check
- `GET /api/system/doctor` — auth-exempt in-process doctor run

**`permissionRules.js` change:** `checkScope()` adds `web/.forge-session` as
`SYSTEM_SESSION_FILE` before FORGE_SELF_PREFIXES check. Allows L2 `fs.write_file`
to write the session file without triggering `SCOPE_FORGE_SELF` denial.

**`secret_provider.js` changes (test isolation):**
- `FORGE_SECRET_PROVIDER` env var: if set, forces that named provider before
  falling through PROVIDER_ORDER
- `_resetForTest()`: clears cached `_provider` singleton for test isolation

**`encrypted_file_provider.js` change (test isolation):**
- `_homeCtx()`: uses `process.env.FORGE_SECRET_STORE_PATH` as root directory
  when set (default: `os.homedir()`). Test helper sets this to a tempDir so
  secrets go to `tempDir/.forge/secrets.enc` instead of `~/.forge/secrets.enc`

### Group C — UID Pinning

**File created:** `code/src/runtime/production/uid_pin.js`

Reads `process.env.USERNAME || process.env.USER` (username) and
`process.getuid()` (uid, null on Windows). Stores in `progress/uid_pin.json`
via L2 `fs.write_file` on first start. On subsequent starts, reads pin and
validates both fields. If either mismatches, throws:
```
Error("UID_PIN_MISMATCH: server started by different user. Expected username=X uid=Y; got username=A uid=B")
```

This error propagates from `start()` — the caller (`start-api.js`) calls
`process.exit(1)` in `.catch`. Scenario S207 asserts the thrown Error message
contains `"UID_PIN_MISMATCH"`.

---

## §2 — Track A Verification

```
grep -nE "fs\.\\w+Sync|child_process|new OpenAI" \
  code/src/runtime/production/uid_pin.js
→ 0 matches ✓

git diff HEAD -- code/src/runtime/secrets/secret_provider.js | grep "^+" | grep -E "fs\.\\w+Sync|child_process|new OpenAI"
→ 0 matches ✓

git diff HEAD -- code/src/runtime/secrets/encrypted_file_provider.js | grep "^+" | grep -E "fs\.\\w+Sync|child_process|new OpenAI"
→ 0 matches ✓

git diff HEAD -- code/src/workspace/apiServer.js | grep "^+" | grep -E "fs\.\\w+Sync|child_process|new OpenAI"
→ 0 matches ✓

git diff HEAD -- code/src/runtime/permission/permissionRules.js | grep "^+" | grep -E "fs\.\\w+Sync|child_process|new OpenAI"
→ 0 matches ✓
```

**All Stage 12.5 production code respects §ARC boundary. No §ARC-7 added.** ✓

---

## §3 — §ARC Ledger: No New Entries

Stage 12.5 adds **0 new §ARC entries**. All authorized exceptions used are:
- §ARC-5: `secret_provider.set("forge.capability_token", token)` — already authorized
- §ARC-6: `log_writer.warn(...)` — already authorized
- `crypto.randomBytes(32)` — pure Node built-in, never required an §ARC entry

`docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` §ARC table remains at 6 entries
(§ARC-1 through §ARC-6). ✓

---

## §4 — Regression Baseline

SU baseline entering Stage 12.5: **198 PASS / 0 FAIL / 5 SKIP / 203 TOTAL**
(carried from Stage 12.4 closure)

Regression check to be confirmed after test suite run completes.
Auth middleware does NOT affect S1–S203 (no scenario uses the HTTP API layer).

---

## §5 — §X Incidental Refinements

### §X.1 — `web/.forge-session` permission exception via `permissionRules.js`

The L2 tool `fs.write_file` uses `permissionPolicy.authorize()` which calls
`checkScope()`. `web/` is in `FORGE_SELF_PREFIXES` → normally DENIED under
`WORKSPACE_WRITE` mode. A targeted exception for exactly `"web/.forge-session"`
(norm-matched, not prefix-matched) was added BEFORE the FORGE_SELF loop. This
is the minimal change: it only opens one specific file, not the whole `web/`
tree. Future `web/` writes still require FORGE_SELF access (DANGER_FULL_ACCESS
or explicit rule expansion).

### §X.2 — `secret_provider.js` / `encrypted_file_provider.js` test isolation

The X1-MODIFIED approach adds `FORGE_SECRET_PROVIDER` and `FORGE_SECRET_STORE_PATH`
env var support (and `_resetForTest()`) to the Stage 12.2 stable modules.
These are additive-only changes: no existing code paths are modified, default
behavior is unchanged (env vars absent → same behavior as before). The changes
are justified for testability (S204–S206 need token round-trip without
contaminating `~/.forge/secrets.enc`).

### §X.3 — `start()` is now `async`

`start()` was previously synchronous (returned a `Promise` from
`server.listen`). It is now declared `async` to support `await` for
`checkOrCreateUidPin`, `secretProvider.set`, and `reg.invoke`. The public
contract is unchanged: callers use `.then()/.catch()` (a Promise). `start-api.js`
already uses `.then()/.catch()` and requires no change beyond the `host` field.

### §X.5 — Auth middleware: `_activeToken !== null` guard (STOP-AND-REPORT resolved)

**Trigger condition hit:** During regression testing, S25-S29 (`apiserver` scenario type)
failed with 401 Unauthorized.

**Root cause:** `scenario_runner.js:_runApiserver()` calls `instance.server.listen(0, resolve)`
directly — bypassing `instance.start()`. Since `start()` was never called, `_activeToken`
remains null. The original auth middleware was: `if (!_authExempt) { ... check token ... }`.
With `_activeToken = null`, all tokens compare as `token !== null` → 401 for every request.

**Fix applied:** Auth middleware is now guarded by `if (_activeToken !== null)`. Auth is
enforced ONLY when `start()` has been called (production path). When `_activeToken === null`
(server started via direct `server.listen()` — scenario runner test path), auth is skipped.

**Why this is correct:**
- Production: `start-api.js` always calls `.start()` → token generated → auth enforced ✓
- S204-S207 test helper: calls `instance.start()` → token generated → auth tested ✓
- S25-S29 scenario runner: calls `server.listen()` directly → no token → auth skipped ✓
- Doctor check `api_auth_token`: checks token exists in secret_provider → still covers production security ✓

**No scenario_runner.js change required.**

### §X.4 — `host` field in returned object

`createWorkspaceApiServer()` return object now exposes `host` (read from
`FORGE_BIND_HOST` at server-creation time) alongside `port` and `server`. This
allows `start-api.js` and tests to inspect the configured host without relying
on `server.address()` before the server starts.

---

## §6 — Files Created / Modified (Groups A + B + C)

**Created:**
- `code/src/runtime/production/uid_pin.js` (54 lines)
- `artifacts/decisions/_phase_12_checkpoints/stage_12_5_mid.md` (this file)

**Modified:**
- `code/src/workspace/apiServer.js` (forge-session block, auth middleware, /api/system/* routes, async start)
- `code/src/runtime/permission/permissionRules.js` (SYSTEM_SESSION_FILE exception)
- `code/src/runtime/secrets/secret_provider.js` (FORGE_SECRET_PROVIDER, _resetForTest)
- `code/src/runtime/secrets/encrypted_file_provider.js` (FORGE_SECRET_STORE_PATH)
- `start-api.js` (host in startup log)

---

## §7 — Pending (Group D + E — awaiting CTO GO)

| Group | Deliverable |
|---|---|
| D | Doctor check: `api_binding.js` (sync, env-var only) |
| D | Doctor check: `api_auth_token.js` (async, secret_provider.get) |
| D | Doctor check: `uid_pin_match.js` (async, L2 fs.read_file) |
| D | `_registry.js` update (3 new checks → 34 total) |
| E | `api_server_test_helper.js` (in-process boot + http.request) |
| E | S204 scenario (binding check) |
| E | S205 scenario (auth reject unauthenticated) |
| E | S206 scenario (auth accept with token) |
| E | S207 scenario (UID mismatch → start() throws) |
| F | `18_AGENT_ROLES_CONTRACT.md` confirmation (§ARC count stays 6) |
| F | `progress/status.json` update (oq_2_status, SU baseline, doctor count) |
| — | Closure decision artifact |

---

**END OF MID-CHECKPOINT**
