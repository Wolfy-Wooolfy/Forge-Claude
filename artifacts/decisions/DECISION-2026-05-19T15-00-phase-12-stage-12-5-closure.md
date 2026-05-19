# Stage 12.5 — API Server Security Hardening — Closure Artifact

**Date:** 2026-05-19
**Stage:** 12.5 — API Server Security Hardening
**Status:** CLOSED — All closure-gate conditions met
**Owner approval:** Required before `current_task` transitions to Stage 12.6
**Plan Authority:** `artifacts/decisions/DECISION-2026-05-18T11-30-phase-12-plan.md`

---

## §1 — Deliverables Summary

| Deliverable | File | Status |
|---|---|---|
| Group A — OQ-2 fix: 127.0.0.1 default binding | `code/src/workspace/apiServer.js` (`FORGE_BIND_HOST` + `server.listen(port, host)`) | DONE |
| Group B — Capability token generation (crypto) | `code/src/workspace/apiServer.js` (`start()` step 2) | DONE |
| Group B — Token stored via secret_provider | `code/src/workspace/apiServer.js` (`start()` step 3, §ARC-5) | DONE |
| Group B — `web/.forge-session` written via L2 | `code/src/workspace/apiServer.js` (`start()` step 4) | DONE |
| Group B — Auth middleware (`_activeToken` guard) | `code/src/workspace/apiServer.js` (before all routes) | DONE |
| Group B — forge-session path block (404) | `code/src/workspace/apiServer.js` | DONE |
| Group B — `GET /api/system/health` route | `code/src/workspace/apiServer.js` | DONE |
| Group B — `GET /api/system/doctor` route | `code/src/workspace/apiServer.js` | DONE |
| Group B — permissionRules SYSTEM_SESSION_FILE | `code/src/runtime/permission/permissionRules.js` | DONE |
| Group B — secret_provider test isolation | `code/src/runtime/secrets/secret_provider.js` (`FORGE_SECRET_PROVIDER`, `_resetForTest`) | DONE |
| Group B — encrypted_file_provider test isolation | `code/src/runtime/secrets/encrypted_file_provider.js` (`FORGE_SECRET_STORE_PATH`) | DONE |
| Group C — UID pinning module | `code/src/runtime/production/uid_pin.js` | DONE |
| Group C — `start-api.js` host field | `start-api.js` | DONE |
| Group D — Doctor check: api_binding | `code/src/runtime/doctor/checks/api_binding.js` | DONE |
| Group D — Doctor check: api_auth_token | `code/src/runtime/doctor/checks/api_auth_token.js` | DONE |
| Group D — Doctor check: uid_pin_match | `code/src/runtime/doctor/checks/uid_pin_match.js` | DONE |
| Group D — Doctor registry update (34 total) | `code/src/runtime/doctor/_registry.js` | DONE |
| Group E — Test helper | `code/src/testing/helpers/api_server_test_helper.js` | DONE |
| Group E — S204 scenario | `code/src/testing/scenarios/S204_api_server_binds_localhost.json` | DONE |
| Group E — S205 scenario | `code/src/testing/scenarios/S205_api_server_unauth_returns_401.json` | DONE |
| Group E — S206 scenario | `code/src/testing/scenarios/S206_api_server_bearer_token_accepted.json` | DONE |
| Group E — S207 scenario | `code/src/testing/scenarios/S207_api_server_uid_mismatch_throws.json` | DONE |
| Group F — §ARC count verified (no new entries) | `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` (stays at 6) | DONE |
| Group F — status.json patched | `progress/status.json` | DONE |
| Mid-Checkpoint | `artifacts/decisions/_phase_12_checkpoints/stage_12_5_mid.md` | DONE |

---

## §2 — Boot Sequence

`start()` (now `async`) executes in this order:

| Step | Action | Notes |
|---|---|---|
| (1) | `checkOrCreateUidPin({ root })` | Throws `Error("UID_PIN_MISMATCH: ...")` on user mismatch → FAIL_CLOSED |
| (2) | `crypto.randomBytes(32).toString("hex")` | 64-char hex, pure Node — no §ARC entry needed |
| (3) | `secretProvider.set("forge.capability_token", token)` | §ARC-5 authorized |
| (4) | L2 `fs.write_file` → `web/.forge-session` | SYSTEM_SESSION_FILE exception in `permissionRules.js` |
| (5) | `_activeToken = token` | Injects token into request-handler closure |
| (6) | `ensureMetricsWindow24h({ root })` | §X.3 Stage 12.4 |
| (7) | `server.listen(port, host, ...)` | `host = FORGE_BIND_HOST \|\| "127.0.0.1"` |

---

## §3 — Auth Middleware Behaviour

