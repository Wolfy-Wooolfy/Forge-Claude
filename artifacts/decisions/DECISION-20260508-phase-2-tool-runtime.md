# DECISION-20260508-phase-2-tool-runtime

| Field | Value |
|---|---|
| **Decision ID** | DECISION-20260508-phase-2-tool-runtime |
| **Status** | APPROVED |
| **Authored** | 2026-05-08 |
| **Related** | DECISION-20260508-phase-1-provider-contract, DECISION-20260508-phase-0.5-warn-resolutions-pre-phase-2 |

---

## 1. Context

PHASE-2 builds L2 Tool Runtime Layer per `architecture/FORGE_V2_BLUEPRINT.md`
Part B and `code/src/runtime/tools/SCHEMA.md`. The runtime is built in
isolation: no existing file outside `code/src/runtime/` is modified.

The 23 tools shipped in PHASE-2 are the seven families defined in SCHEMA.md §6.
Additional tool families (`vision.*`, `built_project_tests.*`, `research.*`)
are deferred to their owning phases.

## 2. Decision

Create the following 11 files (full content per phase prompt §3):

| # | Path | Purpose |
|---|---|---|
| 1 | `code/src/runtime/audit/toolAuditLog.js` | append-only JSONL log |
| 2 | `code/src/runtime/tools/_contract.js` | defineTool() helper + envelope helpers |
| 3 | `code/src/runtime/tools/_registry.js` | registry + invoke() + permitAll default |
| 4 | `code/src/runtime/tools/fs_tools.js` | 7 tools: read_file, write_file, append_file, delete_file, list_dir, exists, glob |
| 5 | `code/src/runtime/tools/shell_tools.js` | 2 tools: run, run_in_workspace |
| 6 | `code/src/runtime/tools/http_tools.js` | 2 tools: get, post |
| 7 | `code/src/runtime/tools/state_tools.js` | 2 tools: read, patch |
| 8 | `code/src/runtime/tools/project_tools.js` | 4 tools: create, activate, list, delete |
| 9 | `code/src/runtime/tools/artifact_tools.js` | 3 tools: write_decision, write_audit, list |
| 10 | `code/src/runtime/tools/pipeline_tools.js` | 3 tools: run_module, advance_stage, mark_blocked |
| 11 | `docs/10_runtime/11_TOOL_RUNTIME_CONTRACT.md` | authority companion to SCHEMA.md |

Also create: `verify/smoke/test_tool_runtime.js` (smoke test, 12 scenarios).

Total: 23 tools registered + audit log + registry infrastructure.

## 3. Acceptance criteria

1. All JS files exist and pass `node --check`.
2. `node -e "require('./code/src/runtime/tools/_registry').getDefaultRegistry()"` loads
   without error and reports 23 tools, all `required_mode` valid.
3. Smoke test (`verify/smoke/test_tool_runtime.js`) passes 12/12 scenarios.
4. No file outside `code/src/runtime/`, `docs/10_runtime/`, `verify/smoke/`,
   `artifacts/decisions/`, `progress/status.json` is modified.
5. Tool Registry uses `permitAll` as `authorize()` default (PHASE-3 wires real
   policy via `setAuthorizeFunction`).
6. `progress/status.json.current_task` flips to `PHASE-2-CLOSED`,
   `runtime_health.tools_registered_count` set to 23.

## 4. Risks

- **R1.** Path safety in `fs_tools.js`: paths resolving outside workspace root
  return `PATH_OUTSIDE_ROOT` regardless of permission mode. Belt-and-braces —
  PHASE-3 permission layer adds a second defense.
- **R2.** Shell tools use `spawn()` with `shell: false` to avoid injection.
  `HARD_DENY_ARGV0 = ["rm"]` catches obvious destructive commands before
  permission check. Additional deny rules added in PHASE-3.
- **R3.** `http_tools` allow-list defaults to 6 hosts. Override via
  `FORGE_HTTP_ALLOW_HOSTS` env var.
- **R4.** `state.patch` uses optimistic concurrency via `_version`. Concurrent
  patches conflict-fail rather than corrupting state.

## 5. Rollback plan

```bash
git checkout HEAD~1 -- progress/status.json docs/10_runtime/11_TOOL_RUNTIME_CONTRACT.md
rm -rf code/src/runtime/audit code/src/runtime/tools/_contract.js \
       code/src/runtime/tools/_registry.js code/src/runtime/tools/*_tools.js \
       verify/smoke/test_tool_runtime.js
```

No state outside the new files and `progress/status.json` is touched.

## 6. Owner approval

Approval: "approved" — 2026-05-08
