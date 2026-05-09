# DECISION-20260509-phase-7-C-1-environment-detection

**Date:** 2026-05-09  
**Owner:** KhElmasry  
**Status:** OWNER_APPROVED — 2026-05-09  
**Track:** TRACK-B (Environment Detection — Trilogy Part 1 of 3)  
**Related:** DECISION-20260509-phase-7-B-shell-hardening, DECISION-20260509-vision-shift-track-b

---

## 1. Context

PHASE-7-A: Vision Authority. PHASE-7-B: Safe Shell Execution.  
PHASE-7-C (trilogy) = Environment Management:

| Sub-phase | Goal | Status |
|---|---|---|
| **7-C-1** | **Detection** — read-only fingerprint | **هذا القرار** |
| 7-C-2 | Package Management — pluggable adapters | بعد 7-C-1 |
| 7-C-3 | Docker Lifecycle | بعد 7-C-2 |

**Pro-grade discipline:** detect → decide → act. هذه المرحلة تبني الـ knowledge layer الذي تعتمد عليه 7-C-2 و 7-C-3. Zero mutations. Zero installations. Pure observation.

---

## 2. Architectural Refinements (Owner-Approved Deviations from Prompt)

### R1 — `state_field_exists` Assertion (Justified Scope Expansion)

**Scope expansion — not scope creep. Rationale:**  
Scenarios S01–S41 tested exact values (`state_field_equals`). Scenarios S42–S47 test **structural shape** — does the fingerprint contain `os`, `node`, `git` entries? A new assertion type is the minimal correct solution.

**Implementation:** new file `code/src/testing/assertions/state_field_exists.js` (~15 lines). Auto-discovered by the assertion registry. Zero changes to existing assertion files.

**Documentation:** First assertion type addition in project history — documented here.

---

### R2 — `env.probe_binary` L2 Tool (Replaces `child_process.spawn` in Helper)

**Original prompt design:** `_shell_helper.js` wraps `shell.run_in_workspace.execute()` directly.  
**Problem:** violates Track A — `--version` IS a side effect (process fork, binary execution).  
**Problem 2:** `shell.run_in_workspace` requires a project dir + vision lock check (7-B).

**Owner-approved architecture:**

1. New L2 tool: `env.probe_binary` (READ_ONLY) in `env_tools.js`
2. **Argument allowlist** enforced inside the tool:
   ```js
   const PROBE_ARG_ALLOWLIST = ["--version", "-v", "-V", "--help", "version", "info", "--info"];
   ```
3. `shell_vision_lock_rule` (from 7-B) does NOT apply — rule checks `tool.name.startsWith("shell.")` only
4. `_probe_helper.js` = thin wrapper calling `reg.invoke("env.probe_binary", ...)` via `getDefaultRegistry()`
5. Detectors: zero direct spawn — use `_probe_helper.js` exclusively

**Benefits:**
- Track A preserved: all spawning goes through registered L2 tool
- 7-B shell rules untouched (no cross-phase modification)
- `env.probe_binary` enforces allowlist architecturally — even buggy detector code can't run mutation commands
- READ_ONLY mode → always allowed by permission policy, no vision/scope check needed

**Tools count:** 25 (post-7-B) + 5 env tools (including probe_binary) = **30**

---

### R3 — `status_equals: "SUCCESS"` (Prompt Error Correction)

The original prompt used `"expected": "PASS"` in S42. Correct value for `direct_tool` scenarios is `"SUCCESS"` (tool envelope status). All scenarios S42–S47 use `"SUCCESS"`.

---

## 3. Decision — 6 Fronts

### F1 — Pluggable Detector Architecture

**New directory:** `code/src/runtime/tools/_detectors/`

**Files:**

| File | Role |
|---|---|
| `_contract.js` | `defineDetector(spec)` — validates `id`, `detect` function. `DetectorResult` shape. |
| `_detector_registry.js` | Auto-discovers `*_detector.js`. Methods: `list()`, `getById(id)`, `runAll(ctx)`, `runOne(id, ctx)`. Singleton + factory. |
| `_probe_helper.js` | Thin wrapper: `probeVersionSilent(ctx, binary)` + `probeInfoSilent(ctx, binary)` — both invoke `env.probe_binary` via `getDefaultRegistry()` |

