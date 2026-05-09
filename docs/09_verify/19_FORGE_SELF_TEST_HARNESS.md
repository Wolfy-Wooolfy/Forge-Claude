# Forge Self-Test Harness — Authority Document

> Layer: L5a Self-Test Harness
> Decision: DECISION-20260508-phase-5-self-test-harness
> Status: ACTIVE

---

## 1. Purpose

The Self-Test Harness (L5a) provides Forge's own baseline regression suite.
It runs without a live OpenAI connection, using a mock HTTP server and
direct-dispatch invocations of providers, tools, and the doctor.

**Primary goal:** Prove that L1–L4 contracts hold after every change.

---

## 2. Entry Point

```bash
node bin/forge-test.js                     # run all 12 scenarios
node bin/forge-test.js --scenario S01      # run one scenario
node bin/forge-test.js -s S05 -s S12       # run selected scenarios
```

Exit codes:
- `0` — all scenarios PASS or SKIP, none FAIL
- `1` — at least one scenario FAIL
- `2` — runner crashed

---

## 3. Dispatch Modes

### 3.1 `direct_provider`

Invokes a provider's `executeTask()` against a mock OpenAI endpoint.

- Starts `mock_openai_service.js` on a random OS-assigned port
- Sets `OPENAI_BASE_URL` to point to the mock (SDK picks this up)
- Overrides `globalThis.fetch` to redirect `api.openai.com` calls for
  providers that use raw `fetch()` (e.g. `intentClassificationProvider`)
- Restores all env and fetch after invocation

### 3.2 `direct_tool`

Invokes a tool through the tool registry with permission policy active.

- Creates a fresh `createPolicy()` instance for this scenario (no singleton)
- Creates a fresh `createRegistry()`, loads tools, wires the policy
- Reads audit entries before and after → exposes delta as `result.audit`
- PROMPT mode: uses `_autoDenyPrompter` (immediate DENY, no timeout)
- Restores all env after invocation

### 3.3 `direct_doctor`

Calls `runDoctor({ write_report: false, update_status: false })` directly.

### 3.4 `conversation` → SKIP

Full conversation engine dispatch is deferred until the engine is wired.
The runner returns `{ status: "SKIP", reason: "conversation engine not wired" }`.
Scenarios 6, 7, 9, 11 use this type.

---

## 4. Assertion Types

| Type | Checks |
|---|---|
| `status_equals` | `result.status === expected` |
| `response_contains` | `result.output.response` includes substring |
| `state_field_equals` | `result.output.state[field]` deep-equals expected |
| `tool_called` | `result.output.tool_calls` has entry with name |
| `tool_not_called` | `result.output.tool_calls` has no entry with name |
| `active_state` | `result.output.state.active === expected` |
| `artifact_exists` | file at `<root>/<path>` exists |
| `audit_count` | `result.audit.length >= min` |

All assertions are deterministic — no "does the response look good?" checks.

---

## 5. Result Normalization

The runner wraps each dispatch result in a unified shape for assertions:

```json
{
  "status": "COMPLETED|DENIED|FAILED|SUCCESS|PASS|FAIL",
  "output": {
    "response":   "text response (from provider message, or doctor summary)",
    "tool_calls": [],
    "state":      { "...": "provider/tool/doctor output fields" }
  },
  "audit": [ "...audit entries added during this invocation..." ]
}
```

Provider results: `output.response = provider.output.message`, `output.state = provider.output`.
Tool results: `output.state = tool.output`, `audit = entries since startTs`.
Doctor results: `output.state = { ok, counts, checks }`, `output.response = summary`.

---

## 6. Baseline Scenarios

| ID | Name | Type | Must |
|---|---|---|---|
| S01 | conversationalResponseProvider returns respond_to_user | direct_provider | PASS |
| S02 | intentClassificationProvider classifies AFFIRM | direct_provider | PASS |
| S03 | conversationalResponseProvider extracts all tool-choice args | direct_provider | PASS |
| S04 | fs.write_file succeeds in WORKSPACE_WRITE | direct_tool | PASS |
| S05 | fs.write_file denied in READ_ONLY | direct_tool | PASS |
| S06 | full conversation turn | conversation | SKIP |
| S07 | conversation with tool use | conversation | SKIP |
| S08 | fs.write_file denied in PROMPT mode | direct_tool | PASS |
| S09 | DANGER mode allows shell command | conversation | SKIP |
| S10 | doctor returns ok=true, no FAIL checks | direct_doctor | PASS |
| S11 | multi-turn state preserved | conversation | SKIP |
| S12 | W-03 isolation: FORGE_DECISION_OVERRIDE ignored | direct_tool | PASS |

---

## 7. W-03 Isolation (S12)

Scenario 12 is the L3 regression test for W-03 (from blueprint_contradiction_sweep.md).

Protocol:
1. Set `FORGE_PERMISSION_MODE=READ_ONLY` as `scenario.permission`
2. Set `FORGE_DECISION_OVERRIDE=APPROVE_ALL` via `scenario.env`
3. Invoke `fs.write_file` through the tool registry
4. Assert `status_equals("DENIED")`

L3 reads only `FORGE_PERMISSION_MODE` and `FORGE_ALLOW_SELF_MODIFY`.
`FORGE_DECISION_OVERRIDE` is not read by `permissionPolicy.js`,
`permissionMode.js`, or `permissionRules.js`. The write is DENIED regardless.

**This scenario must PASS, not SKIP.**

---

## 8. Mock OpenAI Service

`code/src/testing/mock_openai_service.js`:
- Pure Node.js HTTP server (`http.createServer`), no external dependencies
- Port: OS-assigned (`server.listen(0)`)
- Endpoint: `POST /v1/chat/completions`
- Returns canned tool-call JSON from the scenario's `mock` field
- Torn down after each scenario via `server.close()`

The mock response schema matches the OpenAI chat completion format exactly,
so providers receive the same structure they would from the real API.

---

## 9. Adding New Scenarios

1. Create `code/src/testing/scenarios/S<NN>_<slug>.json`
2. Choose type: `direct_provider | direct_tool | direct_doctor | conversation`
3. Define deterministic assertions (no open-ended "did it look right?")
4. Run `node bin/forge-test.js -s S<NN>` → must PASS or SKIP
5. Run full suite → must not regress existing PASS scenarios
6. Update this document's baseline table (§6)

New assertion types: add a file in `code/src/testing/assertions/`,
export `{ type: "name", run(assertion, result, ctx) }`. Auto-loaded.

---

## 10. Files

| Path | Role |
|---|---|
| `code/src/testing/SCHEMA.md` | Schema reference |
| `code/src/testing/mock_openai_service.js` | Mock HTTP server |
| `code/src/testing/assertions/_registry.js` | Assertion auto-loader |
| `code/src/testing/assertions/*.js` | Individual assertion types |
| `code/src/testing/scenario_runner.js` | Core runner logic |
| `code/src/testing/scenarios/S*.json` | Baseline scenario definitions |
| `bin/forge-test.js` | CLI entry point |
| `verify/smoke/test_harness_meta.js` | Meta smoke test |