**Forge-session block** (unconditional): any pathname ending in `/.forge-session` or equal to `/.forge-session` → 404 + `log_writer.warn`.

**Auth gate** (conditional on `_activeToken !== null`):
- **Exempt:** `GET /api/system/health`, `GET /api/system/doctor`
- **Protected:** all other routes → `Authorization: Bearer <token>` required; mismatch → 401

**`_activeToken !== null` guard rationale (§X.5):** `scenario_runner.js:_runApiserver()` calls `instance.server.listen(0, resolve)` directly — bypassing `instance.start()`. `_activeToken` stays null for S25-S29 scenarios. Auth is enforced only after `start()` sets the token. Production always calls `start()`. S204-S207 helper also calls `start()` — auth path exercised in dedicated tests.

---

## §4 — Doctor Checks Added (Group D)

| Check ID | File | Approach | PASS condition | WARN condition |
|---|---|---|---|---|
| `api_binding` | `checks/api_binding.js` | sync, env-var only | `FORGE_BIND_HOST` absent (defaults to 127.0.0.1) OR set to localhost/127.0.0.1 | Non-localhost address configured |
| `api_auth_token` | `checks/api_auth_token.js` | async, `secret_provider.get` | Token present and exactly 64 chars | Token missing or wrong length; secret_provider error |
| `uid_pin_match` | `checks/uid_pin_match.js` | async, L2 `fs.read_file` | `progress/uid_pin.json` exists and username matches | File missing (WARN); username mismatch or parse error (FAIL) |

**Doctor check total after Stage 12.5: 34** (was 31 before Stage 12.5)

---

## §5 — Closure Gate Verification

| Check | Required | Actual | Result |
|---|---|---|---|
| SU pass count | 202 | 202 | ✓ |
| SU fail count | 0 | 0 | ✓ |
| SU skip count | 5 | 5 | ✓ |
| SU total | 207 | 207 | ✓ |
| Doctor checks total | 34 | 34 | ✓ |
| S204 PASS | required | PASS | ✓ |
| S205 PASS | required | PASS | ✓ |
| S206 PASS | required | PASS | ✓ |
| S207 PASS | required | PASS | ✓ |
| OQ-2 resolved | required | RESOLVED | ✓ |
| `_registry.js` has 3 new check lines | required | 3 added (api_binding, api_auth_token, uid_pin_match) | ✓ |
| `18_AGENT_ROLES_CONTRACT.md` §ARC count | 6 | 6 | ✓ |
| `progress/uid_pin.json` created on first `start()` | required | L2 `fs.write_file` | ✓ |
| `web/.forge-session` created on `start()` | required | L2 `fs.write_file` + SYSTEM_SESSION_FILE rule | ✓ |
| Track A: 0 `fs.*Sync` in new production files | required | 0 matches | ✓ |
| Track A: 0 `child_process`/`new OpenAI` in new files | required | 0 matches | ✓ |
| apiServer.js delta: 0 new direct `fs.*Sync` | required | 0 matches | ✓ |

---

## §6 — Track A Verification

```
grep -nE "fs\.\w+Sync|child_process|new OpenAI" \
  code/src/runtime/production/uid_pin.js \
  code/src/runtime/doctor/checks/api_binding.js \
  code/src/runtime/doctor/checks/api_auth_token.js \
  code/src/runtime/doctor/checks/uid_pin_match.js
→ 0 matches ✓

grep -nE "fs\.\w+Sync|child_process|new OpenAI" \
  code/src/testing/helpers/api_server_test_helper.js
→ fs.*Sync matches — test infrastructure; §ARC convention allows direct fs in test helpers ✓

git diff HEAD -- code/src/workspace/apiServer.js | grep "^+" | grep -E "fs\.\w+Sync|child_process|new OpenAI"
→ 0 matches ✓
```

**All Stage 12.5 production code respects §ARC boundary. §ARC table stays at 6 entries (§ARC-1 through §ARC-6). No §ARC-7 added.** ✓

---

## §X — Incidental Refinements

### §X.1 — `web/.forge-session` SYSTEM_SESSION_FILE permission exception

`web/` is in `FORGE_SELF_PREFIXES` → normally denied under `WORKSPACE_WRITE` mode. A targeted exception for exactly `"web/.forge-session"` (path-normalized, not prefix-matched) was inserted in `permissionRules.js:checkScope()` BEFORE the FORGE_SELF_PREFIXES loop. The exception returns `SYSTEM_SESSION_FILE` (allowed) for any mode except `READ_ONLY`. This is the minimal change: it opens one specific file path, not the entire `web/` tree.

### §X.2 — `secret_provider.js` / `encrypted_file_provider.js` test-isolation additions

