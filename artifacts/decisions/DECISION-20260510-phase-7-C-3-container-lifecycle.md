# DECISION-20260510-phase-7-C-3-container-lifecycle

| Field | Value |
|---|---|
| Date | 2026-05-10 |
| Owner | KhElmasry |
| Status | OWNER_APPROVED_2026-05-10 |
| Track | TRACK-B (Container Lifecycle — Trilogy Part 3 of 3) |
| Phase | PHASE-7-C-3 |
| Prerequisite | PHASE-7-C-2 CLOSED (37 tools, 17 doctor checks, 57/57 scenarios) |

---

## 1. Scope

PHASE-7-C-3 adds container lifecycle orchestration to Forge under a new `container.*` namespace, with pluggable Docker/Podman runtime adapters, centralized privilege enforcement (D4), full Compose support, and Dockerfile-based image building.

**What is built:**
- F1: Runtime adapter contract + auto-discovery registry
- F2: Docker runtime adapter (full lifecycle + Compose)
- F3: Podman runtime adapter (full lifecycle + Compose, parity with Docker)
- F4: Centralized `_privilege_guard.js` — D4 enforcement, used by adapters AND L2 tools
- F5: 12 L2 tools under `container.*`
- F6: L3 rule `container_privilege_rule` — fires at policy Step 1.7
- F7: Doctor check `containerRuntime`
- F8: Contract doc `docs/10_runtime/16_CONTAINER_LIFECYCLE_CONTRACT.md`
- F9: 13 scenarios S58–S70

**What is NOT built (deferred — explicit, owner-acknowledged):**
- Cap-add allowlist — HARD DENY all `--cap-add`/`--cap-drop` (raise via DANGER_FULL_ACCESS shell.run if needed)
- Container ownership tracking (exec is PROMPT, no "started by us" tracking)
- Network/volume create/inspect tools (Compose handles declaratively; raw network/volume management deferred)
- Image registry login (`docker login`) — secrets handling = PHASE-12
- pause/unpause/restart (v1 surface = run + stop + run again)
- Healthcheck parsing
- Multi-arch builds (`buildx`)

---

## 2. Architectural Decisions (CTO-locked, OWNER_APPROVED 2026-05-10)

### §2-NS — Namespace Decision: `container.*` (NEW, separate from pkg.*)

**Decision:** Container lifecycle lives in `container.*`, NOT `pkg.*`.

**Rationale:**
1. Different domain model: `pkg` = library/dependency, `container` = long-lived runtime process.
2. Different lifecycle verbs: `pkg` is install/remove (one-shot, manifest-state). `container` is run/stop/exec/logs/build (long-lived, stateful).
3. Different permission model: `pkg` Tier-1/Tier-2 maps to WORKSPACE_WRITE / PROMPT. `container` adds three new privilege axes (bind-mount, port, capability) requiring a separate L3 rule.
4. **§2.X precedent from 7-C-2:** Mixing concerns in one namespace caused the env→pkg deviation. Repeating that pattern at higher cost is unacceptable.

**Implication:** New `code/src/runtime/container/` module tree, parallel to `pkg/`. Independent registry, independent privilege guard, independent contract doc.

---

### §2-D1 — Runtime Adapter Parity (Docker + Podman)

**Decision:** Two runtime adapters loaded at registry build time:
- `docker_runtime.js` — argv-builder for Docker CLI
- `podman_runtime.js` — argv-builder for Podman CLI

**Adapter contract:** Each runtime adapter MUST implement:
```js
{
  id:      "docker" | "podman",
  label:   string,
  available: () => boolean,            // probes the binary at registry init
  buildRunArgv:        (input, ctx) => string[],
  buildStopArgv:       (input, ctx) => string[],
  buildExecArgv:       (input, ctx) => string[],
  buildLogsArgv:       (input, ctx) => string[],
  buildPullArgv:       (input, ctx) => string[],
  buildBuildArgv:      (input, ctx) => string[],
  buildListArgv:       (input, ctx) => string[],
  buildInspectArgv:    (input, ctx) => string[],
  buildComposeUpArgv:     (input, ctx) => string[],
  buildComposeDownArgv:   (input, ctx) => string[],
  buildComposeLogsArgv:   (input, ctx) => string[],
  buildComposeConfigArgv: (input, ctx) => string[]
}
```

**Selection:** Defaults to `docker` if both available. Override via `ctx.runtime_id` or input field `runtime_id`. The `available()` probe is run ONCE at registry init via `env.probe_binary`. **Adapter never spawns directly** — it ONLY builds argv. The L2 tools spawn via `shell.run_with_prompt` or `shell.run_in_workspace`. This is the same Track-A discipline 7-C-2 enforced.

**Privilege invariant (registration-time check):**
The runtime registry validates each adapter's `buildRunArgv({})` (with mock input) does not contain `--privileged`, `--cap-add`, `--cap-drop`, or `--security-opt`. Hard-coded privilege escalation in adapter source = registration rejection.

---

