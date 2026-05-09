# Forge Self-Test Harness — Schema Reference

> Authority: DECISION-20260508-phase-5-self-test-harness
> Layer: L5a Self-Test Harness
> Status: ACTIVE

---

## 1. Scenario File Schema

Each scenario is a JSON file in `code/src/testing/scenarios/`.

```json
{
  "id":          "S01",
  "name":        "Human-readable name",
  "type":        "direct_provider | direct_tool | conversation",
  "provider":    "providerModuleName (direct_provider only)",
  "tool":        "tool_family.tool_name (direct_tool only)",
  "permission":  "READ_ONLY | WORKSPACE_WRITE | DANGER_FULL_ACCESS | TEST (direct_tool only)",
  "env":         { "KEY": "VALUE" },
  "input":       { ... },
  "mock":        { "tool_name": { "arg": "value" } },
  "assertions":  [ { "type": "assertion_id", ...params } ]
}
```

### 1.1 Field definitions

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier, e.g. `"S01"` |
| `name` | yes | Human-readable description |
| `type` | yes | Dispatch mode (see §2) |
| `provider` | if direct_provider | Provider module name (no path, no .js) |
| `tool` | if direct_tool | `"family.name"` — matched against tool registry |
| `permission` | if direct_tool | Permission mode to set for this scenario |
| `env` | no | Extra env vars set before run, restored after |
| `input` | yes | Payload passed to provider or tool |
| `mock` | if direct_provider | Canned tool-choice responses from mock OpenAI |
| `assertions` | yes | Array of assertion objects (see §3) |

---

## 2. Dispatch Modes

### 2.1 `direct_provider`

Invokes a provider's `executeTask()` with a mock OpenAI endpoint.

- Starts `mock_openai_service` on random port
- Sets `OPENAI_BASE_URL=http://127.0.0.1:<port>` in env
- For providers using raw `fetch` (intentClassificationProvider): overrides `globalThis.fetch`
- Calls `provider.executeTask({ task_id: scenario.id, context: scenario.input })`
- Restores env and fetch after call

Result shape expected from provider:
```json
{ "status": "COMPLETED", "output": { ... }, "metadata": { ... } }
```

### 2.2 `direct_tool`

Invokes a tool via the tool registry (with permission policy active).

- Sets `FORGE_PERMISSION_MODE` to `scenario.permission`
- Sets any additional `scenario.env` vars
- Gets the tool registry: `getDefaultRegistry()`
- Calls `registry.invoke(tool_family, tool_name, scenario.input, context)`
- Restores env after call

Result shape:
```json
{ "status": "COMPLETED|DENIED|FAILED", "output": { ... }, "audit": [...] }
```

### 2.3 `conversation` (SKIP)

Full conversation engine dispatch. Skipped until conversation engine is wired.
Runner returns `{ status: "SKIP", reason: "conversation engine not wired" }`.

---

## 3. Assertion Schema

Each assertion object has a `type` field plus assertion-specific fields.

### 3.1 `tool_called`

```json
{ "type": "tool_called", "name": "tool_name" }
```

Passes if `result.output.tool_calls` contains an entry with `name === tool_name`.

### 3.2 `tool_not_called`

```json
{ "type": "tool_not_called", "name": "tool_name" }
```

Passes if `result.output.tool_calls` has no entry with `name === tool_name`.

### 3.3 `active_state`

```json
{ "type": "active_state", "expected": "value" }
```

Passes if `result.output.state.active === expected`.

### 3.4 `state_field_equals`

```json
{ "type": "state_field_equals", "field": "key", "expected": "value" }
```

Passes if `result.output.state[field]` deep-equals `expected`.

### 3.5 `response_contains`

```json
{ "type": "response_contains", "substring": "text" }
```

Passes if `result.output.response` (string) includes `substring`.

### 3.6 `artifact_exists`

```json
{ "type": "artifact_exists", "path": "relative/path/from/root" }
```

Passes if the file exists at `<root>/<path>`.

### 3.7 `audit_count`

```json
{ "type": "audit_count", "min": 1 }
```

Passes if `result.audit.length >= min`.

---

## 4. Runner Result Shape

```json
{
  "schema_version": "1.0",
  "ok":             true,
  "summary":        "8 passed, 0 failed, 4 skipped (12 total)",
  "counts":         { "pass": 8, "fail": 0, "skip": 4 },
  "started_at":     "ISO timestamp",
  "duration_ms":    123,
  "scenarios":      [
    {
      "id":         "S01",
      "name":       "...",
      "status":     "PASS | FAIL | SKIP",
      "skip_reason": "...",
      "duration_ms": 45,
      "assertions": [
        { "type": "tool_called", "name": "respond_to_user", "passed": true }
      ],
      "error":      null
    }
  ]
}
```

---

## 5. Mock OpenAI Service

The mock service is a minimal HTTP server that responds to `POST /v1/chat/completions`.

Response shape (tool-choice):
```json
{
  "id": "mock-...",
  "object": "chat.completion",
  "choices": [{
    "message": {
      "role": "assistant",
      "tool_calls": [{
        "id": "call_mock",
        "type": "function",
        "function": {
          "name": "<tool_name>",
          "arguments": "<JSON string>"
        }
      }]
    },
    "finish_reason": "tool_calls"
  }]
}
```

---

## 6. Baseline Scenarios Index

| ID | Name | Type | Must |
|---|---|---|---|
| S01 | provider responds with tool choice | direct_provider | PASS |
| S02 | intent classified correctly | direct_provider | PASS |
| S03 | tool choice arguments returned | direct_provider | PASS |
| S04 | fs.write_file allowed in WORKSPACE_WRITE | direct_tool | PASS |
| S05 | fs.write_file blocked in READ_ONLY | direct_tool | PASS |
| S06 | full conversation turn | conversation | SKIP |
| S07 | conversation with tool use | conversation | SKIP |
| S08 | permission PROMPT mode blocks auto-write | direct_tool | PASS |
| S09 | DANGER mode allows shell command | conversation | SKIP |
| S10 | doctor passes all checks | direct_tool | PASS |
| S11 | multi-turn state preserved | conversation | SKIP |
| S12 | W-03 isolation — FORGE_DECISION_OVERRIDE has no effect | direct_tool | PASS |
