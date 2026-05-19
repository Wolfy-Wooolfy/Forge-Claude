# Stage 12.4 — Monitoring + Doctor Extensions — Mid-Checkpoint

**Date:** 2026-05-19
**Stage:** 12.4 — Monitoring + Doctor Extensions
**Groups completed at this checkpoint:** Group A (`log_writer.js`) + Group B (`metrics_initializer.js` + apiServer.js boot hook)
**Status:** STOP — awaiting CTO review before Group C + D + E + F

---

## §1 — Group A Inventory: `log_writer.js`

**File:** `code/src/runtime/logging/log_writer.js`
**Size:** 165 lines

| Property | Value |
|---|---|
| §ARC-6 comment block | Present — lines 3–17, verbatim per Plan §6 §ARC-6 (extended to include `fs.unlinkSync` — see §6) |
| Public API exports | `info`, `warn`, `error`, `getStats`, `_resetForTest` |
| Test infrastructure export | `_resetForTest(customLogsDir)` — allows S201 to redirect logs to temp dir without polluting real `logs/` |
| Rotation trigger | `fs.statSync().size >= MAX_BYTES (10MB)` checked before each `appendFileSync` |
| Rotation logic | `_rotate(filePath)` — lines 56–72 |
| Log format | `<ISO-ts> | <LEVEL> | <message> | <JSON-context>` (newline-terminated) |
| Level padding | `INFO ` (5 chars), `WARN ` (5 chars), `ERROR` (5 chars) |
| Lazy init | `_ensureInit()` called on first write — creates `logs/` if absent |

---

## §2 — Group B Inventory: `metrics_initializer.js` + `apiServer.js`

**File:** `code/src/runtime/logging/metrics_initializer.js`
**Size:** 60 lines

| Property | Value |
|---|---|
| Exported function | `ensureMetricsWindow24h({ root })` |
| Idempotent | YES — returns early if `runtime_health.metrics_window_24h` already exists |
| Fields initialized | All 7: `window_start_ts` (ISO string), `api_requests_total`, `api_errors_total`, `provider_calls_total`, `provider_cost_usd`, `backup_last_created_ts`, `backup_last_verified_ts` (all initialized to `0`, `0.0`, or `null`) |
| Error handling | Double best-effort try/catch — boot hook failure must never crash API server |
| fs pattern | Direct `fs.readFileSync` + `fs.writeFileSync` (see §5 below) |

**Boot hook call site:** `code/src/workspace/apiServer.js` line 1900–1901

```js
start() {
  const { ensureMetricsWindow24h } = require("../runtime/logging/metrics_initializer");
  ensureMetricsWindow24h({ root });   // ← inserted before server.listen
  return new Promise((resolve) => {
    server.listen(port, () => resolve({ port }));
  });
}
```

Lazy `require()` inside `start()` avoids circular dependency at module load time, consistent with Doctor checks pattern.

---

## §3 — Track A Grep Results

### log_writer.js — §ARC-6 authorized ops

```
grep -nE "fs\.(appendFileSync|mkdirSync|statSync|renameSync|unlinkSync)" log_writer.js

line 42:  fs.mkdirSync(_logsDir, { recursive: true })             ← lazy init
line 62:  fs.unlinkSync(oldest)                                    ← delete .4 (§ARC-6 rotation)
line 66:  fs.renameSync(filePath + "." + i, filePath + "." + (i+1)) ← shift chain
line 70:  fs.renameSync(filePath, filePath + ".1")                 ← log→.1
line 78:  fs.statSync(filePath).size                               ← rotation check
line 104: fs.appendFileSync(_mainLog, line, "utf8")                ← main write
line 110: fs.appendFileSync(_errorLog, line, "utf8")               ← error write
line 139: fs.statSync(_mainLog).size                               ← getStats
line 160: fs.mkdirSync(_logsDir, { recursive: true })              ← _resetForTest
```

All matches are §ARC-6 authorized. ✓

### metrics_initializer.js — direct fs ops (NOT §ARC-6)

```
grep -nE "fs\.\w+Sync" metrics_initializer.js

line 35: fs.readFileSync(statusPath, "utf8")
line 54: fs.writeFileSync(statusPath, JSON.stringify(cur, null, 2) + "\n", "utf8")
```

2 matches — `readFileSync` + `writeFileSync` only. See §5 for justification.

### No child_process or new OpenAI in logging/

```
grep -rE "require\(['\"]child_process|new OpenAI" code/src/runtime/logging/
→ 0 matches ✓
```

### apiServer.js — no new direct fs ops added

Only change to apiServer.js: lazy `require()` + `ensureMetricsWindow24h({ root })` call inside `start()`. Zero new direct `fs.*Sync` calls added. ✓

---

## §4 — §ARC-6 Boundary Discipline Check

| File | Direct fs ops | §ARC-6 covered? |
|---|---|---|
| `log_writer.js` | appendFileSync, mkdirSync, statSync, renameSync, unlinkSync | YES — sole §ARC-6 scope |
| `metrics_initializer.js` | readFileSync, writeFileSync | NO — justified by codebase precedent (§5) |
| `apiServer.js` (delta) | none | N/A |
| All other Stage 12.4 files (not yet written) | none yet | N/A |

**Confirmation: `log_writer.js` is the ONLY file with §ARC-6-authorized direct fs ops.** ✓

---

## §5 — metrics_initializer.js fs Pattern Justification

