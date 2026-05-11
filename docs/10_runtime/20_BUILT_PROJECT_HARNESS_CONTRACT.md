# 20 — Built-Project Test Harness Contract (L5b)

> PHASE-8 artifact. Binding as of DECISION-20260513-1100-phase-8-builtproject-harness.md.

---

## 1. Purpose

The **L5b harness** tests projects that Forge builds for owners — not Forge itself.
L5a (`bin/forge-test.js`) tests Forge internals.
L5b (`bin/forge-builtproject-test.js`) tests the output artifact.

---

## 2. Scenario Format

Every L5b scenario is a JSON file in `<project>/forge_tests/scenarios/`.

```json
{
  "id":          "T-1",
  "name":        "create_todo_returns_201",
  "description": "POST /todos with valid body returns 201",
  "category":    "http",
  "fixture":     "fresh_db",
  "setup": {
    "actions": [
      { "type": "start_server", "command": "node server.js", "wait_for_port": 3000, "timeout_ms": 5000 }
    ]
  },
  "execution": {
    "type":    "http_request",
    "method":  "POST",
    "url":     "http://localhost:3000/todos",
    "headers": { "Content-Type": "application/json" },
    "body":    { "title": "Buy milk", "completed": false }
  },
  "assertions": [
    { "type": "http_status_equals",        "expected": 201 },
    { "type": "response_body_contains_key", "key": "id" },
    { "type": "response_body_field_equals", "field": "title", "expected": "Buy milk" }
  ],
  "teardown": {
    "actions": [
      { "type": "stop_server" }
    ]
  },
  "metadata": {
    "covers_ac": ["AC-1"],
    "estimated_duration_ms": 400
  }
}
```

### Required fields

| Field        | Type   | Description                                      |
|---|---|---|
| `id`         | string | Unique within the project (e.g. `"T-1"`)        |
| `name`       | string | Snake-case identifier                            |
| `description`| string | Human-readable sentence                          |
| `category`   | string | `"http"` \| `"shell"` \| `"file"`               |
| `setup`      | object | Actions before execution                         |
| `execution`  | object | The thing to test                                |
| `assertions` | array  | One or more assertion objects                    |
| `teardown`   | object | Actions after execution (always runs)            |

---

## 3. Assertion Types

### 3.1 `http_status_equals`
```json
{ "type": "http_status_equals", "expected": 201 }
```
Checks `response.status === expected`.

### 3.2 `response_body_contains_key`
```json
{ "type": "response_body_contains_key", "key": "error" }
```
Checks the JSON response body has the key.

### 3.3 `response_body_field_equals`
```json
{ "type": "response_body_field_equals", "field": "title", "expected": "Buy milk" }
```
Supports dot-notation (`"user.id"`). Strict equality.

### 3.4 `response_body_is_array`
```json
{ "type": "response_body_is_array", "exact_length": 0 }
```
Optional `exact_length` or `min_length`.

### 3.5 `response_body_matches_schema`
```json
{
  "type": "response_body_matches_schema",
  "schema": {
    "type": "object",
    "required": ["id", "title"],
    "properties": {
      "id":    { "type": "number" },
      "title": { "type": "string" }
    }
  }
}
```
Minimal JSON Schema subset: `type`, `required`, `properties` (type checks only).

### 3.6 `process_exit_code_equals`
```json
{ "type": "process_exit_code_equals", "expected": 0 }
```
For shell-type scenarios that run a process and check exit code.

### 3.7 `file_exists`
```json
{ "type": "file_exists", "path": "dist/bundle.js" }
```
Path is relative to `workspace_root` (project root).

### 3.8 `stdout_contains`
```json
{ "type": "stdout_contains", "expected": "Server listening" }
```
Checks captured stdout/stderr from setup phase.

---

## 4. Setup Action Types

| `type`          | Description                                                        |
|---|---|
| `start_server`  | Spawns `command` in `cwd=projectRoot`, polls `wait_for_port` until open. |
| `stop_server`   | Handled automatically in teardown — harness kills the process.    |

---

## 5. Module Map

```
code/src/runtime/builtproject/
├── scenario_loader.js        # Reads forge_tests/scenarios/*.json
├── harness_runner.js         # Runs one scenario (setup → execute → assert → teardown)
├── verdict_aggregator.js     # Aggregates results → forge_tests/last_report.json
├── loopback_signal.js        # Emits forge_tests/loopback_signal.json
└── assertion_types/
    ├── http_status_equals.js
    ├── response_body_contains_key.js
    ├── response_body_field_equals.js
    ├── response_body_is_array.js
    ├── response_body_matches_schema.js
    ├── process_exit_code_equals.js
    ├── file_exists.js
    └── stdout_contains.js

code/src/runtime/tools/
└── builtproject_tools.js     # L2 tools: builtproject.run_scenarios, builtproject.read_report

code/src/runtime/doctor/checks/
└── builtproject_runtime.js   # Doctor check: harness modules + reference fixture intact

bin/
└── forge-builtproject-test.js  # CLI: node bin/forge-builtproject-test.js [--project <dir>]

artifacts/projects/
└── _reference_todo_api/      # Reference fixture (Express + better-sqlite3 CRUD API)
    ├── server.js
    ├── db.js
    ├── routes/todos.js
    └── forge_tests/scenarios/
        ├── T1_create_todo.json
        ├── T2_list_todos.json
        ├── T3_get_todo_by_id.json
        ├── T4_update_todo.json
        ├── T5_delete_todo.json
        └── T6_missing_field_400.json
```

---

## 6. L2 Tool Interface

### `builtproject.run_scenarios`

| | |
|---|---|
| `required_mode` | `PROMPT` |
| Input | `project_root: string`, `scenario_ids?: string[]` |
| Output | `{ overall_status, total, pass, fail, error, report_path, signal_path, scenarios[] }` |

### `builtproject.read_report`

| | |
|---|---|
| `required_mode` | `READ_ONLY` |
| Input | `project_root: string` |
| Output | Contents of `forge_tests/last_report.json` |

---

## 7. Output Files

After every run, two files are written to `<project>/forge_tests/`:

| File                  | Content                                   |
|---|---|
| `last_report.json`    | Full report: summary + per-scenario details |
| `loopback_signal.json`| Compact signal for orchestrator pickup     |

---

## 8. §ARC-1 Exception

`verdict_aggregator.js` and `loopback_signal.js` use `fs.writeFileSync` directly (not via L2 tools). This is permitted per DECISION-20260513-1100 §2-D as a log-style write exception.

---

## 9. Reference Fixture

`artifacts/projects/_reference_todo_api` is a standalone Express + better-sqlite3 `:memory:` CRUD API. It has 6 scenarios (T-1→T-6) covering all 5 endpoints + validation. It requires `node-gyp@12.3.0` (devDependency) to compile `better-sqlite3` on Node 24+ / VS2026.

Run against it directly:
```bash
node bin/forge-builtproject-test.js
# or explicit:
node bin/forge-builtproject-test.js --project artifacts/projects/_reference_todo_api
```

---

## 10. Deprecation Notice — Test Designer v1

`test_designer_v1` prompt is deprecated. `test_designer_v2` (DECISION-20260513-0930) produces L5b-compatible scenarios with all required fields. See `docs/10_runtime/18b_ROLE_PROMPTS.md`.
