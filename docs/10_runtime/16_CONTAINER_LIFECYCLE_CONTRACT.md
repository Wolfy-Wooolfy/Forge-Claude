# 16 — Container Lifecycle Contract

> Authority: this document governs all container-related tool execution in Forge.
> Implemented: PHASE-7-C-1 / C-2 / C-3.

---

## 1. Purpose

Define how Forge manages container operations (run / stop / exec / logs / build / compose) as
first-class L2 Tools, with privilege safety enforced at every layer.

---

## 2. Architecture Layers

```
L1  Provider Contract   (LLM calls — untouched by container layer)
L2  Tool Runtime        code/src/runtime/tools/container_tools.js  (12 tools)
L3  Permission Policy   permissionPolicy.authorize() — Steps 1 and 1.7
L4  Doctor              checks/containerRuntime.js   (18th check)
```

### §2-DA — Container Tool Registry

Container tools are registered in `code/src/runtime/tools/container_tools.js` and auto-loaded
by `_tools_registry.js`. They expose 12 named tools:

| Tool | Mode | Notes |
|------|------|-------|
| container.list | READ_ONLY | Lists running containers |
| container.inspect | READ_ONLY | Full inspect JSON |
| container.logs | READ_ONLY | Fetch container logs |
| container.pull | WORKSPACE_WRITE | Pull image |
| container.stop | WORKSPACE_WRITE | Stop named container |
| container.run | WORKSPACE_WRITE | Start container (guarded) |
| container.build | WORKSPACE_WRITE | Build image (guarded) |
| container.exec | PROMPT | Exec in running container |
| container.compose_config | READ_ONLY | Validate/expand compose file |
| container.compose_up | WORKSPACE_WRITE | Compose up (pre-flight gated) |
| container.compose_down | WORKSPACE_WRITE | Compose down |
| container.compose_logs | READ_ONLY | Compose service logs |

### §2-DB — Runtime Adapter Registry

`code/src/runtime/container/_runtime_registry.js` loads adapters from `runtimes/`:

- `docker_runtime.js` — Docker (preferred)
- `podman_runtime.js` — Podman (Compose uses `podman-compose` binary, not `podman compose`)

Priority: docker → podman. Each adapter exposes 12 `build*Argv()` functions validated
at registration time.

### §2-DC — Runtime Contract

`code/src/runtime/container/_runtime_contract.js` defines `REQUIRED_BUILD_METHODS` and
`checkArgvForForbidden()`. Any adapter missing a required method is skipped. Any adapter
whose sample `buildRunArgv()` output contains a forbidden token is rejected.

### §2-DK — Privilege Guard

`code/src/runtime/container/_privilege_guard.js` enforces two-phase privilege inspection:

**Phase 1 — `inspectInput(input, ctx)`** (machine-agnostic, fires before runtime selection):
Checks structured input fields for privilege escalation. Returns `{ ok, severity, reason, detail }`.

**Phase 2 — `inspectArgv(argv, ctx)`** (defense-in-depth, fires after `build*Argv()`):
Scans the final argv array for forbidden tokens as a second line of defense.

Severity mapping (§2-DG):
- `HARD_DENY` → `failed("HARD_DENY", detail, {rule, action})` in execute() → FAILED status
- `DENY` → `failed("PROMPT_REQUIRED", detail, {rule, action})` in execute() (when not caught at L3)

### §2-DL — Hybrid Two-Phase Guard in execute()

Each write tool's `execute()` follows a 6-phase flow:

```
Phase 1: inspectInput  → HARD_DENY/DENY short-circuit (before pickRuntime)
Phase 2: pickRuntime   → RUNTIME_NOT_AVAILABLE if no daemon
Phase 3: buildArgv     → construct final argv
Phase 4: inspectArgv   → defense-in-depth argv scan
Phase 5: shell.run     → actual execution via L2 inner tool
Phase 6: parse output  → return structured result
```