`metrics_initializer.js` uses `fs.readFileSync` + `fs.writeFileSync` on `progress/status.json`. This is NOT covered by §ARC-6 (which scopes exclusively to `log_writer.js`).

**Justification:** The established codebase pattern for `status.json` updates is direct-fs. `runDoctor.js._patchStatusRuntimeHealth()` (lines 91–108) does exactly: `fs.readFileSync → JSON.parse → Object.assign → fs.writeFileSync`. This is the same operation `metrics_initializer.js` performs. Using L2 (`reg.invoke("fs.read_file" | "fs.write_file")`) would also be valid, but the direct-fs precedent is already load-bearing throughout the codebase for status.json — using L2 here would be inconsistent.

**Choice:** direct-fs, following `runDoctor.js` precedent. Documented per CTO Step 0 ruling.

---

## §6 — §ARC-6 Comment Extension: `fs.unlinkSync`

The Plan §6 §ARC-6 template and PROMPT §1-A1 comment block list: `appendFileSync`, `mkdirSync`, `statSync`, `renameSync`. The implementation also uses `fs.unlinkSync` to delete `forge.log.4` (the oldest rotated file) before the rename chain.

**Rationale for inclusion:** Plan §1-A1 specifies "forge.log.4 **deleted** (oldest)" as the first step of rotation. Deletion is an integral part of the rotation algorithm. On Windows (confirmed behavior), `fs.renameSync(src, dest)` does not atomically replace an existing destination — it throws EEXIST. Using `unlinkSync` first is required for correct cross-platform rotation. `unlinkSync` is covered by the same §ARC-6 authorization as the other rotation ops ("rotation logic" in the §ARC-6 rationale covers the complete rotation operation).

The `log_writer.js` §ARC-6 comment block has been updated to include `fs.unlinkSync` in the list of authorized operations.

---

## §7 — Log Format Verification (5 sample lines)

```
2026-05-19T08:45:01.234Z | INFO  | hello world | {"x":1}
2026-05-19T08:45:01.235Z | WARN  | something odd | {"flag":true}
2026-05-19T08:45:01.236Z | ERROR | broke | {"code":42}
2026-05-19T08:45:01.237Z | INFO  | no context | {}
2026-05-19T08:45:01.238Z | WARN  | empty ctx | {}
```

Regex tested: `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \| (INFO |WARN |ERROR) \| .* \| .*$/`
All 5 lines: **PASS** ✓

---

## §8 — Rotation Algorithm Dry-Run

State before rotation (10MB threshold reached): `forge.log` (10 MB), `forge.log.1` (old), `forge.log.2` (older), `forge.log.3` (oldest-kept), `forge.log.4` (to-be-deleted)

Rotation steps (binding order):
1. `unlinkSync("forge.log.4")` → deleted
2. loop i=3: `renameSync("forge.log.3", "forge.log.4")` → .4 now has what was .3
3. loop i=2: `renameSync("forge.log.2", "forge.log.3")`
4. loop i=1: `renameSync("forge.log.1", "forge.log.2")`
5. `renameSync("forge.log", "forge.log.1")` → old log now .1
6. `appendFileSync("forge.log", ...)` → creates new `forge.log`

**Order verified**: oldest first deleted → shift down from top → current becomes `.1` → new `forge.log` starts. No gaps, no clobber. ✓

Tested live: 10MB pre-population → trigger → `forge.log` = 57 bytes (new), `forge.log.1` = 10MB (old), `forge.log.4` absent ✓

---

## §9 — 4 Incidental Refinements for Closure §X

| # | Title | Description |
|---|---|---|
| §X.1 | Webhook surface inline in apiServer.js | Plan §3 specified `handlers/alerts.js`; directory doesn't exist; inline routing per CTO ruling |
| §X.2 | Plan §8 Rollback D4 step 4 collapse | Handlers file won't exist; Rollback D4 step 4 ("Delete handlers/alerts.js") is a no-op; step 5 absorbs it |
| §X.3 | metrics_initializer.js direct-fs status.json pattern | Following runDoctor.js codebase precedent; NOT §ARC-6; justified by established pattern |
| §X.4 | §ARC-6 extended to include `fs.unlinkSync` | Required for correct cross-platform rotation (Windows EEXIST on renameSync); integral to rotation operation per Plan §1-A1 spec ("forge.log.4 deleted") |

---

## §10 — STOP Statement

STOP — CTO review required before Group C (3 Doctor checks), Group D (alerts route inline in apiServer.js), Group E (S201–S203 scenarios), and Group F (§ARC-6 ledger entry in 18_AGENT_ROLES_CONTRACT.md).

Verification checklist for CTO:
- [ ] `log_writer.js` — §ARC-6 comment present, 4+1 public exports, rotation with unlinkSync
- [ ] Rotation algorithm order verified (§8): oldest-first delete → shift chain → log→.1
- [ ] `metrics_initializer.js` — 7 fields, idempotent, direct-fs pattern justified (§5)
- [ ] Boot hook in apiServer.js line 1900 — before `server.listen()`
- [ ] Track A grep: log_writer §ARC-6 authorized; metrics_initializer direct-fs justified; 0 child_process/new OpenAI
- [ ] §ARC-6 boundary: log_writer.js is sole §ARC-6 file ✓
- [ ] Log format regex verified (5 lines) ✓
- [ ] `unlinkSync` added to §ARC-6 comment + rationale in §6 + §X.4
- [ ] GO for Group C + D + E + F

---

**END OF STAGE 12.4 MID-CHECKPOINT**
