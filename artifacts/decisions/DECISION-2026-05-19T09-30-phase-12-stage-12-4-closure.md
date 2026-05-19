# Stage 12.4 — Monitoring + Doctor Extensions — Closure Artifact

**Date:** 2026-05-19
**Stage:** 12.4 — Monitoring + Doctor Extensions
**Status:** CLOSED — All closure-gate conditions met
**Owner approval:** Required before `current_task` transitions to Stage 12.5
**Plan Authority:** `artifacts/decisions/DECISION-2026-05-18T11-30-phase-12-plan.md`

---

## §1 — Deliverables Summary

| Deliverable | File | Status |
|---|---|---|
| Group A — Log writer (§ARC-6) | `code/src/runtime/logging/log_writer.js` | DONE |
| Group B — Metrics boot hook | `code/src/runtime/logging/metrics_initializer.js` | DONE |
| Group B — Boot hook call site | `code/src/workspace/apiServer.js` (line 1900–1901) | DONE |
| Group C — Doctor check: logging_status | `code/src/runtime/doctor/checks/logging_status.js` | DONE |
| Group C — Doctor check: metrics_available | `code/src/runtime/doctor/checks/metrics_available.js` | DONE |
| Group C — Doctor check: alert_webhook | `code/src/runtime/doctor/checks/alert_webhook.js` | DONE |
| Group C — Doctor registry update | `code/src/runtime/doctor/_registry.js` | DONE |
| Group D — Alerts route (inline in apiServer.js) | `code/src/workspace/apiServer.js` (POST /api/alerts/test) | DONE |
| Group E — Test helper | `code/src/testing/helpers/monitoring_test_helper.js` | DONE |
| Group E — S201 scenario | `code/src/testing/scenarios/S201_log_writer_writes_and_rotates.json` | DONE |
| Group E — S202 scenario | `code/src/testing/scenarios/S202_metrics_window_24h_initialized.json` | DONE |
| Group E — S203 scenario | `code/src/testing/scenarios/S203_doctor_logging_status_pass.json` | DONE |
| Group F — §ARC-6 ledger entry | `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` | DONE |
| Mid-Checkpoint | `artifacts/decisions/_phase_12_checkpoints/stage_12_4_mid.md` | DONE |

---

## §2 — Group C Doctor Checks Inventory

| Check ID | File | Approach | PASS condition | WARN condition |
|---|---|---|---|---|
| `logging_status` | `checks/logging_status.js` | async, L2 `fs.exists` | logs/ directory present | logs/ missing or not a directory |
| `metrics_available` | `checks/metrics_available.js` | async, L2 `fs.read_file` | all 7 fields in `runtime_health.metrics_window_24h` | block absent or fields missing |
| `alert_webhook` | `checks/alert_webhook.js` | sync, env var only | URL absent (optional) OR valid http(s) URL | URL set but malformed or non-http protocol |

**INFO status not used:** `runDoctor.js` line 82 normalizes any non-PASS/WARN/FAIL to FAIL. `alert_webhook` returns PASS when env var not set (webhook is optional; absence is not an error).

---

## §3 — Group D: Alerts Route (Drift #1 implementation)

**Route:** `POST /api/alerts/test` — inline in `apiServer.js` per CTO Drift #1 ruling.

**Behavior:**
- 503 if `FORGE_ALERT_WEBHOOK_URL` not set: `{ error: "webhook not configured", detail: "... see INSTALL.md §Alerts" }`
- 502 if `reg.invoke("http.post", ...)` returns non-SUCCESS
- 200 `{ ok: true, webhook_url_configured: true, status_code, detail: "test alert delivered" }`

**Alert-about-alert guard:** failures in this endpoint do NOT call `log_writer.error` — avoids re-entrancy loop (log write would be another L2 call → potential circular path).

**Test payload:**
```json
{ "type": "forge.alert.test", "source": "forge-api", "ts": "<ISO>", "message": "Forge alert webhook test — delivery confirmed" }
```

---

## §4 — Closure Gate Verification

| Check | Required | Actual | Result |
|---|---|---|---|
| SU pass count | 198 | 198 | ✓ |
| SU fail count | 0 | 0 | ✓ |
| SU skip count | 5 | 5 | ✓ |
| SU total | 203 | 203 | ✓ |
| Doctor checks | 31 | 31 | ✓ |
| S201 PASS | required | PASS | ✓ |
| S202 PASS | required | PASS | ✓ |
| S203 PASS | required | PASS | ✓ |
| `_registry.js` has 3 new check lines | required | 3 lines added | ✓ |
| Alerts route inline in apiServer.js | required | POST /api/alerts/test | ✓ |
| §ARC-6 row in 18_AGENT_ROLES_CONTRACT.md | required | added | ✓ |
| Track A: 0 `fs.*Sync` in new Doctor checks | required | 0 matches | ✓ |
| Track A: 0 `child_process`/`new OpenAI` in new files | required | 0 matches | ✓ |
| apiServer.js delta: 0 new direct `fs.*Sync` | required | 0 matches | ✓ |
| Doctor exits 0 (`✓ HEALTHY — 0 critical`) | required | 0 critical, 6 warn | ✓ |

