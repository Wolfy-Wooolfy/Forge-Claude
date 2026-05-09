# DECISION-20260508-phase-5-self-test-harness

| Field | Value |
|---|---|
| **Decision ID** | DECISION-20260508-phase-5-self-test-harness |
| **Status** | ADOPTED — 2026-05-08 |
| **Authored** | 2026-05-08 |
| **Related** | DECISION-20260508-phase-4-doctor |

---

## 1. Context

PHASE-5 builds L5a Self-Test Harness per architecture/FORGE_V2_BLUEPRINT.md Part B §L5a.
The harness is Forge's own baseline regression suite — it proves that L1 through L4
(Provider Contract, Tool Runtime, Permission Policy, Doctor) hold their contracts after
every change.

Design constraint: the harness must run fully offline (no live OpenAI calls). This
requires a mock OpenAI service for provider scenarios, a deterministic assertion engine,
and a scenario runner that can bypass the conversation layer for tool/provider scenarios.

---

## 2. Option selected — Option C (Direct-Dispatch + Mock-OpenAI)

Scenarios run in three dispatch modes:

| Mode | Mechanism | Scenarios |
|---|---|---|
| `direct_tool` | Invoke tool registry + permission policy directly | 4, 5, 8, 10, 12 |
| `direct_provider` | Invoke provider via `OPENAI_BASE_URL` + `globalThis.fetch` override | 1, 2, 3 |
| `conversation` | Full conversation engine (SKIPPED — engine not yet wired) | 6, 7, 9, 11 |

Pass target: **8/12 PASS, 4/12 SKIP** — all 8 non-SKIPPED scenarios must PASS.

---

## 3. Files to create

| Path | Lines |
|---|---|
| code/src/testing/SCHEMA.md | ~100 |
| code/src/testing/mock_openai_service.js | ~130 |
| code/src/testing/assertions/_registry.js | ~60 |
| code/src/testing/assertions/tool_called.js | ~35 |
| code/src/testing/assertions/tool_not_called.js | ~30 |
| code/src/testing/assertions/active_state.js | ~30 |
| code/src/testing/assertions/state_field_equals.js | ~35 |
| code/src/testing/assertions/response_contains.js | ~30 |
| code/src/testing/assertions/artifact_exists.js | ~30 |
| code/src/testing/assertions/audit_count.js | ~35 |
| code/src/testing/scenario_runner.js | ~250 |
| code/src/testing/scenarios/S01_provider_responds.json | ~30 |
| code/src/testing/scenarios/S02_intent_classified.json | ~30 |
| code/src/testing/scenarios/S03_tool_choice_returned.json | ~30 |
| code/src/testing/scenarios/S04_tool_write_allowed.json | ~30 |
| code/src/testing/scenarios/S05_tool_write_blocked_read_only.json | ~30 |
| code/src/testing/scenarios/S06_full_conversation_turn.json | ~30 |
| code/src/testing/scenarios/S07_conversation_with_tool_use.json | ~30 |
| code/src/testing/scenarios/S08_permission_prompt_mode.json | ~30 |
| code/src/testing/scenarios/S09_danger_mode_allows_shell.json | ~30 |
| code/src/testing/scenarios/S10_doctor_passes_all_checks.json | ~30 |
| code/src/testing/scenarios/S11_multi_turn_state_preserved.json | ~30 |
| code/src/testing/scenarios/S12_w03_isolation.json | ~30 |
| bin/forge-test.js | ~60 |
| docs/09_verify/19_FORGE_SELF_TEST_HARNESS.md | ~150 |
| verify/smoke/test_harness_meta.js | ~120 |

Plus:
- Modified: progress/status.json (self_test_harness_available = true)

---

## 4. Assertion types

| Assertion | Check |
|---|---|
| `tool_called` | `result.tool_calls` includes entry with matching name |
| `tool_not_called` | `result.tool_calls` has no entry with matching name |
| `active_state` | `result.state.active` equals expected value |
| `state_field_equals` | `result.state[field]` deep-equals expected value |
| `response_contains` | `result.response` string contains expected substring |
| `artifact_exists` | file exists at `<root>/<path>` |
| `audit_count` | `result.audit.length >= expected` |

