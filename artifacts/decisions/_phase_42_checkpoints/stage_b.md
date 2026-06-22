# PHASE-42 — STEP B closure checkpoint (Built-Project Test Harness L5b · owner-evidence surface)

**Date:** 2026-06-22
**Decision:** [DECISION-2026-06-22-phase-42...md](../DECISION-2026-06-22-phase-42-built-project-test-harness.md) (AMENDMENT A-1, owner-ratified)
**Contract:** [docs/09_verify/20_BUILT_PROJECT_TEST_CONTRACT.md](../../../docs/09_verify/20_BUILT_PROJECT_TEST_CONTRACT.md)
**Predecessors:** STEP A docs `9900142`; STEP B first half `e784a69`.

> Status: CLOSED LOCALLY. Push + tag `phase-42-complete` + owner Gate #10 follow PENDING CTO closure verification.

---

## What PHASE-42 was (and was not)
The L5b EXECUTION layer (`builtproject.run_scenarios` + verdict + block + loopback at `RUN_TESTS`) was already
complete and proven end-to-end (PHASE-28/29 Gate #10, real gpt-4o). PHASE-42 = **harden + document + add the
owner-facing evidence surface** — NOT build the harness.

## Deliverables
### Documentation / governance (STEP A — committed `9900142`)
- AMENDMENT A-1 on the decision (scope lock, Ruling G1 per-build, closure gate A-1.5, Track A A-1.6).
- Blueprint L5b dated addendum (PER-BUILD for v2.0; PER-MODULE → Iterative Build Loop PHASE-10; `run_after_each_module.sh` illustrative-only).
- NEW authority doc [20_BUILT_PROJECT_TEST_CONTRACT.md](../../../docs/09_verify/20_BUILT_PROJECT_TEST_CONTRACT.md).

### Capability (STEP B)
- `code/src/workspace/apiServer.js` — NEW `GET /api/ai-os/project/test-report?project_id=<id>` (READ-ONLY,
  sourced ONLY via `reg.invoke("builtproject.read_report")`; 200 verdict shape / fail-SOFT `NO_REPORT` / fail-closed
  typed reason) + NEW explicit static route `GET /test-report.html` (before the SPA fallback; token injected). [first half `e784a69`]
- `web/test-report.html` — NEW standalone non-React owner view. [first half `e784a69`]
- `code/src/testing/helpers/builtproject_report_endpoint_test_helper.js` — NEW (in-process apiServer, isolated temp
  root + token, S332 pattern; materializes a real `last_report.json` fixture). [this commit]
- `code/src/testing/scenarios/S333_test_report_endpoint_happy_path.json` (report present → verdict shape). [this commit]
- `code/src/testing/scenarios/S334_test_report_endpoint_no_report.json` (existing project, no run → fail-SOFT NO_REPORT). [this commit]
- `progress/status.json` — closure write (below). [this commit]

## Closure gate (A-1.5) — ALL met
- **SU suite: 327 passed / 0 failed / 5 skipped (332 total)** = 325 + N (N=2). No regression. (`--max-old-space-size=4096`, ~565 s.)
- **forge-doctor: 35 checks — PASS 29 / WARN 6 / FAIL 0** ("0 critical, 6 warning"). The 6 WARNs are pre-existing/environmental
  (`api_auth_token` keychain read in non-interactive shell; `install_path` stale `D:\\ForgeAI`; etc.) — none introduced by PHASE-42.
- **Track A clean.** The ONLY Track-A live-surface file changed by PHASE-42 is `apiServer.js`; both new regions
  (lines 1675–1691 + 1949–1993) are `reg.invoke`-only — forbidden-pattern grep (`fs.*Sync | child_process | fetch( | new OpenAI(`)
  returns NONE in those ranges. No file under `ai_os/**` or `runtime/**` was touched (confirmed by `git diff --name-only bedf672..HEAD`).
  The new test helper uses `fs`/`http` directly — test infrastructure, OUTSIDE the Track A live surface. `web/test-report.html`
  `fetch()` is browser-side, not the live surface. **§ARC stays frozen at 10.**
- 20_BUILT_PROJECT_TEST_CONTRACT.md + Blueprint addendum + AMENDMENT A-1 present.
- status.json updated (below); this checkpoint written.
- **Mock-only, $0** — no LLM calls.

## B.3 cosmetic reconcile — PARTIAL (gate hit reported)
- Updated (ungated): `runtime_health.self_test_last_result` (now 327 + PHASE-42 summary), `runtime_health.self_test_last_run`
  (2026-06-22), `runtime_health.self_test_scenarios_pass` (327), `last_updated` (2026-06-22).
- **NOT updated — `current_task`:** the B.3 hard gate grep found a doctor check that references it —
  `code/src/runtime/doctor/checks/statusJsonValid.js` lists `current_task` in `REQUIRED_FIELDS` and echoes its value in
  the PASS detail. Per AMENDMENT A-1 B.3 ("if ANY ... doctor check asserts on current_task → STOP-AND-REPORT, do not edit"),
  `current_task` was LEFT UNTOUCHED (still the PHASE-36 narrative) and is reported to the CTO for a decision.
  (Authoritative fields `next_phase` / `next_step` / `self_test_last_result` are correct; the check still PASSes since
  `current_task` remains present.)

## status.json closure write
- `next_phase` → **PHASE-43-PENDING-DECISION**.
- `next_step` → PHASE-42 closure summary (prepended; PHASE-41 narrative retained), noting **LOCAL commit; push/tag + owner Gate #10 pending**.
- `runtime_health.self_test_last_result` → the actual B.5 count (327/0/5) + one-line PHASE-42 summary.

## Commit
LOCAL, selective add of ONLY: `apiServer.js` was already committed (`e784a69`); this commit adds the test helper, S333,
S334, `progress/status.json`, and this checkpoint. **NO push, NO tag.**
SHA: __FILLED AT COMMIT__.

**HARD STOP — awaiting CTO closure verification (push GO + tag `phase-42-complete` + owner Gate #10 follow).**
