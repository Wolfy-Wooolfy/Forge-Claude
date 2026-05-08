# 11_TOOL_RUNTIME_CONTRACT

| Field | Value |
|---|---|
| **Document ID** | DOC-10-11 |
| **Authority** | Layer 0 (binding) |
| **Code location** | `code/src/runtime/tools/` |
| **Schema authority** | `code/src/runtime/tools/SCHEMA.md` |
| **Introduced** | PHASE-2 (2026-05-08) |
| **Decision** | DECISION-20260508-phase-2-tool-runtime |

---

## 1. Purpose

This document is the Layer-0 authority companion to the code-level specification at
`code/src/runtime/tools/SCHEMA.md`. It records the governance contract, integration
rules, and migration obligations for the L2 Tool Runtime layer introduced in PHASE-2.

The code specification (`SCHEMA.md`) is the source of truth for **what** the runtime
does. This document records **why** it exists, **how** it integrates with other layers,
and **what obligations** it creates for future phases.

---

## 2. What the Tool Runtime is

The L2 Tool Runtime is a registry of named, schema-validated, permission-gated,
audited **side-effect executors**. Every external observable action Forge performs
— filesystem writes, shell execution, HTTP requests, state mutations — MUST be
expressed as a registered Tool and invoked through `registry.invoke()`.

Direct `fs.*`, `child_process.*`, or `fetch()` calls outside `code/src/runtime/tools/`
are forbidden by `CLAUDE.md §11.4`. This is enforced at code review and by a
grep check at PHASE-6 closure.

---

## 3. Terminology

> **"Tool" (capital T)** refers exclusively to an L2 Runtime Tool: a registered object
> with `name`, `required_mode`, `input_schema`, `output_schema`, `preview()`, and
> `execute()`. This is distinct from the lowercase "tool" in
> `docs/11_ai_layer/07_TOOL_VS_CONVERSATION_CONTRACT.md`, which refers to AI Layer
> approved API endpoints. The two are NOT interchangeable.

---

## 4. Layer integration

### 4.1 Relationship to L1 (Provider Contract)

L1 governs all LLM calls. L2 governs all side effects. They are independent layers:
an LLM call (L1) may trigger a Tool invocation (L2), but the layers do not call
each other's internals directly.

### 4.2 Relationship to L3 (Permission/Safety — PHASE-3)

PHASE-2 ships with `permitAll` as the default `authorize()` function. PHASE-3 wires
the real permission policy via `registry.setAuthorizeFunction(fn)`. The `required_mode`
field on every Tool is the signal L3 uses to gate execution.

No Tool bypasses the authorize step — the registry always calls `_authorize()` before
`execute()`.

### 4.3 Relationship to pipeline modules

Pipeline modules (WORKSPACE_DECISION_GATE, WORKSPACE_BACKFILL, WORKSPACE_EXECUTE,
WORKSPACE_VERIFY) are orchestration stages. They USE Tools to perform side effects.
They are NOT Tools themselves and do not need to be rewritten as Tools.

PHASE-6 (apiServer.js migration) will mechanically lift direct `fs.*`,
`child_process.*`, and `fetch()` calls inside pipeline modules to Tool invocations —
without changing the pipeline structure, module boundaries, or governance contracts.

---

## 5. Tool families shipped in PHASE-2

| Family | Count | required_mode |
|---|---|---|
| `fs.*` | 7 | READ_ONLY (read/list/exists/glob), WORKSPACE_WRITE (write/append/delete) |
| `shell.*` | 2 | WORKSPACE_WRITE (run_in_workspace), DANGER_FULL_ACCESS (run) |
| `http.*` | 2 | READ_ONLY (get), WORKSPACE_WRITE (post) |
| `state.*` | 2 | READ_ONLY (read), WORKSPACE_WRITE (patch) |
| `project.*` | 4 | READ_ONLY (list), WORKSPACE_WRITE (create/activate/delete) |
| `artifact.*` | 3 | READ_ONLY (list), WORKSPACE_WRITE (write_decision/write_audit) |
| `pipeline.*` | 3 | WORKSPACE_WRITE (run_module/advance_stage/mark_blocked) |
| **Total** | **22** | |