### §2-D2 — Compose Support: FULL (4 tools, owner-approved scope)

**Decision:** Compose lifecycle is shipped fully in v1, not deferred:
- `container.compose_up`
- `container.compose_down`
- `container.compose_logs`
- `container.compose_config` (READ_ONLY — invokes `docker compose config` to expand YAML; used as the canonical YAML parser for our privilege guard)

**Architectural rationale:**
1. Forge's mission (Part B-2) is orchestrating real-world projects. Real projects use compose (DB + API + cache + worker = 4 services). Single-container support alone is insufficient.
2. `compose_config` is the security keystone. Without it, our privilege guard cannot validate compose files before `up`, leaving compose_up as a security blind spot. Defense-in-depth requires `compose_config` from day one.
3. Marginal cost is small: 4 tools share argv-builder + privilege guard with single-container tools.

**YAML handling:** Forge does NOT write its own YAML parser. `compose_config` calls `docker compose config --format json` and parses the result. The privilege guard runs on the **expanded JSON output**, not the raw YAML. Same defense-in-depth, leverages Docker's canonical parser.

---

### §2-D3 — Pull + Build (Dockerfile-based, workspace-bounded)

**Decision:** `container.pull` and `container.build` ship in v1.

**`container.pull`:**
- `required_mode`: WORKSPACE_WRITE (image cache write is workspace-equivalent for our purposes)
- Input: `image: string`, `runtime_id?: string`
- HARD DENY: image strings containing `;`, `&`, `|`, `$(`, backticks (injection prevention even though shell:false)

**`container.build`:**
- `required_mode`: WORKSPACE_WRITE
- Input: `dockerfile_path`, `context_path`, `tag`, `runtime_id?`
- **Workspace boundary HARD DENY:** Both `dockerfile_path` and `context_path` MUST resolve inside `artifacts/projects/<project_id>/`. Anything outside → DENIED with `WORKSPACE_BOUNDARY_VIOLATION`.
- `vision_lock_rule` applies: `container.build` creates persistent images = mutation = vision must be locked.

---

### §2-D4 — Privilege Model (the keystone)

**Centralized in `code/src/runtime/container/_privilege_guard.js`.** Imported by both runtime adapters (registration-time check) and L2 tools (execute-time check). Single source of truth.

| User intent | Verdict | Mode required | Rationale |
|---|---|---|---|
| Bind-mount inside `artifacts/projects/<id>/` | ALLOW | WORKSPACE_WRITE | Workspace boundary |
| Bind-mount outside workspace (e.g. `/etc:/etc`) | HARD DENY | DANGER_FULL_ACCESS escape | Filesystem escape |
| Port mapping `>=1024` | ALLOW | WORKSPACE_WRITE | User-space ports |
| Privileged port `<1024` (`-p 80:80`) | DENY | PROMPT | Requires privilege; per-call confirmation |
| `--privileged` flag | HARD DENY | — | Never. No escape. |
| `--cap-add ALL` | HARD DENY | — | Never. No escape. |
| `--cap-add <any>` | HARD DENY | — | v1 deliberately denies all caps; raise via shell.run + DANGER_FULL_ACCESS |
| `--cap-drop <any>` | HARD DENY | — | Same — uniform rule. |
| `--security-opt seccomp=unconfined` | HARD DENY | — | Sandbox escape vector |
| `--security-opt apparmor=unconfined` | HARD DENY | — | Same |
| `--device <any>` | HARD DENY | — | Hardware access escape |
| `--pid=host` / `--ipc=host` / `--uts=host` | HARD DENY | — | Namespace escape |
| `--network=host` | DENY | PROMPT | Network namespace escape; per-call owner approval required |
| `--user 0` / `--user root` | DENY | PROMPT | Root inside container; per-call confirmation |
| `--restart always` / `--restart unless-stopped` | DENY | PROMPT | Persistent process; per-call confirmation |

**Rationale for cap HARD DENY (§2-DA):**
1. Linux capabilities are not safely mode-graded by non-experts. NET_ADMIN can be benign or a breakout vector depending on context.
2. PROMPT-for-cap is false safety: non-technical owner cannot meaningfully approve `--cap-add SYS_ADMIN`.
3. Allowlists scope-creep (NET_BIND_SERVICE today, IPC_LOCK tomorrow, SYS_PTRACE next week — effectively ALL).
4. `shell.run` with DANGER_FULL_ACCESS is the correct escape hatch for owner-accepted risk; permission boundary stays clear.

**Rationale for `container.exec` PROMPT (§2-DC):**
1. Ownership tracking ("started by us") is fragile state with arbitrary-code-execution failure mode if it goes wrong.
2. Container origin is not the right safety predicate anyway — container can hold third-party images, production data.
3. Hard-deny exec just pushes owner to `shell.run docker exec ...` (same risk, less audit trail).
4. PROMPT shows full argv to owner per call; deterministic deny in TEST mode; audit trail unimpeachable.

