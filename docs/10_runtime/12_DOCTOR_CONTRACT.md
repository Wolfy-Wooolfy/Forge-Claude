# Doctor Contract — Authority Document

| Field | Value |
|---|---|
| **Document ID** | RT-12 |
| **Authority** | Layer 0 |
| **Status** | ADOPTED — 2026-05-08 |
| **Code home** | `code/src/runtime/doctor/` |
| **Companion spec** | `code/src/runtime/doctor/SCHEMA.md` |
| **Decision** | DECISION-20260508-phase-4-doctor |

---

## 1. Why this contract exists

Before PHASE-4, a broken Forge component produced raw stack traces with no
structured indication of *which* layer failed or *how* severe. The Doctor
layer closes this by providing a single entry point — `node bin/forge-doctor.js`
— that inspects all four runtime layers (L1 Provider, L2 Tool, L3 Permission,
L4 Doctor-itself) and returns a PASS/WARN/FAIL report per check.

## 2. CLI vs endpoint (Q2 resolution)

Both surfaces call the same `runDoctor()` function:

- **CLI** (`bin/forge-doctor.js`): exits 0 when no FAIL, exits 1 if any FAIL,
  exits 2 if Doctor itself crashes.
- **HTTP endpoint** (`GET /api/system/doctor`): returns the same JSON report
  body. Added in **PHASE-6** (apiServer migration). Until then the endpoint
  does not exist; `runtime_health.doctor_endpoint_available = false`.

## 3. The 14 checks

See `code/src/runtime/doctor/SCHEMA.md §5` for the full table. Summary:

| Group | Checks |
|---|---|
| Runtime | `node_version`, `missing_dependencies` |
| Secrets | `openai_api_key`, `env_dotfile` |
| Ports | `api_server_port`, `web_server_port` |
| Layers | `providers_registered`, `tools_registered`, `permission_mode` |
| State | `status_json_valid`, `active_project`, `recent_execution` |
| Disk | `disk_space`, `trace_matrix_size` |

## 4. status.json integration (Q4 resolution)

After every `runDoctor()` call, the `progress/status.json` `runtime_health`
block is patched **additively** — no existing field is removed or repurposed:

```json
{
  "last_doctor_run":           "<ISO timestamp>",
  "last_doctor_status":        "PASS | WARN | FAIL",
  "last_doctor_counts":        { "pass": N, "warn": N, "fail": N },
  "doctor_endpoint_available": false
}
```

## 5. Future extensions

- **Health UI tab** (PHASE-10 Frontend Refactor): displays the PASS/WARN/FAIL
  table in the web interface.
- **Cron-based daily run** (PHASE-12): automated Doctor runs with alerting.
- **Self-healing actions**: out of scope for all current phases. Doctor
  diagnoses only — it never writes to application files or attempts repair.

## 6. What Doctor does NOT do

- **No self-repair**: Doctor is diagnostic-only. Identified failures must be
  fixed manually or by a dedicated repair tool (future scope).
- **No performance benchmarking**: latency/throughput are separate concerns.
- **No cost tracking**: tracked in `artifacts/ai/cost_ledger.jsonl`.
- **No check writes to disk**: only `runDoctor()` itself writes the report
  file and patches `status.json`, and both are opt-out via options.

---

**END OF DOCUMENT**