This ordering ensures HARD_DENY violations (S59/S60/S61) return FAILED status without
requiring docker to be running. S59/S60/S61 are *positive-FAILED* expectations.

---

## 3. Permission Layer Integration

### §3.1 — Step 1.7 (container_privilege_rule)

`code/src/runtime/permission/rules/container_privilege_rule.js` fires at Step 1.7 in
`permissionPolicy.authorize()`, between shell vision lock (1.6) and mode resolution (2).

**Step A**: DENY-severity violations → `{ allow: false, reason: "PROMPT_REQUIRED" }` → DENIED
(e.g. port < 1024, network=host, user=root, restart=always). S63 is a positive-DENIED expectation.

**Step B** (container.build only):
- B1: `dockerfile_path` outside workspace root → WORKSPACE_BOUNDARY_VIOLATION → DENIED (S69)
- B2: `context_path` outside workspace root → WORKSPACE_BOUNDARY_VIOLATION → DENIED
- B3: `project_id` vision not locked → VISION_NOT_LOCKED → DENIED (S70)

**NOT caught here**: HARD_DENY violations. These are caught inside `execute()` (§2-DL Phase 1)
and return FAILED status, not DENIED. S59/S60/S61 expect FAILED.

### §3.2 — Track-A Discipline

Container tools call inner shell tool `execute()` directly (not through registry) to avoid
circular dependency. All side effects route through L2 tools. Zero direct `spawn()` or
`fs.writeFileSync()` in the container layer.

---

## 4. Doctor Check (§3.7)

`code/src/runtime/doctor/checks/containerRuntime.js` (id: `container_runtime`) checks:

1. Runtime registry loads and registers ≥1 adapter
2. No privilege invariant violations at registration time
3. `container.run` is registered in tool registry
4. Privilege guard exports `inspectInput` and `inspectArgv`
5. Detect available runtimes (`available()` call — async)

Returns:
- `PASS` — registry OK, container.run registered, ≥1 runtime available, no privilege invariant failures
- `WARN` — registry and tools OK but no runtime daemon running (expected in CI)
- `FAIL` — registry fails to load, or privilege invariant violated

---

## 5. Scenarios

| ID | Description | Expected | Requires docker |
|----|-------------|----------|----------------|
| S58 | container.run safe args | SUCCESS | Yes |
| S59 | container.run --privileged | FAILED / HARD_DENY | No |
| S60 | container.run --cap-add | FAILED / HARD_DENY | No |
| S61 | container.run bind-mount /etc | FAILED / HARD_DENY | No |
| S62 | container.run workspace-bound volume | SUCCESS | Yes |
| S63 | container.run port 80 | DENIED / PROMPT_REQUIRED | No |
| S64 | container.exec PROMPT mode | DENIED (auto-deny) | No |
| S65 | container.stop (S58 container) | SUCCESS | Yes |
| S66 | container.logs non-existent | FAILED | No |
| S67 | container.list | SUCCESS | Yes |
| S68 | container.compose_config | SUCCESS | Yes |
| S69 | container.build dockerfile outside root | DENIED | No |
| S70 | container.build vision not locked | DENIED | No |

---

## 6. Files

```
code/src/runtime/tools/container_tools.js         — 12 L2 tools
code/src/runtime/container/
  _runtime_registry.js                            — adapter registry
  _runtime_contract.js                            — contract + forbidden argv tokens
  _privilege_guard.js                             — inspectInput + inspectArgv + inspectComposeJson
  runtimes/
    docker_runtime.js                             — Docker adapter
    podman_runtime.js                             — Podman adapter
code/src/runtime/permission/rules/
  container_privilege_rule.js                     — L3 Step 1.7 rule
code/src/runtime/doctor/checks/
  containerRuntime.js                             — L4 doctor check
code/src/testing/scenarios/
  S058_*.json … S070_*.json                       — 13 scenarios
```