Additional families deferred: `vision.*` (PHASE-7), `built_project_tests.*` (PHASE-8),
`research.*` (PHASE-9).

---

## 6. Invoke sequence (registry contract)

Every call to `registry.invoke(name, input, ctx)` follows this exact sequence:

1. **Lookup** — if name not registered → `FAILED / TOOL_NOT_FOUND`
2. **Validate input** — against `tool.input_schema` → `FAILED / INVALID_INPUT`
3. **Authorize** — call `_authorize(name, input, ctx)` → `DENIED` or continue
4. **Execute or preview** — if `ctx.preview_only` → call `tool.preview()`, else `tool.execute()`
5. **Validate output** — against `tool.output_schema` (SUCCESS envelopes only) → `FAILED / INVALID_OUTPUT`
6. **Audit** — append to `artifacts/audit/tool_audit.jsonl` (never throws)

Callers branch on `envelope.status`. They MUST NOT try/catch the `invoke()` call —
the contract guarantees a returned envelope.

---

## 7. Safety invariants

| Invariant | Enforcement |
|---|---|
| Paths outside workspace root → `PATH_OUTSIDE_ROOT` | `fs_tools.js safeResolve()` |
| Shell HARD_DENY list (`rm`, `del`, ...) → `HARD_DENY` | `shell_tools.js _hardDeny()` before permission check |
| HTTP to localhost/private → `LOCALHOST_BLOCKED` | `http_tools.js _validateUrl()` |
| HTTP to non-allow-listed hosts → `HOST_NOT_ALLOWED` | `http_tools.js _validateUrl()` |
| state.patch with wrong `_version` → `CONFLICT` | `state_tools.js` optimistic concurrency |
| project.create with duplicate id → `ALREADY_EXISTS` | `project_tools.js` |
| artifact.write_* with unsafe filename → `INVALID_FILENAME` | `artifact_tools.js _safeFilename()` |

---

## 8. Audit log

All invocations — success or failure — append one row to
`artifacts/audit/tool_audit.jsonl`:

```json
{
  "ts": "2026-05-08T12:00:00.000Z",
  "tool": "fs.write_file",
  "status": "SUCCESS",
  "reason": null,
  "input_summary": { "path": "artifacts/decisions/foo.md", "content": "<truncated 80 chars>…" }
}
```

Inputs are summarised (never full content). The audit log is used by:
- the Scenario Harness (`tool_called` / `tool_not_called` assertions)
- Doctor health reporting ("tool calls in last N minutes")
- forensics

---

## 9. PHASE-6 migration completeness check

At PHASE-6 closure, the following grep MUST return zero matches:

```bash
grep -rn "fs\.write\|fs\.unlink\|fs\.rm\|fs\.append\|child_process\|fetch(" \
  code/src/ --include="*.js" | grep -v "runtime/tools/"
```

Any remaining direct calls are migration gaps and must be fixed before PHASE-6 closes.

---

## 10. Obligations on future phases

| Phase | Obligation |
|---|---|
| PHASE-3 | Wire real permission policy via `registry.setAuthorizeFunction()`. Resolve W-03. |
| PHASE-4 | Add at least one Doctor check in `code/src/runtime/doctor/checks/` per new Tool family. |
| PHASE-5 | Scenario Harness `tool_called` / `tool_not_called` assertions must use `toolAuditLog.readEntries()`. |
| PHASE-6 | Migrate `apiServer.js` and pipeline modules: all direct `fs.*` / `child_process.*` / `fetch()` calls replaced by Tool invocations. Grep check at closure. |
| PHASE-7+ | New Tool families (`vision.*`, `built_project_tests.*`, `research.*`) follow this same contract. |

---

**END OF DOCUMENT**