**Implementation order in `permissionPolicy.authorize()`:**
- Step 1 — Hard deny (existing argv0 + patterns from shell)
- Step 1.5 — Vision lock rules (existing)
- Step 1.6 — Shell vision lock rules (existing)
- **Step 1.7 — Container privilege rules (NEW — `container_privilege_rule`)** — inserted here
- Step 2 — Resolve active context
- ... (existing flow)

The container privilege rule fires only for tools whose `name` starts with `container.`. Other tools fall through unchanged.

---

### §2-DA — Container.run Default = Detached (Architectural Note)

**Decision:** `container.run` spawns detached by default. Returns `container_id` immediately. Owner uses `container.logs` and `container.stop` for lifecycle.

**Rationale:** Containers are long-lived. Block-waiting in an L2 tool means 30s timeout → kill SIGTERM → zombie container. Unacceptable.

**Override:** `wait: true` in input — tool blocks until container exits, returns full output. Used for short-lived task containers (e.g. `container.run` a migration script). Default is detached.

---

### §2-DB — Test-First Discipline (Scenarios Before Implementation)

S58–S70 are written FIRST in §3.1, before any container code. Each scenario:
- ≥4 assertions
- `requires_binary` set on scenarios that actually spawn containers
- Mix of positive (allow → SUCCESS) and negative (privilege violation → DENIED) cases
- Negative cases dominate (the privilege guard is the high-leverage surface)

**Scenario list:**

| ID | Type | Test |
|---|---|---|
| S58 | direct_tool | `container.run` with safe args → SUCCESS (requires_binary: docker) |
| S59 | direct_tool | `container.run` with `--privileged` → HARD DENY |
| S60 | direct_tool | `container.run` with `--cap-add NET_ADMIN` → HARD DENY |
| S61 | direct_tool | `container.run` with bind-mount `/etc:/etc` → HARD DENY (workspace boundary) |
| S62 | direct_tool | `container.run` with bind-mount inside workspace → SUCCESS (requires_binary: docker) |
| S63 | direct_tool | `container.run` with port `-p 80:80` in TEST mode → DENIED (PROMPT auto-deny in TEST) |
| S64 | direct_tool | `container.exec` in TEST mode → DENIED (PROMPT auto-deny) |
| S65 | direct_tool | `container.stop` after `container.run` → SUCCESS (requires_binary: docker) |
| S66 | direct_tool | `container.logs` on a non-existent container → status FAILED, exit_code != 0 |
| S67 | direct_tool | `container.list` (READ_ONLY) → SUCCESS (requires_binary: docker) |
| S68 | direct_tool | `container.compose_config` on workspace-local compose.yml → SUCCESS (requires_binary: docker) |
| S69 | direct_tool | `container.build` outside workspace → HARD DENY (workspace boundary) |
| S70 | direct_tool | `container.build` with vision NOT locked → DENIED VISION_NOT_LOCKED |

**Coverage rationale:**
- 7 negative scenarios (privilege/boundary/vision rules) — proves the guard works
- 6 positive scenarios — proves the happy path is wired
- 5 of 13 are policy-only (no `requires_binary`) — guaranteed PASS on any machine
- 8 of 13 require docker — SKIP gracefully if absent

---

### §2-DG — Severity-to-Envelope Mapping (Tool Execute) [REVISED — CTO-locked 2026-05-10]

Uniform pattern — no special cases. Applied in §3.5 tool execute(), not in the guard itself:

| Guard severity | Envelope `reason` | Envelope `context` |
|---|---|---|
| `"HARD_DENY"` | `"HARD_DENY"` | `{ rule: guard.reason, action: "<verb>" }` |
| `"DENY"` | `"PROMPT_REQUIRED"` | `{ rule: guard.reason, action: "<verb>" }` |
| `ok: true` | — proceed to execute — | — |

The guard always returns rule-specific reasons (`PRIVILEGED_FLAG`, `WORKSPACE_BOUNDARY_VIOLATION`, etc.).
The L2 tool execute() is the single translation point. No per-rule branching.

**Note on L3 rules:** `shell_vision_lock_rule` and `container_privilege_rule` (Step 1.7) return
their own reason strings directly in the envelope (`"VISION_NOT_LOCKED"`, `"WORKSPACE_BOUNDARY_VIOLATION"`)
because they fire at policy layer before execute() runs. This is intentional — L3 rules and L2
guards have different semantics and different code paths.

---

### §2-DH — Compose Config Output Format (Probe-and-Fallback) [CTO-locked 2026-05-10]

**Context:** compose output format depends on the compose *provider* installed, not on the runtime
selection. `docker compose config --format json` is canonical for Docker Compose v2. Standalone
`podman-compose` newer versions also support `--format json`; older versions are YAML-only.
The correct discriminator is "is the output JSON-parseable?" not "which runtime was selected?".

**Decision — Option D (Probe-and-Fallback):**

Both adapters (`docker_runtime`, `podman_runtime`) always append `"--format", "json"` to
`buildComposeConfigArgv`. Adapter output is homogeneous.

