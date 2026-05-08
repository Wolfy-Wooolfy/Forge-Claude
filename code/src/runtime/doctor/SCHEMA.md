# Doctor Contract — Authoritative Specification

> **Authority:** Binding specification for the Doctor / Health layer (L4).
> **Code location:** `code/src/runtime/doctor/`
> **Companion doc:** `docs/10_runtime/12_DOCTOR_CONTRACT.md`

---

## 1. Why this exists

Before PHASE-4, when Forge breaks the user sees a raw stack trace. Doctor
turns this into a structured PASS/WARN/FAIL report: each check is isolated,
parallel, and readable. A single `node bin/forge-doctor.js` tells the user
exactly which component is broken and at what severity.

---

## 2. Check shape

Each check is a small module that exports a plain object:

```javascript
{
  id:          string,   // unique, snake_case, matches filename
  description: string,   // human-readable one-liner
  fn(ctx):     { status, detail } | Promise<{ status, detail }>
}
```

`ctx` shape:

```javascript
{
  root:         string,    // absolute path to workspace root
  api_port:     number,    // default 4505
  web_port:     number,    // default same as api_port
  skip_checks:  string[]   // IDs to skip (filtered before dispatch)
}
```

---

## 3. Check status enum

| Status | Meaning |
|---|---|
| `PASS` | Component healthy |
| `WARN` | Degraded but functional — doctor exits 0 |
| `FAIL` | Broken — doctor exits 1 |

---

## 4. Report shape (stable contract — schema_version 1.0)

```javascript
{
  schema_version: "1.0",
  ok:             boolean,           // false if any check is FAIL
  summary:        string,            // "N critical, M warning"
  counts:         { pass, warn, fail },
  started_at:     string,            // ISO 8601
  duration_ms:    number,
  checks: [
    { id: string, status: "PASS"|"WARN"|"FAIL", detail: string }
  ],
  links: {
    ui:        string,   // http://localhost:<api_port>/
    api:       string,   // http://localhost:<api_port>/api/system/doctor
    logs:      string,   // logs/forge.log
    decisions: string    // artifacts/decisions/
  },
  report_path?: string   // set if write_report option enabled
}
```

---

## 5. The 14 checks shipped in PHASE-4

| # | id | Description |
|---|---|---|
| 1 | `node_version` | Node.js >= 20.0.0 |
| 2 | `openai_api_key` | OPENAI_API_KEY set and length >= 20 |
| 3 | `env_dotfile` | .env file present at root |
| 4 | `api_server_port` | API port bindable or in use (Forge running) |
| 5 | `web_server_port` | Web port bindable or in use |
| 6 | `providers_registered` | Provider registry loads successfully |
| 7 | `tools_registered` | Tool registry loads with >= 1 tool |
| 8 | `permission_mode` | Active permission mode (DANGER_FULL_ACCESS → WARN) |
| 9 | `status_json_valid` | progress/status.json parseable and v2.0 |
| 10 | `active_project` | Active project consistent with filesystem |
| 11 | `missing_dependencies` | npm dependencies present in node_modules |
| 12 | `recent_execution` | tool_audit.jsonl modified within 7 days (or fresh install) |
| 13 | `disk_space` | artifacts/ directory < 100 MB |
| 14 | `trace_matrix_size` | artifacts/llm/ directory < 50 MB |

---

## 6. CLI exit codes

| Code | Meaning |
|---|---|
| 0 | All checks PASS or WARN — no FAIL |
| 1 | At least one check FAIL |
| 2 | Doctor itself crashed before producing report |

---

## 7. status.json integration (additive only — Q4 resolution)

`runDoctor()` patches `progress/status.json` `runtime_health` block after each
run. Fields written:

```json
{
  "last_doctor_run":           "<ISO timestamp>",
  "last_doctor_status":        "PASS | WARN | FAIL",
  "last_doctor_counts":        { "pass": N, "warn": N, "fail": N },
  "doctor_endpoint_available": false
}
```

No existing field is removed or repurposed. `doctor_endpoint_available` is
set to `false` here; PHASE-6 (apiServer migration) will flip it to `true`.

---

## 8. Boot validation

The check registry (`_registry.js`) loads all 14 checks at module import via
explicit `require()`. If any check file fails to load, the registry throws —
no partial doctor. This is intentional fail-closed behaviour.

---

## 9. What this does NOT cover

- **Self-healing:** Doctor diagnoses only — it never writes to application
  files or attempts automatic repair.
- **Performance benchmarking:** Latency and throughput are separate concerns.
- **Cost tracking:** Tracked separately in `artifacts/ai/cost_ledger.jsonl`.
- **GET /api/system/doctor endpoint:** Added in PHASE-6 (apiServer migration).
- **Health UI tab:** Added in PHASE-10 (Frontend Refactor).