**DetectorResult schema:**
```js
{
  id:           "node",          // string
  detected:     true | false,    // boolean
  data:         { ... } | null,  // structured findings
  error:        null | { code: "NOT_FOUND" | "PROBE_FAILED", message: string },
  detected_at:  ISO-timestamp
}
```

**Why pluggable:** mirrors the L2 tool registry pattern (proven since PHASE-2). Adding a new language = one new file, zero core changes.

---

### F2 — 8 Core Language/Runtime Detectors

Each detector ~60-100 lines. All use `_probe_helper.js` exclusively.

| ID | Binary Probes | Data Fields |
|---|---|---|
| `os` | None (uses `process.platform`, `os.release()`, `os.arch()`) | `platform, release, arch` |
| `shell` | `$SHELL` / `$ComSpec` env vars only | `name, path` |
| `node` | `node --version`, `npm --version`, `yarn --version`, `pnpm --version` | `version, path, package_managers` |
| `python` | `python --version` (fallback: `python3 --version`), `pip --version`, `pipx --version`, `poetry --version`, `conda --version` | `version, path, package_managers` |
| `rust` | `rustc --version`, `cargo --version`, `rustup --version` | `version, cargo, rustup` |
| `go` | `go version` (arg: "version") | `version, gopath, goroot` |
| `ruby` | `ruby --version`, `gem --version`, `bundle --version` | `version, gem, bundler` |
| `php` | `php --version`, `composer --version` | `version, composer` |

**`os` detector note:** reads `process.platform`, `os.release()`, `os.arch()`, `process.env.SHELL` — zero spawning needed. No `probeVersionSilent` call.

**`shell` detector note:** reads `process.env.SHELL` (Unix) / `process.env.ComSpec` (Windows). Zero spawning.

**`go` detector note:** `go version` uses arg `"version"` which is in `PROBE_ARG_ALLOWLIST`.

---

### F3 — Container/VCS/System Detectors (3 more)

| ID | Probes | Data Fields |
|---|---|---|
| `container` | `docker --version`, `docker info`, `podman --version` | `docker.{version, available}`, `podman.{version, available}` |
| `git` | `git --version` only (PHASE-7-C-1 scope) | `version, available` |
| `system` | `os.totalmem()`, `os.freemem()`, `os.cpus()`, `fs.statfsSync()` (Node 22) | `memory.{total_gb, available_gb}`, `cpu_count`, `disk.{free_gb, total_gb}` |

**`container` note:** `docker info` arg is `"info"` — in `PROBE_ARG_ALLOWLIST`. Detects if Docker daemon is running (exit_code=0) vs not (exit_code≠0). No Docker lifecycle management (PHASE-7-C-3 scope).

**`git` note:** PHASE-7-C-1 scope = version detection only. `git status`, `git config`, ahead/behind = PHASE-7-C-2 scope.

**`system` note:** uses Node.js built-ins only (`os` module + `fs.statfsSync`). Zero spawning.

**Total detectors:** 8 (F2) + 3 (F3) = **11**

---

### F4 — 5 L2 Tools (env namespace)

**File:** `code/src/runtime/tools/env_tools.js`

| Tool | Mode | Function |
|---|---|---|
| `env.probe_binary` | READ_ONLY | Safe binary probe with arg allowlist. Uses `child_process.spawn` inside execute(). |
| `env.detect_all` | READ_ONLY | Run all 11 detectors. Reads cache if available + fresh. |
| `env.detect_one` | READ_ONLY | Run single detector by id. |
| `env.fingerprint_cached` | READ_ONLY | Read cache only — returns null if missing/stale. |
| `env.refresh_fingerprint` | WORKSPACE_WRITE | Force re-run all detectors + persist cache. |

**`env.probe_binary` detail:**
```js
// Input schema:
{ binary: string (required), args: string[] (default: ["--version"]) }

// Validation: EACH arg must be in PROBE_ARG_ALLOWLIST
// Returns: { stdout, stderr, exit_code, timed_out }
// On invalid arg: failed("INVALID_PROBE_ARG", "arg '...' not in allowlist")
```

**Cache write policy:**
- `env.detect_all` (READ_ONLY): reads cache if available. Does NOT write (permission would deny it in READ_ONLY mode). Cache is populated only by `env.refresh_fingerprint`.
- `env.refresh_fingerprint` (WORKSPACE_WRITE): force re-detect + write `artifacts/env/system_fingerprint.json` via L2 `fs.write_file`.

**After F4:** 25 + 5 = **30 tools registered**

---