---

## 5. Mock OpenAI Service

- Starts an HTTP server on random port (0 = OS-assigned)
- Endpoint: `POST /v1/chat/completions`
- Accepts a `_mock_responses` map keyed by scenario ID, returns canned tool-call JSON
- Torn down after each scenario via `close()`
- `intentClassificationProvider` uses hardcoded `https://api.openai.com/...` — intercepted
  via `globalThis.fetch` override (not via OPENAI_BASE_URL) for `direct_provider` mode

---

## 6. W-03 Isolation (Scenario 12)

Scenario 12 is `direct_tool` type. Protocol:
1. Set `FORGE_PERMISSION_MODE=READ_ONLY`, `FORGE_DECISION_OVERRIDE=APPROVE_ALL`
2. Invoke `fs.write_file` via tool registry
3. Assert result is `DENIED` (not allowed)

This proves L3 reads only `FORGE_PERMISSION_MODE` + `FORGE_ALLOW_SELF_MODIFY` — never
`FORGE_DECISION_OVERRIDE`. W-03 from blueprint_contradiction_sweep.md is thus enforced.

---

## 7. Acceptance criteria

1. All JS files pass `node --check`.
2. All 12 scenario JSON files parse valid.
3. `node bin/forge-test.js` exits 0 with: 8 PASS, 4 SKIP, 0 FAIL.
4. Scenarios 1,2,3,4,5,8,10,12 each PASS.
5. Scenarios 6,7,9,11 each SKIP (reason: conversation engine not wired).
6. Scenario 12 PASS — NOT SKIP. W-03 isolation confirmed.
7. `verify/smoke/test_harness_meta.js` passes all assertions.
8. PHASE-1/2/3/4 regressions still PASS (no behavior change in those layers).
9. progress/status.json.runtime_health.self_test_harness_available = true.

---

## 8. Risks

- **R1.** mock_openai_service uses `http.createServer` on port 0. If `server.address()` is
  null before listen completes, port assignment fails. Mitigation: await `listening` event.
- **R2.** `intentClassificationProvider` hardcodes `https://api.openai.com`. Cannot be
  redirected via OPENAI_BASE_URL. Mitigation: `globalThis.fetch` override in scenario
  runner for `direct_provider` scenarios.
- **R3.** `direct_tool` scenarios mutate process.env permission mode. Must restore after
  each scenario to avoid cross-contamination.
- **R4.** Doctor scenario (S10) calls `runDoctor()` which may try to write report files.
  Must pass `write_report: false, update_status: false`.
- **R5.** `conversationalResponseProvider.executeTask()` creates `new OpenAI({ apiKey })`
  at call time — SDK reads `OPENAI_BASE_URL` from env automatically. For `direct_provider`
  scenarios, set `OPENAI_BASE_URL` + `OPENAI_API_KEY` before calling, restore after.
  The `new OpenAI()` call happens inside `executeTask()`, so env is read at that moment.

---

## 9. Rollback plan

```bash
rm -rf code/src/testing/ bin/forge-test.js \
       docs/09_verify/19_FORGE_SELF_TEST_HARNESS.md \
       verify/smoke/test_harness_meta.js
git checkout HEAD~1 -- progress/status.json
```

---

## 10. Owner approval

Approval: **GRANTED — 2026-05-08**

Verbatim (§2 decision artifact approval):
> "approved على الـ Option C decision artifact، خاصة الـ R5 clarification.
> R5 logic مقبول... الـ scenarios الـ 8 الباقيين (1, 2, 3, 4, 5, 8, 10, 12)
> لازم PASS... scenario 12 (W-03 isolation) لازم PASS، مش SKIPPED.
> ابدأ §3 — كتابة الملفات بالترتيب الإجباري..."

Verbatim (§3 implementation approval — 3 clarifications):
> "approved على كل التوضيحات الثلاثة:
> 1. status_equals legitimate — envelope-level vs data-level distinction واضحة
> 2. Meta smoke 14 assertions في 6 groups — coverage حقيقي (M1-M6)
> 3. Cleanup pattern (try/finally + before/after) سليم — لا state leakage
> اعمل الـ commit."
