# DECISION-20260513-0830 — PHASE-10 Prerequisite: PROMPT Mode Correction — CLOSED

| Field | Value |
|---|---|
| Date | 2026-05-13 |
| Owner | KhElmasry |
| Status | CLOSED |
| Closes | DECISION-20260512-1430-phase-10-prereq-prompt-mode-correction.md |
| Cost actual | $0.00 |

---

## All 11 Acceptance Criteria — VERIFIED ✓

| # | Criterion | Status |
|---|---|---|
| 1 | `role_tools.js` line 18: `required_mode: "WORKSPACE_WRITE"` | ✓ |
| 2 | `agent_tools.js` line 20: `required_mode: "WORKSPACE_WRITE"` | ✓ |
| 3 | `builtproject_tools.js` line 17: `required_mode: "WORKSPACE_WRITE"` | ✓ |
| 4 | `builtproject_vision_rule.js` created + passes boot validation | ✓ |
| 5 | `permissionPolicy.js` Step 1.10: builtproject_vision_rule wired with `getActiveMode` | ✓ |
| 6 | `forge-live-smoke.js`: `FORGE_PERMISSION_MODE=TEST` block removed | ✓ |
| 7 | `forge-retry-security-auditor.js`: same removal | ✓ |
| 8 | `node bin/forge-doctor.js` → 24 checks, 0 FAILs (22 PASS / 2 pre-existing WARN) | ✓ |
| 9 | `node bin/forge-test.js` → 133 PASS / 5 SKIP / 0 FAIL (138 total) | ✓ |
| 10 | `forge-live-smoke.js --dry-run` → exits 0 without TEST mode | ✓ |
| 11 | S138: agent.invoke in WORKSPACE_WRITE PASS | ✓ |

**Cost actual: $0.00** (all mock; dry-run made no API calls)

---

## Changes Made

| File | Change |
|---|---|
| `code/src/runtime/tools/role_tools.js` | `required_mode: "PROMPT"` → `"WORKSPACE_WRITE"` + description cleaned |
| `code/src/runtime/tools/agent_tools.js` | `required_mode: "PROMPT"` → `"WORKSPACE_WRITE"` + description cleaned |
| `code/src/runtime/tools/builtproject_tools.js` | `required_mode: "PROMPT"` → `"WORKSPACE_WRITE"` |
| `code/src/runtime/permission/rules/builtproject_vision_rule.js` | **NEW** — scope + vision_lock gate for builtproject.run_scenarios |
| `code/src/runtime/permission/permissionPolicy.js` | Added import + `_builtprojectVisionRules` factory + Step 1.10 block |
| `bin/forge-live-smoke.js` | Removed `FORGE_PERMISSION_MODE=TEST` default block (lines 66–70) |
| `bin/forge-retry-security-auditor.js` | Removed `FORGE_PERMISSION_MODE=TEST` default block (lines 28–31) |
| `code/src/testing/scenarios/S138_prereq_workspace_write_agent_invoke.json` | **NEW** — regression guard |
| `progress/status.json` | `prereq_phase_10.status: CLOSED`; `tools_registered_count: 66`; test results updated |

---

## Verification Transcripts

### `node bin/forge-doctor.js`

```
✓ HEALTHY — 0 critical, 2 warning

  ✓  node_version                 v24.14.1
  ✓  openai_api_key               set, length=164
  ✓  env_dotfile                  .env present
  ✓  api_server_port              port 4505 available
  ✓  web_server_port              web served on API port 4505
  ⚠  providers_registered         12 registered, 12 legacy (not yet v2-compliant)  [pre-existing]
  ✓  tools_registered             66 tools registered
  ✓  permission_mode              mode active: WORKSPACE_WRITE
  ✓  status_json_valid            valid v2.0, current_task=PHASE-9-CLOSED
  ✓  active_project               no active project (idle)
  ✓  missing_dependencies         6 dependencies present
  ✓  recent_execution             tool_audit.jsonl modified 0 day(s) ago
  ✓  disk_space                   artifacts/ is 40.7 MB
  ✓  trace_matrix_size            artifacts/llm/ is 17.3 MB
  ✓  shell_hardening              shell.run_with_prompt registered, sudo/su hard-denied
  ✓  environment_detection        11 detectors registered
  ✓  package_management           9 adapters (Tier-1: 6, Tier-2: 3)
  ⚠  container_runtime            2 adapter(s) registered; none available (docker/podman not running) [pre-existing]
  ✓  agent_runtime                5 adapters; agent.invoke OK; cost ledger writable; budget enforcer OK
  ✓  roles_runtime                12 roles registered; role.invoke OK
  ✓  builtproject_runtime         L5b harness OK — 4 modules, 8 assertion types, 6 reference scenarios
  ✓  kb_budget_status             no active project (idle)
  ✓  kb_indexed_sources_count     no active project (idle)
  ✓  research_role_registered     research role registered; system_prompt_id=research_v1

  duration: 2672ms
```

*Note: 2 pre-existing WARNs (providers_registered + container_runtime) present since PHASE-9 closure — not regressions.*

### `node bin/forge-test.js`

```
ALL PASS — 133 passed, 0 failed, 5 skipped (138 total)
duration: 124536ms
```

Key passes relevant to this fix:
- `✓  S72  agent.invoke with mock provider returns deterministic output` (pre-existing, still passes)
- `✓  S82  agent.invoke mock provider + unlocked vision returns SUCCESS (mock bypass)` (pre-existing)
- `✓  S138 agent.invoke allowed in WORKSPACE_WRITE mode (no PROMPT required)` ← **new**

### `node bin/forge-live-smoke.js --dry-run`

```
DRY RUN complete — no API calls made
(exits 0, WORKSPACE_WRITE mode, no TEST mode set)
```

### grep check

```
$ grep -rn "FORGE_PERMISSION_MODE.*TEST" bin/ | grep -v forge-test
(0 rows)
```

---

## Corrected tools_registered_count

`forge-doctor.js` reports `66 tools registered` at runtime. `status.json.runtime_health.tools_registered_count` was stale at 58. Corrected to 66 in this closure.

---

## PHASE-10 Unblocked

The orchestration loop (`orchestration.start_loop`) can now invoke agents via `role.invoke` and `agent.invoke` in the default `WORKSPACE_WRITE` mode without any permission workarounds.

`PHASE-10 Stage 10.0` may now begin.

---

*Authored by Claude (CTO advisor), 2026-05-13.*
*Owner: KhElmasry.*