### F5 — Caching Layer

**File:** `code/src/runtime/tools/_detectors/_cache.js`

**Cache path:** `artifacts/env/system_fingerprint.json`

**Schema:**
```json
{
  "schema_version": 1,
  "detected_at": "ISO-timestamp",
  "ttl_seconds": 3600,
  "fingerprint": {
    "os":        { "id": "os", "detected": true, "data": {...}, "error": null, "detected_at": "..." },
    "node":      { ... },
    "git":       { ... }
  }
}
```

**Operations:**
| Function | Implementation |
|---|---|
| `readCachedFingerprint(ctx)` | `fs.readFileSync` directly — reading is not a side effect per L2 rule |
| `writeCachedFingerprint(ctx, data)` | L2 `fs.write_file` via `getDefaultRegistry().invoke(...)` |
| `isCacheStale(cached)` | Pure logic — compares `detected_at + ttl_seconds` to now |

**AC #11 compliance:** `grep -rE "fs\.write"` in `_cache.js` → **0 matches** (write goes through L2).

---

### F6 — Doctor + Documentation + Scenarios

#### New assertion type (R1)

**File:** `code/src/testing/assertions/state_field_exists.js`
```js
module.exports = {
  type: "state_field_exists",
  run(assertion, result) {
    // Supports dot-separated path: "fingerprint.os"
    const state = (result.output && result.output.state) || {};
    const parts = String(assertion.field).split(".");
    let cur = state;
    for (const p of parts) {
      if (cur === null || cur === undefined || typeof cur !== "object") {
        return { passed: false, detail: "state." + assertion.field + " not found (path broken at " + p + ")" };
      }
      cur = cur[p];
    }
    const passed = cur !== undefined && cur !== null;
    return {
      passed,
      detail: passed
        ? "state." + assertion.field + " exists"
        : "state." + assertion.field + " is missing/null"
    };
  }
};
```

#### Doctor check

**File:** `code/src/runtime/doctor/checks/environmentDetection.js`
- Verifies detector registry loads ≥11 detectors
- Verifies `os` detector present and callable
- Verifies `env.probe_binary` registered in tool registry

#### Documentation

**File:** `docs/10_runtime/14_ENVIRONMENT_DETECTION_CONTRACT.md`
- Detector contract + interface
- 11 detectors documented
- 5 L2 tools documented
- `env.probe_binary` argument allowlist
- Cache schema + TTL semantics
- Cross-platform notes (win32)
- Read-only invariant
- How to add a new detector (one file)

#### 6 Scenarios

| ID | Tool | Permission | Test |
|---|---|---|---|
| S42 | `env.detect_all` | READ_ONLY | Returns fingerprint with all 11 detector ids; `cache_used: false` |
| S43 | `env.detect_one` | READ_ONLY | Returns DetectorResult for "os" — `detected: true`, `data` present |
| S44 | `env.detect_all` | READ_ONLY | Cache hit (fixture pre-creates fingerprint) → `cache_used: true` |
| S45 | `env.refresh_fingerprint` | WORKSPACE_WRITE | Persists `artifacts/env/system_fingerprint.json` |
| S46 | `env.probe_binary` | READ_ONLY | Valid arg `--version` on `node` → SUCCESS with stdout |
| S47 | `env.probe_binary` | READ_ONLY | Invalid arg `install` → FAILED/INVALID_PROBE_ARG |

Each scenario: ≥4 assertions. S42–S43 use `state_field_exists`.

**Test-First:** S42–S47 written BEFORE F1–F5 implementation. Expected: all 6 FAIL (RED) before implementation.

---

## 4. Files to Create