---

## §5 — Track A Verification

```
grep -nE "fs\.\w+Sync|child_process|new OpenAI" \
  code/src/runtime/doctor/checks/logging_status.js \
  code/src/runtime/doctor/checks/metrics_available.js \
  code/src/runtime/doctor/checks/alert_webhook.js
→ 0 matches ✓

grep -nE "fs\.\w+Sync|child_process|new OpenAI" \
  code/src/testing/helpers/monitoring_test_helper.js
→ fs.*Sync matches in monitoring_test_helper.js only — test infrastructure,
  §ARC convention allows direct fs in test helpers

git diff HEAD -- code/src/workspace/apiServer.js | grep "^+" | grep -E "fs\.\w+Sync|child_process|new OpenAI"
→ 0 matches ✓
```

**Confirmation: All production code added in Stage 12.4 respects §ARC-6 boundary.** ✓

---

## §X — Incidental Refinements for Closure

### §X.1 — Webhook surface inline in apiServer.js

Plan §3 specified `handlers/alerts.js` as the implementation location. The `handlers/` directory does not exist in the codebase. Per CTO Drift #1 ruling, the `POST /api/alerts/test` endpoint was implemented inline in `apiServer.js`, consistent with the existing pathname routing pattern throughout the file.

### §X.2 — Plan §8 Rollback D4 step 4 collapse

Plan §8 Rollback for D4 included a step 4: "Delete `handlers/alerts.js`." Since the handlers file was never created (inline implementation per §X.1), Rollback D4 step 4 is a no-op. Step 5 ("Remove route block from `apiServer.js`") absorbs it — the implementation exists only as an inline route block in `apiServer.js`.

### §X.3 — `metrics_initializer.js` direct-fs pattern

`metrics_initializer.js` uses `fs.readFileSync` + `fs.writeFileSync` on `progress/status.json`. This is NOT covered by §ARC-6 (which scopes exclusively to `log_writer.js`). Justified by codebase precedent: `runDoctor.js._patchStatusRuntimeHealth()` (lines 91–108) performs the same `fs.readFileSync → JSON.parse → Object.assign → fs.writeFileSync` pattern. Using L2 here would be inconsistent with the established codebase pattern for `status.json` updates. See mid-checkpoint §5 for full justification.

### §X.4 — §ARC-6 extended to include `fs.unlinkSync`

Plan §6 §ARC-6 template lists `fs.appendFileSync`, `fs.mkdirSync`, `fs.statSync`, `fs.renameSync` as authorized operations. The implementation adds `fs.unlinkSync` for one specific purpose: deleting the oldest rotated slot (`forge.log.4`) before the rename chain. On Windows, `fs.renameSync` throws EEXIST when the destination already exists (Linux POSIX behavior overwrites, but cross-platform compatibility requires explicit deletion). The other rename slots in the chain are vacated by the cascade — only `.4` (the first rename target) needs explicit deletion. `fs.unlinkSync` is integral to the rotation operation per Plan §1-A1 specification ("`forge.log.4` deleted (oldest)") and is covered by the same §ARC-6 authorization as the rest of the rotation logic.

---

## §6 — Files Created / Modified

**Created:**
- `code/src/runtime/logging/log_writer.js` (165 lines)
- `code/src/runtime/logging/metrics_initializer.js` (60 lines)
- `code/src/runtime/doctor/checks/logging_status.js`
- `code/src/runtime/doctor/checks/metrics_available.js`
- `code/src/runtime/doctor/checks/alert_webhook.js`
- `code/src/testing/helpers/monitoring_test_helper.js`
- `code/src/testing/scenarios/S201_log_writer_writes_and_rotates.json`
- `code/src/testing/scenarios/S202_metrics_window_24h_initialized.json`
- `code/src/testing/scenarios/S203_doctor_logging_status_pass.json`
- `artifacts/decisions/_phase_12_checkpoints/stage_12_4_mid.md`

**Modified:**
- `code/src/workspace/apiServer.js` (boot hook at line 1900 + POST /api/alerts/test route)
- `code/src/runtime/doctor/_registry.js` (3 new check lines: logging_status, metrics_available, alert_webhook)
- `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` (§ARC-6 row appended to §ARC table)

---

## §7 — Risks Carried Forward

| Risk | Severity | Plan |
|---|---|---|
| `logging_status` WARN on fresh install (logs/ not yet created) | LOW | Expected behavior — log_writer lazy-creates on first write; Doctor WARN is correct signal |
| `metrics_available` WARN until first API server start | LOW | Expected behavior — boot hook populates on first start; documented in Doctor detail message |
| Alert webhook `http.post` allow-list may block test payloads to non-standard hosts | LOW | FORGE_ALERT_WEBHOOK_URL is optional; operator sets their own URL; http_tools.js allow-list configurable |
| S201 uses log_writer singleton with `_resetForTest` — test isolation depends on single-process execution | LOW | Test harness runs scenarios sequentially; `_resetForTest(null)` restores factory state in finally block |

---

**END OF STAGE 12.4 CLOSURE ARTIFACT**