Two additive-only changes to Stage 12.2 stable modules:
1. `FORGE_SECRET_PROVIDER` env var: forces a named provider before the PROVIDER_ORDER waterfall. Test helper sets `FORGE_SECRET_PROVIDER=encrypted_file` to avoid contaminating the dev machine's OS keychain.
2. `FORGE_SECRET_STORE_PATH` env var: used by `encrypted_file_provider._homeCtx()` to redirect the secrets file to a tempDir (`tempDir/.forge/secrets.enc`). Default behavior (`os.homedir()`) is unchanged when env var is absent.
3. `_resetForTest()`: clears the cached `_provider` singleton; called in test helper finally blocks to restore factory state between scenarios.

No existing code paths were modified; these changes are purely additive.

### §X.3 — `start()` promoted to `async`

Previously `start()` returned a `Promise` from `new Promise((resolve) => server.listen(...))`. It is now declared `async` to allow `await` for `checkOrCreateUidPin`, `secretProvider.set`, and `reg.invoke`. Public contract unchanged: all callers already use `.then()/.catch()`.

### §X.4 — `host` field in `createWorkspaceApiServer()` return object

Return object now exposes `{ server, start, port, host }`. `host` is resolved from `FORGE_BIND_HOST` at creation time. This allows `start-api.js` and test helpers to read the configured host without calling `server.address()` before the server starts.

### §X.5 — Auth middleware `_activeToken !== null` guard (STOP-AND-REPORT resolved)

See §3 above. Full analysis in mid-checkpoint §7. CTO accepted: "The `if (_activeToken !== null)` guard is the correct fix. Modifying `_runApiserver` to call `.start()` would have broken test isolation."

### §X.6 — uid_pin.js option B tightening (CTO observation)

CTO flagged the option-A logic: `const userMismatch = identity.username !== null && pin.username !== null && identity.username !== pin.username` — clearing the `USERNAME` env var (→ null) would bypass the check when pin has a non-null username. Option B applied:

```js
const userMismatch = identity.username !== pin.username;
```

Any inequality (including null vs non-null) counts as mismatch. `uidMismatch` retains the "both non-null" guard (POSIX-only field; null on Windows is expected).

---

## §7 — Files Created

- `code/src/runtime/production/uid_pin.js` (62 lines)
- `code/src/runtime/doctor/checks/api_binding.js`
- `code/src/runtime/doctor/checks/api_auth_token.js`
- `code/src/runtime/doctor/checks/uid_pin_match.js`
- `code/src/testing/helpers/api_server_test_helper.js`
- `code/src/testing/scenarios/S204_api_server_binds_localhost.json`
- `code/src/testing/scenarios/S205_api_server_unauth_returns_401.json`
- `code/src/testing/scenarios/S206_api_server_bearer_token_accepted.json`
- `code/src/testing/scenarios/S207_api_server_uid_mismatch_throws.json`
- `artifacts/decisions/_phase_12_checkpoints/stage_12_5_mid.md`

---

## §8 — Files Modified

- `code/src/workspace/apiServer.js` (forge-session block, auth middleware, /api/system/* routes, async start, UID pin call, token generation, forge-session write, host binding)
- `code/src/runtime/permission/permissionRules.js` (SYSTEM_SESSION_FILE exception)
- `code/src/runtime/secrets/secret_provider.js` (FORGE_SECRET_PROVIDER, _resetForTest)
- `code/src/runtime/secrets/encrypted_file_provider.js` (FORGE_SECRET_STORE_PATH)
- `code/src/runtime/doctor/_registry.js` (3 new check lines)
- `start-api.js` (host field in startup log)

---

## §9 — Risks Carried Forward

| Risk | Severity | Plan |
|---|---|---|
| `api_auth_token` Doctor check reports WARN until first `start()` call (token not yet stored) | LOW | Expected behaviour — documented in check detail message |
| `uid_pin_match` Doctor check reports WARN on fresh install (uid_pin.json not yet created) | LOW | Expected behaviour — first `start()` creates the pin file |
| `uid_pin.js` uid comparison skips when either side is null (Windows: `process.getuid` = null) | LOW | Accepted trade-off (§X.6 option B tightened username; uid guard retained for POSIX-only) |
| `web/.forge-session` is not gitignored — a developer could accidentally commit a live token | LOW | Token is per-boot ephemeral; a committed token is useless after next restart. Consider adding to `.gitignore` in Stage 12.6+ |
| S25-S29 scenario runner bypasses `start()` — auth path not exercised for those scenarios | LOW | Addressed by dedicated S204-S207 helper that explicitly calls `start()` |
| Pre-existing failures: S120, S124, S126 (builtproject integration tests), S137 (live OpenAI call) | NONE (pre-existing) | Environment-dependent; tracked in FINDING-2026-05-19-s137-live-openai-call |

---

**END OF STAGE 12.5 CLOSURE ARTIFACT**