`container.compose_config` tool execute() probes the actual capability:
```js
try {
  const parsed = JSON.parse(result.output.stdout);
  return ok({ services: parsed.services || {}, ... });
} catch (e) {
  return failed("UNSUPPORTED_COMPOSE_OUTPUT",
    "compose provider returned non-JSON output: " + e.message,
    { runtime_id: adapter.id, action: "compose_config" });
}
```

`container.compose_up` MUST call `compose_config` as pre-flight before spawning. If
`compose_config` returns `UNSUPPORTED_COMPOSE_OUTPUT`, `compose_up` returns the same error
(defense in depth — privilege guard cannot run without validated JSON).

**Options rejected:**
- Option A (docker-only): artificially blocks podman + docker-compose binary combos
- Option B (regex YAML): rejected — regex on YAML is fragile; privilege guard requires structure
- Option C (deny by runtime ID): wrong discriminator — should probe capability, not assume

**S68 unaffected:** `requires_binary: docker` guarantees a JSON-capable compose provider on
machines where the test runs.

---

### §2-DI — shell.run_read_only: New L2 Tool for Read-Only Spawns [CTO-locked 2026-05-10]

**Context:** 5 of 12 container tools (logs, list, inspect, compose_logs, compose_config) are
READ_ONLY per §2-F5. All existing shell spawn tools have required_mode ≥ WORKSPACE_WRITE.
No path exists to spawn a read-only command without privilege escalation. This is a cross-cutting
gap affecting 40% of §3.5 tools.

**Decision:** Add `shell.run_read_only` as a new L2 tool in `code/src/runtime/tools/shell_tools.js`.

**Tool spec:**

| Property | Value |
|---|---|
| name | `"shell.run_read_only"` |
| required_mode | `"READ_ONLY"` |
| input.argv | `string[]` — full command argv (argv[0] = binary) |
| input.env | `object?` — key-value pairs, allowlist applied |
| input.timeout_ms | `number?` — execution timeout |
| input.project_id | `string?` — for audit context only (no path enforcement) |

**Constraints:**
- Same argv[0] HARD_DENY list as `shell.run` (rm, sudo, chmod, etc.)
- Env allowlist applied (same as other shell tools)
- No workspace path enforcement — callers are responsible for read-only semantics
- Audit log entry written (tool name, argv, exit_code)

**Container tool wiring (authoritative — §3.5 MUST follow exactly):**

| Container tool | Inner shell tool | Rationale |
|---|---|---|
| `container.run` | `shell.run_in_workspace` | workspace-scoped, WORKSPACE_WRITE |
| `container.stop` | `shell.run_in_workspace` | workspace-scoped, WORKSPACE_WRITE |
| `container.exec` | `shell.run_with_prompt` | PROMPT gate, per-call approval |
| `container.logs` | `shell.run_read_only` | read-only, no workspace scope |
| `container.pull` | `shell.run_in_workspace` | modifies image cache, WORKSPACE_WRITE |
| `container.build` | `shell.run_in_workspace` | vision lock required, WORKSPACE_WRITE |
| `container.list` | `shell.run_read_only` | read-only, no workspace scope |
| `container.inspect` | `shell.run_read_only` | read-only, no workspace scope |
| `container.compose_up` | `shell.run_in_workspace` | workspace-scoped, WORKSPACE_WRITE |
| `container.compose_down` | `shell.run_in_workspace` | workspace-scoped, WORKSPACE_WRITE |
| `container.compose_logs` | `shell.run_read_only` | read-only, no workspace scope |
| `container.compose_config` | `shell.run_read_only` | read-only, config inspection |

**Tool count impact:** 37 (baseline) + 12 (container.*) + 1 (shell.run_read_only) = **50 total**

**Files to modify:**
- `code/src/runtime/tools/shell_tools.js` — add `shell.run_read_only` definition
- `verify/smoke/test_tool_runtime.js` — tool count 37 → 50

---

### §2-DJ — project_id Required for All container.* Tools [CTO-locked 2026-05-10]

**Decision:** Every tool in the `container.*` namespace requires `project_id` in its input schema.

**Rationale:**
1. Workspace boundary enforcement — privilege guard inspects volume mount paths relative to workspace root anchored by project_id
2. Vision lock anchoring — `shell.run_in_workspace` checks vision.md for the given project_id
3. Lifecycle traceability — container operations are audited per-project
4. Consistency with §2-D3 — `container.build` already requires project_id; all peers follow same contract

**Scenario impact:** 10 of 13 scenarios (S58–S68 excluding S62, S69, S70) needed project_id added.
Pattern: `project_id = "test_container_s<NN>"` per scenario to prevent cross-scenario pollution.

**Vision.md fixture requirement (revised per §2-DK):**
- `shell.run_in_workspace` AND `shell.run_read_only` both trigger `shell_vision_lock_rule` (Step 1.6)
- Negative scenarios (privilege guard / policy fires BEFORE shell tool) → no fixture needed
- S58, S65, S66, S67, S68 → vision.md added (vision_locked: true)
- S62 → vision.md already present; S69 → caught by container_privilege_rule; S70 → vision_locked: false (intentional)