| File | Description |
|---|---|
| `code/src/runtime/tools/_detectors/_contract.js` | Detector contract + defineDetector |
| `code/src/runtime/tools/_detectors/_detector_registry.js` | Auto-discovery registry |
| `code/src/runtime/tools/_detectors/_probe_helper.js` | Thin wrapper → `env.probe_binary` |
| `code/src/runtime/tools/_detectors/_cache.js` | Cache read/write with L2 writes |
| `code/src/runtime/tools/_detectors/os_detector.js` | OS info (process + os module) |
| `code/src/runtime/tools/_detectors/shell_detector.js` | Shell env vars |
| `code/src/runtime/tools/_detectors/node_detector.js` | Node + npm/yarn/pnpm |
| `code/src/runtime/tools/_detectors/python_detector.js` | Python ecosystem |
| `code/src/runtime/tools/_detectors/rust_detector.js` | Rust toolchain |
| `code/src/runtime/tools/_detectors/go_detector.js` | Go env |
| `code/src/runtime/tools/_detectors/ruby_detector.js` | Ruby ecosystem |
| `code/src/runtime/tools/_detectors/php_detector.js` | PHP ecosystem |
| `code/src/runtime/tools/_detectors/container_detector.js` | Docker + podman |
| `code/src/runtime/tools/_detectors/git_detector.js` | Git version |
| `code/src/runtime/tools/_detectors/system_detector.js` | Memory, CPU, disk |
| `code/src/runtime/tools/env_tools.js` | 5 L2 tools (env namespace) |
| `code/src/testing/assertions/state_field_exists.js` | New assertion type (R1) |
| `code/src/runtime/doctor/checks/environmentDetection.js` | Doctor check |
| `docs/10_runtime/14_ENVIRONMENT_DETECTION_CONTRACT.md` | Authoritative spec |
| `artifacts/decisions/PHASE-7-C-1-exit-report.md` | Exit report (at close) |

---

## 5. Files to Modify

| File | Change |
|---|---|
| `code/src/runtime/doctor/_registry.js` | Add `environmentDetection` check |
| `verify/smoke/test_tool_runtime.js` | Update tool count 25 → 30 |
| `verify/smoke/test_harness_meta.js` | Update scenario count 41 → 47, IDs S01–S47; assertion count 8 → 9 |
| `verify/smoke/test_doctor.js` | Update check count 15 → 16 |
| `progress/status.json` | Update to PHASE-7-C-1-CLOSED at close |

---

## 6. Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | `node bin/forge-test.js` → **47 PASS / 0 FAIL / 0 SKIP** |
| 2 | S42–S47 each ≥4 assertions, all PASS |
| 3 | Tool count: **30** (25 + 5 env tools including `env.probe_binary`) |
| 4 | Detector count: **11** (verified via `environmentDetection` doctor check) |
| 5 | Negative test S47: `env.probe_binary` with non-allowlisted arg → FAILED/INVALID_PROBE_ARG |
| 6 | All 5 smoke suites PASS — explicit exit codes |
| 7 | S01–S41 all PASS (backwards compat) |
| 8 | Cleanup: no leftover `test_engine_*` / `test_shell_*` dirs |
| 9 | Protected layers untouched: `apiServer.js`, `providers/`, `ai_os/`, existing `*_tools.js` files |
| 10 | Read-only invariant: `grep -rE "fs\.(writeFileSync\|appendFileSync\|unlinkSync\|rmSync)\|child_process\.(spawn\|exec\|execSync)" code/src/runtime/tools/_detectors/` — zero matches (except `_probe_helper.js` is NOT a detector file) |
| 11 | Cache writes via L2: `grep -rE "fs\.write" code/src/runtime/tools/_detectors/_cache.js` → 0 |
| 12 | Doctor check `environment_detection: PASS` after run |
| 13 | `state_field_exists` assertion type registered and functional |
| 14 | `env.probe_binary` allowlist enforced: attempt with arg `"install"` → FAILED/INVALID_PROBE_ARG (tested in S47) |

---

## 6b. Scope Notes — Git Detector Deferral

**Git detector intentionally limited to version detection in PHASE-7-C-1.**

Extended git state — `git config user.name/email`, `current_branch`, `dirty status`, `ahead/behind` — is deferred to **PHASE-11 (Existing Project Intake)**. Rationale: PHASE-11's reverse-vision generation requires full repo context (branch history, authorship, working tree state) to derive a project vision from an existing codebase. The additional git probes belong there as an integral capability unit, not as a standalone detection bonus.

This is **not an omission**. It is an explicit architectural deferral.  
The `git` detector in 7-C-1 establishes version availability (prerequisite for 7-C-2 and PHASE-11). PHASE-11 extends it with full repo context.

---

## 7. Out-of-Scope (Explicit)

- Package manager invocations beyond `--version` query → PHASE-7-C-2
- Docker lifecycle management → PHASE-7-C-3
- Git detailed probing (config, status, ahead/behind) → PHASE-7-C-2
- Any mutation commands in detector code
- Touching shell_tools.js (PHASE-7-B closed)
- Touching vision/conversation/provider layers

---

## 8. Status: PROPOSED — انتظر owner approval قبل §3 Execution
