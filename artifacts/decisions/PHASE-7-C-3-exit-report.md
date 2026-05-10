# PHASE-7-C-3 Exit Report — Container Lifecycle (Trilogy 3/3)

**Date:** 2026-05-10
**Status:** CLOSED
**Owner approval:** Implicit — "كمل" (continue) received at session start

---

## Closure Gate Checklist

- [x] `node bin/forge-test.js` → 65 passed, 0 failed, 5 skipped (70 total)
- [x] All smoke suites PASS:
  - `test_tool_runtime.js` → 22/22
  - `test_doctor.js` → 7/7
  - `test_permission_layer.js` → 16/16
  - `test_harness_meta.js` → 13/13
- [x] Decision artifact: `DECISION-20260510-phase-7-C-3-container-lifecycle.md`
- [x] `progress/status.json.next_step` → PHASE-8
- [x] Exit report written (this file)

---

## Files Modified / Created

### New files
| File | Description |
|------|-------------|
| `code/src/runtime/tools/container_tools.js` | 12 L2 container tools |
| `code/src/runtime/container/_privilege_guard.js` | Phase 1 + Phase 2 privilege guard |
| `code/src/runtime/container/_runtime_contract.js` | Runtime adapter contract |
| `code/src/runtime/container/_runtime_registry.js` | Runtime adapter registry |
| `code/src/runtime/container/runtimes/docker_runtime.js` | Docker adapter |
| `code/src/runtime/container/runtimes/podman_runtime.js` | Podman adapter |
| `code/src/runtime/permission/rules/container_privilege_rule.js` | L3 Step 1.7 rule |
| `code/src/runtime/doctor/checks/containerRuntime.js` | L4 doctor check (18th) |
| `docs/10_runtime/16_CONTAINER_LIFECYCLE_CONTRACT.md` | Contract document |
| `code/src/testing/scenarios/S058_*.json` … `S070_*.json` | 13 scenarios |

### Modified files
| File | Change |
|------|--------|
| `code/src/runtime/permission/permissionPolicy.js` | Added Step 1.7 (container_privilege_rule) |
| `code/src/runtime/doctor/_registry.js` | Added containerRuntime (17 → 18 checks) |
| `code/src/testing/assertions/state_field_equals.js` | Fixed dot-notation traversal |
| `verify/smoke/test_tool_runtime.js` | Tool count 37 → 50 |
| `verify/smoke/test_doctor.js` | Check count 17 → 18 |
| `verify/smoke/test_harness_meta.js` | Scenario count 57 → 70, M5 updated for container SKIPs |
| `verify/smoke/test_permission_layer.js` | Added S11 (Step 1.7 port 80 test) |
| `progress/status.json` | Closed C-3, updated all counts |

---

## New Behaviour

### 12 Container Tools
All container operations route through L2 tools. Zero direct `spawn()` or `fs.writeFileSync()` in the container layer (Track-A compliant).

### §2-DL Hybrid Two-Phase Guard
`inspectInput()` fires **before** `pickRuntime()` so HARD_DENY violations return FAILED without requiring docker to be running. This is why S59/S60/S61 pass in CI with no docker daemon.

### L3 container_privilege_rule (Step 1.7)
DENY-severity violations (low ports, network=host, etc.) are intercepted at the permission layer and return DENIED status — not FAILED. This separation is intentional:
- HARD_DENY → FAILED (execute-level, no docker needed)
- DENY → DENIED (policy-level, no docker needed)
- Execute-time container actions → SKIP (docker needed)

### state_field_equals dot-notation fix
`{field: "context.rule"}` now correctly traverses nested state objects. Previously would look for literal key `"context.rule"`.

---

## Scenarios Summary

| ID | Description | Status |
|----|-------------|--------|
| S58 | container.run safe | SKIP (no docker) |
| S59 | container.run --privileged | PASS (HARD_DENY without docker) |
| S60 | container.run --cap-add | PASS (HARD_DENY without docker) |
| S61 | container.run bind-mount /etc | PASS (HARD_DENY without docker) |
| S62 | container.run workspace volume | SKIP (no docker) |
| S63 | container.run port 80 | PASS (DENIED at L3) |
| S64 | container.exec PROMPT | PASS (DENIED auto-deny prompter) |
| S65 | container.stop | SKIP (no docker) |
| S66 | container.logs non-existent | PASS (FAILED/RUNTIME_NOT_AVAILABLE) |
| S67 | container.list | SKIP (no docker) |
| S68 | container.compose_config | SKIP (no docker) |
| S69 | container.build outside root | PASS (DENIED at L3) |
| S70 | container.build vision unlocked | PASS (DENIED at L3) |

---

## Risks

1. **Docker-dependent scenarios (S58/S62/S65/S67/S68)**: permanently SKIP in CI without docker daemon. Accepted — integration testing requires a container runtime.
2. **Podman-compose binary**: `container.compose_up/down/logs/config` with podman use `podman-compose` (separate Python package), not `podman compose`. If `podman-compose` is absent, `BINARY_NOT_FOUND` is returned at execute time.
3. **Volume path resolution**: relative paths in `volumes[].host` are resolved relative to workspace root, not cwd. Cross-session consistency is maintained by `_resolveVolumePaths()`.

---

## Next: PHASE-8 — Built-Project Test Harness

Requires new decision artifact and explicit owner approval before starting.