---

### §2-DK — shell.run_read_only Coverage in shell_vision_lock_rule [CTO-locked 2026-05-10]

**Decision:** `shell_vision_lock_rule` extended to handle `shell.run_read_only` identically to
`shell.run_in_workspace` — uses `input.project_id` directly (no argv scanning).

**Fix applied in:** `code/src/runtime/permission/rules/shell_vision_lock_rule.js`

**Rationale:** READ operations on container/workspace state in an unlocked-vision project leak
information (logs, inspect output, container list). `vision_locked = "authorized for project
operations"` — read operations require the same authorization as writes. Gap was introduced
when `shell.run_read_only` was added in §3.5 without updating the rule.

**Scenarios affected:** S66 (logs), S67 (list), S68 (compose_config) now correctly blocked when
vision not locked. S58 (run) and S65 (stop) use `shell.run_in_workspace` — already covered.

---

### §2-DL — Hybrid Two-Phase Guard (Execute Order) [CTO-locked 2026-05-10]

**Context:** Original §3.5 skeleton placed `pickRuntime` before the privilege guard. This creates
an execution order conflict: S59/S60/S61 (no `requires_binary`) would receive `RUNTIME_NOT_AVAILABLE`
instead of `HARD_DENY` on machines without docker, because `pickRuntime` fails first.

**Decision — Option C (Hybrid Two-Phase Guard):**

Phase 1 fires BEFORE `pickRuntime` — checks structured input fields directly (no argv yet):
- `input.privileged === true` → HARD_DENY, PRIVILEGED_FLAG
- `input.cap_add` non-empty array → HARD_DENY, CAP_ADD
- `input.cap_drop` non-empty array → HARD_DENY, CAP_DROP
- `input.security_opt` non-empty array → HARD_DENY, SECURITY_OPT
- `input.devices` non-empty array → HARD_DENY, DEVICE_MOUNT
- `input.pid/ipc/uts === "host"` → HARD_DENY, HOST_PID / HOST_IPC / HOST_UTS
- `input.network === "host"` → DENY, HOST_NETWORK
- `input.user === "0" | "root"` → DENY, USER_ROOT
- `input.restart === "always" | "unless-stopped"` → DENY, RESTART_POLICY
- `input.volumes[]` with host path outside workspace root → HARD_DENY, WORKSPACE_BOUNDARY_VIOLATION
- `input.ports[]` with host port < 1024 → DENY, PRIVILEGED_PORT

Phase 2 fires AFTER `buildArgv` — full `inspectArgv` as defense-in-depth (catches anything the
adapter might add beyond what the input directly specifies).

**Authoritative 6-phase execute() flow:**
```
1. inspectInput(input, ctx)       ← Phase 1: structured fields, machine-agnostic
2. pickRuntime(input.runtime_id)  ← returns RUNTIME_NOT_AVAILABLE if absent
3. adapter.build*Argv(input, ctx) ← argv construction
4. inspectArgv(argv, ctx)         ← Phase 2: defense-in-depth, catches adapter additions
5. invoke inner shell tool         ← Track-A discipline
6. map result → envelope           ← §2-DG uniform mapping
```

**Implemented in:**
- `code/src/runtime/container/_privilege_guard.js` — adds `inspectInput(input, ctx)` export
- `code/src/runtime/tools/container_tools.js` — all 12 tools follow 6-phase pattern

**Smoke tests (T1–T6, run inline via node -e):**
- T1: `inspectInput({ privileged: true }, {})` → `{ ok: false, severity: "HARD_DENY", reason: "PRIVILEGED_FLAG" }`
- T2: `inspectInput({ cap_add: ["NET_ADMIN"] }, {})` → `{ ok: false, severity: "HARD_DENY", reason: "CAP_ADD" }`
- T3: `inspectInput({ cap_drop: ["ALL"] }, {})` → `{ ok: false, severity: "HARD_DENY", reason: "CAP_DROP" }`
- T4: `inspectInput({ volumes: ["/etc:/etc"] }, { root: "/workspace" })` → `{ ok: false, severity: "HARD_DENY", reason: "WORKSPACE_BOUNDARY_VIOLATION" }`
- T5: `inspectInput({ ports: ["80:80"] }, {})` → `{ ok: false, severity: "DENY", reason: "PRIVILEGED_PORT" }`
- T6: `inspectInput({ image: "alpine", name: "test" }, {})` → `{ ok: true }`

**Rationale:**
- Phase 1 is machine-agnostic (no adapter/docker needed) → S59/S60/S61 always HARD_DENY
- Phase 2 is defense-in-depth (adapter could construct argv differently from raw input)
- Single decision point for all privilege logic → no per-rule branching in tool execute()

---

## 3. The 9 Fronts

### F1 — Runtime Adapter Contract + Registry

