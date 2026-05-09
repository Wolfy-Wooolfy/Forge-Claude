# 14 — Environment Detection Contract

**Owner:** KhElmasry  
**Phase:** PHASE-7-C-1  
**Status:** ACTIVE  
**Date:** 2026-05-09

---

## 1. Overview

PHASE-7-C-1 builds the **environment knowledge layer**: a pluggable detector architecture that produces a read-only fingerprint of the host system (OS, runtimes, tools, container runtime). Zero mutations. Zero installations. Pure observation.

This document is the authoritative spec. Implementation: `code/src/runtime/env/` + `code/src/runtime/tools/env_tools.js`.

---

## 2. Detector Contract

Every detector module exports:

```js
{
  id:     string,          // unique machine id, e.g. "node", "os"
  label:  string,          // human label, e.g. "Node.js"
  detect: async (probeHelper) => DetectorResult
}
```

### DetectorResult Schema

```js
{
  id:          string,         // detector id
  detected:    boolean,        // true = found, false = absent/failed
  data:        object | null,  // structured findings (version, path, etc.)
  error:       null | { code: "NOT_FOUND" | "PROBE_FAILED", message: string },
  detected_at: ISO-timestamp
}
```

- `detected=true` + `data` present: binary found
- `detected=false` + `error.code="NOT_FOUND"`: binary not in PATH (expected, not an error)
- `detected=false` + `error.code="PROBE_FAILED"`: binary found but probe threw

### Contract Helpers (`_contract.js`)

```js
ok(id, data)              → DetectorResult with detected=true
notFound(id, message)     → DetectorResult with detected=false, NOT_FOUND
probeFailed(id, message)  → DetectorResult with detected=false, PROBE_FAILED
```

---

## 3. Detector Registry

**File:** `code/src/runtime/env/_detector_registry.js`

Auto-discovers all `*_detector.js` files in `code/src/runtime/env/detectors/`. Returns a `Map<id, detector>`. Cached after first load; call `resetDetectorCache()` to force reload.

---

## 4. The 11 Detectors

| ID | Label | Strategy | Data Fields |
|---|---|---|---|
| `os` | Operating System | Node `os` module + `process.platform` | `platform`, `arch`, `release`, `type` |
| `shell` | Shell | `process.env.SHELL` / `ComSpec` | `path` |
| `node` | Node.js | `process.version` | `version`, `executable` |
| `python` | Python | probe `python3`/`python --version` | `binary`, `version` |
| `rust` | Rust | probe `rustc --version` | `version` |
| `go` | Go | probe `go version` | `version` |
| `ruby` | Ruby | probe `ruby --version` | `version` |
| `php` | PHP | probe `php --version` | `version` |
| `git` | Git | probe `git --version` | `version` |
| `container` | Container Runtime | probe `docker info` / `podman info` | `runtime`, `version` |
| `system` | System Resources | Node `os` module | `cpus`, `total_mem_mb`, `free_mem_mb`, `hostname` |

**`os`, `shell`, `node`, `system`:** Zero spawning. Use Node built-ins only.  
**Git deferral:** PHASE-7-C-1 scope = version only. Extended state (branch, config, dirty) deferred to PHASE-11.  
**Container tolerance:** When Docker/Podman absent, returns `{ detected: false, error: { code: "NOT_FOUND" } }`. This is normal.

---

## 5. Probe Helper

**File:** `code/src/runtime/env/_probe_helper.js`

Thin wrapper calling `env.probe_binary` via `getDefaultRegistry()`. Validates args against `PROBE_ARG_ALLOWLIST` before calling. Returns `null` on blocked/failed probe.

---

## 6. Argument Allowlist

`env.probe_binary` enforces this allowlist on every argument:

```js
const PROBE_ARG_ALLOWLIST = ["--version", "-v", "-V", "--help", "version", "info", "--info"];
```

Any arg not in the allowlist → `FAILED/INVALID_PROBE_ARG`. This prevents mutation commands from being executed through the probe tool.

---

## 7. The 5 L2 Tools

All in `code/src/runtime/tools/env_tools.js`.

| Tool | Mode | Description |
|---|---|---|
| `env.probe_binary` | READ_ONLY | Safe binary probe. Validates args against allowlist. |
| `env.detect_all` | READ_ONLY | Run all detectors. `use_cache:true` reads cache if fresh. |
| `env.detect_one` | READ_ONLY | Run single detector by `detector_id`. |
| `env.fingerprint_cached` | READ_ONLY | Return cached fingerprint or null (no refresh). |
| `env.refresh_fingerprint` | WORKSPACE_WRITE | Re-run all detectors + write cache to disk. |

### `env.probe_binary` Input/Output

```js
// Input
{ binary: string,        // required
  args: string[]         // default: ["--version"]; each arg must be in allowlist
}

// Output on SUCCESS
{ stdout: string, stderr: string, exit_code: number|null, timed_out: boolean }

// Output on FAILED
{ reason: "INVALID_PROBE_ARG" | "BINARY_NOT_FOUND", detail: string }
```

### `env.detect_all` Input/Output

```js
// Input
{ use_cache: boolean }   // false = always re-run; true = use cache if fresh

// Output on SUCCESS
{ fingerprint: { [id]: DetectorResult }, cache_used: boolean, detected_at: ISO-string }
```

### Cache write policy

- `env.detect_all` (READ_ONLY): reads cache if available. Never writes (permission would deny in READ_ONLY mode).
- `env.refresh_fingerprint` (WORKSPACE_WRITE): the only tool that writes the cache file.

---

## 8. Cache Schema

**Path:** `artifacts/env/system_fingerprint.json`

```json
{
  "detected_at": "ISO-timestamp",
  "ttl": 3600,
  "fingerprint": {
    "os":    { "id": "os", "detected": true, "data": {...}, "detected_at": "..." },
    "node":  { ... },
    ...
  }
}
```

**TTL:** 3600 seconds (1 hour). `env.detect_all` with `use_cache:true` checks age before serving cached data. Stale cache → re-run detectors (without writing).

---

## 9. Read-Only Invariant

`env.detect_all`, `env.detect_one`, `env.probe_binary`, `env.fingerprint_cached` are READ_ONLY — always allowed by the permission policy (Step 3: "Read-only tool: always allow"). They never write to disk, never mutate system state.

---

## 10. How to Add a New Detector

1. Create `code/src/runtime/env/detectors/<name>_detector.js`
2. Export `{ id, label, detect(probeHelper) }`
3. Return `ok(id, data)` or `notFound(id, msg)` from `detect()`
4. Run `node bin/forge-test.js` — the detector auto-loads
5. Update `environmentDetection` doctor check if it enforces a specific count

That's it. No core registry changes needed.

---

## 11. Cross-Platform Notes

- Windows: `process.env.SHELL` absent → `shell_detector` uses `process.env.ComSpec` fallback
- Windows: `Path` (not `PATH`) may be the actual env key — `ENV_SAFE_KEYS` in `env_tools.js` includes both
- `docker info` can be slow on Windows; `PROBE_TIMEOUT_MS = 5000` applies
- `fs.statfsSync()` (for disk space) requires Node 22 — currently not used in `system_detector` for compatibility

---

**END OF CONTRACT**
