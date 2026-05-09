# 15 — Package Management Contract

**Owner:** KhElmasry  
**Phase:** PHASE-7-C-2  
**Status:** ACTIVE  
**Date:** 2026-05-10

---

## 1. Overview

PHASE-7-C-2 adds a controlled, tier-based package management layer. All package installs/removes/audits go through registered adapters and L2 tools. Zero direct `child_process.spawn` in adapter code — all spawning via `getDefaultRegistry().invoke("shell.*", ...)`.

**Files:**
- `code/src/runtime/pkg/` — adapter contract, registry, adapters
- `code/src/runtime/tools/pkg_tools.js` — 7 L2 tools
- `code/src/runtime/doctor/checks/packageManagement.js` — doctor check

---

## 2. Adapter Contract

Every adapter module exports an object with:

```js
{
  id:      string,          // unique, e.g. "npm", "npm_global"
  label:   string,          // human label
  tier:    1 | 2,           // 1=workspace-local, 2=user-scoped/global
  install: async (packages: string[], ctx) => AdapterResult,
  remove:  async (packages: string[], ctx) => AdapterResult,
  list:    (ctx) => AdapterResult,          // sync or async; zero spawn
  audit:   async (ctx) => AdapterResult
}
```

### AdapterResult Schema

```js
{
  adapter_id:  string,
  action:      "install" | "remove" | "list" | "audit",
  status:      "SUCCESS" | "FAILED" | "SKIPPED",
  packages?:   string[],
  exit_code?:  number | null,
  stdout?:     string | null,
  stderr?:     string | null,
  executed_at: ISO-timestamp
}
```

### Contract Helpers (`_adapter_contract.js`)

```js
adapterOk(id, action, data)           → SUCCESS result
adapterFailed(id, action, reason, data) → FAILED result
adapterSkipped(id, action, reason)    → SKIPPED result
```

---

## 3. Tier Model

| Tier | Scope | Shell Tool | Permission |
|---|---|---|---|
| 1 | Project workspace | `shell.run_in_workspace` | WORKSPACE_WRITE |
| 2 | User-scoped (global) | `shell.run_with_prompt` | PROMPT (user confirms) |
| 3 | System-level | DEFERRED to PHASE-11 | No sudo — ever |

**Tier-3 invariant (permanent):** No adapter may contain `sudo`, `runas`, `pkexec`, or `doas`. Enforced at registry load via `checkPrivilegeInvariant()`.

---

## 4. The 9 Adapters

### Tier-1 (workspace-local)

| ID | Binary | List Strategy |
|---|---|---|
| `npm` | npm | Reads `package.json` (zero spawn) |
| `pip` | pip3 or pip | Reads `requirements.txt` (zero spawn) |
| `cargo` | cargo | Returns empty (deferred to PHASE-11) |
| `go` | go | Returns empty (deferred to PHASE-11) |
| `gem` | gem | Returns empty (deferred to PHASE-11) |
| `composer` | composer | Reads `composer.json` (zero spawn) |

### Tier-2 (user-scoped)

| ID | Binary | Install Command |
|---|---|---|
| `npm_global` | npm | `npm install -g <pkgs>` |
| `pipx` | pipx | `pipx install <pkg>` |
| `yarn_global` | yarn | `yarn global add <pkgs>` |

---

## 5. The 7 L2 Tools

All in `code/src/runtime/tools/pkg_tools.js`.

### READ_ONLY tools (F4)

| Tool | Description |
|---|---|
| `pkg.list` | List declared packages by reading manifest (zero spawn) |
| `pkg.audit` | Security audit; mock in TEST mode (AC #17) |
| `pkg.detect_lock_files` | Scan for lock files in project dir (zero spawn) |
| `pkg.get_adapter` | Return adapter metadata (id, label, tier) |

### WORKSPACE_WRITE tools (F5)

| Tool | Description |
|---|---|
| `pkg.install` | Install packages via adapter; routes Tier-2 to shell.run_with_prompt |
| `pkg.remove` | Remove packages via adapter |
| `pkg.propose_amendment` | Propose vision amendment after install (calls visionEngine) |

---

## 6. Security Audit Mock Strategy (F7 / AC #17)

Each adapter's `audit()` follows this pattern:

```js
async audit(ctx) {
  // TEST-mode mock gate — ONLY in TEST mode
  if (process.env.FORGE_PERMISSION_MODE === "TEST" && ctx && ctx._mock_audit_result) {
    return adapterOk(this.id, "audit", {
      audit_result: ctx._mock_audit_result,
      _mock_used:   true
    });
  }
  // Production path: real audit binary
  ...
}
```

**AC #17:** The production path is verified by S48 (npm install, WORKSPACE_WRITE, no mock). S50 uses TEST mode + `_mock_audit_result` to test mock behavior. The gate `FORGE_PERMISSION_MODE === "TEST"` ensures mocks never suppress real findings in production.

---

## 7. Vision Integration (F6)

After a successful `pkg.install`, the tool calls `visionEngine.proposeAmendment()`:

```js
await visionEngine.proposeAmendment(ctx.project_id, {
  type:         "dependency_added",
  package_name: pkg,
  adapter_id:   adapter.id,
  rationale:    "installed via pkg.install"
});
```

Non-blocking: if `ctx.project_id` is absent or `proposeAmendment` throws, the install still succeeds.

---

## 8. Lock File Detection (F8)

`pkg.detect_lock_files` scans the project workspace for:

| File | Adapter |
|---|---|
| `package-lock.json` | npm |
| `yarn.lock` | yarn_global |
| `Pipfile.lock` | pip |
| `Cargo.lock` | cargo |
| `go.sum` | go |
| `Gemfile.lock` | gem |
| `composer.lock` | composer |

Returns `{ found: [...], not_found: [...] }`.

---

## 9. Track A Discipline

- All Tier-1 spawning: `getDefaultRegistry().invoke("shell.run_in_workspace", ...)`
- All Tier-2 spawning: `getDefaultRegistry().invoke("shell.run_with_prompt", ...)`
- `list()` methods: zero spawn, direct file reads (fs.readFileSync is allowed — prohibition is write-only)
- No `child_process.spawn` directly in adapter code

---

## 10. How to Add a New Adapter

1. Create `code/src/runtime/pkg/adapters/<name>_adapter.js`
2. Export `{ id, label, tier, install, remove, list, audit }`
3. Call spawning via `getDefaultRegistry().invoke("shell.*", ...)`
4. Implement TEST-mode mock gate in `audit()`
5. Run `node bin/forge-test.js` — adapter auto-loads
6. Update `packageManagement` doctor check if it enforces a specific count

---

**END OF CONTRACT**