**Files:**
- `code/src/runtime/container/_runtime_contract.js` — contract helpers + adapter shape doc
- `code/src/runtime/container/_runtime_registry.js` — auto-discovers `*_runtime.js` in `runtimes/`

**Adapter result helpers:**
```js
function runtimeOk(id, action, data)
function runtimeFailed(id, action, reason, data)
```

**Registry validation at load:**
- Adapter has `id`, `available()`, all 13 `build*Argv` methods
- Adapter's `buildRunArgv({ image: 'test', name: 'test' })` does NOT contain forbidden tokens
- Probe `available()` once via `env.probe_binary` (NOT direct spawn)

### F2 — Docker Runtime Adapter

**File:** `code/src/runtime/container/runtimes/docker_runtime.js`

**Implements all 13 `build*Argv` methods** for Docker CLI (e.g. `["docker", "run", "-d", "--name", name, image]`).

**`available()`:** delegates to `env.probe_binary` with `binary: "docker"`, `args: ["info"]`. Returns `true` only if exit_code === 0.

### F3 — Podman Runtime Adapter

**File:** `code/src/runtime/container/runtimes/podman_runtime.js`

**Same shape as Docker.** Differences:
- argv0 = `"podman"` instead of `"docker"`
- `compose` is `podman-compose` (separate binary; if absent, `compose_*` returns `BINARY_NOT_FOUND`)
- Some flags differ (e.g. `--security-opt label=disable` is Podman-specific) — not relevant since we deny security-opts

### F4 — Centralized Privilege Guard

**File:** `code/src/runtime/container/_privilege_guard.js`

**Exports:**
```js
module.exports = {
  // Returns { ok: true } or { ok: false, reason, detail, severity: 'HARD_DENY' | 'PROMPT' | 'DENY' }
  inspectArgv(argv, ctx),

  // Same, but specifically for compose YAML expanded JSON
  inspectComposeJson(composeJson, ctx),

  // Returns { ok, reason } — workspace boundary check on a path
  inspectPath(absPath, projectId, root)
};
```

**`inspectArgv` rules (executed in order, first match wins):**
1. Scan flat argv for `--privileged` → HARD DENY
2. Scan flat argv for `--cap-add` (any value, any spelling) → HARD DENY
3. Scan flat argv for `--cap-drop` → HARD DENY
4. Scan flat argv for `--security-opt` → HARD DENY
5. Scan flat argv for `--device` → HARD DENY
6. Scan flat argv for `--pid=host`, `--ipc=host`, `--uts=host` → HARD DENY
7. Scan flat argv for `--network=host` or `--net=host` → DENY (PROMPT-eligible)
8. Scan flat argv for `--restart always|unless-stopped|on-failure` → DENY (PROMPT-eligible)
9. Scan flat argv for `--user 0` or `--user root` → DENY (PROMPT-eligible)
10. Scan flat argv for `-v <host>:<container>` and `--volume <host>:<container>` → extract `<host>`, run `inspectPath`. If outside workspace → HARD DENY.
11. Scan flat argv for `-p <host_port>:<container_port>` and `--publish` → if `<host_port>` < 1024 → DENY (PROMPT-eligible).

**Note on argv parsing:** The argv is constructed BY US in the adapter, so its structure is known. We don't accept arbitrary argv from the caller; we accept structured input (image, name, ports[], volumes[], env, etc.) and the adapter constructs argv. This means parsing is deterministic — we know `-v` is followed by exactly one mount string, `-p` is followed by exactly one port mapping. **No regex grovelling over user input.**

**`inspectComposeJson` rules:** Walk every service in the JSON. For each service, check `privileged`, `cap_add`, `cap_drop`, `security_opt`, `devices`, `pid`, `ipc`, `network_mode`, `volumes`, `ports`, `restart`, `user` against the same rules.

### F5 — 12 L2 Tools

**File:** `code/src/runtime/tools/container_tools.js`

| Tool | Mode | Description |
|---|---|---|
| `container.run` | WORKSPACE_WRITE | Run a container (detached by default; `wait: true` for blocking). Privilege guard applies. |
| `container.stop` | WORKSPACE_WRITE | Stop a container by id or name. |
| `container.exec` | PROMPT | Execute a command inside a running container. Per-call owner approval. |
| `container.logs` | READ_ONLY | Read container logs. `tail`, `since`, `follow:false` only. |
| `container.pull` | WORKSPACE_WRITE | Pull an image. Image string sanitized (no shell metachars). |
| `container.build` | WORKSPACE_WRITE | Build an image from a Dockerfile. Workspace-bounded. Vision lock applies. |
| `container.list` | READ_ONLY | List containers. Filter by name/label. |
| `container.inspect` | READ_ONLY | Inspect a container by id/name. |
| `container.compose_up` | WORKSPACE_WRITE | Compose up. compose_file MUST be inside workspace. Privilege guard runs on expanded JSON. |
| `container.compose_down` | WORKSPACE_WRITE | Compose down. |
| `container.compose_logs` | READ_ONLY | Compose logs. |
| `container.compose_config` | READ_ONLY | Expand compose YAML to JSON. Used as canonical parser for the privilege guard. |

