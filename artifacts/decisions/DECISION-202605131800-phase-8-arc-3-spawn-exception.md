# DECISION-202605131800 — §ARC-3 Spawn Exception for harness_runner.js (PHASE-8 Retro-Documentation)

| Field | Value |
|---|---|
| Date | 2026-05-13 |
| Owner | KhElmasry |
| Status | OWNER_APPROVED_2026-05-13 (CTO recommendation, owner acknowledged via PROMPT-PHASE-8-REMEDIATION.md) |
| Authority | Layer-1 (scoped architectural exception) |
| Triggers | PHASE-8 deep verification 2026-05-13 — silent deviation identified |
| Related | `DECISION-20260513-1100-phase-8-builtproject-harness.md` §2-D6 and §5 |
| Related | `DECISION-20260510-1938-phase-7-E-agent-adapters.md` §ARC-1 (precedent) |
| Related | `DECISION-20260511-0930-phase-7-F-2-build-verify-roles.md` §ARC-1 (precedent) |
| Related | `DECISION-20260511-1000-phase-7-F-3-quality-delivery-roles.md` §ARC-1, §ARC-2 (precedent) |
| Type | RETRO-DOCUMENTATION (no functional change) |

---

## 1. Purpose

PHASE-8 deep verification identified a contradiction between the binding PHASE-8 implementation artifact and the actual implementation:

- **Artifact claim (`DECISION-20260513-1100-phase-8-builtproject-harness.md` §2-D6, line 99):**
  > "Server spawning via shell.run_in_workspace. NEVER `child_process.spawn` directly."

- **Artifact claim (same artifact §5, line 122):**
  > "harness_runner.js uses shell.run_in_workspace for spawning (NOT direct spawn)"

- **Actual implementation (`code/src/runtime/builtproject/harness_runner.js`):**
  - Line 4: `const { spawn } = require("child_process");`
  - Line 108: `const proc = spawn(cmd, args, { ... })`
  - Line 142: `spawn("taskkill", ["/pid", proc.pid, "/f", "/t"], { stdio: "ignore" })`

This decision artifact formalizes the deviation as **§ARC-3 (L5b Harness Process Control Exception)** and brings documentation into truth.

This artifact does NOT re-open PHASE-8. PHASE-8 stays CLOSED. The L5b harness works correctly; the discrepancy is in the documentation, not the implementation.

---

## 2. Why direct spawn is architecturally necessary in harness_runner.js

`shell.run_in_workspace` (defined in `code/src/runtime/tools/shell_tools.js`, lines 203–260) is **a blocking, fire-and-collect tool**:

- Awaits process exit before returning
- Returns `{ stdout, stderr, exit_code, timed_out }` after termination
- Has no streaming stdout capture during execution
- Has no port-readiness probe
- Has no ability to hand the spawned process back to the caller for later teardown

The L5b harness requires the **opposite** lifecycle:

1. **Start server in background** (don't wait for exit — the server is meant to keep running)
2. **Stream stdout/stderr** into a buffer while the server runs (needed for `stdout_contains` assertion)
3. **Poll a TCP port** until it accepts connections OR a timeout fires
4. **Hold the process handle** so the harness can issue `SIGTERM` (Unix) or `taskkill /f /t` (Windows) during teardown — regardless of whether assertions passed, failed, or errored

Wrapping this lifecycle inside `shell.run_in_workspace` would require either:
- (a) Adding background-process semantics to `shell.run_in_workspace` (a much larger contract change affecting every consumer of the L2 shell tool), or
- (b) Having the harness fire `shell.run_in_workspace` and never await it, then race-poll the port — which still leaves no way to capture stdout or teardown reliably.

Neither option preserves L5b correctness. Direct `spawn` inside the L5b harness module is the architecturally clean choice.

---

## 3. §ARC-3 (formal exception declaration)

**§ARC-3 — L5b Harness Process Control Exception**

`code/src/runtime/builtproject/harness_runner.js` is permitted to use `child_process.spawn` directly for:
- Starting servers under test (long-running background processes)
- Issuing process termination signals during teardown (`SIGTERM` on POSIX, `taskkill /f /t` on Windows)

**Justification:** L5b harness owns server lifecycle for projects-under-test. It needs streaming I/O capture, TCP port readiness polling, and direct process-handle access for teardown. The L2 `shell.run_in_workspace` tool's blocking contract does not support these needs without degrading L5b correctness. This exception is **bounded** to `harness_runner.js` only — no other file in `code/src/runtime/builtproject/` may use `child_process` directly.

**Scope:**
- File: `code/src/runtime/builtproject/harness_runner.js` ONLY
- Uses allowed: `spawn` (process start), `taskkill` (Windows teardown), `kill` (POSIX teardown)
- Uses NOT allowed: `exec`, `execSync`, `spawnSync`, `fork`

**Audit obligation:** The exception MUST be declared in `harness_runner.js` via a header docstring (see §4 below).

**Precedent:** This is the third infrastructure exception. §ARC-1 covered cost_ledger / activity_emitter / prompt_loader / role_registry direct fs reads/writes (re-entrancy prevention). §ARC-2 covered live_smoke_runner direct fs writes (test infrastructure). §ARC-3 extends the same pattern to test harness process control.

---

## 4. Implementation (this artifact's deliverables)

### 4.1 Header docstring added to harness_runner.js

The following block MUST appear at the top of `code/src/runtime/builtproject/harness_runner.js`, immediately after `"use strict";`:

```js
/**
 * L5b Built-Project Test Harness — Scenario Runner
 *
 * §ARC-3 Exception: This module uses `child_process.spawn` directly for
 * server lifecycle management (start, stdout capture, port polling, teardown).
 *
 * Rationale: The L2 `shell.run_in_workspace` tool is blocking (awaits exit
 * before returning). L5b requires:
 *   - Background process start (server keeps running during assertions)
 *   - Streaming stdout/stderr capture (for stdout_contains assertions)
 *   - TCP port readiness polling (with timeout)
 *   - Direct process handle for teardown (SIGTERM / taskkill)
 *
 * Wrapping this lifecycle inside shell.run_in_workspace would require
 * background-process semantics that would expand the L2 shell tool's
 * contract well beyond its current scope and break L5b correctness.
 *
 * This exception is BOUNDED to this file. Other files under
 * code/src/runtime/builtproject/ MUST NOT import child_process directly.
 *
 * Formal authorization: artifacts/decisions/DECISION-202605131800-phase-8-arc-3-spawn-exception.md
 */
```

### 4.2 Track A documentation update

In `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` Track A Compliance section, add a §ARC exceptions subsection with the following entry:

> **§ARC-3 (PHASE-8):** `code/src/runtime/builtproject/harness_runner.js` uses `child_process.spawn` directly for server lifecycle management. Authorized: `DECISION-202605131800-phase-8-arc-3-spawn-exception.md`.

### 4.3 No other files change

This task changes:
- The new decision artifact (Task 1 itself)
- The header docstring of `harness_runner.js` (one block, no logic changes)
- §ARC index entries in agent roles contract doc

---

## 5. Acceptance Criteria

- **AC1-1:** Decision artifact file created at `artifacts/decisions/DECISION-202605131800-phase-8-arc-3-spawn-exception.md`.
- **AC1-2:** Artifact contains all six top-level sections (1 Purpose, 2 Why direct spawn is necessary, 3 §ARC-3 declaration, 4 Implementation, 5 ACs, 6 Owner Approval).
- **AC1-3:** `code/src/runtime/builtproject/harness_runner.js` opens with the header docstring from §4.1 (immediately after `"use strict";`).
- **AC1-4:** The header docstring's "Formal authorization" line references the exact filename `DECISION-202605131800-phase-8-arc-3-spawn-exception.md`.
- **AC1-5:** `docs/10_runtime/18_AGENT_ROLES_CONTRACT.md` Track A Compliance section lists §ARC-3.

---

## 6. Owner Approval

This Layer-1 override is authorized by `PROMPT-PHASE-8-REMEDIATION.md` issued by the CTO advisor on 2026-05-13 and accepted by the owner. Owner approval is implicit in the act of forwarding the remediation PROMPT to Claude Code.

— Decision authored by Claude Code on behalf of CTO advisor, 2026-05-13.