**Tool implementation pattern (skeleton):**
```js
const tool_run = defineTool({
  name: "container.run",
  required_mode: "WORKSPACE_WRITE",
  input_schema: { ... },
  output_schema: { ... },
  preview(input, ctx) { /* return { argv, runtime_id } that WOULD execute */ },
  async execute(input, ctx) {
    const adapter = pickRuntime(input.runtime_id, ctx);
    if (!adapter) return failed("RUNTIME_NOT_AVAILABLE", "...");
    const argv = adapter.buildRunArgv(input, ctx);

    // Defense in depth: privilege guard runs BEFORE shell tool
    const guard = privilegeGuard.inspectArgv(argv, ctx);
    if (!guard.ok) return failed(guard.severity, guard.reason);

    // Volume paths: separate path inspection
    for (const v of (input.volumes || [])) {
      const pathCheck = privilegeGuard.inspectPath(v.host, ctx.project_id, ctx.root);
      if (!pathCheck.ok) return failed("WORKSPACE_BOUNDARY_VIOLATION", pathCheck.reason);
    }

    // Spawn via shell.run_in_workspace (Track A discipline — no direct spawn)
    const { getDefaultRegistry } = require("./_registry");
    const reg = getDefaultRegistry();
    const r = await reg.invoke("shell.run_in_workspace", {
      project_id: input.project_id,
      argv
    }, ctx);
    return r;
  }
});
```

**Critical Track-A invariant:** Container tools NEVER spawn directly. Always via the registry's `shell.run_in_workspace` (or `shell.run_with_prompt` for PROMPT-mode container.exec).

### F6 — L3 Rule: container_privilege_rule

**File:** `code/src/runtime/permission/rules/container_privilege_rule.js`

**Inserted in `permissionPolicy.authorize()` at Step 1.7** (after shell vision lock, before active-context resolution).

**Logic:**
```js
function check(tool, input, ctx) {
  if (!tool.name.startsWith("container.")) return { denied: false };

  // For container.* tools, run the privilege guard at the policy boundary.
  // This is defense-in-depth — the guard ALSO runs inside execute(),
  // but a violation should be caught at the policy gate too,
  // because permission audit log is the authoritative forensic trail.

  // We can't always inspect argv at policy time (only the L2 tool builds argv).
  // But we CAN inspect raw input for forbidden flags (e.g. raw_args bypass attempts).

  if (input && Array.isArray(input.raw_args)) {
    return { denied: true, reason: "RAW_ARGS_FORBIDDEN" };
  }

  // For build / compose_up: inspect path arguments at policy boundary.
  if (tool.name === "container.build") {
    if (input.dockerfile_path && _looksOutsideWorkspace(input.dockerfile_path, ctx)) {
      return { denied: true, reason: "WORKSPACE_BOUNDARY_VIOLATION" };
    }
  }

  return { denied: false };
}
```

The L2 tool's `execute()` is the authoritative privilege guard. The L3 rule is a coarser gate that catches obvious bypass attempts (e.g. owner trying to pass `raw_args` to inject flags).

### F7 — Doctor Check: containerRuntime

**File:** `code/src/runtime/doctor/checks/containerRuntime.js`

**Verifies:**
1. Container runtime registry loads ≥1 adapter (docker or podman)
2. At least one adapter's `available()` returns true OR returns false with a clear `BINARY_NOT_FOUND` (not WARN-level if absent — INFO; FAIL only if registry fails to load)
3. `container.run` registered in tool registry
4. Privilege guard module loads without throwing
5. No adapter contains hardcoded forbidden tokens (registration-time invariant)

**Returns:**
- PASS: registry loaded, `container.run` registered, ≥1 runtime detected, no privileged tokens
- INFO: no runtime present (this is fine for many dev machines)
- WARN: registry loaded but tool not registered, or vice versa
- FAIL: registry fails to load, or privilege invariant violated

### F8 — Contract Doc

**File:** `docs/10_runtime/16_CONTAINER_LIFECYCLE_CONTRACT.md`

Covers: namespace decision, runtime adapter contract, tier model (single-container + Compose), 12 tool catalog, privilege guard rules (the matrix from §2-D4), workspace boundary semantics, vision lock applicability, cross-platform notes (Docker on Linux/macOS/Windows, Podman on Linux), failure modes and exit code semantics, audit log fields.

### F9 — 13 Scenarios S58–S70

Files: `code/src/testing/scenarios/S58_*.json` through `S70_*.json`.

Each scenario:
- ≥4 assertions
- `requires_binary: "docker"` for scenarios that actually spawn (S58, S62, S65, S67, S68)
- `permission` field set explicitly per scenario
- Naming: `S<NN>_container_<verb>_<situation>.json`

---

## 4. Files to Create

| File | Purpose |
|---|---|
| `code/src/runtime/container/_runtime_contract.js` | Contract helpers |
| `code/src/runtime/container/_runtime_registry.js` | Auto-discovery registry |
| `code/src/runtime/container/_privilege_guard.js` | D4 enforcement (centralized) |
| `code/src/runtime/container/runtimes/docker_runtime.js` | Docker adapter |
| `code/src/runtime/container/runtimes/podman_runtime.js` | Podman adapter |
| `code/src/runtime/tools/container_tools.js` | 12 L2 tools |
| `code/src/runtime/permission/rules/container_privilege_rule.js` | L3 rule |
| `code/src/runtime/doctor/checks/containerRuntime.js` | Doctor check |
| `code/src/testing/scenarios/S58_*.json` ... `S70_*.json` | 13 scenarios |
| `docs/10_runtime/16_CONTAINER_LIFECYCLE_CONTRACT.md` | Contract doc |
| `artifacts/decisions/PHASE-7-C-3-exit-report.md` | Exit report (at close) |

---

## 5. Files to Modify

| File | Change |
|---|---|
| `code/src/runtime/permission/permissionPolicy.js` | Add Step 1.7 with container_privilege_rule |
| `code/src/runtime/doctor/_registry.js` | Register containerRuntime check (17→18) |
| `code/src/runtime/tools/shell_tools.js` | Add shell.run_read_only (required_mode READ_ONLY) |
| `verify/smoke/test_tool_runtime.js` | Tool count 37 → 50 |
| `verify/smoke/test_doctor.js` | Checks 17 → 18 |
| `verify/smoke/test_harness_meta.js` | Scenarios 57 → 70, IDs S01–S70 |
| `verify/smoke/test_permission_layer.js` | Add policy step 1.7 verification |
| `progress/status.json` | PHASE-7-C-3-CLOSED at completion |

---

## 6. Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | 70/70 scenarios PASS or SKIP (0 FAIL) |
| AC-2 | S58–S70 each ≥4 assertions |
| AC-3 | Tools registered: 37 → 50 (12 container tools + shell.run_read_only) |
| AC-4 | Runtime adapter count: ≥1 registered (docker, podman, or both) |
| AC-5 | Doctor checks: 17 → 18 (containerRuntime added) |
| AC-6 | S59: `--privileged` → status FAILED, reason HARD_DENY |
| AC-7 | S60: `--cap-add NET_ADMIN` → status FAILED, reason HARD_DENY |
| AC-8 | S61: bind-mount `/etc:/etc` → status FAILED, reason HARD_DENY, context.rule WORKSPACE_BOUNDARY_VIOLATION |
| AC-9 | S63: privileged port in TEST mode → DENIED |
| AC-10 | S64: container.exec in TEST mode → DENIED (PROMPT auto-deny) |
| AC-11 | S69: build outside workspace → HARD_DENY |
| AC-12 | S70: build with vision unlocked → DENIED VISION_NOT_LOCKED |
| AC-13 | `container.run` default (no `wait`) returns container_id without blocking |
| AC-14 | `container.compose_config` returns parsed JSON for workspace-local compose.yml |
| AC-15 | Privilege guard registration-time check rejects adapter with hardcoded `--privileged` |
| AC-16 | Track A discipline preserved: zero direct `spawn`/`fs.*` outside L2 tools in `container/` |
| AC-17 | All 5 smoke suites PASS with explicit exit code 0 (Bug-11 prevention) |
| AC-18 | All previous scenarios S01–S57 still PASS (no regression) |
| AC-19 | `docs/10_runtime/16_CONTAINER_LIFECYCLE_CONTRACT.md` created |
| AC-20 | `permissionPolicy.authorize()` Step 1.7 fires before active-context resolution |

---

## 7. Risks + Mitigations

| Risk | Mitigation |
|---|---|
| Docker absent on test machine | scenarios use `requires_binary: "docker"` → SKIP |
| Podman compose binary (`podman-compose`) absent | adapter returns `BINARY_NOT_FOUND` cleanly; compose scenarios test with docker only |
| Privilege guard misses a flag variant (e.g. `--cap-add=NET_ADMIN` vs `--cap-add NET_ADMIN`) | Test both spellings in S60 |
| Container leaked from S58/S62/S65 | All container-spawning scenarios MUST set unique `--name` and run cleanup `container.stop` afterward |
| `docker compose config` schema changes between versions | Don't depend on unstable fields; only walk `services.*.{privileged,cap_add,...}` (stable since Compose v2) |
| Compose YAML may be in `compose.yml`, `compose.yaml`, `docker-compose.yml`, or `docker-compose.yaml` | All four canonical names supported in compose_* tools |
| Owner uses `container.run` from a project without vision locked | container.run does NOT require vision lock (run is ephemeral); only `container.build` does (creates persistent image) |

---

## 8. Approval

Per §11.3 of the project discipline: PHASE-7-C-3 may not begin §3 Execution until owner approves this artifact.

**Owner approval:** KhElmasry — approved in chat 2026-05-10
**Date:** 2026-05-10
**Signal:** Status updated from `PROPOSED — pending owner approval` to `OWNER_APPROVED_2026-05-10`
